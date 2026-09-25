import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { ApplicationType } from '../entities/application-type.enum.js';

/** 폼은 (박람회, 참여자군, 신청방식) 조합으로 유일하므로 이 셋으로 조회한다. */
export const findFormSchema = z.object({
  expoId: z.uuid(),
  participationType: z.enum(ParticipationType),
  applicationType: z.enum(ApplicationType),
});

export class FindFormRequestDto extends createZodDto(findFormSchema) {}
