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

  it('조회 요청을 쿼리 DTO 그대로 서비스에 넘긴다', async () => {
    const query = {
      expoId: '11111111-1111-1111-1111-111111111111',
      participationType: ParticipationType.TRAINEE,
      applicationType: ApplicationType.PRE,
    };

    await controller.findOne(query);

    expect(formService.findOne).toHaveBeenCalledWith(query);
  });

  it('수정 요청에 경로의 formId와 바디를 함께 넘긴다', async () => {
    const dto = { title: '수정된 폼' } as never;

    await controller.update('form-1', dto);

    expect(formService.update).toHaveBeenCalledWith('form-1', dto);
  });
});
