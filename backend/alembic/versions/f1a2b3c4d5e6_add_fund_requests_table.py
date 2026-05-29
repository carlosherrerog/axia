"""add_fund_requests_table

Revision ID: f1a2b3c4d5e6
Revises: e1f2a3b4c5d6
Create Date: 2026-05-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = '22eef3448e1a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fund_requests',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('wallet_address', sa.String(42), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('pol_amount', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('usdc_amount', sa.Float(), nullable=False, server_default='1000.0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
        sa.Column('tx_hash_pol', sa.String(66), nullable=True),
        sa.Column('tx_hash_usdc', sa.String(66), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('fund_requests')
