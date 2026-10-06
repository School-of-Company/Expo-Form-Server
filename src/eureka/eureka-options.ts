import type { EurekaModuleOptions } from '@school-of-company/nestjs-eureka';

/** Gateway 설정(`gateway-*.yml`)의 `/forms`, `/surveys`가 이 이름으로 라우팅된다. */
export const FORM_EUREKA_APP_NAME = 'expo-form-server';

/**
 * Eureka 등록을 켜는 기준이 되는 환경 변수. 값이 없으면 `AppModule`이 Eureka 모듈을 아예 불러오지 않아
 * 로컬 개발·테스트·CI는 Eureka 없이 그대로 뜬다.
 */
export const EUREKA_SERVICE_URL_ENV = 'EUREKA_SERVICE_URL';

export type EurekaEnv = {
  /** 쉼표로 여러 개를 줄 수 있다 (`http://a:8761/eureka,http://b:8761/eureka`). */
  serviceUrl: string;
  /** Gateway와 같은 이름(`INSTANCE_HOSTNAME`, `INSTANCE_IP_ADDR`)을 쓴다. */
  hostName: string | undefined;
  ipAddr: string | undefined;
  port: string | undefined;
};

/**
 * 환경 변수로 Eureka 등록 옵션을 만든다. Nest를 띄우지 않고 테스트할 수 있게 순수 함수로 둔다.
 *
 * - 라이브러리는 쉼표로 이은 URL 문자열을 받지 않으므로 배열로 나눠서 넘긴다.
 * - `registrationMode: 'background'`: Eureka가 잠시 내려가 있어도 앱은 뜨고, 등록은 하트비트마다 다시 시도한다.
 *   Form 서버는 직접 들어오는 요청(예: 내부 API)도 받으므로 Eureka 장애로 기동까지 막을 이유가 없다.
 */
export function buildEurekaOptions(env: EurekaEnv): EurekaModuleOptions {
  const serviceUrls = env.serviceUrl
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url !== '');
  if (serviceUrls.length === 0) {
    throw new Error(`${EUREKA_SERVICE_URL_ENV} must contain at least one URL`);
  }

  if (
    env.hostName === undefined ||
    env.hostName === '' ||
    env.ipAddr === undefined ||
    env.ipAddr === ''
  ) {
    throw new Error(
      `INSTANCE_HOSTNAME and INSTANCE_IP_ADDR are required when ${EUREKA_SERVICE_URL_ENV} is set`,
    );
  }

  const port = Number(env.port ?? 3000);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT for Eureka registration: ${env.port}`);
  }

  return {
    serviceUrl: serviceUrls.length === 1 ? serviceUrls[0] : serviceUrls,
    registrationMode: 'background',
    instance: {
      app: FORM_EUREKA_APP_NAME,
      hostName: env.hostName,
      ipAddr: env.ipAddr,
      port,
    },
  };
}
