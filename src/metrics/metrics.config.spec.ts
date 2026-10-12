import { readMetricsBind, readMetricsEnabled } from './metrics.config.js';

const envOf = (entries: Array<[string, string]>) => {
  const env = new Map(entries);
  return (key: string) => env.get(key);
};

describe('readMetricsEnabled', () => {
  it('기본은 켜짐이다', () => {
    expect(readMetricsEnabled(envOf([]))).toBe(true);
  });

  it('false로 끈다', () => {
    expect(readMetricsEnabled(envOf([['METRICS_ENABLED', 'false']]))).toBe(
      false,
    );
  });

  it('true·false 외의 값은 조용히 넘기지 않고 거부한다', () => {
    expect(() => readMetricsEnabled(envOf([['METRICS_ENABLED', '0']]))).toThrow(
      /METRICS_ENABLED/u,
    );
  });
});

describe('readMetricsBind', () => {
  it('기본은 loopback의 9464다', () => {
    expect(readMetricsBind(envOf([]))).toEqual({
      host: '127.0.0.1',
      port: 9464,
    });
  });

  it('환경 변수로 주소와 포트를 바꾼다', () => {
    expect(
      readMetricsBind(
        envOf([
          ['METRICS_HOST', '10.0.0.5'],
          ['METRICS_PORT', '18206'],
        ]),
      ),
    ).toEqual({ host: '10.0.0.5', port: 18_206 });
  });

  it.each(['abc', '0', '-1', '1.5', '65536'])(
    '올바르지 않은 포트(%s)는 거부한다',
    (port) => {
      expect(() => readMetricsBind(envOf([['METRICS_PORT', port]]))).toThrow(
        /METRICS_PORT/u,
      );
    },
  );

  it('빈 주소는 거부한다', () => {
    expect(() => readMetricsBind(envOf([['METRICS_HOST', ' ']]))).toThrow(
      /METRICS_HOST/u,
    );
  });
});
