import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { currentTrace } from './trace-context.js';

/**
 * 요청 처리 중에 남긴 로그 줄 끝에 `trace=<id>`를 붙이는 로거. Loki → Tempo 연결(derived field)이 이 규약을 쓴다.
 * 요청 밖(기동, 스케줄 작업)의 로그에는 붙지 않는다.
 */
export class TraceLogger extends ConsoleLogger {
  // 부모 시그니처를 그대로 따라야 해서 매개변수가 많다.
  // eslint-disable-next-line max-params
  protected override formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
  ): string {
    const line = super.formatMessage(
      logLevel,
      message,
      pidMessage,
      formattedLogLevel,
      contextMessage,
      timestampDiff,
    );
    const trace = currentTrace();
    if (trace === undefined) {
      return line;
    }

    const suffix = ` trace=${trace.traceId}`;
    return line.endsWith('\n')
      ? `${line.slice(0, -1)}${suffix}\n`
      : `${line}${suffix}`;
  }
}
