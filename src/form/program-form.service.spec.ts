import { QueryFailedError } from 'typeorm';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  ExpoNotFoundException,
  FormNotFoundException,
  FormVersionConflictException,
  ProgramFormTitleDuplicatedException,
} from '../common/exceptions/domain.exception.js';
import {
  CreateProgramFormRequestDto,
  UpdateProgramFormRequestDto,
} from './dto/program-form.request.dto.js';
import { DynamicFormType } from './entities/dynamic-form-type.enum.js';
import { FormPurpose } from './entities/form-purpose.enum.js';
import { FormEntity } from './entities/form.entity.js';
import { FormService } from './form.service.js';
import { FormStore } from './form.store.js';

const expoId = '11111111-1111-1111-1111-111111111111';
const formId = '22222222-2222-2222-2222-222222222222';

const createDto = {
  title: 'AI 체험 프로그램',
  informationText: '안내문',
  participantType: ParticipationType.STANDARD,
  startDate: new Date('2026-01-01T00:00:00Z'),
  endDate: new Date('2026-01-31T00:00:00Z'),
  dynamicForm: [
    {
      title: '희망 시간대',
      formType: DynamicFormFieldType.SENTENCE,
      requiredStatus: true,
      jsonData: {},
      otherJson: null,
      dynamicFormType: DynamicFormType.DEFAULT,
    },
  ],
} satisfies CreateProgramFormRequestDto;

const updateDto = {
  ...createDto,
  title: '수정한 제목',
  expectedVersion: 3,
} satisfies UpdateProgramFormRequestDto;

const existingForm = () =>
  ({
    id: formId,
    expoId,
    version: 3,
    purpose: FormPurpose.PROGRAM,
    title: 'AI 체험 프로그램',
    informationText: '안내문',
    participationType: ParticipationType.STANDARD,
    applicationType: null,
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: new Date('2026-01-31T00:00:00Z'),
    dynamicForms: [
      {
        id: 7,
        title: '희망 시간대',
        formType: DynamicFormFieldType.SENTENCE,
        requiredStatus: true,
        jsonData: {},
        otherJson: null,
        dynamicFormType: DynamicFormType.DEFAULT,
      },
    ],
  }) as unknown as FormEntity;

const uniqueViolation = () =>
  new QueryFailedError('INSERT ...', undefined, {
    name: 'error',
    message: 'duplicate key value violates unique constraint',
    code: '23505',
  } as Error);

