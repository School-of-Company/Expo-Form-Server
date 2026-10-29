import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { SurveyCursorInvalidException } from '../common/exceptions/domain.exception.js';

/** DB가 돌려주는 마이크로초 UTC 시각. 자릿수가 고정이라 문자열 비교가 곧 시각 비교다. */
const micros = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u);

const cursorSchema = z
  .object({
    surveyId: z.uuid(),
    snapshotAt: micros,
    createdAt: micros,
    id: z.uuid(),
    // 첫 페이지가 센 전체 건수. 이 필드가 생기기 전에 발급한 커서에는 없어서, 없으면 그 페이지에서 다시 센다(#248).
    totalCount: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((cursor) => cursor.createdAt <= cursor.snapshotAt);

/** 공개 설문 응답 커서. 조회 상한, 마지막으로 준 응답의 `(createdAt, id)`, 전체 건수를 담는다. */
export type PublicAnswerCursor = z.infer<typeof cursorSchema>;

// ponytail: 서명 없는 base64url JSON. 내부 토큰 호출자가 같은 설문 안에서 커서를 바꿔도 원래 읽을 수 있는 것 이상은 못 얻는다.
export function encodeCursor(cursor: PublicAnswerCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/**
 * 커서를 풀고 이 설문의 것인지, 상한이 미래가 아닌지 확인한다.
 *
 * @throws {SurveyCursorInvalidException} 해석할 수 없거나 다른 설문의 커서일 때
 */
export function decodeCursor(
  raw: string,
  surveyId: string,
): PublicAnswerCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new SurveyCursorInvalidException();
  }

  const result = cursorSchema.safeParse(parsed);
  if (
    !result.success ||
    result.data.surveyId !== surveyId ||
    Date.parse(result.data.snapshotAt) > Date.now()
  ) {
    throw new SurveyCursorInvalidException();
  }

  return result.data;
}
