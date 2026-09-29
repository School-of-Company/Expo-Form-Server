import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';
import { ApplicationType } from '../entities/application-type.enum.js';

/**
 * 폼은 (박람회, 참여자군, 신청방식) 조합으로 유일하다. `expoId`는 경로 파라미터로 받으므로
 * 여기에는 나머지 둘만 남는다.
 */
export const findFormSchema = z.object({
  participationType: z.enum(ParticipationType),
  applicationType: z.enum(ApplicationType),
});

export class FindFormRequestDto extends createZodDto(findFormSchema) {}
