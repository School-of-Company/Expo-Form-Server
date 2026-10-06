import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';

/** 박람회에 어떤 설문이 만들어져 있는지. 설문을 유일하게 식별하는 두 값만 담는다. */
export const surveySummarySchema = z.object({
  expoId: z.uuid(),
  participationType: z.enum(ParticipationType),
});

export class SurveySummaryDto extends createZodDto(surveySummarySchema) {}
