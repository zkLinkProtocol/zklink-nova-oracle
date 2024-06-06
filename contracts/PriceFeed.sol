// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IPriceFeed} from "./interfaces/IPriceFeed.sol";

contract PriceFeed is IPriceFeed, UUPSUpgradeable, OwnableUpgradeable {
    string private __description;
    uint8 private __decimals;
    uint256 private __heartBeat;

    int256 public answer;
    uint80 public roundId;
    address public override aggregator;
    uint256 public lastSetAnswerTime;

    mapping(uint80 => int256) public answers;
    mapping(address => bool) public isAdmin;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[41] private __gap;

    /// @dev Contract is expected to be used as proxy implementation.
    /// @dev Disable the initialization to prevent Parity hack.
    constructor() {
        _disableInitializers();
    }

    function initialize(string memory _description, uint8 _decimals, uint256 _heartBeat) external initializer {
        __UUPSUpgradeable_init_unchained();
        __Ownable_init_unchained();
        isAdmin[msg.sender] = true;
        lastSetAnswerTime = block.timestamp;

        __description = _description;
        __decimals = _decimals;
        __heartBeat = _heartBeat;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // can only called by owner
    }

    function setAdmin(address _account, bool _isAdmin) external onlyOwner {
        isAdmin[_account] = _isAdmin;
    }

    function latestAnswer() external view override returns (int256) {
        require(block.timestamp < lastSetAnswerTime + ((__heartBeat * 110) / 100), "exceed max update delay");
        return answer;
    }

    function latestRound() external view override returns (uint80) {
        return roundId;
    }

    function description() external view override returns (string memory) {
        return __description;
    }

    function decimals() external view override returns (uint8) {
        return __decimals;
    }

    function heartBeat() external view override returns (uint256) {
        return __heartBeat;
    }

    function setLatestAnswer(int256 _answer) external {
        require(isAdmin[msg.sender], "PriceFeed: forbidden");
        roundId = roundId + 1;
        answer = _answer;
        answers[roundId] = _answer;
        lastSetAnswerTime = block.timestamp;
    }

    // returns roundId, answer, startedAt, updatedAt, answeredInRound
    function getRoundData(uint80 _roundId) external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, answers[_roundId], 0, 0, 0);
    }
}
