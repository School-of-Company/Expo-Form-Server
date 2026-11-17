import type { EntityManager } from 'typeorm';

/**
 * 폼 필드·설문 문항의 id를 매기는 시퀀스. 필드를 jsonb로 옮기기 전 `dynamic_form`·`dynamic_survey`의 SERIAL
 * 시퀀스를 그대로 이어 쓴다. 그래서 이미 쓴 id와 겹치지 않고, 한 번 쓴 id를 다른 문항이 다시 받지 않는다(지운
 * 문항의 id를 새 문항이 받으면 옛 답변이 새 문항에 붙는다). 시퀀스는 마이그레이션이 만든 것을 쓰고 앱은 만들지 않는다.
 */
export type DynamicFieldIdSequence = 'dynamic_form_id_seq' | 'dynamic_survey_id_seq';

/** 새 필드 `count`개의 id를 한 번의 쿼리로 받는다. 오름차순이라 받은 순서대로 붙이면 작성 순서와 id 순서가 같다. */
export async function allocateFieldIds(
  manager: EntityManager,
  sequence: DynamicFieldIdSequence,
  count: number,
): Promise<number[]> {
  if (count === 0) {
    return [];
  }

  const rows = await manager.query<Array<{ id: string }>>(
    `SELECT nextval('${sequence}') AS id FROM generate_series(1, $1) ORDER BY 1`,
    [count],
  );
  return rows.map((row) => Number(row.id));
}
