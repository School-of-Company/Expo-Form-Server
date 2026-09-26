import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';

/** 설문은 (박람회, 참여자군) 조합으로 유일하므로 이 둘로 조회한다. */
export const findSurveySchema = z.object({
  expoId: z.uuid(),
  participationType: z.enum(ParticipationType),
});

export class FindSurveyRequestDto extends createZodDto(findSurveySchema) {}
