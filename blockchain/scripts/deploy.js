const { ethers } = require("hardhat");

/**
 * @dev Deployment script for Axia Luxury Ecosystem on Polygon Amoy
 * Order of deployment:
 * 1. WatchNFT (The Identity)
 * 2. MockUSDC (The Currency - for testing)
 * 3. WatchMarketplace (The Economy)
 * 4. WatchAuction (The Bidding System)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // --- 1. DEPLOY WATCH NFT ---
  const WatchNFT = await ethers.getContractFactory("WatchNFT");
  const watchNFT = await WatchNFT.deploy();
  await watchNFT.waitForDeployment();
  const watchNFTAddress = await watchNFT.getAddress();
  console.log("\n1. WatchNFT deployed to:", watchNFTAddress);

  // --- 2. DEPLOY MOCK USDC ---
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();
  console.log("\n2. MockUSDC deployed to:", mockUSDCAddress);

  // --- 3. DEPLOY WATCH MARKETPLACE ---
  const WatchMarketplace = await ethers.getContractFactory("WatchMarketplace");
  const watchMarketplace = await WatchMarketplace.deploy(watchNFTAddress, mockUSDCAddress);
  await watchMarketplace.waitForDeployment();
  const marketplaceAddress = await watchMarketplace.getAddress();
  console.log("\n4. WatchMarketplace deployed to:", marketplaceAddress);

  // --- 4. DEPLOY WATCH AUCTION ---
  const WatchAuction = await ethers.getContractFactory("WatchAuction");
  const watchAuction = await WatchAuction.deploy(watchNFTAddress, mockUSDCAddress, marketplaceAddress);
  await watchAuction.waitForDeployment();
  const auctionAddress = await watchAuction.getAddress();
  console.log("\n5. WatchAuction deployed to:", auctionAddress);

  // --- 5. INITIAL CONFIGURATION (LINKING) ---
  
  // Link Marketplace in NFT contract
  await watchNFT.setMarketplaceAddress(marketplaceAddress);
  console.log("\n- Marketplace linked in WatchNFT");

  // Link Auction Contract in Marketplace
  await watchMarketplace.setAuctionContract(auctionAddress);
  console.log("- Auction Contract linked in WatchMarketplace");

  // Set Logistics System (backend wallet that calls markAsShipped)
  const LOGISTICS_WALLET = "0xb48D5f419984698fFf66511809c7B11FA098443a";
  await watchMarketplace.setLogisticsSystem(LOGISTICS_WALLET);
  console.log("- Logistics System set to", LOGISTICS_WALLET);

  // Authorize deployer as Manufacturer
  await watchNFT.manageManufacturer(deployer.address, true);
  console.log("- Deployer authorized as Manufacturer");

  console.log("\n==============================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("==============================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });