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
const performDBOperation = async (
    wallet_address: string,
    cid: string,
    trx_hash: string
) => {
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
        const trxHash = tx.hash;
        if (trxHash) {
            const result = await performDBOperation(
                wallet_address,
                cid,
                trxHash
            );
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
        }
        return res
            .status(500)
            .json({ success: false, error: 'Transaction failed' });
    } catch (err) {
        return res
            .status(500)
            .json({ success: false, error: 'Internal server error' });
    }
});
export default router;
