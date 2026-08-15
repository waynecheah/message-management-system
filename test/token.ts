import { generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken'; // transitive dependency of @nestjs/jwt

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const TEST_PUBLIC_KEY = publicKey;
export const TEST_ISSUER = 'https://issuer.test';
export const TEST_AUDIENCE = 'message-api';

export function signTestToken(
  claims: { tid?: string; sub?: string; expiresIn?: string } = {},
): string {
  const { tid = 'tenant-a', sub = 'sender-1', expiresIn = '5m' } = claims;
  const payload: Record<string, string> = {};
  if (tid) payload.tid = tid;
  if (sub) payload.sub = sub;
  return sign(payload, privateKey, {
    algorithm: 'ES256',
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    expiresIn,
  });
}
