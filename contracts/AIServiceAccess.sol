// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AI Service Access
/// @notice Collects STK payments and records time-based access to an AI service.
/// @dev LLM requests and computations are handled off-chain by the backend.
contract AIServiceAccess is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Identifier for the 30-day subscription plan.
    uint8 public constant MONTHLY_PLAN = 1;
    /// @notice Identifier for the 365-day subscription plan.
    uint8 public constant YEARLY_PLAN = 2;

    /// @notice Price of the monthly plan in STK's smallest units.
    uint256 public constant MONTHLY_PRICE = 100 * 10 ** 18;
    /// @notice Price of the yearly plan in STK's smallest units.
    uint256 public constant YEARLY_PRICE = 1_000 * 10 ** 18;

    /// @notice Fixed duration of the monthly plan.
    uint256 public constant MONTHLY_DURATION = 30 days;
    /// @notice Fixed duration of the yearly plan.
    uint256 public constant YEARLY_DURATION = 365 days;

    /// @notice ERC-20 token used to pay for subscriptions.
    IERC20 public immutable accessToken;
    /// @notice Recipient of all subscription payments.
    address public immutable treasury;

    mapping(address user => uint256 expiresAt) private subscriptionExpiresAt;

    error ZeroAddress();
    error InvalidPlan(uint8 plan);
    error InsufficientTokenBalance(uint256 available, uint256 required);
    error InsufficientTokenAllowance(uint256 available, uint256 required);

    /// @notice Emitted after a subscription payment completes successfully.
    event SubscriptionPurchased(
        address indexed user,
        uint8 indexed plan,
        uint256 amount,
        uint256 expiresAt
    );

    /// @param token Address of the deployed STK ERC-20 contract.
    /// @param treasuryAddress Address that receives STK subscription payments.
    constructor(address token, address treasuryAddress) {
        if (token == address(0) || treasuryAddress == address(0)) {
            revert ZeroAddress();
        }

        accessToken = IERC20(token);
        treasury = treasuryAddress;
    }

    /// @notice Purchases a plan and extends the caller's subscription.
    /// @dev State is updated before the external token transfer. If the transfer
    /// reverts, EVM atomicity reverts the expiry update as well.
    /// @param plan The plan identifier: 1 for monthly or 2 for yearly.
    function purchaseSubscription(uint8 plan) external nonReentrant {
        (uint256 price, uint256 duration) = _getPlanDetails(plan);

        uint256 balance = accessToken.balanceOf(msg.sender);
        if (balance < price) {
            revert InsufficientTokenBalance(balance, price);
        }

        uint256 allowance = accessToken.allowance(msg.sender, address(this));
        if (allowance < price) {
            revert InsufficientTokenAllowance(allowance, price);
        }

        uint256 currentExpiration = subscriptionExpiresAt[msg.sender];
        uint256 startTime = currentExpiration > block.timestamp
            ? currentExpiration
            : block.timestamp;
        uint256 newExpiration = startTime + duration;

        // Effects precede interaction; nonReentrant protects the token callback boundary.
        subscriptionExpiresAt[msg.sender] = newExpiration;
        accessToken.safeTransferFrom(msg.sender, treasury, price);

        emit SubscriptionPurchased(msg.sender, plan, price, newExpiration);
    }

    /// @notice Returns whether a user currently has an active subscription.
    function hasAccess(address user) external view returns (bool) {
        return block.timestamp < subscriptionExpiresAt[user];
    }

    /// @notice Returns the Unix timestamp at which a user's access expires.
    function getExpiration(address user) external view returns (uint256) {
        return subscriptionExpiresAt[user];
    }

    /// @notice Returns the price of a valid plan in STK's smallest units.
    function getPlanPrice(uint8 plan) external pure returns (uint256) {
        (uint256 price,) = _getPlanDetails(plan);
        return price;
    }

    /// @notice Returns the duration of a valid plan in seconds.
    function getPlanDuration(uint8 plan) external pure returns (uint256) {
        (, uint256 duration) = _getPlanDetails(plan);
        return duration;
    }

    function _getPlanDetails(uint8 plan)
        internal
        pure
        returns (uint256 price, uint256 duration)
    {
        if (plan == MONTHLY_PLAN) {
            return (MONTHLY_PRICE, MONTHLY_DURATION);
        }
        if (plan == YEARLY_PLAN) {
            return (YEARLY_PRICE, YEARLY_DURATION);
        }

        revert InvalidPlan(plan);
    }
}
