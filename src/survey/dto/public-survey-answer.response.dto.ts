import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 공개 설문 답변 제출 결과. 경품 추첨이 켜져 있으면 이 응답이 당첨인지 알려 응답 화면이 "당첨되었습니다"를
 * 띄운다 — 전화번호를 입력하지 않은 응답자도 똑같이 알 수 있다. 추첨이 꺼져 있으면 항상 당첨이 아니다.
 */
export const publicSurveyAnswerResponseSchema = z.object({
  /** 이 응답이 경품에 당첨됐는지. */
  won: z.boolean(),
  /**
   * 기념품 수령 확인 토큰. 제출에 성공한 응답자에게만 한 번 돌려주고 서버에는 해시만 남으므로 잃어버리면 다시 받을 수 없다.
   * 추첨 당첨 여부와 상관없이 응답자 전원에게 발급한다. 로그·URL 쿼리에 남기지 않는다.
   */
  giftToken: z.string(),
});

export class PublicSurveyAnswerResponseDto extends createZodDto(
  publicSurveyAnswerResponseSchema,
) {}
