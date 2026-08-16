import { generateKeyPairSync } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

appendFileSync('.env', `\nJWT_PUBLIC_KEY="${publicKey.replace(/\n/g, '\\n')}"\n`);
process.stdout.write(
  'Public key appended to .env.\n' +
    'Private key (for minting test tokens only — DO NOT COMMIT):\n\n' +
    privateKey +
    '\n',
);
