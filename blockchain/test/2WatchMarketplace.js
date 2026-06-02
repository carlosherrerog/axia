const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WatchMarketplace", function (){
    let MockUSDC, WatchNFT, WatchMarketplace;
    let mockUSDC, watchNFT, watchNFTMarketplace;
    let mockUSDCAddress, watchNFTAddress, marketplaceAddress;
    let owner, rolex, client1, client2, client3, logisticsSystem, feeRecipient, watchmaker, watchmaker2;

    let initialRoyaltyBalance;
    let initialPlatformBalance;
    let initialWatchmakerBalance;

    beforeEach(async function () {
        [owner, rolex, client1, client2, client3, logisticsSystem, feeRecipient, watchmaker, watchmaker2] = await ethers.getSigners();

        // despliega el USDC
        MockUSDC = await ethers.getContractFactory("MockUSDC");
        mockUSDC = await MockUSDC.deploy();
        mockUSDCAddress = await mockUSDC.getAddress();

        // despliega el WatchNFT
        WatchNFT = await ethers.getContractFactory("WatchNFT");
        watchNFT = await WatchNFT.deploy();
        watchNFTAddress = await watchNFT.getAddress();

        // despliega el WatchMarketplace
        WatchMarketplace = await ethers.getContractFactory("WatchMarketplace");
        watchMarketplace = await WatchMarketplace.deploy(watchNFTAddress, mockUSDCAddress);
        marketplaceAddress = await watchMarketplace.getAddress();

        await watchMarketplace.setLogisticsSystem(logisticsSystem.address);
        await watchMarketplace.updateFeeRecipient(feeRecipient.address);
        await watchNFT.setMarketplaceAddress(marketplaceAddress);

        // permisos a fabricante para mintear un reloj para client1 y este le da permisos al Marketplace
        await watchNFT.manageManufacturer(rolex.address, true);
        await watchNFT.connect(rolex).mintWatch("Rolex", "Submariner",  "numeroSerie", 2024, ethers.id("NFC-FAB1"), "ipfs://foto-fab1", client1.address);
        await watchNFT.connect(client1).setApprovalForAll(marketplaceAddress, true);    

        // SALDOS GLOBALES
        const amount = ethers.parseUnits("10000", 6);
        await mockUSDC.mint(client1.address, amount);
        await mockUSDC.mint(client2.address, amount);
        await mockUSDC.mint(client3.address, amount);

        // permisos al marketPlace para sacar el dinero de los clientes
        await mockUSDC.connect(client1).approve(marketplaceAddress, ethers.MaxUint256);
        await mockUSDC.connect(client2).approve(marketplaceAddress, ethers.MaxUint256);
        await mockUSDC.connect(client3).approve(marketplaceAddress, ethers.MaxUint256);

        initialRoyaltyBalance = await mockUSDC.balanceOf(rolex.address);
        initialPlatformBalance = await mockUSDC.balanceOf(feeRecipient);
        initialWatchmakerBalance = await mockUSDC.balanceOf(watchmaker.address);
    });

    it("USER CU 1. COMO usuario QUIERO listar mi reloj y poder modificar su precio sin pagar fianza anticipada.", async function () {
        const tokenId = 1;
        const initialClientBalance = ethers.parseUnits("10000", 6);

        // 1. lista el reloj
        const initialPrice = ethers.parseUnits("5000", 6); 

        await expect(watchMarketplace.connect(client1).listWatch(tokenId, initialPrice))
            .to.emit(watchMarketplace, "WatchListed")
            .withArgs(tokenId, client1.address, initialPrice);

        let currentBalance = await mockUSDC.balanceOf(client1.address);
        expect(currentBalance).to.equal(initialClientBalance);

        // 2. modifica el precio
        const newPrice = ethers.parseUnits("8000", 6);

        await expect(watchMarketplace.connect(client1).updateListingPrice(tokenId, newPrice))
            .to.emit(watchMarketplace, "ListingPriceUpdated")
            .withArgs(tokenId, initialPrice, newPrice);

        currentBalance = await mockUSDC.balanceOf(client1.address);
        expect(currentBalance).to.equal(initialClientBalance);

        const listing = await watchMarketplace.listings(tokenId);
        expect(listing.price).to.equal(newPrice);
        expect(listing.sellerDeposit).to.equal(0);
    });

    it("USER CU 2. COMO usuario QUIERO configurar el estado de mis relojes (en venta, no a la venta).", async function () {
        const tokenId = 1;
        const price = ethers.parseUnits("5000", 6);
        const initialBalance = ethers.parseUnits("10000", 6);

        // 1. lista el reloj
        await expect(watchMarketplace.connect(client1).listWatch(tokenId, price))
            .to.emit(watchMarketplace, "WatchListed");

        let listing = await watchMarketplace.listings(tokenId);
        expect(listing.state).to.equal(1); // 1 = Active

        // el contrato NO debe tener dinero del usuario
        expect(await mockUSDC.balanceOf(marketplaceAddress)).to.equal(0);

        // 2. pone el reloj como no a la venta
        await expect(watchMarketplace.connect(client1).cancelListing(tokenId))
            .to.emit(watchMarketplace, "ListingCancelled");

        listing = await watchMarketplace.listings(tokenId);
        expect(listing.state).to.equal(0); // 0 = Inactive

        // el saldo del usuario sigue siendo el mismo que al principio
        expect(await mockUSDC.balanceOf(client1.address)).to.equal(initialBalance);
    });

    it("USER CU 3. COMO vendedor particular (P2P) QUIERO depositar una fianza en USDC al aceptar una oferta.", async function () {
        // Flujo nuevo: comprador firma EIP-712 off-chain (sin coste de gas);
        // el vendedor acepta actualizando el precio on-chain con updateListingPrice;
        // el comprador completa la compra con buyWatchEscrow, que retira sus fondos Y la fianza del vendedor en una sola tx.
        const tokenId = 1;
        const listPrice   = ethers.parseUnits("5000", 6);
        const offerAmount = ethers.parseUnits("4000", 6);
        // fianza del 2% sobre el precio acordado
        const expectedDeposit = (offerAmount * 200n) / 10000n; // 80 USDC

        await watchMarketplace.connect(client1).listWatch(tokenId, listPrice);

        const initialSellerBalance = await mockUSDC.balanceOf(client1.address);
        const initialBuyerBalance  = await mockUSDC.balanceOf(client2.address);

        // EL VENDEDOR acepta la oferta actualizando el precio del listing al precio acordado
        // (la fianza del vendedor ya está pre-aprobada con MaxUint256 en beforeEach)
        await watchMarketplace.connect(client1).updateListingPrice(tokenId, offerAmount);

        // EL COMPRADOR completa la compra: en una sola tx el contrato retira sus 4000 USDC + 80 USDC de fianza del vendedor
        await expect(watchMarketplace.connect(client2).buyWatchEscrow(tokenId))
            .to.emit(watchMarketplace, "EscrowInitiated");

        // verificación del listing
        const listing = await watchMarketplace.listings(tokenId);
        expect(listing.state).to.equal(2); // 2 = Escrowed
        expect(listing.buyer).to.equal(client2.address);
        expect(listing.price).to.equal(offerAmount);
        expect(listing.sellerDeposit).to.equal(expectedDeposit);

        // el contrato debe tener exactamente 4080 USDC (4000 del comprador + 80 de fianza del vendedor)
        const contractBalance = await mockUSDC.balanceOf(marketplaceAddress);
        expect(contractBalance).to.equal(offerAmount + expectedDeposit);

        // el vendedor tiene 80 USDC menos por la fianza
        expect(await mockUSDC.balanceOf(client1.address)).to.equal(initialSellerBalance - expectedDeposit);
        // el comprador tiene 4000 USDC menos por la compra
        expect(await mockUSDC.balanceOf(client2.address)).to.equal(initialBuyerBalance - offerAmount);

        // el NFT está custodiado en el contrato
        expect(await watchNFT.ownerOf(tokenId)).to.equal(marketplaceAddress);
    });

    it("USER CU 4. COMO comprador QUIERO realizar ofertas de compra sin coste de gas ni bloqueo previo de fondos.", async function () {
        const token2 = 2; 
        const token3 = 3; 
        const offerAmount1 = ethers.parseUnits("4000", 6);
        const offerAmount2 = ethers.parseUnits("3500", 6);
        
        await watchNFT.connect(rolex).mintWatch("Rolex", "Daytona", "numeroSerie",2024, ethers.id("NFC-002"), "ipfs://foto-fab2", client2.address);
        await watchNFT.connect(rolex).mintWatch("Rolex", "GMT", "numeroSerie", 2024, ethers.id("NFC-003"), "ipfs://foto-fab3", client3.address);

        // saldos y permisos de USDC del comprador ANTES de firmar las ofertas
        const initialBuyerBalance = await mockUSDC.balanceOf(client1.address);
        const initialBuyerAllowance = await mockUSDC.allowance(client1.address, marketplaceAddress);

        // FIRMA OFF-CHAIN, client1 hace una oferta a client2 por su reloj 
        const messageHash1 = ethers.solidityPackedKeccak256(["uint256", "address", "uint256", "address"],
            [token2, client1.address, offerAmount1, marketplaceAddress]
        );
        const signature1 = await client1.signMessage(ethers.getBytes(messageHash1));

        // FIRMA OFF-CHAIN, client1 hace una oferta a client3 por su reloj 
        const messageHash2 = ethers.solidityPackedKeccak256(["uint256", "address", "uint256", "address"],
            [token3, client1.address, offerAmount2, marketplaceAddress]
        );
        const signature2 = await client1.signMessage(ethers.getBytes(messageHash2));

        // saldos y permisos de USDC del comprador DESPUÉS de firmar las ofertas
        const finalBuyerBalance = await mockUSDC.balanceOf(client1.address);
        const finalBuyerAllowance = await mockUSDC.allowance(client1.address, marketplaceAddress);

        // VERIFICACIONES
        // 1. las firmas existen y se generaron correctamente off-chain
        expect(signature1).to.not.be.undefined;
        expect(signature2).to.not.be.undefined;
        expect(signature1).to.not.equal(signature2); // son firmas distintas para ofertas distintas

        // el saldo total en USDC no disminuyó al hacer las ofertas
        expect(finalBuyerBalance).to.equal(initialBuyerBalance);

        // 3. no se alteraron los permisos (allowance) hacia el contrato al firmar
        expect(finalBuyerAllowance).to.equal(initialBuyerAllowance);
    });

    it("USER CU 5. COMO comprador QUIERO que mis fondos se transfieran al contrato SOLO cuando yo complete la compra.", async function () {
        // Flujo nuevo: el vendedor actualiza el precio on-chain (updateListingPrice) sin mover fondos;
        // el comprador decide cuándo ejecutar buyWatchEscrow y es en ese momento cuando los fondos se mueven.
        const token1 = 1;
        const offerAmount     = ethers.parseUnits("4000", 6);
        const expectedDeposit = (offerAmount * 200n) / 10000n; // 80 USDC

        await watchMarketplace.connect(client1).listWatch(token1, ethers.parseUnits("5000", 6));

        const initialBuyerBalance = await mockUSDC.balanceOf(client2.address);

        // COMPRADOR firma la oferta off-chain (EIP-712) sin ningún coste de gas ni bloqueo de fondos
        // (la firma la gestiona el backend; aquí solo verificamos el comportamiento del contrato)
        expect(await mockUSDC.balanceOf(client2.address)).to.equal(initialBuyerBalance); // sin cambio

        // VENDEDOR acepta la oferta actualizando el precio on-chain → los fondos del comprador NO se mueven
        await watchMarketplace.connect(client1).updateListingPrice(token1, offerAmount);
        expect(await mockUSDC.balanceOf(client2.address)).to.equal(initialBuyerBalance); // sigue igual

        // COMPRADOR ejecuta la compra → ahora SÍ se transfieren los fondos al contrato
        await watchMarketplace.connect(client2).buyWatchEscrow(token1);

        // el balance del comprador ha disminuido exactamente en la cantidad de la oferta
        expect(await mockUSDC.balanceOf(client2.address)).to.equal(initialBuyerBalance - offerAmount);

        // el contrato tiene los fondos (4000 del comprador + 80 de fianza del vendedor)
        const contractBalance = await mockUSDC.balanceOf(marketplaceAddress);
        expect(contractBalance).to.equal(offerAmount + expectedDeposit);

        // NFT custodiado en el contrato
        expect(await watchNFT.ownerOf(token1)).to.equal(marketplaceAddress);
    });

    const { time } = require("@nomicfoundation/hardhat-network-helpers");

    it("USER CU 6. COMO vendedor QUIERO que mi NFT se transfiera automáticamente al comprador solo cuando el contrato valide la entrega.", function () {});

        it("        6.1. Flujo Ideal: Compra directa, envío, asignación, certificación y confirmación del cliente.", async function () {
            const listPrice = ethers.parseUnits("5000", 6);
            const tokenId = 2;
            await watchNFT.connect(rolex).mintWatch("Rolex", "Submariner",  "numeroSerie", 2024, ethers.id("NFC-005"), "ipfs://foto2", client2.address);
            await watchNFT.connect(client2).approve(marketplaceAddress, tokenId);
            await watchMarketplace.connect(client2).listWatch(tokenId, listPrice);

            const initialWatchmakerBalance = await mockUSDC.balanceOf(watchmaker.address);
            const watchmakerFeePercent = await watchMarketplace.watchmakerFeePercent();
            const watchmakerFee = (listPrice * watchmakerFeePercent) / 10000n;

            // 1. compra directa por client1
            await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);

            // 2. el sistema marca el reloj como enviado (previamente tiene que verificar si el vendedor lo ha enviado)
            //    y se asigna un relojero específico para verificar el reloj
            await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);
            await watchMarketplace.connect(logisticsSystem).assignWatchmaker(tokenId, watchmaker.address);

            // 3. el relojero específico verifica el reloj
            await watchMarketplace.connect(watchmaker).verifyAuthenticity(tokenId, true);

            // 4. cliente confirma la recepción escaneando el NFC
            await watchMarketplace.connect(client1).confirmDelivery(tokenId);

            // VERIFICACIONES
            expect(await watchNFT.ownerOf(tokenId)).to.equal(client1.address);
    
            // client2 recibe el precio + la devolución de su fianza
            const sellerFinalBalance = await mockUSDC.balanceOf(client2.address);
            expect(sellerFinalBalance).to.be.above(ethers.parseUnits("10000", 6)); 

            // el relojero recibe su comisión
            expect(await mockUSDC.balanceOf(watchmaker.address)).to.equal(initialWatchmakerBalance + watchmakerFee);
        });

        it("        6.2. Penalización: client1 compra a client3, y el vendedor consume el tiempo de entrega.", async function () {
            const tokenId = 2;
            const listPrice = ethers.parseUnits("5000", 6);
            const sellerDeposit = (listPrice * 200n) / 10000n; // 2% fianza
            await watchNFT.connect(rolex).mintWatch("Rolex", "Daytona", "numeroSerie", 2024, ethers.id("NFC-006"), "ipfs://foto2", client3.address);
            await watchNFT.connect(client3).approve(marketplaceAddress, tokenId);
            await watchMarketplace.connect(client3).listWatch(tokenId, listPrice);

            const initialBuyerBalance1 = await mockUSDC.balanceOf(client1.address);
            const initialBuyerBalance3 = await mockUSDC.balanceOf(client3.address);
            
            // compra directa por client1
            await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);

            // se simula que pasan los 5 días de plazo de envío
            await time.increase(5 * 24 * 60 * 60 + 1);

            // el sistema cancela la compra por plazo acabado (devuelve dinero al comprador y se queda con fianza vendedor)
            await watchMarketplace.connect(logisticsSystem).refundEscrow(tokenId, true);
            
            // VERIFICACIONES
            // comprador recupera su dinero entero 
            expect(await mockUSDC.balanceOf(client1.address)).to.be.equal(initialBuyerBalance1);
            
            // el vendedor se queda sin su fianza y recupera su NFT (ya no está listado)
            expect(await mockUSDC.balanceOf(client3.address)).to.be.gte(initialBuyerBalance3 - sellerDeposit);
            expect(await watchNFT.ownerOf(tokenId)).to.equal(client3.address);
        });

        it("        6.3. Rechazo: client1 compra a client3, envía a tiempo, pero el relojero no lo certifica.", async function () {
            const tokenId = 2;
            const listPrice = ethers.parseUnits("5000", 6);
            const sellerDeposit = (listPrice * 200n) / 10000n; // 2% fianza
            await watchNFT.connect(rolex).mintWatch("Rolex", "GMT", "numeroSerie",  2024, ethers.id("NFC-007"), "ipfs://foto7", client3.address);
            await watchNFT.connect(client3).approve(marketplaceAddress, tokenId);
            await watchMarketplace.connect(client3).listWatch(tokenId, listPrice);
            
            const initialBuyerBalance1 = await mockUSDC.balanceOf(client1.address);
            const initialSellerBalance = await mockUSDC.balanceOf(client3.address);
            const initialPlatformBalance = await mockUSDC.balanceOf(feeRecipient);
            const initialWatchmakerBalance = await mockUSDC.balanceOf(watchmaker.address);

            const watchmakerFeePercent = await watchMarketplace.watchmakerFeePercent();
            const watchmakerFee = (listPrice * watchmakerFeePercent) / 10000n;

           // compra directa por client1
            await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);

            // el sistema marca el reloj como enviado (previamente tiene que verificar si el vendedor lo ha enviado)
            await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);

            // se asigna un relojero específico para verificar el reloj
            await watchMarketplace.connect(logisticsSystem).assignWatchmaker(tokenId, watchmaker.address);

            // el relojero específico NO verifica el reloj
            await watchMarketplace.connect(watchmaker).verifyAuthenticity(tokenId, false);

            // VERIFICACIONES
            // comprador recupera su dinero entero 
            expect(await mockUSDC.balanceOf(client1.address)).to.be.equal(initialBuyerBalance1);
            
            // el vendedor pierde su fianza
            expect(await mockUSDC.balanceOf(client3.address)).to.equal(initialSellerBalance - sellerDeposit);

            // el relojero recibe su comisión
            expect(await mockUSDC.balanceOf(watchmaker.address)).to.equal(initialWatchmakerBalance + sellerDeposit);

            // la plataforma se queda el sobrante de la fianza
            const platformPenalty = sellerDeposit - watchmakerFee;
            expect(await mockUSDC.balanceOf(feeRecipient)).to.equal(initialPlatformBalance + platformPenalty);
    
            // el NFT vuelve a ser del vendedor
            expect(await watchNFT.ownerOf(tokenId)).to.equal(client3.address);

            // el estado del reloj debe ser AlteredNFC (4)
            const watchData = await watchNFT.getWatchData(tokenId);
            expect(watchData.state).to.equal(4);
        });

        it("        6.4. Auto-Confirmación: Relojero certifica, pero el usuario no confirma en 48h.", async function () {
            const tokenId = 2;
            const listPrice = ethers.parseUnits("5000", 6);
            await watchNFT.connect(rolex).mintWatch("Rolex",  "numeroSerie", "Datejust", 2024, ethers.id("NFC-008"), "ipfs://foto8", client3.address);
            await watchNFT.connect(client3).approve(marketplaceAddress, tokenId);
            await watchMarketplace.connect(client3).listWatch(tokenId, listPrice);

            const initialWatchmakerBalance = await mockUSDC.balanceOf(watchmaker.address);
            const initialSellerBalance = await mockUSDC.balanceOf(client3.address);

            // compra directa por client1
            await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);

            // el sistema marca el reloj como enviado (previamente tiene que verificar si el vendedor lo ha enviado)
            await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);

            // se asigna un relojero específico para verificar el reloj
            await watchMarketplace.connect(logisticsSystem).assignWatchmaker(tokenId, watchmaker.address);

            // el relojero específico verifica el reloj
            await watchMarketplace.connect(watchmaker).verifyAuthenticity(tokenId, true);

            // cliente no confirma la recepción después de 48h (backend servidor llama a esta función)
            await watchMarketplace.connect(logisticsSystem).confirmDelivery(tokenId);

            // VERIFICACIONES
            const wmFeePercent = await watchMarketplace.watchmakerFeePercent();
            const marketFeePercent = await watchMarketplace.marketPlaceFeePercent();
            const royaltyPercent = await watchMarketplace.royaltyPercent();

            const watchmakerFee = (listPrice * wmFeePercent) / 10000n;
            const platformFee = (listPrice * marketFeePercent) / 10000n;
            const royaltyFee = (listPrice * royaltyPercent) / 10000n;
            const sellerPayout = listPrice - platformFee - royaltyFee - watchmakerFee;

            // el NFT ya pertenece al comprador (client1) aunque no haya confirmado él
            expect(await watchNFT.ownerOf(tokenId)).to.equal(client1.address);

            // el vendedor ha recibido su pago neto y recuperado su fianza
            expect(await mockUSDC.balanceOf(client3.address)).to.equal(initialSellerBalance + sellerPayout);

            // el relojero ha recibido su comisión por el trabajo realizado
            expect(await mockUSDC.balanceOf(watchmaker.address)).to.equal(initialWatchmakerBalance + watchmakerFee);

            // el listing ha sido borrado (estado Inactive = 0)
            const listing = await watchMarketplace.listings(tokenId);
            expect(listing.state).to.equal(0);    
        });

        it("        6.5. Reasignación: El sistema logístico cambia de relojero y solo el nuevo puede certificar.", async function () {
            const tokenId = 2; // Usamos un nuevo reloj para este test
            const listPrice = ethers.parseUnits("5000", 6);

            await watchNFT.connect(rolex).mintWatch("Rolex", "Explorer", "numeroSerie", 2024, ethers.id("NFC-009"), "ipfs://foto9", client3.address);
            await watchNFT.connect(client3).approve(marketplaceAddress, tokenId);
            await watchMarketplace.connect(client3).listWatch(tokenId, listPrice);
            
            const initialBuyerBalance = await mockUSDC.balanceOf(client1.address);
            await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);
            await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);

            // 1. el sistema logístico asigna al primer relojero
            await watchMarketplace.connect(logisticsSystem).assignWatchmaker(tokenId, watchmaker.address);

            // 2. hubo un problema (ej. paquete desviado), se REASIGNA a un segundo relojero
            await watchMarketplace.connect(logisticsSystem).assignWatchmaker(tokenId, watchmaker2.address);

            // 3. SEGURIDAD: el primer relojero intenta certificar el reloj, pero el contrato lo rechaza
            await expect(
                watchMarketplace.connect(watchmaker).verifyAuthenticity(tokenId, true)
            ).to.be.revertedWithCustomError(watchMarketplace, "NotAssignedWatchmaker");

            // 4. el segundo relojero certifica el reloj con éxito
            await expect(
                watchMarketplace.connect(watchmaker2).verifyAuthenticity(tokenId, true)
            ).to.emit(watchMarketplace, "AuthenticityApproved")
             .withArgs(tokenId, watchmaker2.address);

            // 5. el comprador confirma la entrega final
            await watchMarketplace.connect(client1).confirmDelivery(tokenId);

            // VERIFICACIONES
            // el NFT pertenece ahora al comprador
            expect(await watchNFT.ownerOf(tokenId)).to.equal(client1.address);

            // el segundo relojero es quien ha cobrado la comisión por su trabajo
            const watchmakerFeePercent = await watchMarketplace.watchmakerFeePercent();
            const watchmakerFee = (listPrice * watchmakerFeePercent) / 10000n;
            
            // el balance del relojero2 debe haber sumado su comisión
            expect(await mockUSDC.balanceOf(watchmaker2.address)).to.equal(watchmakerFee);
            
            // el balance del primer relojero no debió alterarse
            expect(await mockUSDC.balanceOf(watchmaker.address)).to.equal(0);
        });


    it("        7.1. COMO vendedor QUIERO denegar una devolución injustificada PARA que el sistema logístico fuerce la finalización de la venta.", async function () {
        const listPrice = ethers.parseUnits("5000", 6);
        const tokenId = 2;

        await watchNFT.connect(rolex).mintWatch("Rolex", "Sea-Dweller", "numeroSerie", 2024, ethers.id("NFC-REJ1"), "ipfs://rej1", client3.address);
        await watchNFT.connect(client3).approve(marketplaceAddress, tokenId);
        await watchMarketplace.connect(client3).listWatch(tokenId, listPrice);

        const initialBuyerBalance = await mockUSDC.balanceOf(client1.address);
        const initialSellerBalance = await mockUSDC.balanceOf(client3.address);

        // 1. compra y proceso de certificación
        await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);
        await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);
        await watchMarketplace.connect(logisticsSystem).assignWatchmaker(tokenId, watchmaker.address);
        await watchMarketplace.connect(watchmaker).verifyAuthenticity(tokenId, true);

        // 2. el sistema logístico resuelve la disputa forzando la confirmación
        await watchMarketplace.connect(logisticsSystem).confirmDelivery(tokenId);

        // VERIFICACIONES
        const wmFee = (listPrice * 200n) / 10000n;
        const platFee = (listPrice * 150n) / 10000n;
        const royFee = (listPrice * 100n) / 10000n;
        const sellerPayout = listPrice - wmFee - platFee - royFee;

        // el comprador ha perdido sus 5000 USDC
        expect(await mockUSDC.balanceOf(client1.address)).to.equal(initialBuyerBalance - listPrice);

        // el vendedor recibe su parte limpia (payout + fianza devuelta)
        expect(await mockUSDC.balanceOf(client3.address)).to.equal(initialSellerBalance + sellerPayout);

        // el nft se transfiere al comprador por orden del sistema logístico
        expect(await watchNFT.ownerOf(tokenId)).to.equal(client1.address);

        // el relojero recibe su comisión por el peritaje (100 USDC)
        expect(await mockUSDC.balanceOf(watchmaker.address)).to.equal(initialWatchmakerBalance + wmFee);

        // el fabricante (rolex) recibe sus regalías (50 USDC)
        expect(await mockUSDC.balanceOf(rolex.address)).to.equal(initialRoyaltyBalance + royFee);

        // 4. la plataforma recibe su comisión de marketplace (75 USDC)
        expect(await mockUSDC.balanceOf(feeRecipient)).to.be.gte(initialPlatformBalance + platFee);
    });

    it("DEALER CU 1. COMO joyería autorizada QUIERO listar relojes sin depositar fianza PARA agilizar mi operativa profesional.", async function () {
        const tokenId = 2; 
        const listPrice = ethers.parseUnits("10000", 6);

        // 1. Dealer = client3
        await watchNFT.manageDealer(client3.address, true);
        await watchNFT.connect(rolex).mintWatch("Rolex", "Yacht-Master", "numeroSerie", 2024, ethers.id("NFC-DEALER1"), "ipfs://dealer1", client3.address);

        // 2. Dealer lista el reloj
        await watchNFT.connect(client3).approve(marketplaceAddress, tokenId);
        await watchMarketplace.connect(client3).listWatch(tokenId, listPrice);

        // comprobación que el contrato lo marca como venta profesional
        let listing = await watchMarketplace.listings(tokenId);
        expect(listing.isP2P).to.be.false; 
        expect(listing.watchmakerApproved).to.be.true; 

        // 3. el comprador adquiere el reloj (pasa a Escrow)
        const initialDealerBalance = await mockUSDC.balanceOf(client3.address);
        await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);

        // VERIFICACIÓN DE QUE AL DEALER NO LE CUESTA DINERO NI TIENE FIANZ
        listing = await watchMarketplace.listings(tokenId);
        expect(listing.sellerDeposit).to.equal(0);
        expect(await mockUSDC.balanceOf(client3.address)).to.equal(initialDealerBalance); 

        // 4. Completamos el flujo para verificar comisiones
        await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);
        
        const initialPlatformBalance = await mockUSDC.balanceOf(feeRecipient);
        const initialRoyaltyBalance = await mockUSDC.balanceOf(rolex.address);
        const initialWatchmakerBalance = await mockUSDC.balanceOf(watchmaker.address);

        await watchMarketplace.connect(client1).confirmDelivery(tokenId);

        // VERIFICACIONES
        const marketFeePercent = await watchMarketplace.marketPlaceFeePercent();
        const royaltyPercent = await watchMarketplace.royaltyPercent();
        
        const platformFee = (listPrice * marketFeePercent) / 10000n; // 1.5% = 150 USDC
        const royaltyFee = (listPrice * royaltyPercent) / 10000n;    // 1.0% = 100 USDC
        const dealerPayout = listPrice - platformFee - royaltyFee;   

        expect(await watchNFT.ownerOf(tokenId)).to.equal(client1.address);
        
        // el Dealer cobra el neto 
        expect(await mockUSDC.balanceOf(client3.address)).to.equal(initialDealerBalance + dealerPayout);
        
        // plataforma y fabricante cobran comisión
        expect(await mockUSDC.balanceOf(feeRecipient)).to.be.gte(initialPlatformBalance + platformFee);
        expect(await mockUSDC.balanceOf(rolex.address)).to.equal(initialRoyaltyBalance + royaltyFee);
        
        // el relojero no cobra nada en ventas de Dealer
        expect(await mockUSDC.balanceOf(watchmaker.address)).to.equal(initialWatchmakerBalance);
    });

    it("DEALER CU 2. COMO joyería autorizada QUIERO que el contrato me identifique como entidad de confianza.", async function () {
        const tokenIdDealer = 2;
        const tokenIdUser = 3;
        const listPrice = ethers.parseUnits("5000", 6);

        // 1. client3 = dealer
        await watchNFT.manageDealer(client3.address, true);
        await watchNFT.connect(rolex).mintWatch("Rolex", "Submariner", "numeroSerie", 2024, ethers.id("NFC-D2"), "ipfs://d2", client3.address);
        
        // 2. preparamos a client1 como usuario normal (p2p)
        await watchNFT.connect(rolex).mintWatch("Rolex", "Datejust", "numeroSerie", 2024, ethers.id("NFC-U2"), "ipfs://u2", client1.address);

        // 3. el dealer aprueba y lista su reloj
        await watchNFT.connect(client3).approve(marketplaceAddress, tokenIdDealer);
        await watchMarketplace.connect(client3).listWatch(tokenIdDealer, listPrice);

        // 4. el usuario normal aprueba y lista su reloj
        await watchNFT.connect(client1).approve(marketplaceAddress, tokenIdUser);
        await watchMarketplace.connect(client1).listWatch(tokenIdUser, listPrice);

        // VERIFICACIONES
        // el contrato identifica y clasifica correctamente a cada perfil
        const listingDealer = await watchMarketplace.listings(tokenIdDealer);
        const listingUser = await watchMarketplace.listings(tokenIdUser);

        // comprobación de la joyería autorizada (condiciones especiales)
        expect(listingDealer.isP2P).to.be.false; 
        expect(listingDealer.watchmakerApproved).to.be.true; 

        // comprobación del usuario normal (condiciones estándar)
        expect(listingUser.isP2P).to.be.true; 
        expect(listingUser.watchmakerApproved).to.be.false; // necesitará pasar por el peritaje de un relojero
    });

    it("RELOJERO CU 1. COMO relojero autorizado QUIERO aprobar la autenticidad de un reloj en Escrow PARA permitir que se repartan los pagos.", async function () {
        const tokenId = 2;
        const listPrice = ethers.parseUnits("5000", 6);

        // 1. minteo y listado por un usuario normal (venta p2p)
        await watchNFT.connect(rolex).mintWatch("Rolex", "Submariner", "numeroSerie", 2024, ethers.id("NFC-WM1"), "ipfs://wm1", client3.address);
        await watchNFT.connect(client3).approve(marketplaceAddress, tokenId);
        await watchMarketplace.connect(client3).listWatch(tokenId, listPrice);

        // 2. el client1 compra el reloj al client3
        await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);

        // 3. el sistema logístico lo marca como enviado y asigna a este relojero
        await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);
        await watchMarketplace.connect(logisticsSystem).assignWatchmaker(tokenId, watchmaker.address);

        // 4. el relojero aprueba la autenticidad del reloj
        await expect(watchMarketplace.connect(watchmaker).verifyAuthenticity(tokenId, true))
            .to.emit(watchMarketplace, "AuthenticityApproved")
            .withArgs(tokenId, watchmaker.address);

        // VERIFICACIONES
        const listing = await watchMarketplace.listings(tokenId);
        
        // el reloj está marcado como aprobado, desbloqueando la confirmación de entrega
        expect(listing.watchmakerApproved).to.be.true;
        
        // el contrato ha guardado correctamente quién hizo el peritaje para pagarle luego
        expect(listing.verifyingWatchmaker).to.equal(watchmaker.address);

        // el estado sigue siendo escrowed (2), ya que el dinero se mueve en confirmDelivery
        expect(listing.state).to.equal(2); 
    });

    it("RELOJERO CU 2. COMO relojero autorizado QUIERO rechazar una transacción fraudulenta.", async function () {
        const tokenId = 2; 
        const listPrice = ethers.parseUnits("5000", 6);
        const sellerDeposit = (listPrice * 200n) / 10000n; // 2% fianza = 100 USDC

        await watchNFT.connect(rolex).mintWatch("Rolex", "Submariner", "numeroSerie", 2024, ethers.id("NFC-FAKE1"), "ipfs://fake1", client3.address);
        
        // 1. el vendedor client3 sube un reloj falso a la plataforma
        await watchNFT.connect(client3).approve(marketplaceAddress, tokenId);
        await watchMarketplace.connect(client3).listWatch(tokenId, listPrice);

        // saldos iniciales
        const initialBuyerBalance = await mockUSDC.balanceOf(client1.address);
        const initialSellerBalance = await mockUSDC.balanceOf(client3.address);
        const initialWatchmakerBalance = await mockUSDC.balanceOf(watchmaker.address);
        const initialPlatformBalance = await mockUSDC.balanceOf(feeRecipient);

        // 2. el comprador client1 compra el reloj (pensando que es verdadero)
        await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);

        // 3. envío y asignación del relojero
        await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);
        await watchMarketplace.connect(logisticsSystem).assignWatchmaker(tokenId, watchmaker.address);

        // 4. el relojero detecta que es falso y rechaza la autenticidad
        await expect(watchMarketplace.connect(watchmaker).verifyAuthenticity(tokenId, false))
            .to.emit(watchMarketplace, "AuthenticityRejected")
            .withArgs(tokenId, watchmaker.address);

        // saldos
        const wmFeePercent = await watchMarketplace.watchmakerFeePercent();
        const watchmakerFee = (listPrice * wmFeePercent) / 10000n;
        const actualWmFee = watchmakerFee > sellerDeposit ? sellerDeposit : watchmakerFee;
        const platformPenalty = sellerDeposit > actualWmFee ? sellerDeposit - actualWmFee : 0n;

        // VERIFICACIONES
        // el comprador recupera el 100% de su dinero
        expect(await mockUSDC.balanceOf(client1.address)).to.equal(initialBuyerBalance);

        // el vendedor pierde su fianza íntegra
        expect(await mockUSDC.balanceOf(client3.address)).to.equal(initialSellerBalance - sellerDeposit);

        // el relojero cobra su comisión extraída de la fianza del vendedor
        expect(await mockUSDC.balanceOf(watchmaker.address)).to.equal(initialWatchmakerBalance + actualWmFee);

        // la plataforma se queda con el sobrante de la fianza como penalización
        expect(await mockUSDC.balanceOf(feeRecipient)).to.equal(initialPlatformBalance + platformPenalty);

        // el nft vuelve al vendedor, pero su estado cambia a 4 (AlteredNFC) por seguridad
        expect(await watchNFT.ownerOf(tokenId)).to.equal(client3.address);
        const watchData = await watchNFT.getWatchData(tokenId);
        expect(watchData.state).to.equal(4); 

        // el anuncio se borra de la base de datos (estado inactive = 0)
        const listing = await watchMarketplace.listings(tokenId);
        expect(listing.state).to.equal(0);
    });

    it("FABRICANTE CU 1. COMO fabricante QUIERO cobrar automáticamente de un porcentaje de comisión (regalías) en cada reventa.", async function () {    
    });

    it("              1.1 (P2P) ", async function () {
        const tokenId = 2; 
        const listPrice = ethers.parseUnits("5000", 6);

        await watchNFT.connect(rolex).mintWatch("Rolex", "Explorer", "numeroSerie", 2024, ethers.id("NFC-ROYALTY"), "ipfs://royalty1", client2.address);

        // 1. client2 decide revender el reloj en el mercado secundario (P2P)
        await watchNFT.connect(client2).approve(marketplaceAddress, tokenId);
        await watchMarketplace.connect(client2).listWatch(tokenId, listPrice);

        // 2. client1 se lo compra a client2
        await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);

        // 3. envío y peritaje
        await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);
        await watchMarketplace.connect(logisticsSystem).assignWatchmaker(tokenId, watchmaker.address);
        await watchMarketplace.connect(watchmaker).verifyAuthenticity(tokenId, true);

        // saldos
        const initialRoyaltyBalance = await mockUSDC.balanceOf(rolex.address);

        // 4. el comprador confirma la entrega, lo que dispara el reparto de dinero
        await watchMarketplace.connect(client1).confirmDelivery(tokenId);

        // VERIFICACIONES
        const royaltyPercent = await watchMarketplace.royaltyPercent();
        
        // comisión exacta que debería haber recibido
        const expectedRoyaltyFee = (listPrice * royaltyPercent) / 10000n;

        // el saldo del fabricante ha aumentado exactamente en esa cantidad
        expect(await mockUSDC.balanceOf(rolex.address)).to.equal(initialRoyaltyBalance + expectedRoyaltyFee);

        // el comprador final obtuvo su reloj
        expect(await watchNFT.ownerOf(tokenId)).to.equal(client1.address);
    });

    it("              1.2 (Dealer 2 Person)", async function () {
        const tokenId = 2;
        const listPrice = ethers.parseUnits("5000", 6);

        // client3 = dealer
        await watchNFT.manageDealer(client3.address, true);
        await watchNFT.connect(rolex).mintWatch("Rolex", "Explorer II", "numeroSerie", 2024, ethers.id("NFC-ROYALTY2"), "ipfs://royalty2", client3.address);

        // 1. el dealer lista el reloj
        await watchNFT.connect(client3).approve(marketplaceAddress, tokenId);
        await watchMarketplace.connect(client3).listWatch(tokenId, listPrice);

        // 2. client1 se lo compra al dealer
        await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);

        // 3. envío (se omite el peritaje del relojero porque es Dealer)
        await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);

        // saldos
        const initialRoyaltyBalance = await mockUSDC.balanceOf(rolex.address);

        // 4. el comprador confirma la entrega, lo que dispara el reparto de dinero
        await watchMarketplace.connect(client1).confirmDelivery(tokenId);

        // VERIFICACIONES
        const royaltyPercent = await watchMarketplace.royaltyPercent();
        
        // comisión exacta que debería haber recibido
        const expectedRoyaltyFee = (listPrice * royaltyPercent) / 10000n;

        // el saldo del fabricante ha aumentado exactamente en esa cantidad
        expect(await mockUSDC.balanceOf(rolex.address)).to.equal(initialRoyaltyBalance + expectedRoyaltyFee);

        // el comprador final obtuvo su reloj
        expect(await watchNFT.ownerOf(tokenId)).to.equal(client1.address);
    });

    it("              1.3 (Person 2 Dealer)", async function () {
        const tokenId = 2; // usamos un id nuevo
        const listPrice = ethers.parseUnits("5000", 6);

        // client3 = Dealer
        await watchNFT.manageDealer(client3.address, true);

        await watchNFT.connect(rolex).mintWatch("Rolex", "Milgauss", "numeroSerie", 2024, ethers.id("NFC-ROYALTY3"), "ipfs://royalty3", client1.address);

        // 1. el client1 (usuario normal) lista el reloj (venta con estado P2P = true)s
        await watchNFT.connect(client1).approve(marketplaceAddress, tokenId);
        await watchMarketplace.connect(client1).listWatch(tokenId, listPrice);

        // 2. el dealer client3 se lo compra al usuario
        await watchMarketplace.connect(client3).buyWatchEscrow(tokenId);

        // 3. envío y peritaje (porque el VENDEDOR es un particular)
        await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);
        await watchMarketplace.connect(logisticsSystem).assignWatchmaker(tokenId, watchmaker.address);
        await watchMarketplace.connect(watchmaker).verifyAuthenticity(tokenId, true);

        // saldos
        const initialRoyaltyBalance = await mockUSDC.balanceOf(rolex.address);

        // 4. el dealer confirma la entrega, lo que dispara el reparto de dinero
        await watchMarketplace.connect(client3).confirmDelivery(tokenId);

        // VERIFICACIONES
        const royaltyPercent = await watchMarketplace.royaltyPercent();
        
        // comisión exacta que debería haber recibido
        const expectedRoyaltyFee = (listPrice * royaltyPercent) / 10000n;

        // el saldo del fabricante ha aumentado exactamente en esa cantidad
        expect(await mockUSDC.balanceOf(rolex.address)).to.equal(initialRoyaltyBalance + expectedRoyaltyFee);

        // el dealer obtuvo su reloj
        expect(await watchNFT.ownerOf(tokenId)).to.equal(client3.address);
    });

    it("ADMIN CU 1. COMO administrador QUIERO configurar las comisiones de plataforma, fabricante y relojero.", async function () {
        // NUEVOS VALORES A CONFIGURAR
        const newMarketFee = 200;   // 2.0%
        const newRoyaltyFee = 150;  // 1.5%
        const newWmFee = 250;       // 2.5%
        const newDeposit = 300;     // 3.0%

        // 1. el administrador actualiza las comisiones
        await watchMarketplace.connect(owner).setFees(newMarketFee, newRoyaltyFee, newWmFee, newDeposit);

        // 2. verificación de que las variables de estado se han actualizado correctamente
        expect(await watchMarketplace.marketPlaceFeePercent()).to.equal(newMarketFee);
        expect(await watchMarketplace.royaltyPercent()).to.equal(newRoyaltyFee);
        expect(await watchMarketplace.watchmakerFeePercent()).to.equal(newWmFee);
        expect(await watchMarketplace.sellerDepositPercent()).to.equal(newDeposit);

        // 3. SEGURIDAD: límite máximo excedido, la plataforma no puede superar el 10% (1000) ni el relojero el 5% (500).
        await expect(
            watchMarketplace.connect(owner).setFees(1001, 100, 100, 100)
        ).to.be.revertedWithCustomError(watchMarketplace, "InvalidPrice");

        await expect(
            watchMarketplace.connect(owner).setFees(100, 100, 501, 100)
        ).to.be.revertedWithCustomError(watchMarketplace, "InvalidPrice");

        // 4. SEGURIDAD: Control de acceso. Un usuario normal como client1 no puede ejecutar esta función
        await expect(
            watchMarketplace.connect(client1).setFees(100, 100, 100, 100)
        ).to.be.revertedWithCustomError(watchMarketplace, "OwnableUnauthorizedAccount")
         .withArgs(client1.address);
    });

    it("ADMIN CU 2. COMO administrador QUIERO configurar el porcentaje de fianza exigido a los particulares.", async function () {
        const tokenId = 2;
        const listPrice = ethers.parseUnits("5000", 6);
        
        // nueva fianza al 3% (300) en lugar del 2% (200) habitual
        const newDepositPercent = 300n; 
        const expectedDeposit = (listPrice * newDepositPercent) / 10000n; // 150 USDC

        // comisiones actuales
        const currentMarketFee = await watchMarketplace.marketPlaceFeePercent();
        const currentRoyalty = await watchMarketplace.royaltyPercent();
        const currentWmFee = await watchMarketplace.watchmakerFeePercent();

        // 1. el administrador modifica el porcentaje de la fianza
        await watchMarketplace.connect(owner).setFees(currentMarketFee, currentRoyalty, currentWmFee, newDepositPercent);

        // 2. un usuario particular client3 (p2p) lista un reloj
        await watchNFT.connect(rolex).mintWatch("Rolex", "Oyster Perpetual", "numeroSerie", 2024, ethers.id("NFC-ADMIN2"), "ipfs://admin2", client3.address);
        await watchNFT.connect(client3).approve(marketplaceAddress, tokenId);
        await watchMarketplace.connect(client3).listWatch(tokenId, listPrice);

        // saldos antes de la compra
        const initialSellerBalance = await mockUSDC.balanceOf(client3.address);

        // 3. el client1 compra el reloj
        await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);

        // verificaciones intermedias
        const listing = await watchMarketplace.listings(tokenId);
        
        // el contrato ha calculado y guardado en la base de datos la nueva fianza exigida (150 USDC en vez de 100)
        expect(listing.sellerDeposit).to.equal(expectedDeposit);

        // al vendedor se le ha descontado exactamente esa nueva cantidad de su saldo en USDC
        expect(await mockUSDC.balanceOf(client3.address)).to.equal(initialSellerBalance - expectedDeposit);

        // 4. envío y asignación del relojero
        await watchMarketplace.connect(logisticsSystem).markAsShipped(tokenId);
        await watchMarketplace.connect(logisticsSystem).assignWatchmaker(tokenId, watchmaker.address);

        // 5. el relojero certifica la autenticidad
        await watchMarketplace.connect(watchmaker).verifyAuthenticity(tokenId, true);

        // 6. el comprador confirma la entrega
        await watchMarketplace.connect(client1).confirmDelivery(tokenId);

        // VERIFICACIONES
        const platformFee = (listPrice * currentMarketFee) / 10000n;
        const royaltyFee = (listPrice * currentRoyalty) / 10000n;
        const watchmakerFee = (listPrice * currentWmFee) / 10000n;
        const sellerPayout = listPrice - platformFee - royaltyFee - watchmakerFee;

        // el vendedor recibe su pago neto y recupera la fianza exacta del 3% devuelta.
        expect(await mockUSDC.balanceOf(client3.address)).to.equal(initialSellerBalance + sellerPayout);

        expect(await watchNFT.ownerOf(tokenId)).to.equal(client1.address);
    });

    it("ADMIN CU 3. COMO administrador QUIERO poder intervenir en disputas.", async function () {
        const tokenId = 2;
        const listPrice = ethers.parseUnits("5000", 6);
        const sellerDeposit = (listPrice * 200n) / 10000n; // 2% fianza = 100 USDC

        // 1. un usuario particular lista un reloj (estado Active)
        await watchNFT.connect(rolex).mintWatch("Rolex", "Daytona", "numeroSerie", 2024, ethers.id("NFC-ADMIN3"), "ipfs://admin3", client3.address);
        await watchNFT.connect(client3).approve(marketplaceAddress, tokenId);
        await watchMarketplace.connect(client3).listWatch(tokenId, listPrice);

        // saldos antes de que nadie deposite dinero
        const initialBuyerBalance = await mockUSDC.balanceOf(client1.address);
        const initialSellerBalance = await mockUSDC.balanceOf(client3.address);
        const initialPlatformBalance = await mockUSDC.balanceOf(feeRecipient);

        // 2. el comprador adquiere el reloj (estado Escrowed, se bloquea el dinero y el NFT)
        await watchMarketplace.connect(client1).buyWatchEscrow(tokenId);

        // 3. Surge una disputa legal. El paquete se pierde.
        //    El administrador interviene y fuerza el reembolso castigando al vendedor (punishSeller = true).
        await expect(watchMarketplace.connect(owner).refundEscrow(tokenId, true))
            .to.emit(watchMarketplace, "EscrowRefunded")
            .withArgs(tokenId, client1.address, client3.address, listPrice);

        // VERIFICACIONES
        // el comprador recupera íntegramente los fondos de la compra (100% de vuelta)
        expect(await mockUSDC.balanceOf(client1.address)).to.equal(initialBuyerBalance);

        // el vendedor NO recupera su fianza por haber sido penalizado
        expect(await mockUSDC.balanceOf(client3.address)).to.equal(initialSellerBalance - sellerDeposit);

        // la plataforma se queda con la fianza del vendedor en concepto de penalización
        expect(await mockUSDC.balanceOf(feeRecipient)).to.equal(initialPlatformBalance + sellerDeposit);

        // el NFT vuelve a ser propiedad del vendedor (luego se podría marcar como perdido)
        expect(await watchNFT.ownerOf(tokenId)).to.equal(client3.address);

        // el anuncio se borra completamente de la base de datos para evitar bloqueos de estado
        const listing = await watchMarketplace.listings(tokenId);
        expect(listing.state).to.equal(0);
    });

   it("ADMIN CU 4. COMO administrador QUIERO poder pausar temporalmente las funciones críticas del contrato inteligente PARA proteger los fondos y los activos.", async function () {
        const tokenIdToBuy = 2;
        const tokenIdToList = 3;
        const listPrice = ethers.parseUnits("5000", 6);

        // se lista un primer reloj
        await watchNFT.connect(rolex).mintWatch("Rolex", "Submariner", "numeroSerie", 2024, ethers.id("NFC-PAUSE1"), "ipfs://pause1", client3.address);
        await watchNFT.connect(client3).approve(marketplaceAddress, tokenIdToBuy);
        await watchMarketplace.connect(client3).listWatch(tokenIdToBuy, listPrice);

        // segundo reloj pero NO se lista aún 
        await watchNFT.connect(rolex).mintWatch("Rolex", "Batman", "numeroSerie", 2024, ethers.id("NFC-PAUSE2"), "ipfs://pause2", client1.address);
        await watchNFT.connect(client1).approve(marketplaceAddress, tokenIdToList);
        
        // 1. el administrador pausa el contrato ante una emergencia
        await watchMarketplace.connect(owner).pauseMarketplace();

        // VERIFICACIONES DURANTE LA PAUSA
        // el contrato debe bloquear nuevos listados
        await expect(
            watchMarketplace.connect(client1).listWatch(tokenIdToList, listPrice)
        ).to.be.revertedWithCustomError(watchMarketplace, "EnforcedPause");

        // el contrato debe bloquear la compra de relojes
        await expect(
            watchMarketplace.connect(client2).buyWatchEscrow(tokenIdToBuy)
        ).to.be.revertedWithCustomError(watchMarketplace, "EnforcedPause");

        // SEGURIDAD DE ACCESO: un usuario normal no puede ni pausar ni despausar el contrato
        await expect(
            watchMarketplace.connect(client1).resumeMarketplace()
        ).to.be.revertedWithCustomError(watchMarketplace, "OwnableUnauthorizedAccount")
         .withArgs(client1.address);

        // 2. una vez resuelto el problema, el administrador despausa el contrato
        await watchMarketplace.connect(owner).resumeMarketplace();

        // VERIFICACIONES TRAS REANUDAR
        await watchMarketplace.connect(client1).listWatch(tokenIdToList, listPrice);
        await watchMarketplace.connect(client2).buyWatchEscrow(tokenIdToBuy);
        
        // comprobación de estados finales correctos
        const listingToList = await watchMarketplace.listings(tokenIdToList);
        expect(listingToList.state).to.equal(1); // ListingState.Active

        const listingToBuy = await watchMarketplace.listings(tokenIdToBuy);
        expect(listingToBuy.state).to.equal(2); // ListingState.Escrowed
    });

})