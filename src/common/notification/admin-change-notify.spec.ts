import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DICOSHOT_NOTIFY_METADATA } from 'dicoshot-nest/dist/dicoshot.constants.js';
import { AdminChangeNotify } from './admin-change-notify.js';

class Sample {
  @AdminChangeNotify('폼 생성')
  handler() {
    return undefined;
  }
}

type Resolver = (args: unknown[], result: unknown) => string;

function resolve(request: Partial<Request>) {
  const options = new Reflector().get<{ title: string; description: Resolver }>(
    DICOSHOT_NOTIFY_METADATA,
    Sample.prototype.handler,
  );

  return {
    title: options.title,
    description: options.description([request], undefined),
  };
}

describe('AdminChangeNotify', () => {
  it('제목은 행위이고, 요청자와 대상 식별자를 알린다', () => {
    const { title, description } = resolve({
      headers: { 'x-user-id': '42' },
      params: { expoId: 'expo-1', formId: 'form-1', ignored: 'x' },
    });

    expect(title).toBe('폼 생성');
    expect(description).toBe('요청자: 42\n대상: expoId=expo-1, formId=form-1');
  });

  it('요청자 헤더가 없으면 알 수 없음으로 쓴다', () => {
    expect(resolve({ headers: {}, params: {} }).description).toBe(
      '요청자: 알 수 없음\n대상: -',
    );
  });

  it('식별자 모양이 아닌 헤더(멘션·마크다운)는 알림에 싣지 않는다', () => {
    const { description } = resolve({
      headers: { 'x-user-id': '@everyone hi' },
      params: {},
    });

    expect(description).not.toContain('everyone');
    expect(description).toContain('알 수 없음');
  });
});
