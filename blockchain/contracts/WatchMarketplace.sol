// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "./WatchNFT.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// ==========================================
// CUSTOM ERRORS
// ==========================================
error InvalidAddress();
error InvalidPrice();
error Unauthorized();
error MarketplaceNotApproved();
error WatchNotActive();
error InactiveListing();
error SelfPurchaseNotAllowed();
error TransferFailed();
error PendingVerification();
error NotInEscrow();
error P2POnly();
error AlreadyListed();
error NotLogisticsSystem();
error AlreadyShipped();
error NotShipped();
error NotAssignedWatchmaker();  

/**
 * @title Axia Luxury Watch Marketplace
 * @dev Escrow-based marketplace for trading physical luxury watches linked to NFTs.
 * Supports direct sales, P2P transactions with watchmaker verification, and off-chain signatures.
 */
contract WatchMarketplace is Ownable, Pausable, ReentrancyGuard {

    // INTERFACES
    WatchNFT public watchNFT;
    IERC20 public paymentToken;

    // FEE CONFIGURATION (BASE 10000 = 100%)
    uint256 public marketPlaceFeePercent = 150; // 1.5% platform fee
    uint256 public royaltyPercent = 100;        // 1.0% manufacturer royalty
    uint256 public watchmakerFeePercent = 200;  // 2.0% watchmaker fee for P2P verification
    uint256 public sellerDepositPercent = 200;  // 2.0% deposit required from P2P sellers
    
    address public feeRecipient;
    address public logisticsSystem;
    address public auctionContract;

    /// @dev Represents the current state of a listing.
    enum ListingState { Inactive, Active, Escrowed }

    /// @dev Core data structure for a marketplace listing.
    struct Listing {
        address seller;
        address buyer; 
        uint256 price;
        uint256 sellerDeposit;
        bool isP2P;
        bool watchmakerApproved;
        bool isShipped;               
        address assignedWatchmaker;   
        address verifyingWatchmaker; 
        ListingState state;
    }

    // STATE VARIABLES
    mapping(uint256 => Listing) public listings;

    // EVENTS
    event FeeRecipientUpdated(address newRecipient);
    event WatchListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event EscrowInitiated(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event SaleCompleted(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event EscrowRefunded(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price);

    event AuthenticityApproved(uint256 indexed tokenId, address indexed watchmaker);
    event AuthenticityRejected(uint256 indexed tokenId, address indexed watchmaker);
    event ListingPriceUpdated(uint256 indexed tokenId, uint256 oldPrice, uint256 newPrice);

    event WatchShipped(uint256 indexed tokenId);
    event WatchmakerAssigned(uint256 indexed tokenId, address indexed watchmaker);
  
    /**
     * @notice Initializes the marketplace contract.
     * @param _watchNFTAddress Address of the WatchNFT ERC721 contract.
     * @param _paymentTokenAddress Address of the USDC/ERC20 payment token.
     */
    constructor(address _watchNFTAddress, address _paymentTokenAddress) Ownable(msg.sender) {
        if (_watchNFTAddress == address(0)) revert InvalidAddress();
        if (_paymentTokenAddress == address(0)) revert InvalidAddress();

        watchNFT = WatchNFT(_watchNFTAddress);
        paymentToken = IERC20(_paymentTokenAddress);
        feeRecipient = msg.sender;
    }

    // ==========================================
    // ADMIN FUNCTIONS
    // ==========================================

    /**
     * @notice Pauses trading across the marketplace.
     */
    function pauseMarketplace() external onlyOwner { _pause(); }

    /**
     * @notice Resumes trading across the marketplace.
     */
    function resumeMarketplace() external onlyOwner { _unpause(); }
   
    /**
     * @notice Updates the wallet address that receives platform fees.
     * @param _newRecipient New fee recipient address.
     */
    function updateFeeRecipient(address _newRecipient) external onlyOwner {
        if (_newRecipient == address(0)) revert InvalidAddress();
        feeRecipient = _newRecipient;
        emit FeeRecipientUpdated(_newRecipient);
    }

    /**
     * @notice Adjusts the global fee and deposit percentages.
     * @dev Max values enforced for user protection (10%, 10%, 5%, 5%).
     * @param _market Platform fee percentage (base 10000).
     * @param _royalty Manufacturer royalty percentage.
     * @param _wm Watchmaker fee percentage for P2P.
     * @param _deposit Seller deposit percentage for P2P.
     */
    function setFees(uint256 _market, uint256 _royalty, uint256 _wm, uint256 _deposit) external onlyOwner {
        if (_market > 1000 || _royalty > 1000 || _wm > 500 || _deposit > 500) revert InvalidPrice();
        marketPlaceFeePercent = _market;
        royaltyPercent = _royalty;
        watchmakerFeePercent = _wm;
        sellerDepositPercent = _deposit;
    }

    /**
     * @notice Reverses an escrow transaction in case of legal dispute or logistics failure.
     * @param _tokenId The ID of the watch in escrow.
     * @param punishSeller True if the seller caused the failure (forfeits deposit).
     */
    function refundEscrow(uint256 _tokenId, bool punishSeller) external whenNotPaused nonReentrant {
        Listing storage listing = listings[_tokenId];
        if (listing.state != ListingState.Escrowed) revert InactiveListing();
        if (msg.sender != owner() && msg.sender != logisticsSystem) revert Unauthorized();

        address buyer = listing.buyer;
        address seller = listing.seller;
        uint256 price = listing.price;
        uint256 deposit = listing.sellerDeposit;

        delete listings[_tokenId];

        // 1. Refund the buyer
        if (!paymentToken.transfer(buyer, price)) revert TransferFailed();

        // 2. Handle seller deposit logic
        if (deposit > 0) {
            if (punishSeller) {
                // Seller forfeits deposit to the platform
                if (!paymentToken.transfer(feeRecipient, deposit)) revert TransferFailed();
            } else {
                // Seller recovers deposit
                if (!paymentToken.transfer(seller, deposit)) revert TransferFailed();
            }
        }

        // 3. Return the NFT to the seller
        watchNFT.transferFrom(address(this), seller, _tokenId);

        emit EscrowRefunded(_tokenId, buyer, seller, price);
    }

    function setLogisticsSystem(address _systemAddress) external onlyOwner {
        if (_systemAddress == address(0)) revert InvalidAddress();
        logisticsSystem = _systemAddress;
    }

    /**
     * @notice Updates the ERC20 payment token address (e.g. for mainnet USDC migration).
     */
    function setPaymentToken(address _newPaymentToken) external onlyOwner {
        if (_newPaymentToken == address(0)) revert InvalidAddress();
        paymentToken = IERC20(_newPaymentToken);
    }

    // ==========================================
    // LOGISTICS SYSTEM FUNCTIONS
    // ==========================================

    /**
     * @notice Marks an escrowed watch as shipped by the logistics provider.
     * @param _tokenId The ID of the shipped watch.
     */
    function markAsShipped(uint256 _tokenId) external {
        if (msg.sender != logisticsSystem) revert NotLogisticsSystem();
        Listing storage listing = listings[_tokenId];
        if (listing.state != ListingState.Escrowed) revert NotInEscrow();
        if (listing.isShipped) revert AlreadyShipped();

        listing.isShipped = true;
        emit WatchShipped(_tokenId);
    }

    /**
     * @notice Assigns a specific watchmaker to verify a P2P transaction.
     * @param _tokenId The ID of the watch in transit.
     * @param _watchmaker Address of the assigned watchmaker.
     */
    function assignWatchmaker(uint256 _tokenId, address _watchmaker) external {
        if (msg.sender != logisticsSystem) revert Unauthorized();
        if (listings[_tokenId].state != ListingState.Escrowed) revert NotInEscrow();
        listings[_tokenId].assignedWatchmaker = _watchmaker;
        emit WatchmakerAssigned(_tokenId, _watchmaker);
    }

    // ==========================================
    // SELLER LISTING FUNCTIONS
    // ==========================================

    /**
     * @notice Lists a watch for sale on the marketplace.
     * @param _tokenId The ID of the watch to list.
     * @param _price Desired sale price in payment token base units.
     */
    function listWatch(uint256 _tokenId, uint256 _price) external whenNotPaused nonReentrant {
        if (_price == 0) revert InvalidPrice();
        if (watchNFT.ownerOf(_tokenId) != msg.sender) revert NotOwner();
        if (listings[_tokenId].state != ListingState.Inactive) revert AlreadyListed();

        // Verify marketplace has approval to move the token
        if (!(watchNFT.getApproved(_tokenId) == address(this) || watchNFT.isApprovedForAll(msg.sender, address(this)))) {
            revert MarketplaceNotApproved();
        }

        // Verify watch is not flagged as stolen, lost, or altered
        WatchNFT.Watch memory watchData = watchNFT.getWatchData(_tokenId);
        if (uint(watchData.state) != 0) revert WatchNotActive();

        // Determine if seller is an authorized entity (Dealer/Manufacturer) or standard user (P2P)
        bool isTrusted = watchNFT.authorizedDealers(msg.sender) || watchNFT.authorizedManufacturers(msg.sender);
        bool isP2P = !isTrusted;

        // Store the listing
        listings[_tokenId] = Listing({
            seller: msg.sender,
            buyer: address(0),
            price: _price,
            sellerDeposit: 0,
            isP2P: isP2P,
            watchmakerApproved: isTrusted, // Trusted entities bypass verification
            isShipped: false,
            assignedWatchmaker: address(0),
            verifyingWatchmaker: address(0),
            state: ListingState.Active
        });

        emit WatchListed(_tokenId, msg.sender, _price);
    }

    /**
     * @notice Cancels an active listing.
     * @param _tokenId The ID of the listed watch.
     */
    function cancelListing(uint256 _tokenId) external whenNotPaused { 
        Listing storage listing = listings[_tokenId];
        if (listing.seller != msg.sender) revert Unauthorized();
        if (listing.state != ListingState.Active) revert InactiveListing();

        delete listings[_tokenId];
        emit ListingCancelled(_tokenId, msg.sender);
    }

    /**
     * @notice Updates the price of an active listing.
     * @param _tokenId The ID of the listed watch.
     * @param _newPrice The new sale price.
     */
    function updateListingPrice(uint256 _tokenId, uint256 _newPrice) external {
        Listing storage listing = listings[_tokenId];

        if (listing.seller != msg.sender) revert Unauthorized();
        if (_newPrice == 0) revert InvalidPrice();
        if (listing.state != ListingState.Active) revert InactiveListing();

        uint256 oldPrice = listing.price;
        listing.price = _newPrice;

        emit ListingPriceUpdated(_tokenId, oldPrice, _newPrice);
    }

    // ==========================================
    // BUYER & ESCROW FUNCTIONS
    // ==========================================

    /**
     * @notice Executes a purchase at the listed price, moving funds and token into escrow.
     * @param _tokenId The ID of the watch to buy.
     */
    function buyWatchEscrow(uint256 _tokenId) external whenNotPaused nonReentrant {
        Listing storage listing = listings[_tokenId];

        if (listing.state != ListingState.Active) revert InactiveListing();
        if (listing.seller == msg.sender) revert SelfPurchaseNotAllowed();

        // 1. Collect seller deposit (Only for P2P transactions)
        if(listing.isP2P) {
            uint256 deposit = (listing.price * sellerDepositPercent) / 10000;
            listing.sellerDeposit = deposit;
        
            if (!paymentToken.transferFrom(listing.seller, address(this), deposit)) revert TransferFailed();
        }

        // 2. Lock buyer funds into escrow
        if (!paymentToken.transferFrom(msg.sender, address(this), listing.price)) revert TransferFailed();

        // 3. Update listing state
        listing.buyer = msg.sender;
        listing.state = ListingState.Escrowed;

        // 4. Lock NFT into contract escrow
        watchNFT.transferFrom(listing.seller, address(this), _tokenId);

        emit EscrowInitiated(_tokenId, msg.sender, listing.price);
    }

    /**
     * @notice Confirms final delivery, distributing funds and unlocking the NFT to the buyer.
     * @dev Callable by the buyer or the logistics system.
     * @param _tokenId The ID of the delivered watch.
     */
    function confirmDelivery(uint256 _tokenId) external whenNotPaused nonReentrant {
        Listing storage listing = listings[_tokenId];

        if (listing.state != ListingState.Escrowed) revert NotInEscrow();
        if (!listing.watchmakerApproved) revert PendingVerification();

        if (msg.sender != listing.buyer && msg.sender != owner() && msg.sender != logisticsSystem) {
            revert Unauthorized();
        }

        address manufacturer = watchNFT.getWatchManufacturer(_tokenId);
        uint256 price = listing.price;
        uint256 deposit = listing.sellerDeposit;
        address seller = listing.seller;

        // Calculate fees
        uint256 platformFee = (price * marketPlaceFeePercent) / 10000;
        uint256 royaltyFee = (manufacturer != address(0)) ? (price * royaltyPercent) / 10000 : 0;
        uint256 watchmakerFee = (listing.isP2P) ? (price * watchmakerFeePercent) / 10000 : 0;
        uint256 sellerPayout = price - platformFee - royaltyFee - watchmakerFee;

        // Cache state and clear listing before transfers (CEI Pattern)
        address buyer = listing.buyer;
        address verifyingWm = listing.verifyingWatchmaker;
        delete listings[_tokenId];

        // Execute token transfers
        if (platformFee > 0 && !paymentToken.transfer(feeRecipient, platformFee)) revert TransferFailed();
        if (royaltyFee > 0 && !paymentToken.transfer(manufacturer, royaltyFee)) revert TransferFailed();
        if (watchmakerFee > 0 && !paymentToken.transfer(verifyingWm, watchmakerFee)) revert TransferFailed();
        if (sellerPayout > 0 && !paymentToken.transfer(seller, sellerPayout)) revert TransferFailed();
        if (deposit > 0 && !paymentToken.transfer(seller, deposit)) revert TransferFailed();

        // Transfer NFT to the new owner
        watchNFT.transferFrom(address(this), buyer, _tokenId);

        emit SaleCompleted(_tokenId, msg.sender, seller, price);
    }

    // ==========================================
    // WATCHMAKER P2P FUNCTIONS
    // ==========================================

    /**
     * @notice Submits the result of physical watch authentication during a P2P transaction.
     * @dev If rejected, the seller loses their deposit, the buyer is fully refunded, and the NFT is flagged.
     * @param _tokenId The ID of the watch in transit.
     * @param _isAuthentic True if genuine, false if fake or tampered.
     */
    function verifyAuthenticity(uint256 _tokenId, bool _isAuthentic) external whenNotPaused nonReentrant {
        Listing storage listing = listings[_tokenId];
        
        if (listing.state != ListingState.Escrowed) revert NotInEscrow();
        if (!listing.isShipped) revert NotShipped();
        if (msg.sender != listing.assignedWatchmaker) revert NotAssignedWatchmaker();

        // Calculate watchmaker compensation
        uint256 watchmakerFee = (listing.price * watchmakerFeePercent) / 10000;

        if (_isAuthentic) {
            listing.watchmakerApproved = true;
            listing.verifyingWatchmaker = msg.sender;
            emit AuthenticityApproved(_tokenId, msg.sender);
        } else {
            address buyer = listing.buyer;
            address seller = listing.seller;
            uint256 price = listing.price;
            uint256 deposit = listing.sellerDeposit;

            delete listings[_tokenId];

            // 1. Fully refund the buyer (100%)
            if (!paymentToken.transfer(buyer, price)) revert TransferFailed();

            // 2. Pay watchmaker using the seller's deposit
            uint256 actualWmFee = watchmakerFee > deposit ? deposit : watchmakerFee;
            if (actualWmFee > 0 && !paymentToken.transfer(msg.sender, actualWmFee)) revert TransferFailed();

            // 3. Platform keeps the remaining deposit as a penalty
            uint256 penalty = deposit > actualWmFee ? deposit - actualWmFee : 0;
            if (penalty > 0 && !paymentToken.transfer(feeRecipient, penalty)) revert TransferFailed();

            // 4. Return NFT and flag it as altered
            watchNFT.transferFrom(address(this), seller, _tokenId);
            watchNFT.alteredWatch(_tokenId); // Updated function name mapping

            emit AuthenticityRejected(_tokenId, msg.sender);
        }
    }
    
    // ==========================================
    // AUCTION INTEGRATION
    // ==========================================

    /**
     * @notice Generates an escrow listing directly from a concluded auction.
     * @dev Bypasses standard listing logic, forces watchmaker bypass.
     * @param _tokenId The ID of the auctioned watch.
     * @param _seller The winner/seller.
     * @param _buyer The highest bidder.
     * @param _price Final auction price.
     */
    function createAuctionEscrow(uint256 _tokenId, address _seller, address _buyer, uint256 _price) external {
        if (msg.sender != auctionContract) revert Unauthorized();

        Listing storage l = listings[_tokenId];
        l.seller = _seller;
        l.buyer = _buyer;
        l.price = _price;
        l.state = ListingState.Escrowed;
        l.watchmakerApproved = true;
        l.isP2P = false; 

        emit EscrowInitiated(_tokenId, _buyer, _price);
    }  

    /**
     * @notice Links the external Auction smart contract.
     * @param _auctionContract Address of the auction contract.
     */
    function setAuctionContract(address _auctionContract) external onlyOwner {
        if (_auctionContract == address(0)) revert InvalidAddress();
        auctionContract = _auctionContract;
    }   
}