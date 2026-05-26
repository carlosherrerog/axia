from typing import List, Optional
from sqlalchemy import ForeignKey, String, DateTime, Integer, Boolean, BigInteger, Text, JSON, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base
from datetime import datetime
from sqlalchemy.sql import func

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    is_admin: Mapped[bool] = mapped_column(default=False)
    
    # ["DEALER"], ["RELOJERO"], ["FABRICANTE"]
    roles: Mapped[list[str]] = mapped_column(JSON, default=lambda: [])

    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    wallet_address: Mapped[Optional[str]] = mapped_column(String(42), unique=True, index=True, nullable=True)
    requested_role: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    request_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_active: Mapped[bool] = mapped_column(default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # RELACIONES
    owned_watches: Mapped[List["Watch"]] = relationship(back_populates="owner")
    notifications: Mapped[List["Notification"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Watch(Base):
    __tablename__ = "watches"

    token_id: Mapped[int] = mapped_column(primary_key=True, unique=True, index=True) 
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    brand: Mapped[Optional[str]] = mapped_column(String(50))
    model: Mapped[Optional[str]] = mapped_column(String(50))
    serial_number: Mapped[Optional[str]] = mapped_column(String(100))
    manufacturing_year: Mapped[Optional[int]] = mapped_column(Integer)
    image_url: Mapped[Optional[str]] = mapped_column(String(255))
    owner_wallet: Mapped[Optional[str]] = mapped_column(String(42))
    is_imported: Mapped[bool] = mapped_column(default=False)
    is_listed: Mapped[bool] = mapped_column(default=False, nullable=False)
    is_public: Mapped[bool] = mapped_column(default=False, nullable=False)
    
    hash_uid: Mapped[Optional[str]] = mapped_column(String(66)) # bytes32 en hex
    watch_state: Mapped[Optional[int]] = mapped_column(Integer) # Enum WatchState
    manufacturer_wallet: Mapped[Optional[str]] = mapped_column(String(42))
    # 0: Activo, 1: Robado, 2: Perdido, 3: Destruido, 4: Alterado
    security_state: Mapped[int] = mapped_column(default=0)
    mint_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # SDM (Secure Dynamic Messaging) — NTAG 424 DNA Fase 2
    sdm_key: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)     # 16 bytes AES-128 en hex
    last_sdm_counter: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # RELACIONES
    owner: Mapped["User"] = relationship(back_populates="owned_watches")
    revisions: Mapped[List["WatchRevision"]] = relationship(back_populates="watch")
    verifications: Mapped[List["WatchVerification"]] = relationship(back_populates="watch")
    listings: Mapped[List["MarketplaceListing"]] = relationship(back_populates="watch")
    auctions: Mapped[List["WatchAuction"]] = relationship(back_populates="watch")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="watch", cascade="all, delete-orphan")


# --- TABLAS SECUNDARIAS (HISTORIAL) ---

class WatchRevision(Base):
    """Mapea el struct 'Revision' del contrato"""
    __tablename__ = "watch_revisions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    token_id: Mapped[int] = mapped_column(ForeignKey("watches.token_id"))
    date: Mapped[int] = mapped_column(Integer) # uint256 block.timestamp
    watchmaker: Mapped[str] = mapped_column(String(42))
    description: Mapped[str] = mapped_column(Text)

    # RELACIONES
    watch: Mapped["Watch"] = relationship(back_populates="revisions")


class WatchVerification(Base):
    """Mapea el struct 'Verification' del contrato"""
    __tablename__ = "watch_verifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    token_id: Mapped[int] = mapped_column(ForeignKey("watches.token_id"))
    watchmaker: Mapped[str] = mapped_column(String(42))
    date: Mapped[int] = mapped_column(Integer) # uint256 block.timestamp
    comment: Mapped[str] = mapped_column(Text)

    # RELACIONES
    watch: Mapped["Watch"] = relationship(back_populates="verifications")


class MarketplaceListing(Base):
    """Mapea el struct 'Listing' del Marketplace"""
    __tablename__ = "marketplace_listings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    token_id: Mapped[int] = mapped_column(ForeignKey("watches.token_id"))
    
    seller: Mapped[str] = mapped_column(String(42))
    buyer: Mapped[Optional[str]] = mapped_column(String(42))
    
    price: Mapped[int] = mapped_column(BigInteger) 
    seller_deposit: Mapped[int] = mapped_column(BigInteger)
    
    is_p2p: Mapped[bool] = mapped_column(Boolean)
    watchmaker_approved: Mapped[bool] = mapped_column(Boolean)
    is_shipped: Mapped[bool] = mapped_column(Boolean)
    
    assigned_watchmaker: Mapped[Optional[str]] = mapped_column(String(42))
    assigned_watchmaker_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    verifying_watchmaker: Mapped[Optional[str]] = mapped_column(String(42))
    listing_state: Mapped[int] = mapped_column(Integer) # Enum ListingState

    # RELACIONES
    watch: Mapped["Watch"] = relationship(back_populates="listings")

class WatchAuction(Base):
    """Mapea el struct 'Auction' del contrato de subastas"""
    __tablename__ = "watch_auctions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    token_id: Mapped[int] = mapped_column(ForeignKey("watches.token_id"), index=True)
    seller: Mapped[str] = mapped_column(String(42))
    highest_bidder: Mapped[Optional[str]] = mapped_column(String(42))
    highest_bid: Mapped[int] = mapped_column(BigInteger, default=0)
    min_price: Mapped[int] = mapped_column(BigInteger)
    end_time: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # RELACIONES
    watch: Mapped["Watch"] = relationship(back_populates="auctions")


class AuctionBid(Base):
    """Registro histórico de cada puja realizada en una subasta"""
    __tablename__ = "auction_bids"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    token_id: Mapped[int] = mapped_column(ForeignKey("watches.token_id"), index=True)
    bidder_wallet: Mapped[str] = mapped_column(String(42))
    amount_usdc: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class WatchOwnershipHistory(Base):
    """Historial inmutable de propietarios de un reloj"""
    __tablename__ = "watch_ownership_history"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    token_id: Mapped[int] = mapped_column(ForeignKey("watches.token_id"), index=True)
    previous_owner_wallet: Mapped[str] = mapped_column(String(42))
    new_owner_wallet: Mapped[str] = mapped_column(String(42))
    via_contract_wallet: Mapped[Optional[str]] = mapped_column(String(42), nullable=True)
    price_usdc: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    transferred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    watch: Mapped["Watch"] = relationship("Watch")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    watch_id: Mapped[Optional[int]] = mapped_column(ForeignKey("watches.token_id"), nullable=True)
    title: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)
    reference_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # offer_id para tipo OFFER
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # RELACIONES
    user: Mapped["User"] = relationship(back_populates="notifications")
    watch: Mapped[Optional["Watch"]] = relationship(back_populates="notifications")