import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { FormPurpose } from '../entities/form-purpose.enum.js';
import { formResponseSchema } from './form.response.dto.js';

/**
 * 프로그램용 폼 조회 응답. 등록용 응답에서 신청 방식(`applicationType`)이 빠지고 참여자군(`participantType`)이
 * 비어 있을 수 있으며 `purpose`와 `version`이 더해진다.
 * `purpose`는 항상 `PROGRAM`이다 — 박람회 서비스가 응답을 읽을 때 프로그램용 폼인지 이 값으로 확인한다.
 * `version`은 수정할 때 `expectedVersion`으로 되돌려 보낸다.
 */
export const programFormResponseSchema = formResponseSchema
  .omit({ applicationType: true, participantType: true })
  .extend({
    // 프로그램의 대상 역할은 박람회 서비스 회차가 정하므로 폼에는 없을 수 있다.
    participantType: z.enum(ParticipationType).nullable(),
    purpose: z.literal(FormPurpose.PROGRAM),
    version: z.number().int().positive(),
  });

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
