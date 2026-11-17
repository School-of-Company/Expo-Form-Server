import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRAW_MAX_RETRY_COUNT,
  resolveDrawMaxRetryCount,
} from './survey-draw-result-relay.config.js';

describe('resolveDrawMaxRetryCount', () => {
  it('환경변수가 없거나 비어 있으면 기본값을 쓴다', () => {
    expect(resolveDrawMaxRetryCount(() => undefined)).toBe(
      DEFAULT_DRAW_MAX_RETRY_COUNT,
    );
    expect(resolveDrawMaxRetryCount(() => '')).toBe(
      DEFAULT_DRAW_MAX_RETRY_COUNT,
    );
  });

  it('문자열 환경변수를 숫자로 읽는다', () => {
    expect(resolveDrawMaxRetryCount(() => '30')).toBe(30);
  });

  it.each(['0', '-1', '1.5', 'abc'])('잘못된 값 %s는 거부한다', (raw) => {
    expect(() => resolveDrawMaxRetryCount(() => raw)).toThrow(
      'SURVEY_DRAW_RESULT_MAX_RETRY_COUNT must be a positive integer.',
    );
  });
});
