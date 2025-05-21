import express from 'express';
import { findOrCreateUser } from '../users';
import db from '../db';
import { ethers } from 'ethers';
import { FACTORY_ABI } from '../abi/FACTORY_ABI';

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
    const { wallet_address, cid, trx_hash } = req.body;
    if (!wallet_address || !cid || !trx_hash) {
        return res
            .status(400)
            .json({ error: 'wallet address cid or trx_hash is required' });
    }
    try {
        const query = `
            UPDATE user_logs
            SET
                cid_logs = cid_logs || jsonb_build_array(
                jsonb_build_object(
                    'cid', $2,
                    'tx_hash', $3,
                    'timestamp', NOW()
                )
                )
            WHERE wallet_address = $1
            `;
        await db.query(query, [wallet_address, cid, trx_hash]);
        return res
            .status(200)
            .json({ message: 'Transaction log updated successfully' });
    } catch (err) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/meta-tx', async (req: any, res: any) => {
    const { wallet_address, pkey, cid } = req.body;
    if (!wallet_address || !pkey || !cid) {
        return res
            .status(400)
            .json({ error: 'wallet_address, pkey, and cid are required' });
    }
    try {
        const signer = new ethers.Wallet(pkey);
        const messageHash = ethers.utils.keccak256(
            ethers.utils.solidityPack(
                ['address', 'string'],
                [wallet_address, cid]
            )
        );
        const signature = await signer.signMessage(
            ethers.utils.arrayify(messageHash)
        );
        const provider = new ethers.providers.JsonRpcProvider(
            'https://api.avax-test.network/ext/bc/C/rpc'
        );
        const adminSigner = new ethers.Wallet(
            process.env.ADMIN_KEY as string,
            provider
        );
        const factoryContract = new ethers.Contract(
            '0x201E02F99A3898A174f15E6ACA670EB314658eba',
            FACTORY_ABI,
            adminSigner
        );
        const tx = await factoryContract.executeMetaTx(
            wallet_address,
            cid,
            signature
        );
        await tx.wait();

        return res.status(200).json({
            txHash: tx.hash,
        });
    } catch (err) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
