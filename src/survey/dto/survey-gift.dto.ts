import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** 직원 PIN은 숫자 4~8자리다. 현장에서 휴대전화로 빠르게 입력하는 값이라 숫자만 받는다. */
const pinSchema = z
  .string()
  .regex(/^\d{4,8}$/u, 'PIN은 숫자 4~8자리여야 합니다.');

const tokenSchema = z.string().min(1).max(200);

export const updateGiftPinRequestSchema = z.object({ pin: pinSchema });
export class UpdateGiftPinRequestDto extends createZodDto(
  updateGiftPinRequestSchema,
) {}

export const giftPinResponseSchema = z.object({
  /** 직원 PIN이 설정돼 있는지. PIN 자체는 어디에도 돌려주지 않는다. */
  configured: z.boolean(),
});
export class GiftPinResponseDto extends createZodDto(giftPinResponseSchema) {}

/** 토큰은 URL 쿼리·접근 로그에 남지 않게 바디로만 받는다. */
export const giftPickupStatusRequestSchema = z.object({ token: tokenSchema });
export class GiftPickupStatusRequestDto extends createZodDto(
  giftPickupStatusRequestSchema,
) {}

export const confirmGiftPickupRequestSchema = z.object({
  token: tokenSchema,
  pin: pinSchema,
});
export class ConfirmGiftPickupRequestDto extends createZodDto(
  confirmGiftPickupRequestSchema,
) {}

/** 수령 상태. 응답 본문·전화번호 같은 다른 정보는 싣지 않는다. */
export const giftPickupStatusResponseSchema = z.object({
  claimed: z.boolean(),
  claimedAt: z.iso.datetime().nullable(),
  /** 직원 PIN이 설정돼 있는지. 없으면 직원 확인을 안내하지 않을 수 있게 알려 준다. */
  pinConfigured: z.boolean(),
});
export class GiftPickupStatusResponseDto extends createZodDto(
  giftPickupStatusResponseSchema,
) {}
