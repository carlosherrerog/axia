const { ethers } = require("hardhat");

/**
 * Verifica y configura el enlace entre WatchAuction y WatchMarketplace en testnet.
 * WatchMarketplace.createAuctionEscrow() requiere que msg.sender == auctionContract.
 * Si este valor no está configurado, endAuction() revertirá con Unauthorized cuando hay ganador.
 *
 * Ejecutar con: npx hardhat run scripts/linkAuctionToMarketplace.js --network amoy
 */
async function main() {
  const MARKETPLACE_ADDRESS = "0x0b37B3C1A5e3ae541c0793eAd83975f683dA3aB5";
  const AUCTION_ADDRESS     = "0xe995aC6099389EAc72AC51212dA02EFA3117D6Ae";

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
