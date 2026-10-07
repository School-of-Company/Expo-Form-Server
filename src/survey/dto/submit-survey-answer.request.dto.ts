import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 답변 제출 요청의 겉모양만 검증한다. `answers`의 문항별 실제 규칙(필수 여부, 선택지,
 * 최대 선택 개수)은 문항마다 다르고 설문 정의에 저장돼 있어 컴파일 시점에 알 수 없다 —
 * 그건 `buildAnswerSchema`로 런타임에 조립해 서비스에서 `safeParse`한다
 * (전역 `ZodValidationPipe`는 이렇게 정적으로 선언되지 않은 스키마를 다루지 못한다).
 */
export const submitSurveyAnswerSchema = z.object({
  phoneNumber: z.string().min(1),
  personalInformationStatus: z.boolean(),
  answers: z.record(z.string(), z.unknown()),
});

export class SubmitSurveyAnswerRequestDto extends createZodDto(
  submitSurveyAnswerSchema,
) {}
