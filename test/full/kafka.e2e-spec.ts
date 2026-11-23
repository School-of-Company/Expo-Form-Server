import type { Server } from 'node:http';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';

// 실제 Kafka에 붙여 앱을 띄운다. 부팅 중 프로듀서 접속과 컨슈머 구독이 끝나야 init이 끝나므로,
// 이 테스트가 통과하면 Kafka 설정·접속·토픽 구독이 모두 동작한다는 뜻이다.
describe('AppModule + Kafka (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('Kafka에 접속한 채로 요청을 처리한다', () =>
    request(app.getHttpServer()).get('/').expect(200));

  afterAll(async () => {
    await app?.close();
  });
});
