import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Occupation } from '../../common/enums/occupation.enum.js';
import { submitSurveyAnswerSchema } from './submit-survey-answer.request.dto.js';

/**
 * 종이 QR 응답. 응답자 정보가 없으니 전화번호·개인정보 동의 없이 답변만 받는다. 대신 직업별로 나눠
 * 볼 수 있게 직업은 반드시 받는다.
 */
export const submitSurveyQrAnswerSchema = submitSurveyAnswerSchema
  .pick({ answers: true })
  .extend({ occupation: z.enum(Occupation) });

export class SubmitSurveyQrAnswerRequestDto extends createZodDto(
  submitSurveyQrAnswerSchema,
) {}
