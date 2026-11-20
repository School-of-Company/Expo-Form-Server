# 설문 기념품 수령 확인 계약 (#239)

공개 설문(현장 QR 설문) 제출자 전원에게 응답별 수령 토큰을 발급하고, 운영위원이 제출자 휴대전화에서 직원 PIN으로 수령을 완료한다.
추첨 당첨 여부와 무관하며 설문 문항·응답 엑셀은 바뀌지 않는다. 연계 Client 이슈: Expo-Client#899, #898.

## 흐름

1. `POST /surveys/answer/public/{expoId}` 성공 응답에 `giftToken`이 더해진다(`{won, giftToken}`). 실패 응답에는 없다.
2. 완료 화면이 토큰을 보관하고 안내 문구를 띄운다. 토큰은 서버에 해시만 있어 다시 받을 수 없다.
3. 직원 확인: `POST /surveys/{expoId}/gift-pickup/confirm` `{token, pin}` → 성공하면 수령 완료.
4. 새로고침·재진입: `POST /surveys/{expoId}/gift-pickup/status` `{token}`으로 상태를 복원한다. 토큰을 잃었으면 상태를 알 수 없다 — 미수령·완료를 가정하지 말고 안내한다.

## API

| 메서드 | 경로 | 요청 | 응답 |
| --- | --- | --- | --- |
| PUT | `/surveys/{expoId}/gift-pin` (관리자) | `{pin}` 숫자 4~8자리 | `{configured: true}` |
| GET | `/surveys/{expoId}/gift-pin` (관리자) | - | `{configured}` |
| POST | `/surveys/{expoId}/gift-pickup/status` | `{token}` | `{claimed, claimedAt, pinConfigured}` |
| POST | `/surveys/{expoId}/gift-pickup/confirm` | `{token, pin}` | `{claimed: true, claimedAt, pinConfigured: true}` |

- 토큰·PIN은 URL 쿼리가 아니라 바디로만 보낸다. 모든 응답은 `Cache-Control: no-store`.
- 이미 완료된 토큰의 `confirm`은 PIN과 무관하게 같은 완료 상태를 200으로 돌려준다(멱등, 시각 불변).
- 다른 박람회의 토큰은 `404 GIFT_PICKUP_TOKEN_INVALID`로 없는 토큰과 구분하지 않는다.

## 오류

| 상태 | code | 의미 |
| --- | --- | --- |
| 403 | `GIFT_PIN_INVALID` | PIN 불일치. `attemptsLeft`가 잠기기까지 남은 횟수 |
| 404 | `GIFT_PICKUP_TOKEN_INVALID` | 없는 토큰이거나 다른 박람회의 토큰 |
| 409 | `GIFT_PIN_NOT_CONFIGURED` | 박람회에 직원 PIN이 없음 |
| 429 | `GIFT_PIN_LOCKED` | 토큰 단위 잠금. `Retry-After`(초)와 바디 `retryAfterSeconds` |

## 제한 정책

한 토큰에서 PIN을 5번 연속 틀리면 그 토큰만 300초 잠근다(잠긴 동안은 맞는 PIN도 받지 않는다). 지나면 횟수를 0부터 다시 센다.
박람회 전체를 막는 전역 잠금은 없다. 맞는 PIN으로 완료하면 횟수가 지워진다.

## 호환·데이터

- 기존 클라이언트는 응답의 `giftToken`을 무시하면 그대로 동작한다. 기존 응답에는 수령 기록·토큰을 만들지 않는다.
- 새 테이블 `survey_gift_pin`(설문별 PIN scrypt 해시), `survey_gift_claim`(응답당 1개, 토큰 SHA-256 해시, 완료 시각). 설문·응답이 지워지면 함께 지워진다.
- 응답 저장과 수령 기록 발급은 한 트랜잭션이다.
