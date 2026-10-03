import { z } from 'zod';
import { QR_TOKEN_MAX_LENGTH } from '../entities/survey-qr-answer.entity.js';

/**
 * 경로의 QR 토큰. 형식은 참여 서비스가 정하므로 비어 있지 않고 컬럼에 들어갈 길이인지만
 * 본다 — 그보다 긴 값은 참여 서비스에 물어볼 것도 없이 막는다.
 */
export const qrTokenSchema = z.string().min(1).max(QR_TOKEN_MAX_LENGTH);