describe('FormService 프로그램용 폼', () => {
  let formStore: {
    save: Mock;
    findProgramById: Mock;
    updateProgramWithFields: Mock;
    deleteProgramById: Mock;
  };
  let expoClient: { exists: Mock };
  let service: FormService;

  beforeEach(() => {
    formStore = {
      save: vi.fn(),
      findProgramById: vi.fn(),
      updateProgramWithFields: vi.fn(),
      deleteProgramById: vi.fn(),
    };
    expoClient = { exists: vi.fn().mockResolvedValue(true) };
    service = new FormService(formStore as unknown as FormStore, expoClient);
  });

  describe('createProgram', () => {
    it('박람회가 없으면 거부하고 저장하지 않는다', async () => {
      expoClient.exists.mockResolvedValue(false);

      await expect(service.createProgram(expoId, createDto)).rejects.toThrow(
        ExpoNotFoundException,
      );
      expect(formStore.save).not.toHaveBeenCalled();
    });

    it('프로그램용으로, 신청 방식 없이 필드와 함께 저장하고 id와 version을 돌려준다', async () => {
      formStore.save.mockImplementation(async (form: FormEntity) =>
        Object.assign(form, { id: formId, version: 1 }),
      );

      await expect(service.createProgram(expoId, createDto)).resolves.toEqual({
        id: formId,
        version: 1,
      });

      const [saved] = formStore.save.mock.calls[0] as [FormEntity];
      expect(saved.purpose).toBe(FormPurpose.PROGRAM);
      expect(saved.applicationType).toBeNull();
      expect(saved.participationType).toBe(ParticipationType.STANDARD);
      expect(saved.expoId).toBe(expoId);
      expect(saved.dynamicForms).toHaveLength(1);
    });

    it('같은 박람회에 같은 제목이 있어 유니크 제약에 걸리면 409로 변환한다', async () => {
      formStore.save.mockRejectedValue(uniqueViolation());

      await expect(service.createProgram(expoId, createDto)).rejects.toThrow(
        ProgramFormTitleDuplicatedException,
      );
    });

    it('유니크 제약 위반이 아닌 저장 에러는 그대로 전파한다', async () => {
      formStore.save.mockRejectedValue(new Error('connection lost'));

      await expect(service.createProgram(expoId, createDto)).rejects.toThrow(
        'connection lost',
      );
    });
  });

  describe('findProgram', () => {
    it('없으면 예외를 던진다(등록용 폼의 id도 없는 것으로 본다)', async () => {
      formStore.findProgramById.mockResolvedValue(null);

      await expect(service.findProgram(formId)).rejects.toThrow(
        FormNotFoundException,
      );
    });

    it('version을 담고 신청 방식 없이 응답으로 변환한다', async () => {
      formStore.findProgramById.mockResolvedValue(existingForm());

      const response = await service.findProgram(formId);

      expect(response).toMatchObject({
        id: formId,
        expoId,
        version: 3,
        participantType: ParticipationType.STANDARD,
      });
      expect(response).not.toHaveProperty('applicationType');
      expect(response.dynamicForm).toEqual([
        {
          id: 7,
          title: '희망 시간대',
          formType: DynamicFormFieldType.SENTENCE,
          requiredStatus: true,
          jsonData: {},
          otherJson: null,
          dynamicFormType: DynamicFormType.DEFAULT,
        },
      ]);
    });
  });

  describe('updateProgram', () => {
    it('폼이 없으면 예외를 던진다', async () => {
      formStore.findProgramById.mockResolvedValue(null);

      await expect(service.updateProgram(formId, updateDto)).rejects.toThrow(
        FormNotFoundException,
      );
      expect(formStore.updateProgramWithFields).not.toHaveBeenCalled();
    });

    it('expectedVersion과 새 필드를 저장소에 넘기고 새 version을 돌려준다', async () => {
      formStore.findProgramById.mockResolvedValue(existingForm());
      formStore.updateProgramWithFields.mockResolvedValue({
        status: 'UPDATED',
        version: 4,
      });

      await expect(service.updateProgram(formId, updateDto)).resolves.toEqual({
        id: formId,
        version: 4,
      });

      const [form, expectedVersion, fields] = formStore.updateProgramWithFields
        .mock.calls[0] as [FormEntity, number, unknown[]];
      expect(form.title).toBe('수정한 제목');
      expect(expectedVersion).toBe(3);
      expect(fields).toHaveLength(1);
    });

    it('버전이 다르면 409로 거절한다', async () => {
      formStore.findProgramById.mockResolvedValue(existingForm());
      formStore.updateProgramWithFields.mockResolvedValue({
        status: 'CONFLICT',
      });

      await expect(service.updateProgram(formId, updateDto)).rejects.toThrow(
        FormVersionConflictException,
      );
    });

    it('수정하는 사이 폼이 삭제됐으면 404로 거절한다', async () => {
      formStore.findProgramById.mockResolvedValue(existingForm());
      formStore.updateProgramWithFields.mockResolvedValue({
        status: 'NOT_FOUND',
      });

      await expect(service.updateProgram(formId, updateDto)).rejects.toThrow(
        FormNotFoundException,
      );
    });

    it('바꾼 제목이 다른 프로그램용 폼과 겹치면 409로 변환한다', async () => {
      formStore.findProgramById.mockResolvedValue(existingForm());
      formStore.updateProgramWithFields.mockRejectedValue(uniqueViolation());

      await expect(service.updateProgram(formId, updateDto)).rejects.toThrow(
        ProgramFormTitleDuplicatedException,
      );
    });
  });

  describe('deleteProgram', () => {
    it('없으면 예외를 던진다', async () => {
      formStore.deleteProgramById.mockResolvedValue(false);

      await expect(service.deleteProgram(formId)).rejects.toThrow(
        FormNotFoundException,
      );
    });

    it('지웠으면 아무것도 돌려주지 않는다', async () => {
      formStore.deleteProgramById.mockResolvedValue(true);

      await expect(service.deleteProgram(formId)).resolves.toBeUndefined();
      expect(formStore.deleteProgramById).toHaveBeenCalledWith(formId);
    });
  });
});
