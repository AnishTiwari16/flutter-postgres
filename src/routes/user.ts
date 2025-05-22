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
    trx_hash: string,
    gameplay_id: number
) => {
    if (!wallet_address || !cid || !trx_hash || !gameplay_id) {
        return {
            success: false,
            message: 'wallet address, cid, gameplay_id or trx_hash is required',
        };
    }
    try {
        const query = `
            WITH new_log AS (
                SELECT jsonb_build_object(
                    'cid', $2::text,
                    'tx_hash', $3::text,
                    'timestamp', NOW()
                ) AS log_entry
            ),
            new_gameplay AS (
                SELECT jsonb_build_object(
                    'gameplay_id', $4::int,
                    'logs', jsonb_build_array((SELECT log_entry FROM new_log))
                ) AS gameplay_entry
            )
            INSERT INTO user_logs (wallet_address, cid_logs)
            VALUES (
                $1,
                jsonb_build_array((SELECT gameplay_entry FROM new_gameplay))
            )
            ON CONFLICT (wallet_address)
            DO UPDATE SET cid_logs = (
                SELECT
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM jsonb_array_elements(user_logs.cid_logs) elem
                            WHERE (elem->>'gameplay_id')::int = $4
                        )
                        THEN (
                            SELECT jsonb_agg(
                                CASE
                                    WHEN (elem->>'gameplay_id')::int = $4 THEN
                                        CASE
                                            WHEN EXISTS (
                                                SELECT 1 FROM jsonb_array_elements(elem->'logs') log
                                                WHERE (log->>'cid') = $2::text OR (log->>'tx_hash') = $3::text
                                            )
                                            THEN elem
                                            ELSE jsonb_set(
                                                elem,
                                                '{logs}',
                                                (elem->'logs') || (SELECT log_entry FROM new_log)
                                            )
                                        END
                                    ELSE elem
                                END
                            )
                            FROM jsonb_array_elements(user_logs.cid_logs) elem
                        )
                        ELSE user_logs.cid_logs || (SELECT gameplay_entry FROM new_gameplay)
                    END
            )
            `;
        await db.query(query, [wallet_address, cid, trx_hash, gameplay_id]);
        return {
            success: true,
            message: 'Transaction log updated successfully',
        };
    } catch (err) {
        return { success: false, message: 'Internal server error' };
    }
};
router.post('/meta-tx', async (req: any, res: any) => {
    const { wallet_address, pkey, cid, gameplayId } = req.body;
    if (!wallet_address || !pkey || !cid || !gameplayId) {
        return res.status(400).json({
            error: 'wallet_address, gameplayId, pkey, and cid are required',
        });
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
        const result = await performDBOperation(
            wallet_address,
            cid,
            trxHash,
            gameplayId
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
    } catch (err) {
        return res
            .status(500)
            .json({ success: false, error: 'Internal server error' });
    }
});
router.post('/log-gameplay-id', async (req: any, res: any) => {
    const { wallet_address } = req.body;

    if (!wallet_address) {
        return res.status(400).json({ error: 'wallet_address is required' });
    }

    try {
        const result = await db.query(
            `SELECT cid_logs FROM user_logs WHERE wallet_address = $1`,
            [wallet_address]
        );

        let nextGameplayId = 1;

        if (result.rows.length > 0 && result.rows[0].cid_logs) {
            const maxIdResult = await db.query(
                `
                SELECT MAX((elem->>'gameplay_id')::int) AS max_id
                FROM user_logs, jsonb_array_elements(cid_logs) elem
                WHERE wallet_address = $1
                `,
                [wallet_address]
            );
            const maxId = maxIdResult.rows[0].max_id;
            nextGameplayId = maxId ? maxId + 1 : 1;
        }
        res.status(200).json({ gameplay_id: nextGameplayId });
    } catch (err) {
        console.error('Error generating gameplay ID:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
export default router;
