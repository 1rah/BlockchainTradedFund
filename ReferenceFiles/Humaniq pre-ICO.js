pragma solidity ^0.4.6;

import "./StandardToken.sol";
import "./SafeMath.sol";

/// @title Token contract - Implements Standard Token Interface with HumaniQ features.
/// @author Evgeny Yurtaev - <evgeny@etherionlab.com>
/// @author Alexey Bashlykov - <alexey@etherionlab.com>
contract HumaniqToken is StandardToken, SafeMath {

    /*
     * External contracts
     */
    address public minter;

    /*
     * Token meta data
     */
    string constant public name = "Humaniq";
    string constant public symbol = "HMQ";
    uint8 constant public decimals = 8;

    // Address of the founder of Humaniq.
    address public founder = 0xc890b1f532e674977dfdb791cafaee898dfa9671;

    // Multisig address of the founders
    address public multisig = 0xa2c9a7578e2172f32a36c5c0e49d64776f9e7883;

    // Address where all tokens created during ICO stage initially allocated
    address constant public allocationAddressICO = 0x1111111111111111111111111111111111111111;

    // Address where all tokens created during preICO stage initially allocated
    address constant public allocationAddressPreICO = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    // 31 820 314 tokens were minted during preICO
    uint constant public preICOSupply = mul(31820314, 100000000);

    // 131 038 286 tokens were minted during ICO
    uint constant public ICOSupply = mul(131038286, 100000000);

    // Max number of tokens that can be minted
    uint public maxTotalSupply;

    /*
     * Modifiers
     */
    modifier onlyFounder() {
        // Only founder is allowed to do this action.
        if (msg.sender != founder) {
            throw;
        }
        _;
    }

    modifier onlyMinter() {
        // Only minter is allowed to proceed.
        if (msg.sender != minter) {
            throw;
        }
        _;
    }

    /*
     * Contract functions
     */

    /// @dev Crowdfunding contract issues new tokens for address. Returns success.
    /// @param _for Address of receiver.
    /// @param tokenCount Number of tokens to issue.
    function issueTokens(address _for, uint tokenCount)
        external
        payable
        onlyMinter
        returns (bool)
    {
        if (tokenCount == 0) {
            return false;
        }

        if (add(totalSupply, tokenCount) > maxTotalSupply) {
            throw;
        }

        totalSupply = add(totalSupply, tokenCount);
        balances[_for] = add(balances[_for], tokenCount);
        Issuance(_for, tokenCount);
        return true;
    }

    /// @dev Function to change address that is allowed to do emission.
    /// @param newAddress Address of new emission contract.
    function changeMinter(address newAddress)
        public
        onlyFounder
        returns (bool)
    {   
        // Forbid previous emission contract to distribute tokens minted during ICO stage
        delete allowed[allocationAddressICO][minter];

        minter = newAddress;

        // Allow emission contract to distribute tokens minted during ICO stage
        allowed[allocationAddressICO][minter] = balanceOf(allocationAddressICO);
    }

    /// @dev Function to change founder address.
    /// @param newAddress Address of new founder.
    function changeFounder(address newAddress)
        public
        onlyFounder
        returns (bool)
    {   
        founder = newAddress;
    }

    /// @dev Function to change multisig address.
    /// @param newAddress Address of new multisig.
    function changeMultisig(address newAddress)
        public
        onlyFounder
        returns (bool)
    {
        multisig = newAddress;
    }

    /// @dev Contract constructor function sets initial token balances.
    function HumaniqToken(address founderAddress)
    {   
        // Set founder address
        founder = founderAddress;

        // Allocate all created tokens during ICO stage to allocationAddressICO.
        balances[allocationAddressICO] = ICOSupply;

        // Allocate all created tokens during preICO stage to allocationAddressPreICO.
        balances[allocationAddressPreICO] = preICOSupply;

        // Allow founder to distribute tokens minted during preICO stage
        allowed[allocationAddressPreICO][founder] = preICOSupply;

        // Give 14 percent of all tokens to founders.
        balances[multisig] = div(mul(ICOSupply, 14), 86);

        // Set correct totalSupply and limit maximum total supply.
        totalSupply = add(ICOSupply, balances[multisig]);
        totalSupply = add(totalSupply, preICOSupply);
        maxTotalSupply = mul(totalSupply, 5);
    }
}

pragma solidity ^0.4.2;

import "./HumaniqToken.sol";

