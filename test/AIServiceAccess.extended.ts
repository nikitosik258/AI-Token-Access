import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const MONTHLY_PLAN = 1;
const YEARLY_PLAN = 2;
const MONTHLY_PRICE = 100n * 10n ** 18n;
const YEARLY_PRICE = 1_000n * 10n ** 18n;
const MONTHLY_DURATION = 30n * 24n * 60n * 60n;
const YEARLY_DURATION = 365n * 24n * 60n * 60n;

describe("AIServiceAccess: extended scenarios", async function () {
  const { networkHelpers, viem } = await network.create();
  const [, alice, bob, treasury] = await viem.getWalletClients();

  async function deployContracts() {
    const token = await viem.deployContract("AccessToken");
    const access = await viem.deployContract("AIServiceAccess", [
      token.address,
      treasury.account.address,
    ]);
    return { access, token };
  }

  it("rejects zero STK and treasury addresses in the constructor", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);

    await viem.assertions.revertWithCustomError(
      viem.deployContract("AIServiceAccess", [ZERO_ADDRESS, treasury.account.address]),
      access,
      "ZeroAddress",
    );
    await viem.assertions.revertWithCustomError(
      viem.deployContract("AIServiceAccess", [token.address, ZERO_ADDRESS]),
      access,
      "ZeroAddress",
    );
  });

  for (const invalidPlan of [0, 3, 255]) {
    it(`rejects invalid plan ${invalidPlan} in both plan getters`, async function () {
      const { access } = await networkHelpers.loadFixture(deployContracts);

      await viem.assertions.revertWithCustomError(
        access.read.getPlanPrice([invalidPlan]),
        access,
        "InvalidPlan",
      );
      await viem.assertions.revertWithCustomError(
        access.read.getPlanDuration([invalidPlan]),
        access,
        "InvalidPlan",
      );
    });
  }

  it("starts a new user without access or an expiration", async function () {
    const { access } = await networkHelpers.loadFixture(deployContracts);

    assert.equal(await access.read.getExpiration([alice.account.address]), 0n);
    assert.equal(await access.read.hasAccess([alice.account.address]), false);
  });

  it("rejects a monthly purchase with an insufficient STK balance", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([alice.account.address, MONTHLY_PRICE - 1n]);
    await token.write.approve([access.address, MONTHLY_PRICE], {
      account: alice.account,
    });

    await viem.assertions.revertWithCustomError(
      access.write.purchaseSubscription([MONTHLY_PLAN], { account: alice.account }),
      access,
      "InsufficientTokenBalance",
    );
    assert.equal(await access.read.getExpiration([alice.account.address]), 0n);
  });

  it("renews a monthly subscription by another 30 days and charges both payments", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([alice.account.address, MONTHLY_PRICE * 2n]);
    await token.write.approve([access.address, MONTHLY_PRICE * 2n], {
      account: alice.account,
    });

    await access.write.purchaseSubscription([MONTHLY_PLAN], { account: alice.account });
    const firstExpiration = (await access.read.getExpiration([
      alice.account.address,
    ])) as bigint;
    await access.write.purchaseSubscription([MONTHLY_PLAN], { account: alice.account });

    assert.equal(
      await access.read.getExpiration([alice.account.address]),
      firstExpiration + MONTHLY_DURATION,
    );
    assert.equal(await token.read.balanceOf([treasury.account.address]), MONTHLY_PRICE * 2n);
    assert.equal(await token.read.balanceOf([alice.account.address]), 0n);
  });

  it("charges and activates a yearly subscription for exactly 365 days", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([alice.account.address, YEARLY_PRICE]);
    await token.write.approve([access.address, YEARLY_PRICE], { account: alice.account });

    await viem.assertions.emitWithArgs(
      access.write.purchaseSubscription([YEARLY_PLAN], { account: alice.account }),
      access,
      "SubscriptionPurchased",
      [alice.account.address, YEARLY_PLAN, YEARLY_PRICE, (value: bigint) => value > 0n],
    );

    const expiration = (await access.read.getExpiration([alice.account.address])) as bigint;
    assert.equal(expiration - BigInt(await networkHelpers.time.latest()), YEARLY_DURATION);
    assert.equal(await access.read.hasAccess([alice.account.address]), true);
    assert.equal(await token.read.balanceOf([treasury.account.address]), YEARLY_PRICE);
    assert.equal(await token.read.balanceOf([alice.account.address]), 0n);
  });

  it("rejects a yearly purchase with insufficient allowance", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([alice.account.address, YEARLY_PRICE]);
    await token.write.approve([access.address, YEARLY_PRICE - 1n], {
      account: alice.account,
    });

    await viem.assertions.revertWithCustomError(
      access.write.purchaseSubscription([YEARLY_PLAN], { account: alice.account }),
      access,
      "InsufficientTokenAllowance",
    );
    assert.equal(await access.read.getExpiration([alice.account.address]), 0n);
  });

  it("rejects a yearly purchase with insufficient STK balance", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([alice.account.address, YEARLY_PRICE - 1n]);
    await token.write.approve([access.address, YEARLY_PRICE], { account: alice.account });

    await viem.assertions.revertWithCustomError(
      access.write.purchaseSubscription([YEARLY_PLAN], { account: alice.account }),
      access,
      "InsufficientTokenBalance",
    );
    assert.equal(await access.read.getExpiration([alice.account.address]), 0n);
  });

  it("marks access inactive at exactly expiresAt", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([alice.account.address, MONTHLY_PRICE]);
    await token.write.approve([access.address, MONTHLY_PRICE], { account: alice.account });
    await access.write.purchaseSubscription([MONTHLY_PLAN], { account: alice.account });
    const expiration = (await access.read.getExpiration([alice.account.address])) as bigint;

    await networkHelpers.time.increaseTo(Number(expiration));
    assert.equal(await access.read.hasAccess([alice.account.address]), false);
  });

  it("adds a plan to the existing expiry immediately before expiration", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([alice.account.address, MONTHLY_PRICE * 2n]);
    await token.write.approve([access.address, MONTHLY_PRICE * 2n], {
      account: alice.account,
    });
    await access.write.purchaseSubscription([MONTHLY_PLAN], { account: alice.account });
    const firstExpiration = (await access.read.getExpiration([
      alice.account.address,
    ])) as bigint;

    await networkHelpers.time.increaseTo(Number(firstExpiration - 2n));
    await access.write.purchaseSubscription([MONTHLY_PLAN], { account: alice.account });
    assert.equal(
      await access.read.getExpiration([alice.account.address]),
      firstExpiration + MONTHLY_DURATION,
    );
  });

  it("starts a new yearly period from the current timestamp after expiration", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([alice.account.address, YEARLY_PRICE * 2n]);
    await token.write.approve([access.address, YEARLY_PRICE * 2n], {
      account: alice.account,
    });
    await access.write.purchaseSubscription([YEARLY_PLAN], { account: alice.account });
    const firstExpiration = (await access.read.getExpiration([
      alice.account.address,
    ])) as bigint;

    await networkHelpers.time.increaseTo(Number(firstExpiration));
    await access.write.purchaseSubscription([YEARLY_PLAN], { account: alice.account });
    const newExpiration = (await access.read.getExpiration([alice.account.address])) as bigint;
    assert.equal(newExpiration - BigInt(await networkHelpers.time.latest()), YEARLY_DURATION);
  });

  for (const scenario of [
    { name: "MONTHLY to MONTHLY", first: MONTHLY_PLAN, second: MONTHLY_PLAN, firstPrice: MONTHLY_PRICE, secondPrice: MONTHLY_PRICE, secondDuration: MONTHLY_DURATION },
    { name: "MONTHLY to YEARLY", first: MONTHLY_PLAN, second: YEARLY_PLAN, firstPrice: MONTHLY_PRICE, secondPrice: YEARLY_PRICE, secondDuration: YEARLY_DURATION },
    { name: "YEARLY to MONTHLY", first: YEARLY_PLAN, second: MONTHLY_PLAN, firstPrice: YEARLY_PRICE, secondPrice: MONTHLY_PRICE, secondDuration: MONTHLY_DURATION },
    { name: "YEARLY to YEARLY", first: YEARLY_PLAN, second: YEARLY_PLAN, firstPrice: YEARLY_PRICE, secondPrice: YEARLY_PRICE, secondDuration: YEARLY_DURATION },
  ]) {
    it(`preserves time, charges tokens, and emits the plan event for ${scenario.name}`, async function () {
      const { access, token } = await networkHelpers.loadFixture(deployContracts);
      const totalPrice = scenario.firstPrice + scenario.secondPrice;
      await token.write.transfer([alice.account.address, totalPrice]);
      await token.write.approve([access.address, totalPrice], { account: alice.account });

      await access.write.purchaseSubscription([scenario.first], { account: alice.account });
      const firstExpiration = (await access.read.getExpiration([
        alice.account.address,
      ])) as bigint;

      await viem.assertions.emitWithArgs(
        access.write.purchaseSubscription([scenario.second], { account: alice.account }),
        access,
        "SubscriptionPurchased",
        [alice.account.address, scenario.second, scenario.secondPrice, firstExpiration + scenario.secondDuration],
      );

      assert.equal(
        await access.read.getExpiration([alice.account.address]),
        firstExpiration + scenario.secondDuration,
      );
      assert.equal(await token.read.balanceOf([treasury.account.address]), totalPrice);
      assert.equal(await token.read.balanceOf([alice.account.address]), 0n);
    });
  }

  it("keeps subscriptions independent and prevents one caller from changing another user's expiry", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([alice.account.address, MONTHLY_PRICE]);
    await token.write.transfer([bob.account.address, YEARLY_PRICE]);
    await token.write.approve([access.address, MONTHLY_PRICE], { account: alice.account });
    await token.write.approve([access.address, YEARLY_PRICE], { account: bob.account });

    await access.write.purchaseSubscription([MONTHLY_PLAN], { account: alice.account });
    const aliceExpiration = (await access.read.getExpiration([
      alice.account.address,
    ])) as bigint;
    assert.equal(await access.read.getExpiration([bob.account.address]), 0n);

    await access.write.purchaseSubscription([YEARLY_PLAN], { account: bob.account });
    assert.equal(await access.read.getExpiration([alice.account.address]), aliceExpiration);
    assert.equal(await access.read.hasAccess([alice.account.address]), true);
    assert.equal(await access.read.hasAccess([bob.account.address]), true);
  });
});
