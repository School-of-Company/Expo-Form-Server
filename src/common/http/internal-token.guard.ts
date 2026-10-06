import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  INTERNAL_TOKEN_HEADER,
  INTERNAL_TOKEN_MIN_LENGTH,
} from './internal-token.constants.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/**
 * `/internal` 하위 경로를 지키는 가드. 서비스 간 호출은 Gateway를 거치지 않으므로 사용자 토큰 대신
 * `X-Internal-Token`이 이 서비스의 `INTERNAL_TOKEN`과 같은지만 본다(유저 서비스와 같은 방식).
 *
 * Gateway 라우팅 표에 `/internal` prefix를 넣으면 안 된다. 라우팅에 없는 경로는 Gateway가 막아 주므로
 * 이 경로가 외부에 닿지 않는 것은 그 덕분이다.
 *
 * 토큰이 없거나 짧으면 생성자에서 던져 부팅 단계에서 실패한다.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  private readonly expectedDigest: Uint8Array;

  constructor(config: ConfigService) {
    const token = config.get<string>('INTERNAL_TOKEN') ?? '';
    if (token.length < INTERNAL_TOKEN_MIN_LENGTH) {
      throw new Error(
        `INTERNAL_TOKEN must be at least ${INTERNAL_TOKEN_MIN_LENGTH} characters.`,
      );
    }

    this.expectedDigest = sha256(token);
  }

  canActivate(context: ExecutionContext): boolean {
    const token = context
      .switchToHttp()
      .getRequest<Request>()
      .header(INTERNAL_TOKEN_HEADER);

    // 해시한 값끼리 상수 시간으로 비교해 길이나 일치한 앞부분이 응답 시간으로 드러나지 않게 한다.
    if (
      token === undefined ||
      !timingSafeEqual(sha256(token), this.expectedDigest)
    ) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