/// @title HumaniqICO contract - Takes funds from users and issues tokens.
/// @author Evgeny Yurtaev - <evgeny@etherionlab.com>
contract HumaniqPreICO {

    /*
     * External contracts
     */
    HumaniqToken public humaniqToken = HumaniqToken(0x0);

    /*
     * Crowdfunding parameters
     */
    uint constant public CROWDFUNDING_PERIOD = 12 days;
    // Goal threshold, 10000 ETH
    uint constant public CROWDSALE_TARGET = 10000 ether;

    /*
     *  Storage
     */
    address public founder;
    address public multisig;
    uint public startDate = 0;
    uint public icoBalance = 0;
    uint public baseTokenPrice = 666 szabo; // 0.000666 ETH
    uint public discountedPrice = baseTokenPrice;
    bool public isICOActive = false;

    // participant address => value in Wei
    mapping (address => uint) public investments;

    /*
     *  Modifiers
     */
    modifier onlyFounder() {
        // Only founder is allowed to do this action.
        if (msg.sender != founder) {
            throw;
        }
        _;
    }

    modifier minInvestment() {
        // User has to send at least the ether value of one token.
        if (msg.value < baseTokenPrice) {
            throw;
        }
        _;
    }

    modifier icoActive() {
        if (isICOActive == false) {
            throw;
        }
        _;
    }

    modifier applyBonus() {
        uint icoDuration = now - startDate;
        if (icoDuration >= 248 hours) {
            discountedPrice = baseTokenPrice;
        }
        else if (icoDuration >= 176 hours) {
            discountedPrice = (baseTokenPrice * 100) / 107;
        }
        else if (icoDuration >= 104 hours) {
            discountedPrice = (baseTokenPrice * 100) / 120;
        }
        else if (icoDuration >= 32 hours) {
            discountedPrice = (baseTokenPrice * 100) / 142;
        }
        else if (icoDuration >= 12 hours) {
            discountedPrice = (baseTokenPrice * 100) / 150;
        }
        else {
            discountedPrice = (baseTokenPrice * 100) / 170;
        }
        _;
    }

    /// @dev Allows user to create tokens if token creation is still going
    /// and cap was not reached. Returns token count.
    function fund()
        public
        applyBonus
        icoActive
        minInvestment
        payable
        returns (uint)
    {
        // Token count is rounded down. Sent ETH should be multiples of baseTokenPrice.
        uint tokenCount = msg.value / discountedPrice;
        // Ether spent by user.
        uint investment = tokenCount * discountedPrice;
        // Send change back to user.
        if (msg.value > investment && !msg.sender.send(msg.value - investment)) {
            throw;
        }
        // Update fund's and user's balance and total supply of tokens.
        icoBalance += investment;
        investments[msg.sender] += investment;
        // Send funds to founders.
        if (!multisig.send(investment)) {
            // Could not send money
            throw;
        }
        if (!humaniqToken.issueTokens(msg.sender, tokenCount)) {
            // Tokens could not be issued.
            throw;
        }
        return tokenCount;
    }

    /// @dev Issues tokens for users who made BTC purchases.
    /// @param beneficiary Address the tokens will be issued to.
    /// @param _tokenCount Number of tokens to issue.
    function fundBTC(address beneficiary, uint _tokenCount)
        external
        applyBonus
        icoActive
        onlyFounder
        returns (uint)
    {
        // Approximate ether spent.
        uint investment = _tokenCount * discountedPrice;
        // Update fund's and user's balance and total supply of tokens.
        icoBalance += investment;
        investments[beneficiary] += investment;
        if (!humaniqToken.issueTokens(beneficiary, _tokenCount)) {
            // Tokens could not be issued.
            throw;
        }
        return _tokenCount;
    }

    /// @dev If ICO has successfully finished sends the money to multisig
    /// wallet.
    function finishCrowdsale()
        external
        onlyFounder
        returns (bool)
    {
        if (isICOActive == true) {
            isICOActive = false;
            // Founders receive 14% of all created tokens.
            uint founderBonus = ((icoBalance / baseTokenPrice) * 114) / 100;
            if (!humaniqToken.issueTokens(multisig, founderBonus)) {
                // Tokens could not be issued.
                throw;
            }
        }
    }

    /// @dev Sets token value in Wei.
    /// @param valueInWei New value.
    function changeBaseTokenPrice(uint valueInWei)
        external
        onlyFounder
        returns (bool)
    {
        baseTokenPrice = valueInWei;
        return true;
    }

    /// @dev Function that activates ICO.
    function startICO()
        external
        onlyFounder
    {
        if (isICOActive == false && startDate == 0) {
          // Start ICO
          isICOActive = true;
          // Set start-date of token creation
          startDate = now;
        }
    }

    /// @dev Contract constructor function sets founder and multisig addresses.
    function HumaniqICO(address _multisig) {
        // Set founder address
        founder = msg.sender;
        // Set multisig address
        multisig = _multisig;
    }

    /// @dev Fallback function. Calls fund() function to create tokens.
    function () payable {
        fund();
    }
}