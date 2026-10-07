import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { readInternalServiceOptions } from '../common/http/internal-service.config.js';
import type { ExpoClient } from './expo-client.interface.js';
import { HttpExpoClient } from './http-expo-client.js';

/** 박람회 서비스 연동 설정을 담은 환경 변수 이름. */
export const EXPO_SERVICE_CONFIG_KEYS = {
  urlKey: 'EXPO_SERVICE_URL',
  tokenKey: 'EXPO_SERVICE_INTERNAL_TOKEN',
};

/**
 * 박람회 서비스 설정이 없을 때 쓰는 구현. 확인을 건너뛰고 항상 있다고 답한다 — 연동 전과 같은 동작이라
 * 설정을 넣기 전에 배포해도 폼·설문 생성이 막히지 않는다.
 */
const skippingExpoClient: ExpoClient = {
  async exists() {
    return true;
  },
};

/**
 * 박람회 서비스 연동 설정으로 {@link ExpoClient}를 만든다.
 *
 * 설정이 아예 없으면 부팅을 막지 않고 존재 확인을 건너뛴다(경고를 남긴다). 하나만 있거나 토큰이 짧으면
 * 설정 실수이므로 부팅 단계에서 던진다(`readInternalServiceOptions`).
 */
export function createExpoClient(config: ConfigService): ExpoClient {
  const options = readInternalServiceOptions(config, EXPO_SERVICE_CONFIG_KEYS);
  if (options === null) {
    new Logger('ExpoClient').warn(
      '박람회 서비스 설정(EXPO_SERVICE_URL, EXPO_SERVICE_INTERNAL_TOKEN)이 없어 폼·설문 생성 때 박람회 존재 확인을 건너뜁니다.',
    );
    return skippingExpoClient;
  }

  return new HttpExpoClient(options);
}
