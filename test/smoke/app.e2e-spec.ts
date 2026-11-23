import type { Server } from 'node:http';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { KAFKA_CLIENT } from '../../src/kafka/kafka.constants.js';

// 스모크는 앱이 뜨는지만 본다. Kafka 연동은 integration·단위 테스트와 비동기 e2e가 확인한다.
const noopKafka = {
  producer: () => ({
    connect: async () => undefined,
    disconnect: async () => undefined,
    send: async () => [],
    sendBatch: async () => [],
  }),
  consumer: () => ({
    connect: async () => undefined,
    disconnect: async () => undefined,
    subscribe: async () => undefined,
    run: async () => undefined,
  }),
};

describe('AppController (e2e smoke)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KAFKA_CLIENT)
      .useValue(noopKafka)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () =>
    request(app.getHttpServer()).get('/').expect(200).expect('Hello World!'));

  afterEach(async () => {
    await app?.close();
  });
});
