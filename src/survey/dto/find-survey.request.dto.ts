import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';

/**
 * 설문은 (박람회, 참여자군) 조합으로 유일하다. `expoId`는 경로 파라미터로 받으므로 여기에는
 * 참여자군만 남는다. 쿼리 키는 `participationType`이 아니라 `type`이다 — v1
 * (`@RequestParam("type")`)과 맞춘 이름이다.
 */
export const findSurveySchema = z.object({
  type: z.enum(ParticipationType),
});

export class FindSurveyRequestDto extends createZodDto(findSurveySchema) {}
