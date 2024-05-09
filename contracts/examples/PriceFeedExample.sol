// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {IPriceFeed} from "../interfaces/IPriceFeed.sol";

contract PriceFeedExample {
    IPriceFeed public defaultPriceFeed;

    constructor(IPriceFeed _priceFeed) {
        defaultPriceFeed = _priceFeed;
    }

    function getLatestAnswer() external view returns (int256) {
        return defaultPriceFeed.latestAnswer();
    }

    function getLatestRound() external view returns (uint80) {
        return defaultPriceFeed.latestRound();
    }

    function getLatestAnswerWithOtherPriceFeed(IPriceFeed _priceFeed) external view returns (int256) {
        return _priceFeed.latestAnswer();
    }
}
