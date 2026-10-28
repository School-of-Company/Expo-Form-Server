import type { Logger } from '@nestjs/common';

/** 미스 로그를 키마다 한 번만 남기려고 기억하는 키 수의 기본 상한. 넘치면 비우고 다시 센다. */
const DEFAULT_MEMORY = 10_000;

/**
 * 로컬 프로젝션에 없어 원래 서비스로 동기 조회할 때(미스) 남기는 로그를 키마다 한 번만 찍는다.
 * 재발행 전이나 소비가 밀릴 때 같은 키의 미스가 요청마다 쌓여 로그가 넘치지 않게 한다.
 */
export class ProjectionMissLogger {
  private readonly logged = new Set<string>();

  constructor(
    private readonly logger: Logger,
    private readonly memory = DEFAULT_MEMORY,
  ) {}

  record(key: string, message: string): void {
    if (this.logged.has(key)) {
      return;
    }

    if (this.logged.size >= this.memory) {
      this.logged.clear();
    }

    this.logged.add(key);
    this.logger.log(message);
  }
}
