import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';

/**
 * 설문은 (박람회, 참여자군) 조합으로 유일하다. `expoId`는 경로 파라미터로 받으므로 여기에는
 * `participationType`만 남는다.
 */
export const findSurveySchema = z.object({
  participationType: z.enum(ParticipationType),
});

export class FindSurveyRequestDto extends createZodDto(findSurveySchema) {}
