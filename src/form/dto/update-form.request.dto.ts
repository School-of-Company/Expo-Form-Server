import { createZodDto } from 'nestjs-zod';
import { createFormSchema } from './create-form.request.dto.js';

/** 생성과 같은 바디를 받되, 대상 폼은 경로의 formId로 식별하므로 `expoId`는 받지 않는다. */
export const updateFormSchema = createFormSchema.omit({ expoId: true });

export class UpdateFormRequestDto extends createZodDto(updateFormSchema) {}
