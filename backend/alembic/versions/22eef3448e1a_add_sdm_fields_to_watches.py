"""add_sdm_fields_to_watches

Revision ID: 22eef3448e1a
Revises: e1f2a3b4c5d6
Create Date: 2026-05-26 12:24:48.674563

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '22eef3448e1a'
down_revision: Union[str, Sequence[str], None] = '8c9a71d5ade6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('watches', sa.Column('sdm_key', sa.String(32), nullable=True))
    op.add_column('watches', sa.Column('last_sdm_counter', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('watches', 'last_sdm_counter')
    op.drop_column('watches', 'sdm_key')
