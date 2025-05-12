import express from 'express';
import { findOrCreateUser } from '../users';
import db from '../db';
const router = express.Router();

router.post('/onboard', (req: any, res: any) => {
    const { walletAddress, username, email } = req.body;

    if (!walletAddress || !username || !email) {
        return res.status(400).json({ error: 'details is required' });
    }

    const user = findOrCreateUser(walletAddress, username, email);
    return res.status(200).json(user);
});
router.post('/update-transaction', async (req: any, res: any) => {
    //after onchain commit is completed add the cid in the db
    const { wallet_address, cid } = req.body;
    if (!wallet_address || !cid) {
        return res
            .status(400)
            .json({ error: 'wallet address or cid is required' });
    }
    try {
        await db.query(
            'UPDATE users SET cid = array_append(cid, $1) WHERE wallet_address = $2',
            [cid, wallet_address]
        );
        return res.status(200).json({ message: 'CID updated successfully' });
    } catch (err) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
