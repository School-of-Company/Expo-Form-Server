import type { Request } from 'express';
import { DicoshotNotify } from 'dicoshot-nest';

/** Gateway가 검증한 토큰에서 꺼내 백엔드로 넘기는 요청자 헤더. */
const USER_ID_HEADER = 'x-user-id';

/** 알림에 싣는 경로 파라미터. 대상 식별용 UUID·열거값만이고, 바디는 싣지 않는다(개인정보가 실릴 수 있다). */
const TARGET_PARAMS = [
  'expoId',
  'formId',
  'participationType',
  'applicationType',
] as const;

/**
 * 헤더 값을 그대로 알림에 넣지 않는다. Gateway를 거치지 않고 직접 들어온 요청은 헤더를 마음대로 채울 수 있고,
 * Discord 메시지에는 멘션(`@everyone`)·마크다운이 먹기 때문에 식별자 모양일 때만 쓴다.
 */
function readRequester(request: Request): string {
  const value = request.headers[USER_ID_HEADER];
  return typeof value === 'string' && /^[\w-]{1,64}$/u.test(value)
    ? value
    : '알 수 없음';
}

function describeChange(request: Request): string {
  const targets = TARGET_PARAMS.flatMap((key) => {
    const value = (request.params as Record<string, unknown>)[key];
    return typeof value === 'string' ? [`${key}=${value}`] : [];
  });

  return [
    `요청자: ${readRequester(request)}`,
    `대상: ${targets.length > 0 ? targets.join(', ') : '-'}`,
  ].join('\n');
}

/**
 * 관리자가 데이터를 바꾸는 API가 성공했을 때 "누가 뭘 했는지"를 Discord로 알린다. 실패한 요청은 알리지 않는다
 * (처리되지 않은 예외는 Dicoshot 전역 필터가 따로 알린다). 컨트롤러 메서드에 붙이면 된다.
 *
 * @param action 알림 제목에 쓸 행위 (예: `폼 생성`)
 */
// Nest의 `@Get`처럼 데코레이터는 PascalCase가 관례라 함수 이름 규칙을 적용하지 않는다.
// eslint-disable-next-line @typescript-eslint/naming-convention
export function AdminChangeNotify(action: string): MethodDecorator {
  return DicoshotNotify({
    title: action,
    description: (args) => describeChange(args[0] as Request),
  });
}
