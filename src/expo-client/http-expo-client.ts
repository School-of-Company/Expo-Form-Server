import { Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  ExternalServiceUnavailableException,
  ProgramFormChangeInProgressException,
  ProgramFormGuardianPolicyInUseException,
  ProgramFormReservationUnavailableException,
} from '../common/exceptions/domain.exception.js';
import { logDownstreamFailure } from '../common/http/resilience.js';
import { ExternalServiceError } from '../common/http/external-service.error.js';
import {
  deleteRequest,
  fetchJson,
  putJson,
} from '../common/http/fetch-json.util.js';
import type { InternalServiceOptions } from '../common/http/internal-service.config.js';
import { INTERNAL_TOKEN_HEADER } from '../common/http/internal-token.constants.js';
import type { ExpoClient, ExpoPeriod } from './expo-client.interface.js';

/** 박람회 서비스가 수정 예약을 "이 폼에 진행 중인 변경이 있다"며 409로 거절할 때 바디에 싣는 `code`. */
const CHANGE_IN_PROGRESS_CODE = 'PROGRAM_FORM_CHANGE_IN_PROGRESS';

/** 박람회가 있다는 사실만 쓰고 내용은 쓰지 않아서, 객체 모양인지만 본다. */
const expoResponseSchema = z.looseObject({});

/** 박람회 기간 응답 모양. 날짜는 `yyyy-MM-dd` 문자열이다. */
const expoPeriodResponseSchema = z.looseObject({
  startedDay: z.string(),
  finishedDay: z.string(),
});

/**
 * 박람회 서비스의 내부 API를 HTTP로 호출하는 {@link ExpoClient} 구현.
 *
 * 계약: `GET /internal/expo/{expoId}`에 `X-Internal-Token`을 보내면, 박람회가 있으면 `200`(박람회
 * 기간), 없으면 `404`다(박람회 서비스 `InternalExpoController`).
 */
export class HttpExpoClient implements ExpoClient {
  private readonly logger = new Logger(HttpExpoClient.name);

  constructor(private readonly options: InternalServiceOptions) {}

  /**
   * 박람회가 있으면 true, 404면 false다. 그 밖의 응답·타임아웃·연결 실패는 "없음"이 아니라 장애이므로
   * 503으로 바꿔 던진다 — 장애를 "없음"으로 돌려보내면 있는 박람회에 폼을 못 만든다.
   */
  async exists(expoId: string): Promise<boolean> {
    const url = `${this.options.baseUrl}/internal/expo/${encodeURIComponent(expoId)}`;

    try {
      const result = await fetchJson(url, expoResponseSchema, {
        headers: { [INTERNAL_TOKEN_HEADER]: this.options.internalToken },
        observe: { service: 'expo', operation: 'exists' },
      });

      return result !== null;
    } catch (error) {
      logDownstreamFailure(
        this.logger,
        `박람회 서비스 존재 확인 실패: ${url}`,
        error,
      );
      throw new ExternalServiceUnavailableException();
    }
  }

  /** 박람회가 없으면(404) null이고, 그 밖의 실패는 "없음"이 아니라 장애이므로 503으로 바꿔 던진다. */
  async findPeriod(expoId: string): Promise<ExpoPeriod | null> {
    const url = `${this.options.baseUrl}/internal/expo/${encodeURIComponent(expoId)}`;

    try {
      const result = await fetchJson(url, expoPeriodResponseSchema, {
        headers: { [INTERNAL_TOKEN_HEADER]: this.options.internalToken },
        observe: { service: 'expo', operation: 'find_period' },
      });

      return result === null
        ? null
        : { startedDay: result.startedDay, finishedDay: result.finishedDay };
    } catch (error) {
      logDownstreamFailure(
        this.logger,
        `박람회 서비스 기간 조회 실패: ${url}`,
        error,
      );
      throw new ExternalServiceUnavailableException();
    }
  }

  /**
   * `PUT /internal/forms/by-id/:formId/changes/:changeId`에 `kind=UPDATE`를 보낸다. 409는 보호자 동반 정책이
   * 폼을 쓰고 있다는 거절이고, 404를 포함한 그 밖의 실패는 확인하지 못한 것이므로 503으로 막는다.
   */
  async reserveProgramFormUpdate(
    formId: string,
    changeId: string,
  ): Promise<void> {
    const url = this.programFormChangeUrl(formId, changeId);

    let result: unknown;
    try {
      result = await putJson(url, { kind: 'UPDATE' }, expoResponseSchema, {
        headers: { [INTERNAL_TOKEN_HEADER]: this.options.internalToken },
        observe: { service: 'expo', operation: 'reserve_update' },
      });
    } catch (error) {
      if (error instanceof ExternalServiceError && error.status === 409) {
        // 사유 코드가 없는 409(코드를 주기 전 버전의 박람회 서비스)는 지금까지처럼 보호자 정책 참조로 본다.
        throw error.code === CHANGE_IN_PROGRESS_CODE
          ? new ProgramFormChangeInProgressException()
          : new ProgramFormGuardianPolicyInUseException();
      }

      logDownstreamFailure(
        this.logger,
        `박람회 서비스 폼 수정 예약 실패: ${url}`,
        error,
      );
      throw new ProgramFormReservationUnavailableException();
    }

    if (result !== null) {
      return;
    }

    // 404는 폼이 없다는 뜻이 아니라(폼은 이 서비스에 있다) 박람회 서비스에 변경 예약 API가 없다는 뜻일 가능성이 크다.
    this.logger.error(
      `박람회 서비스 폼 수정 예약 실패(404): ${url} — 박람회 서비스에 변경 예약 API(PUT /internal/forms/by-id/:formId/changes/:changeId)가 배포됐는지 확인하세요.`,
    );
    throw new ProgramFormReservationUnavailableException();
  }

  /** `DELETE .../changes/{changeId}`. 반복·미등록 해제도 204라 재시도해도 안전하다. */
  async releaseProgramFormChange(
    formId: string,
    changeId: string,
  ): Promise<void> {
    const url = this.programFormChangeUrl(formId, changeId);

    try {
      await deleteRequest(url, {
        headers: { [INTERNAL_TOKEN_HEADER]: this.options.internalToken },
        observe: { service: 'expo', operation: 'release_change' },
        // 회로가 열려 있다는 이유로 해제를 건너뛰면 예약이 만료(5분)까지 남아 다음 수정이 막힌다.
        bypassGuard: true,
      });
    } catch (error) {
      // ponytail: 한 번만 시도한다. 풀리지 않은 예약은 박람회 서비스에서 수동으로 해제해야 한다.
      logDownstreamFailure(
        this.logger,
        `박람회 서비스 폼 변경 예약 해제 실패: ${url}`,
        error,
      );
    }
  }

  private programFormChangeUrl(formId: string, changeId: string): string {
    return `${this.options.baseUrl}/internal/forms/by-id/${encodeURIComponent(formId)}/changes/${encodeURIComponent(changeId)}`;
  }
}
