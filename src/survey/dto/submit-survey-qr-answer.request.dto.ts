import { createZodDto } from 'nestjs-zod';
import { submitSurveyAnswerSchema } from './submit-survey-answer.request.dto.js';

/** 종이 QR 응답. 응답자 정보가 없으니 전화번호·개인정보 동의 없이 답변만 받는다. */
export const submitSurveyQrAnswerSchema = submitSurveyAnswerSchema.pick({
  answers: true,
});

export class SubmitSurveyQrAnswerRequestDto extends createZodDto(
  submitSurveyQrAnswerSchema,
) {}
