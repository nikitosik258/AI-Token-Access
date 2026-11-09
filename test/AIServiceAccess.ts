import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

const MONTHLY_PLAN = 1;
const YEARLY_PLAN = 2;
const MONTHLY_PRICE = 100n * 10n ** 18n;
const YEARLY_PRICE = 1_000n * 10n ** 18n;
const MONTHLY_DURATION = 30n * 24n * 60n * 60n;
const YEARLY_DURATION = 365n * 24n * 60n * 60n;

describe("AIServiceAccess", async function () {
  const { networkHelpers, viem } = await network.create();
  const [deployer, subscriber, treasury] = await viem.getWalletClients();

  async function deployContracts() {
    const token = await viem.deployContract("AccessToken");
    const access = await viem.deployContract("AIServiceAccess", [
      token.address,
      treasury.account.address,
    ]);
    return { access, token };
  }

  it("returns the two exact plan prices and durations", async function () {
    const { access } = await networkHelpers.loadFixture(deployContracts);

    assert.equal(await access.read.getPlanPrice([MONTHLY_PLAN]), MONTHLY_PRICE);
    assert.equal(await access.read.getPlanPrice([YEARLY_PLAN]), YEARLY_PRICE);
    assert.equal(await access.read.getPlanDuration([MONTHLY_PLAN]), MONTHLY_DURATION);
    assert.equal(await access.read.getPlanDuration([YEARLY_PLAN]), YEARLY_DURATION);
  });

  it("charges STK, records a monthly expiration, and emits the purchase event", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([subscriber.account.address, YEARLY_PRICE]);
    await token.write.approve([access.address, YEARLY_PRICE], {
      account: subscriber.account,
    });

    await viem.assertions.emitWithArgs(
      access.write.purchaseSubscription([MONTHLY_PLAN], {
        account: subscriber.account,
      }),
      access,
      "SubscriptionPurchased",
      [subscriber.account.address, MONTHLY_PLAN, MONTHLY_PRICE, (value: bigint) => value > 0n],
    );

    const expiration = (await access.read.getExpiration([
      subscriber.account.address,
    ])) as bigint;
    const currentTime = BigInt(await networkHelpers.time.latest());
    assert.equal(expiration - currentTime, MONTHLY_DURATION);
    assert.equal(await access.read.hasAccess([subscriber.account.address]), true);
    assert.equal(
      await token.read.balanceOf([treasury.account.address]),
      MONTHLY_PRICE,
    );
  });

  it("preserves the remaining time when switching from monthly to yearly", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([
      subscriber.account.address,
      MONTHLY_PRICE + YEARLY_PRICE,
    ]);
    await token.write.approve([access.address, MONTHLY_PRICE + YEARLY_PRICE], {
      account: subscriber.account,
    });

    await access.write.purchaseSubscription([MONTHLY_PLAN], {
      account: subscriber.account,
    });
    const firstExpiration = (await access.read.getExpiration([
      subscriber.account.address,
    ])) as bigint;

    await networkHelpers.time.increase(20 * 24 * 60 * 60);
    await access.write.purchaseSubscription([YEARLY_PLAN], {
      account: subscriber.account,
    });

    assert.equal(
      await access.read.getExpiration([subscriber.account.address]),
      firstExpiration + YEARLY_DURATION,
    );
  });

  it("starts a new period from the current time after access expires", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([subscriber.account.address, YEARLY_PRICE]);
    await token.write.approve([access.address, YEARLY_PRICE], {
      account: subscriber.account,
    });

    await access.write.purchaseSubscription([MONTHLY_PLAN], {
      account: subscriber.account,
    });
    await networkHelpers.time.increase(Number(MONTHLY_DURATION));
    assert.equal(await access.read.hasAccess([subscriber.account.address]), false);

    await access.write.purchaseSubscription([MONTHLY_PLAN], {
      account: subscriber.account,
    });
    const expiration = (await access.read.getExpiration([
      subscriber.account.address,
    ])) as bigint;
    const currentTime = BigInt(await networkHelpers.time.latest());
    assert.equal(expiration - currentTime, MONTHLY_DURATION);
  });

  it("does not change expiry when payment fails because approval is missing", async function () {
    const { access, token } = await networkHelpers.loadFixture(deployContracts);
    await token.write.transfer([subscriber.account.address, MONTHLY_PRICE]);

    await viem.assertions.revertWithCustomError(
      access.write.purchaseSubscription([MONTHLY_PLAN], {
        account: subscriber.account,
      }),
      access,
      "InsufficientTokenAllowance",
    );

    assert.equal(await access.read.getExpiration([subscriber.account.address]), 0n);
    assert.equal(await token.read.balanceOf([treasury.account.address]), 0n);
  });

  it("rejects unknown plan identifiers", async function () {
    const { access } = await networkHelpers.loadFixture(deployContracts);

    await viem.assertions.revertWithCustomError(
      access.read.getPlanPrice([3]),
      access,
      "InvalidPlan",
    );
  });
});
