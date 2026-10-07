import { type FlatXoConfig } from 'xo';

/**
 * XO 설정. 포매팅은 Prettier가 맡고(`prettier: 'compat'`은 Prettier와 충돌하는 XO 규칙만 끈다),
 * 여기서는 코드 품질 규칙을 본다.
 *
 * 규칙을 끄는 건 아래 세 경우뿐이다. 새로 끌 때는 이유를 같이 적는다.
 * 1. NestJS 런타임과 충돌: 데코레이터 호출, 생성자 주입 타입 import
 * 2. API 계약·DB 스키마를 바꿔야 하는 규칙: `null`, v1에서 온 필드명
 * 3. 프로젝트가 정한 컨벤션과 충돌하는 규칙: 인터페이스 토큰 DI, 한국어 TSDoc 주석 스타일
 */
const xoConfig: FlatXoConfig = [
  {
    space: 2,
    semicolon: true,
    prettier: 'compat',
  },
  {
    ignores: [
      // TypeORM이 생성하는 파일이라 사람이 손대지 않는다.
      'src/database/migrations/**',
      'dist/**',
      // 에이전트 스킬·하네스 문서와 예제는 제품 코드가 아니다.
      '.claude/**',
      '.agents/**',
      // XO는 Markdown·JSON도 검사하지만 이 설정은 JS/TS 코드만 대상으로 한다.
      '**/*.md',
      '**/*.json',
    ],
  },
  {
    rules: {
      // `@Injectable()`, `@Column()`처럼 대문자로 시작하는 데코레이터 호출을 생성자로 오인한다.
      'new-cap': ['error', { newIsCap: true, capIsNew: false }],

      // 생성자 주입은 `emitDecoratorMetadata`가 남기는 런타임 타입 정보에 의존한다. 클래스를 `import type`으로
      // 바꾸면 Nest가 의존성을 해석하지 못한다(nestjs-arch: "DTO는 import type 하지 않는다").
      '@typescript-eslint/consistent-type-imports': 'off',

      // DB nullable 컬럼(`string | null`)과 API 응답의 JSON null을 타입으로 그대로 표현해야 한다.
      // `undefined`로 바꾸면 응답 계약과 TypeORM의 반환값이 달라진다.
      '@typescript-eslint/no-restricted-types': 'off',

      // 인터페이스 토큰 DI(`USER_CLIENT` + `interface UserClient`)가 이 프로젝트의 컨벤션이고 `implements`로 쓴다.
      '@typescript-eslint/consistent-type-definitions': 'off',

      // Zod 스키마는 `z.array(z.object({...}))`처럼 중첩 호출이 기본 모양이다.
      'unicorn/max-nested-calls': 'off',

      // 도메인 식별자(`ApplicationType`→`AppType`)와 v1 계약 필드명(`requiredStatus` 등)을 바꾸라고 한다.
      'unicorn/name-replacements': 'off',
      'unicorn/no-non-function-verb-prefix': 'off',
      'unicorn/consistent-boolean-name': 'off',

      // 공개 API를 위에, 내부 헬퍼를 아래에 두는 것이 이 프로젝트의 읽는 순서다. XO는 private 메서드를
      // public보다 앞에 두라고 한다.
      'unicorn/consistent-class-member-order': 'off',

      // `v` 플래그는 ES2024 이상 타깃에서만 컴파일된다(tsconfig 타깃은 ES2023). `u`면 같은 목적(유니코드 안전)을 만족한다.
      'require-unicode-regexp': ['error', { requireFlag: 'u' }],

      // `Promise.withResolvers()`는 ES2024 API라 tsconfig 타깃(ES2023)에서는 타입 오류가 난다.
      'unicorn/prefer-promise-with-resolvers': 'off',

      // 이 프로젝트의 TSDoc은 `/** ... */`에 ` * ` 접두사를 쓰는 표준 형태이고 주석은 한국어다.
      'jsdoc/require-asterisk-prefix': 'off',
      'jsdoc/check-indentation': 'off',
      'unicorn/single-line-block-comment-style': 'off',
      'capitalized-comments': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      // 테스트는 협력 객체를 일부 메서드만 가진 객체 리터럴로 만들어 `as`로 단언해 주입한다
      // (nestjs-arch/testing: "object-literal mocks").
      '@typescript-eslint/consistent-type-assertions': 'off',
    },
  },
];

export default xoConfig;
