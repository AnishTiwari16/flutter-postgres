import express from 'express';
import { findOrCreateUser } from '../users';

const router = express.Router();

router.post('/onboard', (req: any, res: any) => {
    const { walletAddress, username, email } = req.body;

    if (!walletAddress || !username || !email) {
        return res.status(400).json({ error: 'details is required' });
    }

    const user = findOrCreateUser(walletAddress, username, email);
    return res.status(200).json(user);
});

export default router;
