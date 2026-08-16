import { createPublicKey } from 'node:crypto';
import { registerDecorator, type ValidationOptions } from 'class-validator';

const PEM_BEGIN = '-----BEGIN PUBLIC KEY-----';
const PEM_END = '-----END PUBLIC KEY-----';

// Node parses only the first PEM block it finds and silently ignores anything
// after it, so a header check alone lets a public key followed by a trailing
// private-key block through. Require the whole trimmed value to be exactly
// one SPKI "PUBLIC KEY" block: first line is the header, last line is the
// footer, and no line in between opens or closes another PEM block.
function isSinglePublicKeyPem(value: string): boolean {
  const lines = value.trim().split(/\r?\n/);
  if (lines.length < 3) return false;
  if (lines[0] !== PEM_BEGIN) return false;
  if (lines[lines.length - 1] !== PEM_END) return false;
  return lines.slice(1, -1).every((line) => !line.includes('-----BEGIN') && !line.includes('-----END'));
}

function isEs256PublicKey(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // createPublicKey() also accepts a private key and derives its public half —
  // require a single well-formed SPKI "PUBLIC KEY" PEM block so a private key
  // (standalone or trailing a valid public key) is rejected outright.
  if (!isSinglePublicKeyPem(value)) return false;
  try {
    const key = createPublicKey(value);
    return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1';
  } catch {
    return false;
  }
}

export function IsEs256PublicKey(options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isEs256PublicKey',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a PEM-encoded EC P-256 (ES256) public key`,
        ...options,
      },
      validator: { validate: isEs256PublicKey },
    });
  };
}
