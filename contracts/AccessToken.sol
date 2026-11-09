// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Access Token
/// @notice Fixed-supply utility token used to pay for AI access subscriptions.
/// @dev Subscription prices and access periods belong to a separate contract.
contract AccessToken is ERC20 {
    /// @notice The complete supply minted once to the deploying address.
    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;

    /// @notice Creates the token and assigns its entire fixed supply to the deployer.
    constructor() ERC20("Access Token", "STK") {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
}
