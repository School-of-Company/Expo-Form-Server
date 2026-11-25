import { describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import {
  matchExistingIds,
  type DynamicFormField,
  type NewDynamicFormField,
} from './dynamic-form-field.js';
import { DynamicFormType } from './entities/dynamic-form-type.enum.js';

const field = (
  title: string,
  formType = DynamicFormFieldType.SENTENCE,
): NewDynamicFormField => ({
  title,
  formType,
  requiredStatus: true,
  jsonData: {},
  otherJson: null,
  dynamicFormType: DynamicFormType.DEFAULT,
});

const current: DynamicFormField[] = [
  { ...field('이름'), id: 10 },
  { ...field('학교급', DynamicFormFieldType.DROPDOWN), id: 11 },
  { ...field('학년', DynamicFormFieldType.DROPDOWN), id: 12 },
];

describe('matchExistingIds', () => {
  it('순서를 바꾸고 필드를 더해도 제목·종류가 같은 기존 필드의 id를 유지한다', () => {
    expect(
      matchExistingIds(
        [
          field('학년', DynamicFormFieldType.DROPDOWN),
          field('이름'),
          field('학교급', DynamicFormFieldType.DROPDOWN),
          field('소속'),
        ],
        current,
      ),
    ).toEqual([12, 10, 11, undefined]);
  });

  it('지운 필드 자리에 같은 종류의 다른 필드를 넣으면 옛 id를 이어받지 않는다', () => {
    expect(
      matchExistingIds(
        [
          field('이름'),
          field('관심분야', DynamicFormFieldType.DROPDOWN),
          field('학년', DynamicFormFieldType.DROPDOWN),
        ],
        current,
      ),
    ).toEqual([10, undefined, 12]);
  });

  it('제목을 고친 필드는 새 id를 받는다', () => {
    expect(
      matchExistingIds(
        [field('이름'), field('학교 급', DynamicFormFieldType.DROPDOWN)],
        current,
      ),
    ).toEqual([10, undefined]);
  });

  it('제목·입력 종류가 같아도 의미 종류가 다르면 새 id를 받는다', () => {
    expect(
      matchExistingIds(
        [{ ...field('이름'), dynamicFormType: DynamicFormType.NAME }],
        current,
      ),
    ).toEqual([undefined]);
  });

  it('종류가 다르면 새 id를 받고, 기존 id는 한 번만 쓴다', () => {
    expect(
      matchExistingIds(
        [
          field('이름'),
          field('이름'),
          field('학년', DynamicFormFieldType.CHECKBOX),
        ],
        current,
      ),
    ).toEqual([10, undefined, undefined]);
  });
});
