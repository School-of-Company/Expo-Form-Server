import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { QueryFailedError } from 'typeorm';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  FormAlreadyExistsException,
  FormNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { CreateFormRequestDto } from './dto/create-form.request.dto.js';
import { ApplicationType } from './entities/application-type.enum.js';
import { DynamicFormType } from './entities/dynamic-form-type.enum.js';
import { FormEntity } from './entities/form.entity.js';
import { FormService } from './form.service.js';
import { FormStore } from './form.store.js';

const expoId = '11111111-1111-1111-1111-111111111111';

const createDto = {
  title: '사전 등록 폼',
  informationText: '안내문',
  participantType: ParticipationType.TRAINEE,
  applicationType: ApplicationType.PRE,
  startDate: new Date('2026-01-01T00:00:00Z'),
  endDate: new Date('2026-01-31T00:00:00Z'),
  dynamicForm: [
    {
      title: '참여 형태',
      formType: DynamicFormFieldType.DROPDOWN,
      requiredStatus: true,
      jsonData: { '1': '온라인', '2': '오프라인' },
      otherJson: null,
      dynamicFormType: DynamicFormType.DEFAULT,
    },
  ],
} satisfies CreateFormRequestDto;

const existingForm = {
  id: 'form-1',
  expoId,
  dynamicForms: [],
} as unknown as FormEntity;

describe('FormService', () => {
  let formStore: {
    findByExpoAndTypes: Mock;
    existsByExpoAndTypes: Mock;
    save: Mock;
    updateWithFields: Mock;
    deleteById: Mock;
    findSummariesByExpoIds: Mock;
  };
  let service: FormService;

  beforeEach(() => {
    formStore = {
      findByExpoAndTypes: vi.fn(),
      existsByExpoAndTypes: vi.fn(),
      save: vi.fn(),
      updateWithFields: vi.fn(),
      deleteById: vi.fn(),
      findSummariesByExpoIds: vi.fn(),
    };
    service = new FormService(formStore as unknown as FormStore);
  });

  describe('create', () => {
    it('같은 조합의 폼이 이미 있으면 거부한다', async () => {
      formStore.existsByExpoAndTypes.mockResolvedValue(true);

      await expect(service.create(expoId, createDto)).rejects.toThrow(
        FormAlreadyExistsException,
      );
      expect(formStore.save).not.toHaveBeenCalled();
    });

    it('중복이 없으면 필드까지 함께 저장한다', async () => {
      formStore.existsByExpoAndTypes.mockResolvedValue(false);
      formStore.save.mockResolvedValue({ id: 'form-1' });

      await service.create(expoId, createDto);

      const saved = formStore.save.mock.calls[0][0] as FormEntity;
      expect(saved.expoId).toBe(expoId);
      expect(saved.dynamicForms).toHaveLength(1);
      expect(saved.dynamicForms[0].jsonData).toEqual({
        '1': '온라인',
        '2': '오프라인',
      });
    });

    it('생성된 폼의 id를 돌려준다', async () => {
      formStore.existsByExpoAndTypes.mockResolvedValue(false);
      formStore.save.mockResolvedValue({ id: 'form-1' });

      await expect(service.create(expoId, createDto)).resolves.toEqual({
        id: 'form-1',
      });
    });

    it('중복 검사 통과 후 동시 요청과 경합해 유니크 제약에 걸리면 409로 변환한다', async () => {
      formStore.existsByExpoAndTypes.mockResolvedValue(false);
      formStore.save.mockRejectedValue(
        new QueryFailedError('INSERT ...', undefined, {
          name: 'error',
          message: 'duplicate key value violates unique constraint',
          code: '23505',
        } as Error),
      );

      await expect(service.create(expoId, createDto)).rejects.toThrow(
        FormAlreadyExistsException,
      );
    });

    it('유니크 제약 위반이 아닌 저장 에러는 그대로 전파한다', async () => {
      formStore.existsByExpoAndTypes.mockResolvedValue(false);
      formStore.save.mockRejectedValue(new Error('connection lost'));

      await expect(service.create(expoId, createDto)).rejects.toThrow(
        'connection lost',
      );
    });
  });

  describe('update', () => {
    it('폼이 없으면 예외를 던진다', async () => {
      formStore.findByExpoAndTypes.mockResolvedValue(null);

      await expect(service.update(expoId, createDto)).rejects.toThrow(
        FormNotFoundException,
      );
      expect(formStore.updateWithFields).not.toHaveBeenCalled();
    });

    it('기존 필드를 새 필드로 통째로 교체한다', async () => {
      formStore.findByExpoAndTypes.mockResolvedValue(existingForm);

      await service.update(expoId, createDto);

      const [, fields] = formStore.updateWithFields.mock.calls[0] as [
        unknown,
        Array<{ title: string }>,
      ];
      expect(fields).toHaveLength(1);
      expect(fields[0].title).toBe('참여 형태');
    });
  });

  describe('delete', () => {
    it('폼이 없으면 예외를 던진다', async () => {
      formStore.findByExpoAndTypes.mockResolvedValue(null);

      await expect(
        service.delete(expoId, ParticipationType.TRAINEE, ApplicationType.PRE),
      ).rejects.toThrow(FormNotFoundException);
      expect(formStore.deleteById).not.toHaveBeenCalled();
    });

    it('찾은 폼의 id로 삭제한다', async () => {
      formStore.findByExpoAndTypes.mockResolvedValue(existingForm);

      await service.delete(
        expoId,
        ParticipationType.TRAINEE,
        ApplicationType.PRE,
      );

      expect(formStore.deleteById).toHaveBeenCalledWith(existingForm.id);
    });
  });

  describe('findOne', () => {
    it('폼이 없으면 예외를 던진다', async () => {
      formStore.findByExpoAndTypes.mockResolvedValue(null);

      await expect(
        service.findOne(expoId, {
          type: createDto.participantType,
          applicationType: createDto.applicationType,
        }),
      ).rejects.toThrow(FormNotFoundException);
    });

    it('필드 스펙을 그대로 담아서 응답으로 변환한다', async () => {
      formStore.findByExpoAndTypes.mockResolvedValue({
        ...createDto,
        id: 'form-1',
        expoId,
        participationType: createDto.participantType,
        dynamicForms: [{ ...createDto.dynamicForm[0], id: 1 }],
      });

      const result = await service.findOne(expoId, {
        type: createDto.participantType,
        applicationType: createDto.applicationType,
      });

      expect(result.id).toBe('form-1');
      expect(result.dynamicForm[0].jsonData).toEqual({
        '1': '온라인',
        '2': '오프라인',
      });
    });
  });

  describe('summarize', () => {
    it('저장소가 준 행에서 식별 값만 골라 돌려준다', async () => {
      formStore.findSummariesByExpoIds.mockResolvedValue([
        {
          expoId,
          participationType: ParticipationType.STANDARD,
          applicationType: ApplicationType.PRE,
          title: '섞여 들어온 값',
        },
      ]);

      await expect(service.summarize([expoId])).resolves.toEqual([
        {
          expoId,
          participationType: ParticipationType.STANDARD,
          applicationType: ApplicationType.PRE,
        },
      ]);
      expect(formStore.findSummariesByExpoIds).toHaveBeenCalledWith([expoId]);
    });
  });
});
