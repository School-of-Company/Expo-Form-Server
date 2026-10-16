# 공개 설문 추첨 (#148)

- 공개 제출 응답은 `{ won: boolean }`이다. 추첨 순번은 서버 내부 당첨 기록과 관리자 API에만 남긴다.
- 중복 응답은 계속 저장한다. 추첨이 켜져 있으면 모든 응답이 순번을 소비한다. 이미 당첨된 정규화 전화번호가 당첨 순번에 다시 제출해도 `won: false`이며 그 순번은 재배정하지 않는다.
- 같은 설문 행의 `FOR NO KEY UPDATE` 락 안에서 이전 당첨을 확인하고 기록하므로 동시 제출도 한 번만 당첨된다. 번호 없는 응답은 기존처럼 추첨한다.
- `SurveyPublicAnswerStore.create()`의 운영 호출자는 공개 제출 서비스 하나다. 당첨 아웃박스와 관리자 조회의 `drawNumber`는 유지한다.

## Client 연동

Expo-Client `develop`의 `PublicSurveyContainer`는 `won`으로 당첨 화면을 열고 `drawNumber`를 문구에 표시한다. 응답 타입과 문구를 함께 바꿔야 한다. 동반 패치는 `148-expo-client.patch`이며 Expo-Client에서 `git apply --check` 후 적용한다. 서버보다 먼저 반영해도 기존 서버 응답과 호환된다.

## 남은 정책 판단

현재 개인정보 정책은 박람회 종료 후 보관 기간이 지나면 당첨 전화번호를 삭제한다. 삭제한 번호의 과거 당첨 여부는 복원할 수 없으므로 이 변경의 중복 당첨 방지는 번호가 보관된 기간에 적용된다. 번호 삭제 이후까지 보장하려면 추첨 영구 종료 또는 별도 식별값 보관 정책을 결정해야 한다. 이번 수정에서는 개인정보 보관 정책과 공개 설문 접수 기간을 바꾸지 않는다.

## 재현 테스트

`DATABASE_URL=postgres://... pnpm test:integration src/survey/survey-public.integration-spec.ts --maxWorkers=1`

실제 PostgreSQL 임시 DB와 공개 HTTP 경로로 정규화 번호 동시 제출, 기존 당첨 번호 재제출, 순번 소비, 미당첨 번호 재시도, 다른 설문, 번호 없는 제출, 추첨 비활성 상태를 검증한다.
