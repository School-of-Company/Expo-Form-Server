import { createZodDto } from 'nestjs-zod';
import { createSurveySchema } from './create-survey.request.dto.js';

/**
 * 생성과 같은 바디를 받되, 대상 설문은 경로의 surveyId로 식별하므로 `expoId`는 받지 않는다.
 * 생성 스키마에 `.refine()`이 없어 중간 스키마 없이 바로 `.omit()`을 걸 수 있다.
 */
export const updateSurveySchema = createSurveySchema.omit({ expoId: true });

export class UpdateSurveyRequestDto extends createZodDto(updateSurveySchema) {}
