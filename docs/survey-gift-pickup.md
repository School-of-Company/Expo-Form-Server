# 설문 기념품 직원확인 계약 (#239, #267로 PIN 제거)

공개 설문(현장 QR 설문) 제출자 전원에게 응답별 확인 토큰을 발급하고, 제출자 휴대전화의 **직원확인** 버튼으로 응답별 완료를 저장한다.
직원 PIN 입력·검증은 쓰지 않는다. 참가자가 직접 눌러도 처리되며, 직원의 신원을 확인하거나 직원만 누를 수 있다고 표현하지 않는다.
추첨 당첨 여부와 무관하며 설문 문항·응답 엑셀은 바뀌지 않는다. 연계 Client 이슈: Expo-Client#899, #898, #913.

## 흐름

1. `POST /surveys/answer/public/{expoId}` 성공 응답에 `giftToken`이 더해진다(`{won, giftToken}`). 실패 응답에는 없다. 중복 응답은 허용하며 응답마다 별도 토큰·확인 상태를 가진다.
2. 완료 화면이 토큰을 보관하고 안내 문구와 **직원확인** 버튼을 띄운다. 토큰은 서버에 해시만 있어 다시 받을 수 없다.
3. 직원확인 버튼: `POST /surveys/{expoId}/gift-pickup/confirm` `{token}` → 완료 저장.
4. 새로고침·재진입: `POST /surveys/{expoId}/gift-pickup/status` `{token}`으로 상태를 복원한다. 토큰을 잃었으면 상태를 알 수 없다 — 미수령·완료를 가정하지 말고 안내한다.

## API

| 메서드 | 경로 | 요청 | 응답 |
| --- | --- | --- | --- |
| POST | `/surveys/{expoId}/gift-pickup/status` | `{token}` | `{claimed, claimedAt, pinConfigured}` |
| POST | `/surveys/{expoId}/gift-pickup/confirm` | `{token}` | `{claimed: true, claimedAt, pinConfigured}` |
| PUT/GET | `/surveys/{expoId}/gift-pin` (관리자) | `{pin}` / - | `{configured}` — 새 흐름에서는 쓰지 않는다 |

- 토큰은 URL 쿼리가 아니라 바디로만 보낸다. 모든 응답은 `Cache-Control: no-store`.
- `confirm`은 요청에 `pin`이 있어도 무시한다(이전 클라이언트 호환). 새 클라이언트는 보내지 않는다.
- 이미 완료된 토큰의 `confirm`은 같은 완료 상태를 200으로 돌려주고 `claimedAt`을 다시 쓰지 않는다. 동시·반복 요청도 한 번만 저장한다.
- `pinConfigured`는 구클라이언트 호환용으로 남아 있다. 새 Client는 이 필드에 의존하지 않는다(PIN이 없어도 확인된다).

## 오류

| 상태 | code | 의미 |
| --- | --- | --- |
| 404 | `GIFT_PICKUP_TOKEN_INVALID` | 없는 토큰이거나 다른 박람회의 토큰 |

예전 PIN 방식의 `GIFT_PIN_INVALID`(403), `GIFT_PIN_NOT_CONFIGURED`(409), `GIFT_PIN_LOCKED`(429)는 더 이상 나오지 않는다.
이전에 남은 PIN 오입력 횟수·잠금 값은 확인을 막지 않는다.

## 호환·데이터

- 기존 클라이언트는 응답의 `giftToken`을 무시하면 그대로 동작한다. 기존 응답에는 수령 기록·토큰을 만들지 않고, 이미 발급된 토큰과 완료 상태는 그대로 유지한다.
- 테이블 `survey_gift_pin`(설문별 PIN 해시), `survey_gift_claim`(응답당 1개, 토큰 SHA-256 해시, 완료 시각)은 그대로 둔다. 삭제·백필 없음. 설문·응답이 지워지면 함께 지워진다.
- 응답 저장과 수령 기록 발급은 한 트랜잭션이다.
