import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SurveyAnswerSubmissionStatus } from '../entities/survey-answer-submission-status.enum.js';

/**
 * 참가자 본인의 설문 응답 상태(#203). 설문 화면이 진입할 때 이미 응답했는지 보여 주는 데 쓴다.
 *
 * `status`는 가장 최근 제출의 처리 단계다. 발행 여부(`PUBLISHED`)는 내부 처리 단계라 `RECEIVED`(접수)로 묶는다.
 * 제출한 적이 없으면 null이다. 거절(`REJECTED`)되면 다시 제출할 수 있으므로 `answered`는 false다.
 */
export const mySurveyAnswerResponseSchema = z.object({
  /** 다시 제출하면 409가 되는지 — 접수됐거나 저장된 제출이 있으면 true. */
  answered: z.boolean(),
  status: z
    .enum([
      SurveyAnswerSubmissionStatus.RECEIVED,
      SurveyAnswerSubmissionStatus.STORED,
      SurveyAnswerSubmissionStatus.REJECTED,
    ])
    .nullable(),
});

export class MySurveyAnswerResponseDto extends createZodDto(
  mySurveyAnswerResponseSchema,
) {}
