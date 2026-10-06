import type { FilterOptions } from 'dicoshot-nest';
import { ExternalServiceUnavailableException } from '../exceptions/domain.exception.js';

/**
 * 처리되지 않은 예외를 Discord로 알리는 Dicoshot 전역 필터의 설정.
 *
 * - 요청 바디에는 전화번호·설문 답변 같은 개인정보가 실린다. 알림 채널에 보내지 않는다.
 * - 의존 서비스(유저·참여) 장애(503)는 이 서비스의 버그가 아니고, 클라이언트가 이미 요청 내용 없이
 *   로그로 남긴다. 알림의 경로 필드에 QR 토큰(`/surveys/qr/:token`)이 실리는 것도 막는다.
 *
 * Dicoshot은 경로를 가리는 옵션이 없어서, 그 밖의 500이 QR 경로에서 나면 경로는 그대로 실린다.
 */
export const dicoshotFilterOptions: FilterOptions = {
  includeRequest: false,
  ignoreErrors: [ExternalServiceUnavailableException],
};
