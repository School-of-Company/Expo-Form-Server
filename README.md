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
