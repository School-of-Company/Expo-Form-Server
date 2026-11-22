import type { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import type { JsonData, OtherJson } from '../json/field-spec.schema.js';
import type { DynamicFormType } from './entities/dynamic-form-type.enum.js';

/**
 * {@link FormEntity}의 입력 필드 하나. 폼 행의 `fields`(jsonb 배열)에 이 모양 그대로 들어가고, 배열 순서가 표시
 * 순서다(조건부 표시 `otherJson.conditional.parentIndex`가 이 위치를 가리킨다).
 *
 * `id`는 답변의 키이고 신청·박람회·리포트 서비스가 저장해 두는 문항 id다(박람회의 보호자 동반 정책 등). 한 번
 * 매긴 값은 바꾸지도 다시 쓰지도 않는다. 새 필드의 id는 `dynamic_form_id_seq`에서 받는다({@link FormStore}).
 * 배열 안에서 양의 정수이고 겹치지 않는다는 것은 DB의 CHECK 제약(`dynamic_fields_valid`)이 지킨다.
 */
export interface DynamicFormField {
  id: number;
  title: string;
  /** 입력 위젯 종류 (문장형/체크박스/드롭다운/이미지/다중선택 등). */
  formType: DynamicFormFieldType;
  /** 신청자가 값을 채우지 않으면 제출을 막을지 여부. */
  requiredStatus: boolean;
  /** 드롭다운·체크박스 등의 선택지 목록. */
  jsonData: JsonData;
  /** 기타 입력 허용·최대 선택 개수·조건부 표시 같은 부가 설정. 없으면 null(키는 늘 있다). */
  otherJson: OtherJson | null;
  /**
   * 다른 서비스가 소비하는 고정 의미를 가진 필드인지 표시.
   * NAME/PHONE_NUMBER/TRAINING_ID는 신청 처리 로직이 값을 직접 참조하는 필드이고,
   * DEFAULT는 폼 작성자가 자유롭게 정의한 커스텀 필드다.
   */
  dynamicFormType: DynamicFormType;
}

/** 아직 id를 받지 않은 새 필드. 저장할 때 store가 id를 붙인다. */
export type NewDynamicFormField = Omit<DynamicFormField, 'id'>;

/**
 * 새 필드에 받은 id를 붙여 저장할 모양으로 만든다. 요청에 섞인 다른 키는 버리고, `otherJson`이 없으면 null로 둔다
 * (신청 서비스는 이 키가 없으면 502로 거절한다).
 */
export function toStoredField(
  field: NewDynamicFormField,
  id: number,
): DynamicFormField {
  return {
    id,
    title: field.title,
    formType: field.formType,
    requiredStatus: field.requiredStatus,
    jsonData: field.jsonData,
    otherJson: field.otherJson ?? null,
    dynamicFormType: field.dynamicFormType,
  };
}

/**
 * 수정 요청의 필드마다 유지할 기존 id를 찾는다(#290). 요청에 id가 없어서 내용으로 짝짓는다. 먼저 제목·종류가 같은
 * 필드를 위치와 상관없이 짝짓고(순서 변경·선택지 수정), 남은 필드는 같은 위치에서 종류가 같으면 짝짓는다(제목 수정).
 * 기존 id는 한 번만 쓴다. 짝이 없으면 `undefined`이고 새 id를 받는다.
 *
 * shortcut: 같은 위치의 필드를 지우고 같은 종류의 다른 필드를 넣으면 옛 id를 이어받는다, 요청이 id를 실어 보내게 되면 그 id로 바꾼다.
 */
export function matchExistingIds(
  fields: readonly NewDynamicFormField[],
  current: readonly DynamicFormField[],
): Array<number | undefined> {
  const used = new Set<number>();
  const claim = (found: DynamicFormField | undefined) => {
    if (found === undefined) {
      return undefined;
    }
    used.add(found.id);
    return found.id;
  };

  const ids = fields.map((field) =>
    claim(
      current.find(
        (old) =>
          !used.has(old.id) &&
          old.title === field.title &&
          old.formType === field.formType,
      ),
    ),
  );

  return ids.map((id, index) => {
    const old = current[index];
    return (
      id ??
      (old && !used.has(old.id) && old.formType === fields[index].formType
        ? claim(old)
        : undefined)
    );
  });
}
