import { createZodDto } from 'nestjs-zod';
import { createSurveySchema } from './create-survey.request.dto.js';

/**
 * 생성과 같은 바디를 받는다. 대상 설문은 경로의 `expoId`와 바디의 `participationType`
 * 조합으로 식별하므로, 이 조합을 바꾸는 것(참여자군 변경)은 지원하지 않는다.
 */
export const updateSurveySchema = createSurveySchema;

export class UpdateSurveyRequestDto extends createZodDto(updateSurveySchema) {}
