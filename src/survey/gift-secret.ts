import { Buffer } from 'node:buffer';
import { createHash, randomBytes, scrypt, type BinaryLike } from 'node:crypto';

const SCRYPT_KEY_LENGTH = 32;

/** `crypto.scrypt`를 `await`로 쓴다. 이벤트 루프를 막지 않으려고 동기 버전은 쓰지 않는다. */
async function derive(pin: string, salt: BinaryLike): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, SCRYPT_KEY_LENGTH, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
}

/** 추측할 수 없는 수령 확인 토큰(32바이트 난수, URL에 안전한 문자). 제출자에게만 한 번 돌려준다. */
export function generateGiftToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 토큰은 난수라 솔트 없는 SHA-256으로 충분하다. 저장·조회는 이 해시로만 한다. */
export function hashGiftToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 직원 PIN을 `scrypt$<salt hex>$<hash hex>`로 만든다. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pin, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
