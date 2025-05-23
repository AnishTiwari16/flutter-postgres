import * as jose from 'jose';

async function authenticateWeb3Auth(req, res, next) {
    try {
        const idToken = req.headers.authorization?.split(' ')[1];
        const app_pub_key = req.body.app_pubkey;
        if (!idToken || !app_pub_key) {
            return res
                .status(400)
                .json({ error: 'idToken and app_pub_key are required' });
        }

        const jwks = jose.createRemoteJWKSet(
            new URL('https://api-auth.web3auth.io/.well-known/jwks.json')
        );
        const jwtDecoded = await jose.jwtVerify(idToken, jwks, {
            algorithms: ['ES256'],
        });
        if (
            jwtDecoded.payload.wallets
                .find((w) => w.type === 'web3auth_app_key')
                .public_key.toLowerCase() === app_pub_key.toLowerCase()
        ) {
            next();
        } else {
            return res.status(400).json({ name: 'Verification Failed' });
        }
    } catch (err) {
        return res
            .status(500)
            .json({ success: false, error: 'Internal server error' });
    }
}

export default authenticateWeb3Auth;
