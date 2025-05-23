import db from './db/index.js';

export const findOrCreateUser = async (walletAddress, username, email) => {
    const existing = await db.query(
        'SELECT wallet_address, username, email, created_at FROM users WHERE wallet_address = $1',
        [walletAddress]
    );

    if (existing.rows.length > 0) {
        return existing.rows[0];
    }

    const insert = await db.query(
        'INSERT INTO users (wallet_address, username, email) VALUES ($1, $2, $3) RETURNING wallet_address, username, email, created_at',
        [walletAddress, username, email]
    );

    return insert.rows[0];
};
