import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SurveyAnswerSubmissionStatus } from '../entities/survey-answer-submission-status.enum.js';

/**
 * 참가자 본인의 설문 응답 상태.
 *
 * - `answered`: 이미 응답해서 다시 제출할 수 없으면 true. 접수·전달 중이거나 저장 완료이면 true이고, 아직 응답하지 않았거나
 *   유저 서비스가 거절한 응답(다시 제출할 수 있다)이면 false다.
 * - `status`: 제출 처리 단계. 응답한 적이 없으면 null이다. `RECEIVED`(접수), `PUBLISHED`(유저 서비스로 전달, 결과 대기),
 *   `STORED`(저장 완료), `REJECTED`(거절, 다시 제출 가능).
 *
 * 거절 사유(`rejectReason`)는 싣지 않는다 — 다른 서비스의 처리 내용이 참가자 화면에 새지 않게 한다.
 */
export const surveyAnswerStatusResponseSchema = z.object({
  answered: z.boolean(),
  status: z.enum(SurveyAnswerSubmissionStatus).nullable(),
});

export class SurveyAnswerStatusResponseDto extends createZodDto(
  surveyAnswerStatusResponseSchema,
) {}
