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
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    existing = [c['name'] for c in inspect(bind).get_columns('watches')]
    if 'sdm_key' not in existing:
        op.add_column('watches', sa.Column('sdm_key', sa.String(32), nullable=True))
    if 'last_sdm_counter' not in existing:
        op.add_column('watches', sa.Column('last_sdm_counter', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('watches', 'last_sdm_counter')
    op.drop_column('watches', 'sdm_key')
