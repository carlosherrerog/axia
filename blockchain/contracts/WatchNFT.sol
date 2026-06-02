// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// Custom Errors for WatchNFT
error NotAuthorizedWatchmaker();
error NotAuthorizedManufacturer();
error NFCEmpty();
error NFCAlreadyRegistered();
error NFCNotRegistered();
error TokenDoesNotExist();
error NotAuthorized();
error NotOwner();
error WatchAltered();
error WatchDestroyed();
error InvalidState();
error TransferBlocked();
error NotAltered();

/**
 * @title Axia Luxury Watch NFT Contract
 * @dev Implementation of the ERC-721 Token standard for physical watch authentication.
 * Integrates NFC UID hashing and role-based access control for manufacturers and watchmakers.
 */
contract WatchNFT is ERC721URIStorage, Ownable, Pausable {

    /// @dev Represents the physical and commercial status of the watch.
    enum WatchState { Active, Stolen, Lost, Destroyed, AlteredWatch }

    /// @dev Structure representing a maintenance or repair revision.
    struct Revision {
        uint256 date;
        address watchmaker;
        string description;
    }

    /// @dev Core data structure for each luxury watch.
    struct Watch {
        string brand;
        string model;
        string serialNumber;
        uint256 manufacturingYear;
        bytes32 hashUID;
        WatchState state;
        address manufacturer;
    }

    /// @dev Structure representing an authenticity verification event.
    struct Verification {
        address watchmaker;
        uint256 date;
        string comment;
    }

    // STATE VARIABLES
    uint256 public nextTokenId;
    address public marketplaceAddress;

    mapping(uint256 => Watch) public watches;
    mapping(uint256 => Revision[]) public watchRevisions;
    mapping(bytes32 => uint256) public nfcToTokenId;
    mapping(address => bool) public authorizedManufacturers;
    mapping(address => bool) public authorizedWatchmakers;
    mapping(address => bool) public authorizedDealers;
    mapping(uint256 => Verification[]) public watchVerifications;

    // EVENTS
    event WatchMinted(uint256 indexed tokenId, bytes32 hashUID, address indexed owner);
    event SecurityStateChanged(uint256 indexed tokenId, WatchState newState);
    event WatchAuthenticityVerified(uint256 indexed tokenId, address indexed watchmaker, uint256 date, string comment);

    // MODIFIERS
    modifier onlyAuthorizedWatchmaker() {
        if (!authorizedWatchmakers[msg.sender]) revert NotAuthorizedWatchmaker();
        _;
    }

    modifier onlyAuthorizedManufacturer() {
        if (!authorizedManufacturers[msg.sender]) revert NotAuthorizedManufacturer();
        _;
    }

    /**
     * @notice Initializes the contract with name and symbol.
     */
    constructor() ERC721("AXIA Watch", "AXIA") Ownable(msg.sender) {}

    /**
     * @notice Mints a new Watch NFT and links it to a physical NFC chip hash.
     * @dev Only authorized manufacturers can call this function.
     */
    function mintWatch(string memory _brand, string memory _model, string memory _serialNumber, uint256 _manufacturingYear,
                       bytes32 _hashUID, string memory _tokenURI, address _recipient
    ) public onlyAuthorizedManufacturer whenNotPaused returns(uint256) {

        if (_hashUID == bytes32(0)) revert NFCEmpty();
        if (nfcToTokenId[_hashUID] != 0) revert NFCAlreadyRegistered();

        nextTokenId++;
        uint256 newItemId = nextTokenId;

        watches[newItemId] = Watch({
            brand: _brand,
            model: _model,
            serialNumber: _serialNumber,
            manufacturingYear: _manufacturingYear,
            hashUID: _hashUID,
            state: WatchState.Active,
            manufacturer: msg.sender
        });

        nfcToTokenId[_hashUID] = newItemId;

        // Verificación de origen: el fabricante certifica la autenticidad en el momento del minteo
        watchVerifications[newItemId].push(Verification({
            watchmaker: msg.sender,
            date: block.timestamp,
            comment: "Certificado de fabricacion original. Reloj vinculado a chip NFC y registrado en blockchain por el fabricante."
        }));

        _safeMint(_recipient, newItemId);
        _setTokenURI(newItemId, _tokenURI);

        emit WatchMinted(newItemId, _hashUID, _recipient);
        emit WatchAuthenticityVerified(newItemId, msg.sender, block.timestamp, "Certificado de fabricacion original.");

        return newItemId;
    }

    /**
     * @dev Overrides ERC721 _update to restrict transfers based on WatchState.
     */
    function _update(address to, uint256 tokenId, address auth) internal override whenNotPaused returns (address) {
        if (auth != address(0) && to != address(0)) {
            if (watches[tokenId].state != WatchState.Active) revert TransferBlocked();
        }
        return super._update(to, tokenId, auth);
    }

    // ==========================================
    // ADMIN FUNCTIONS
    // ==========================================

    function manageWatchmaker(address _watchmaker, bool _status) public onlyOwner {
        authorizedWatchmakers[_watchmaker] = _status;
    }

    function manageManufacturer(address _manufacturer, bool _status) public onlyOwner {
        authorizedManufacturers[_manufacturer] = _status;
    }

    function manageDealer(address _dealer, bool _status) public onlyOwner {
        authorizedDealers[_dealer] = _status;
    }

    function setMarketplaceAddress(address _marketplaceAddress) public onlyOwner {
        marketplaceAddress = _marketplaceAddress;
    }

    /**
     * @notice Pauses all critical contract functions (Emergency stop).
     */
    function pauseContract() public onlyOwner { _pause(); }

    /**
     * @notice Resumes all critical contract functions.
     */
    function resumeContract() public onlyOwner { _unpause(); }

    /**
     * @notice Permanently destroys the NFT. Only allowed when watch is Stolen or Lost.
     */
    function burnWatch(uint256 tokenId) public onlyOwner {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();
        WatchState currentState = watches[tokenId].state;
        if (currentState != WatchState.Stolen && currentState != WatchState.Lost) revert InvalidState();
        watches[tokenId].state = WatchState.Destroyed;
        _burn(tokenId);
    }

    /**
     * @notice Flags a watch as altered (tampered NFC, fake parts). Halts transfers.
     * @dev Callable only by the marketplace contract or the admin.
     */
    function alteredWatch(uint256 _tokenId) external {
        if (!(msg.sender == marketplaceAddress || msg.sender == owner())) revert NotAuthorized();
        watches[_tokenId].state = WatchState.AlteredWatch;
        emit SecurityStateChanged(_tokenId, WatchState.AlteredWatch);
    }

    // ==========================================
    // WATCHMAKER FUNCTIONS
    // ==========================================

    /**
     * @notice Restores a watch from the 'AlteredWatch' state back to 'Active' after proper physical repair.
     */
    function restoreAuthenticity(uint256 _tokenId, string memory _repairDescription) public onlyAuthorizedWatchmaker whenNotPaused {
        if (_ownerOf(_tokenId) == address(0)) revert TokenDoesNotExist();
        if (watches[_tokenId].state != WatchState.AlteredWatch) revert NotAltered();

        watches[_tokenId].state = WatchState.Active;

        watchRevisions[_tokenId].push(Revision({
            date: block.timestamp,
            watchmaker: msg.sender,
            description: _repairDescription
        }));

        emit SecurityStateChanged(_tokenId, WatchState.Active);
    }

    // ==========================================
    // USER FUNCTIONS
    // ==========================================

    /**
     * @notice Allows the owner to report the watch as Stolen or Lost, or revert it to Active.
     */
    function changeSecurityState(uint256 _tokenId, WatchState _newState) public whenNotPaused {
        if (ownerOf(_tokenId) != msg.sender) revert NotOwner();

        if (watches[_tokenId].state == WatchState.AlteredWatch) revert WatchAltered();
        if (watches[_tokenId].state == WatchState.Destroyed) revert WatchDestroyed();

        if (!(_newState == WatchState.Stolen || _newState == WatchState.Lost || _newState == WatchState.Active)) {
            revert InvalidState();
        }

        watches[_tokenId].state = _newState;
        emit SecurityStateChanged(_tokenId, _newState);
    }

    // ==========================================
    // PUBLIC READ FUNCTIONS
    // ==========================================

    function getWatchData(uint256 _tokenId) public view returns (Watch memory) {
        if (_ownerOf(_tokenId) == address(0)) revert TokenDoesNotExist();
        return watches[_tokenId];
    }

    function getWatchManufacturer(uint256 _tokenId) external view returns (address) {
        return watches[_tokenId].manufacturer;
    }

    function getRevisionHistory(uint256 _tokenId) public view returns (Revision[] memory) {
        if (_ownerOf(_tokenId) == address(0)) revert TokenDoesNotExist();
        return watchRevisions[_tokenId];
    }

    function getTokenByNFC(bytes32 _hashUID) public view returns (uint256) {
        uint256 tokenId = nfcToTokenId[_hashUID];
        if (tokenId == 0) revert NFCNotRegistered();
        return tokenId;
    }

    function getVerificationHistory(uint256 _tokenId) public view returns (Verification[] memory) {
        if (_ownerOf(_tokenId) == address(0)) revert TokenDoesNotExist();
        return watchVerifications[_tokenId];
    }
}
