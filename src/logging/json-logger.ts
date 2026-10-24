import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { type LoggerService } from '@nestjs/common';
import pino, {
  type DestinationStream,
  type Level,
  type Logger as Pino,
} from 'pino';
import { currentTrace } from '../tracing/trace-context.js';

/** Expo 공통 로그 키(README "Logging"). Loki는 이 이름만 라벨로 읽는다. */
export type JsonLoggerOptions = {
  /** Eureka 앱 이름. 모든 줄의 `service`가 된다. */
  service: string;
  /** pino 레벨: trace, debug, info, warn, error */
  level: string;
  /** 지정하면 stdout과 같은 줄을 `<logDir>/<service>/app.log`에도 쓴다(로컬 전용). */
  logDir?: string;
};

const DEFAULT_MODULE = 'app';
const LOG_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error']);
const STACK_LINE = /\n[\t ]+at /u;

/**
 * 환경 변수에서 로그 레벨과 파일 미러 위치를 읽는다. 로거가 다른 설정보다 먼저 설치되므로 잘못된 값에도 던지지 않는다.
 * 파일 미러는 `PROFILE`(없으면 `NODE_ENV`)이 `local`일 때만 켠다.
 */
export function readLogEnv(
  env: NodeJS.ProcessEnv = process.env,
): Pick<JsonLoggerOptions, 'level' | 'logDir'> {
  const raw = (env.LOG_LEVEL ?? 'info').toLowerCase();
  const level = LOG_LEVELS.has(raw) ? raw : 'info';
  if ((env.PROFILE ?? env.NODE_ENV) !== 'local') {
    return { level };
  }

  const logDir = env.EXPO_LOG_DIR;
  return {
    level,
    logDir:
      logDir === undefined || logDir === ''
        ? path.join(homedir(), '.expo', 'logs')
        : logDir,
  };
}

export function createPino(
  options: JsonLoggerOptions,
  stdout: DestinationStream = pino.destination({ dest: 1, sync: true }),
): Pino {
  const level = options.level as Level;
  const streams: pino.StreamEntry[] = [{ level, stream: stdout }];
  if (options.logDir !== undefined && options.logDir !== '') {
    const file = pino.destination({
      dest: path.join(options.logDir, options.service, 'app.log'),
      mkdir: true,
      sync: true,
    });
    streams.push({ level, stream: file });
  }

  return pino(
    {
      level: options.level,
      base: { service: options.service },
      messageKey: 'message',
      timestamp: () => `,"@timestamp":"${new Date().toISOString()}"`,
      formatters: {
        // 표준에는 FATAL이 없어서 Nest의 fatal()은 ERROR로 남긴다.
        level: (label) => ({
          level: label === 'fatal' ? 'ERROR' : label.toUpperCase(),
        }),
      },
      // 요청 처리 중이면 trace id를 키로 붙인다. Loki → Tempo 링크와 Tempo → Loki 필터가 이 값을 찾는다.
      mixin() {
        const trace = currentTrace();
        return trace === undefined ? {} : { traceId: trace.traceId };
      },
    },
    pino.multistream(streams),
  );
}

/**
 * 표준 JSON 한 줄을 쓰는 Nest LoggerService. Nest 로거 컨텍스트(`new Logger(Foo.name)`의 이름)를 `module`로 쓴다
 * (nestjs-pino `renameContext: 'module'`과 같은 매핑). 호출부에서 `module`을 넣지 않는다.
 * Nest 앱을 만들기 전에 `Logger.overrideLogger()`로 설치해 기동 중 로그와 실패 종료도 JSON으로 남긴다.
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly logger: Pino) {}

  log(message: unknown, ...parameters: unknown[]): void {
    this.write('info', message, parameters);
  }

  error(message: unknown, ...parameters: unknown[]): void {
    this.write('error', message, parameters, true);
  }

  warn(message: unknown, ...parameters: unknown[]): void {
    this.write('warn', message, parameters);
  }

  debug(message: unknown, ...parameters: unknown[]): void {
    this.write('debug', message, parameters);
  }

  verbose(message: unknown, ...parameters: unknown[]): void {
    this.write('trace', message, parameters);
  }

  fatal(message: unknown, ...parameters: unknown[]): void {
    this.write('fatal', message, parameters, true);
  }

   
  private write(
    level: Level,
    message: unknown,
    parameters: unknown[],
    withStack = false,
  ): void {
    // `new Logger(ctx).log(msg)`는 (msg, undefined, ctx)로 들어온다.
    const rest = parameters.filter((parameter) => parameter !== undefined);
    let stack: string | undefined;
    // Nest는 error(message, stack?, context?)로 부른다. 스택 모양의 문자열 하나는 컨텍스트가 아니다.
    if (
      withStack &&
      typeof rest[0] === 'string' &&
      (rest.length === 2 || STACK_LINE.test(rest[0]))
    ) {
      stack = rest.shift() as string;
    }

    const last = rest.at(-1);
    const module =
      typeof last === 'string' && last !== ''
        ? (rest.pop() as string)
        : DEFAULT_MODULE;

    const fields: Record<string, unknown> = { module };
    let text: string;
    if (message instanceof Error) {
      text = message.message;
      stack ??= message.stack;
    } else {
      text = stringify(message);
    }

    if (rest.length > 0) {
      text = [text, ...rest.map((value) => stringify(value))].join(' ');
    }

    if (stack !== undefined) {
      fields.stack_trace = stack;
    }

    this.logger[level](fields, text);
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
