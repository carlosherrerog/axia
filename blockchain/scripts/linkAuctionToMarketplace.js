const { ethers } = require("hardhat");

/**
 * Verifica y configura el enlace entre WatchAuction y WatchMarketplace en testnet.
 * WatchMarketplace.createAuctionEscrow() requiere que msg.sender == auctionContract.
 * Si este valor no está configurado, endAuction() revertirá con Unauthorized cuando hay ganador.
 *
 * Ejecutar con: npx hardhat run scripts/linkAuctionToMarketplace.js --network amoy
 */
async function main() {
  const MARKETPLACE_ADDRESS = "0xBc2a666C02AEa56831C0afF1D9b26A5149c88E95";
  const AUCTION_ADDRESS     = "0xcD7320Cf7d59cF5089F55E177e4073B4D3Ef0532";

  const [deployer] = await ethers.getSigners();
  console.log("Ejecutando con la cuenta:", deployer.address);

  const marketplace = await ethers.getContractAt("WatchMarketplace", MARKETPLACE_ADDRESS);

  const current = await marketplace.auctionContract();
  console.log("\nauctionContract actual en el marketplace:", current);

  if (current.toLowerCase() === AUCTION_ADDRESS.toLowerCase()) {
    console.log("✅ Ya está configurado correctamente. No se necesita ninguna acción.");
    return;
  }

  console.log("⚠️  No está configurado. Llamando a setAuctionContract...");
  const tx = await marketplace.setAuctionContract(AUCTION_ADDRESS);
  console.log("Transacción enviada:", tx.hash);
  await tx.wait();

  const updated = await marketplace.auctionContract();
  console.log("✅ auctionContract actualizado a:", updated);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
