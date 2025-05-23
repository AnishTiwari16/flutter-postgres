import { ethers } from 'ethers';
import express from 'express';
import { FACTORY_ABI } from '../abi/FACTORY_ABI.js';
import db from '../db/index.js';
import { findOrCreateUser } from '../users.js';

import authenticateWeb3Auth from '../middleware/index.js';

const router = express.Router();

router.post('/onboard', authenticateWeb3Auth, (req, res) => {
    const { walletAddress, username, email } = req.body;

    if (!walletAddress || !username || !email) {
        return res.status(400).json({ error: 'details is required' });
    }

    const user = findOrCreateUser(walletAddress, username, email);
    return res.status(200).json(user);
});
const performDBOperation = async (wallet_address, cid, trx_hash) => {
    if (!wallet_address || !cid || !trx_hash) {
        return {
            success: false,
            message: 'wallet address, cid or trx_hash is required',
        };
    }
    try {
        const query = `
            INSERT INTO user_logs (wallet_address, cid_logs)
            VALUES (
                $1,
                jsonb_build_array(
                    jsonb_build_object(
                        'cid', $2::text,
                        'tx_hash', $3::text,
                        'timestamp', NOW()
                    )
                )
            )
            ON CONFLICT (wallet_address)
            DO UPDATE SET cid_logs = user_logs.cid_logs || jsonb_build_array(
                jsonb_build_object(
                    'cid', $2::text,
                    'tx_hash', $3::text,
                    'timestamp', NOW()
                )
            )
        `;
        await db.query(query, [wallet_address, cid, trx_hash]);
        return {
            success: true,
            message: 'Transaction log updated successfully',
        };
    } catch (err) {
        return { success: false, message: 'Internal server error' };
    }
};
router.post('/meta-tx', authenticateWeb3Auth, async (req, res) => {
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
        const adminSigner = new ethers.Wallet(process.env.ADMIN_KEY, provider);
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
        const trxHash = tx.hash;
        const result = await performDBOperation(wallet_address, cid, trxHash);
        if (result.success) {
            return res.status(200).json({
                success: true,
                message: result.message,
                transactionHash: trxHash,
            });
        } else {
            return res.status(500).json({
                success: false,
                error: result.message,
            });
        }
    } catch (err) {
        return res
            .status(500)
            .json({ success: false, error: 'Internal server error' });
    }
});

export default router;
