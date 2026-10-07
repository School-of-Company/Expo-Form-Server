import type { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import type { JsonData, OtherJson } from '../json/field-spec.schema.js';
import type { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';

/**
 * 제출 당시의 문항 하나. 설문을 수정하면 문항이 다시 만들어져 ID가 바뀌므로, 수정 전에 저장된 답변은
 * ID만으로는 문항 제목을 복원할 수 없다. 그래서 답변을 접수할 때 검증에 쓴 문항 정의를 함께 남긴다.
 */
export type QuestionSnapshot = {
  id: number;
  title: string;
  /** 설문 안에서의 위치(0부터). 설문 조회 응답 `dynamicSurveyResponseDto[]`의 순서와 같다. */
  order: number;
  formType: DynamicFormFieldType;
  /** 드롭다운·복수선택 답변은 이 선택지의 키로 저장되므로, 보기 문구를 복원하려면 필요하다. */
  jsonData: JsonData;
  /** 기타 입력 허용·최대 선택 개수·조건부 표시 같은 문항의 부가 설정. 없으면 null. */
  otherJson: OtherJson | null;
};

/** 접수 시점의 설문 문항들을 스냅샷으로 바꾼다. 문항은 ID 오름차순(작성 순서)으로 들어온다고 본다. */
export function toQuestionSnapshots(
  questions: ReadonlyArray<
    Pick<
      DynamicSurveyEntity,
      'id' | 'title' | 'formType' | 'jsonData' | 'otherJson'
    >
  >,
): QuestionSnapshot[] {
  return questions.map((question, order) => ({
    id: question.id,
    title: question.title,
    order,
    formType: question.formType,
    jsonData: question.jsonData,
    otherJson: question.otherJson,
  }));
}
