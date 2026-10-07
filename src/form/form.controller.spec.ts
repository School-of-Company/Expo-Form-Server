import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { ApplicationType } from './entities/application-type.enum.js';
import { FormController } from './form.controller.js';
import { FormService } from './form.service.js';

describe('FormController', () => {
  let formService: { create: Mock; findOne: Mock; update: Mock; delete: Mock };
  let controller: FormController;

  beforeEach(() => {
    formService = {
      create: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    controller = new FormController(formService as unknown as FormService);
  });

  it('조회 요청에 경로의 expoId와 쿼리 DTO를 함께 넘긴다', async () => {
    const query = {
      type: ParticipationType.TRAINEE,
      applicationType: ApplicationType.PRE,
    };

    await controller.findOne('expo-1', query);

    expect(formService.findOne).toHaveBeenCalledWith('expo-1', query);
  });

  it('수정 요청에 경로의 expoId와 바디를 함께 넘긴다', async () => {
    const dto = { title: '수정된 폼' } as never;

    await controller.update('expo-1', dto);

    expect(formService.update).toHaveBeenCalledWith('expo-1', dto);
  });

  it('삭제 요청에 경로의 expoId·participationType·applicationType을 함께 넘긴다', async () => {
    await controller.delete(
      'expo-1',
      ParticipationType.STANDARD,
      ApplicationType.PRE,
    );

    expect(formService.delete).toHaveBeenCalledWith(
      'expo-1',
      ParticipationType.STANDARD,
      ApplicationType.PRE,
    );
  });
});
