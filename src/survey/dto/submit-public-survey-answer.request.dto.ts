import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Occupation } from '../../common/enums/occupation.enum.js';
import { submitSurveyAnswerSchema } from './submit-survey-answer.request.dto.js';

/**
 * 공개 링크 설문 응답. 응답자를 식별하지 않으니 답변만 받고, 직업별로 나눠 볼 수 있게 직업은 반드시 받는다.
 *
 * 경품 추첨이 켜진 설문에서만 선택으로 전화번호를 받는다. 번호를 보내면 개인정보 수집 동의
 * (`personalInformationStatus`)도 함께 와야 한다. 번호 형식과 동의 여부는 서비스가 확인한다 — 추첨이 꺼진
 * 설문이면 번호를 저장하지 않고 무시해야 해서, 겉모양 검사만으로는 거절할 수 없다.
 */
export const submitPublicSurveyAnswerSchema = submitSurveyAnswerSchema
  .pick({ answers: true })
  .extend({
    occupation: z.enum(Occupation),
    phoneNumber: z.string().optional(),
    personalInformationStatus: z.boolean().optional(),
  });

export class SubmitPublicSurveyAnswerRequestDto extends createZodDto(
  submitPublicSurveyAnswerSchema,
) {}
