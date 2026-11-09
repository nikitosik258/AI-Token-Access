import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

const INITIAL_SUPPLY = 1_000_000n * 10n ** 18n;

describe("AccessToken", async function () {
  const { networkHelpers, viem } = await network.create();
  const [deployer, recipient, spender] = await viem.getWalletClients();

  async function deployAccessToken() {
    const token = await viem.deployContract("AccessToken");
    return { token };
  }

  it("sets the required metadata and mints all STK to the deployer", async function () {
    const { token } = await networkHelpers.loadFixture(deployAccessToken);

    assert.equal(await token.read.name(), "Access Token");
    assert.equal(await token.read.symbol(), "STK");
    assert.equal(await token.read.decimals(), 18);
    assert.equal(await token.read.totalSupply(), INITIAL_SUPPLY);
    assert.equal(
      await token.read.balanceOf([deployer.account.address]),
      INITIAL_SUPPLY,
    );
  });

  it("supports standard ERC-20 transfers without changing total supply", async function () {
    const { token } = await networkHelpers.loadFixture(deployAccessToken);
    const amount = 100n * 10n ** 18n;

    await viem.assertions.emitWithArgs(
      token.write.transfer([recipient.account.address, amount]),
      token,
      "Transfer",
      [deployer.account.address, recipient.account.address, amount],
    );

    assert.equal(await token.read.balanceOf([recipient.account.address]), amount);
    assert.equal(await token.read.totalSupply(), INITIAL_SUPPLY);
  });

  it("rejects a transfer that exceeds the sender balance", async function () {
    const { token } = await networkHelpers.loadFixture(deployAccessToken);

    await viem.assertions.revertWithCustomError(
      token.write.transfer([recipient.account.address, INITIAL_SUPPLY + 1n]),
      token,
      "ERC20InsufficientBalance",
    );
    assert.equal(
      await token.read.balanceOf([deployer.account.address]),
      INITIAL_SUPPLY,
    );
  });

  it("supports approve, allowance, and transferFrom", async function () {
    const { token } = await networkHelpers.loadFixture(deployAccessToken);
    const approvedAmount = 250n * 10n ** 18n;
    const transferAmount = 100n * 10n ** 18n;

    await viem.assertions.emitWithArgs(
      token.write.approve([spender.account.address, approvedAmount]),
      token,
      "Approval",
      [deployer.account.address, spender.account.address, approvedAmount],
    );
    assert.equal(
      await token.read.allowance([deployer.account.address, spender.account.address]),
      approvedAmount,
    );

    await token.write.transferFrom(
      [deployer.account.address, recipient.account.address, transferAmount],
      { account: spender.account },
    );

    assert.equal(
      await token.read.balanceOf([recipient.account.address]),
      transferAmount,
    );
    assert.equal(
      await token.read.allowance([deployer.account.address, spender.account.address]),
      approvedAmount - transferAmount,
    );
    assert.equal(await token.read.totalSupply(), INITIAL_SUPPLY);
  });

  it("rejects transferFrom when the spender allowance is insufficient", async function () {
    const { token } = await networkHelpers.loadFixture(deployAccessToken);

    await viem.assertions.revertWithCustomError(
      token.write.transferFrom(
        [deployer.account.address, recipient.account.address, 1n],
        { account: spender.account },
      ),
      token,
      "ERC20InsufficientAllowance",
    );
    assert.equal(
      await token.read.balanceOf([recipient.account.address]),
      0n,
    );
  });
});
