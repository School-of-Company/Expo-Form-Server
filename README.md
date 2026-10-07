<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# integration tests
$ pnpm run test:integration

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Lint

[XO](https://github.com/xojs/xo)(ESLint 기반, 타입 정보 사용)로 JS/TS 코드를 검사한다. 포매팅은 Prettier가 맡고 XO는 코드 품질 규칙을 본다(`prettier: 'compat'`).

```bash
# 검사 (CI의 `lint` 잡과 같다)
$ pnpm run lint

# 자동 수정 가능한 것만 고친다
$ pnpm run lint:fix

# 포매팅
$ pnpm run format
```

- `develop`으로 가는 PR은 CI의 `lint` 잡이 통과해야 머지할 수 있다(브랜치 보호의 필수 체크).
- 규칙은 `xo.config.ts`에서 끈 것만 예외다. 끄는 경우는 NestJS 런타임과 충돌하거나, API 계약·DB 스키마를 바꿔야 하거나, 프로젝트 컨벤션과 충돌할 때뿐이고 이유를 설정 파일에 같이 적는다. 코드 한 줄만 예외로 둘 때는 `// eslint-disable-next-line <rule>`에 이유를 남긴다.
- 검사 대상은 JS/TS 코드다. TypeORM이 생성하는 `src/database/migrations`와 `.claude`, `.agents`는 제외한다.

## Database migrations

개발에서는 엔티티를 보고 스키마를 자동으로 맞추지만(`synchronize`), **운영에서는 끄고** `src/database/migrations`의 마이그레이션으로만 바꾼다. 컬럼 이름을 바꾸면 TypeORM이 "삭제 후 추가"로 처리해서 운영 데이터가 사라질 수 있기 때문이다.

```bash
# 운영/클린 DB에 마이그레이션 적용 (배포 단계에서 한 번)
$ pnpm migration:run

# 적용 상태 확인 / 마지막 마이그레이션 되돌리기
$ pnpm migration:show
$ pnpm migration:revert

# 엔티티를 바꾼 뒤 마이그레이션 생성
$ pnpm migration:generate src/database/migrations/<이름>
```

- 명령은 `DATABASE_URL`(없으면 `.env`)의 DB를 대상으로 하고, 실행 전에 `dist`를 비우고 다시 빌드한다. 컴파일된 엔티티를 읽기 때문에 오래된 빌드 결과가 남아 있으면 없는 엔티티까지 스키마에 들어간다.
- `migration:generate`는 **대상 DB의 현재 스키마와 엔티티의 차이**를 만든다. `synchronize`로 자동 갱신되는 개발 DB로는 차이가 없으니, `pnpm migration:run`으로만 만든 DB를 대상으로 해야 한다.
- 생성된 파일은 반드시 읽어 본다. 컬럼 이름 변경은 삭제와 추가로 만들어지므로 `RENAME COLUMN`으로 직접 고친다.
- 앱 시작 시 자동 실행(`migrationsRun`)은 하지 않는다. 인스턴스가 여러 개 뜰 때 서로 부딪히지 않도록 배포 단계에서 한 번만 실행한다.

## Survey answer submission recovery

사전 신청자의 설문 답변은 접수 기록(`survey_answer_submission`)으로 남은 뒤 Kafka로 유저 서비스에 전달된다.

- **릴레이(30초마다)**: `RECEIVED`를 발행하고, 결과를 받지 못한 `PUBLISHED`는 `SURVEY_ANSWER_STALE_MS`(기본 5분)가 지나면 같은 `eventId`로 다시 보낸다. 최대 `SURVEY_ANSWER_MAX_RETRY_COUNT`(기본 5회)까지만 보낸다.
- **이벤트 버전**: `SURVEY_ANSWER_EVENT_VERSION`(기본 1)이 발행하는 이벤트의 `version`이다. 2는 제출 당시의 문항 스냅샷(`questions: [{id, title, order, formType, jsonData, otherJson}]`)을 함께 싣는다. 접수할 때 스냅샷은 항상 접수 기록에 저장되고, 설문을 수정해도 바뀌지 않는다. 유저 서비스 컨슈머가 v2를 받도록 배포된 뒤에 2로 올리고, 2여도 스냅샷이 없는 옛 접수 건은 v1로 재발행한다.
- **정합성 점검(매시간)**: 재발행 상한을 다 썼고 마지막 발행 후 `SURVEY_ANSWER_STALE_MS`가 지난 `PUBLISHED` 기록마다 유저 서비스에 처리 결과를 묻는다(한 번에 최대 1000건). 결과가 있으면(결과 이벤트만 유실된 경우) `STORED`/`REJECTED`로 반영하고, 처리한 적 없으면 상태를 그대로 두고 Discord로 알린다. 유저 서비스가 응답하지 않으면 그 자리에서 점검을 멈추고 알린다.
  - `SURVEY_ANSWER_RECONCILE_ENABLED=true`일 때만 돈다(기본 꺼짐). 유저 서비스의 처리 결과 조회 API(Expo-User-Server#11)가 배포된 뒤에 켠다.
  - 상한이나 장애로 멈추면 다음 점검은 마지막으로 확인한 기록 다음부터 이어 본다. 이 위치는 인스턴스 메모리에만 있어서, 재시작하면 처음부터 다시 본다.
  - 알릴 결과는 Discord와 별개로 항상 오류 로그에 남긴다. `DISCORD_WEBHOOK_URL`이 비어 있으면 로그에 "웹훅 미설정"이 함께 찍히고, Discord 전송이 실패해도 오류 로그를 남긴다.

알림의 "유저 서비스 미처리" 건을 다시 보내려면, 유저 서비스가 정상인지 먼저 확인한 뒤 해당 기록을 처음 상태로 되돌린다. 릴레이가 다음 주기에 같은 `eventId`로 발행하므로, 유저 서비스는 이미 처리한 건이면 중복 저장하지 않는다.

```sql
UPDATE survey_answer_submission
SET status = 'RECEIVED', retry_count = 0
WHERE event_id = '<알림의 eventId>' AND status = 'PUBLISHED';
```

"확인 불가"는 유저 서비스가 응답하지 않은 경우라, 장애가 풀리면 다음 점검에서 다시 판단한다. 되돌릴 필요가 없다.

## Internal API

다른 서비스가 Gateway를 거치지 않고 부르는 `/internal` 경로다. `X-Internal-Token` 헤더가 `INTERNAL_TOKEN`(필수, 32자 이상)과 같아야 하고, 아니면 401이다. Gateway 라우팅 표에 `/internal` prefix를 넣지 않는다.

| 메서드·경로                                                                                    | 쓰는 곳                                         |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `GET /internal/forms/{expoId}?type=&applicationType=`                                          | 신청 서비스 — 제출된 신청서를 폼 스펙으로 검증  |
| `GET /internal/surveys/{expoId}?type=`                                                         | 리포트 서비스 등 — 설문 문항 스펙               |
| `POST /internal/forms/summaries`, `POST /internal/surveys/summaries` (`{expoIds}`, 최대 100개) | 박람회 서비스 — 박람회별 폼·설문 생성 현황      |
| `DELETE /internal/expos/{expoId}`                                                              | 박람회 서비스 — 박람회 삭제 시 폼·설문·접수 기록을 한 번에 지우고 삭제 기록을 남김(없어도 204) |

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

앱 시작/종료와 처리되지 않은 예외를 [`dicoshot-nest`](https://www.npmjs.com/package/dicoshot-nest)로 Discord 채널에 알립니다. `.env`에 `DISCORD_WEBHOOK_URL`을 설정하면 활성화되고, 비워두면 자동으로 비활성화됩니다.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
