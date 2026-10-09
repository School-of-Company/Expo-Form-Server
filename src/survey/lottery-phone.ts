/** 알림 서비스가 문자를 보낼 수 있는 번호 모양(`01`로 시작하는 10~11자리 숫자). */
const LOTTERY_PHONE_PATTERN = /^01\d{8,9}$/u;

/**
 * 경품 번호를 `01XXXXXXXXX` 숫자만의 모양으로 맞춘다. 하이픈·공백 같은 구분은 지우고, 문자를 보낼 수 있는
 * 번호가 아니면 `null`이다. 같은 번호를 한 번만 세려면 비교 전에 이렇게 맞춰야 한다.
 */
export function normalizeLotteryPhone(raw: string): string | null {
  const digits = raw.replaceAll(/\D/gu, '');
  return LOTTERY_PHONE_PATTERN.test(digits) ? digits : null;
}
