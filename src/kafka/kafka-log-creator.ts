import { Logger } from '@nestjs/common';
import { type LogEntry, logLevel } from 'kafkajs';

const logger = new Logger('kafkajs');

/**
 * kafkajs 로그를 Nest 로거로 보낸다. kafkajs 기본 로거는 자기 형식의 JSON(`timestamp`, `logger`)을 stderr에 써서
 * 로그 표준(README "Logging")의 `service`·`module`이 빠진다. `module`은 `kafkajs`다.
 */
export function kafkaLogCreator() {
  return ({ namespace, level, log }: LogEntry): void => {
    const { message, timestamp: _timestamp, logger: _logger, ...extra } = log;
    const detail = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
    // 일부 메시지(파티셔너 안내 등)는 namespace 없이 온다.
    const prefix =
      typeof namespace === 'string' && namespace !== '' ? `[${namespace}] ` : '';
    const text = `${prefix}${message}${detail}`;
    switch (level) {
      case logLevel.ERROR: {
        logger.error(text);
        break;
      }

      case logLevel.WARN: {
        logger.warn(text);
        break;
      }

      case logLevel.INFO: {
        logger.log(text);
        break;
      }

      case logLevel.DEBUG: {
        logger.debug(text);
        break;
      }

      case logLevel.NOTHING: {
        break;
      }
    }
  };
}
