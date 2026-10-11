import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { formResponseSchema } from './form.response.dto.js';

/**
 * 프로그램용 폼 조회 응답. 등록용 응답에서 신청 방식(`applicationType`)이 빠지고 `version`이 더해진다.
 * `version`은 수정할 때 `expectedVersion`으로 되돌려 보낸다.
 */
export const programFormResponseSchema = formResponseSchema
  .omit({ applicationType: true })
  .extend({ version: z.number().int().positive() });

export class ProgramFormResponseDto extends createZodDto(
  programFormResponseSchema,
) {}

/** 프로그램용 폼 생성·수정 응답. 새 `version`을 돌려줘서 이어서 고칠 때 다시 조회하지 않아도 된다. */
export const programFormVersionResponseSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
});

export class ProgramFormVersionResponseDto extends createZodDto(
  programFormVersionResponseSchema,
) {}
