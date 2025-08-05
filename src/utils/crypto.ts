import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

const getKey = (secretKey: string, salt: Buffer): Buffer => {
  return crypto.pbkdf2Sync(secretKey, salt, ITERATIONS, KEY_LENGTH, 'sha512');
};

export const encrypt = (text: string, secretKey: string): string => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = getKey(secretKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]).toString('hex');
};

export const decrypt = (encryptedText: string, secretKey: string): string => {
  const data = Buffer.from(encryptedText, 'hex');
  const salt = data.slice(0, SALT_LENGTH);
  const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = data.slice(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH,
  );
  const encrypted = data.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const key = getKey(secretKey, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};
