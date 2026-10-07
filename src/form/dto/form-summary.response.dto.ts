import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { ApplicationType } from '../entities/application-type.enum.js';

/** 박람회에 어떤 폼이 만들어져 있는지. 폼을 유일하게 식별하는 세 값만 담는다. */
export const formSummarySchema = z.object({
  expoId: z.uuid(),
  participationType: z.enum(ParticipationType),
  applicationType: z.enum(ApplicationType),
});

export class FormSummaryDto extends createZodDto(formSummarySchema) {}
