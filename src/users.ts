import db from './db';

type User = {
    walletAddress: string;
    username: string;
    email: string;
    cid: string[] | null;
    createdAt: Date;
};

export const findOrCreateUser = async (
    walletAddress: string,
    username: string,
    email: string
): Promise<User> => {
    const existing = await db.query(
        'SELECT wallet_address, username, email, cid, created_at FROM users WHERE wallet_address = $1',
        [walletAddress]
    );

    if (existing.rows.length > 0) {
        return existing.rows[0];
    }

    const insert = await db.query(
        'INSERT INTO users (wallet_address, username, email) VALUES ($1, $2, $3) RETURNING wallet_address, username, email, cid, created_at',
        [walletAddress, username, email]
    );

    return insert.rows[0];
};
