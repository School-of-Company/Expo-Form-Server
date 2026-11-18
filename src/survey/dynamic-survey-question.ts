import type { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import type { JsonData, OtherJson } from '../json/field-spec.schema.js';

/**
 * {@link SurveyEntity}의 문항 하나. 설문 행의 `questions`(jsonb 배열)에 이 모양 그대로 들어가고, 배열 순서가 표시
 * 순서다(조건부 표시 `otherJson.conditional.parentIndex`가 이 위치를 가리킨다).
 *
 * `id`는 답변의 키다. 공개 답변·로그인 설문 접수가 이 값을 키로 저장하고, 리포트 서비스는 현재 문항의 id로 저장된
 * 답변을 찾는다. 한 번 매긴 값은 바꾸지도 다시 쓰지도 않는다. 새 문항의 id는 `dynamic_survey_id_seq`에서 받는다
 * ({@link SurveyStore}). 배열 안에서 양의 정수이고 겹치지 않는다는 것은 DB의 CHECK 제약(`dynamic_fields_valid`)이 지킨다.
 */
export interface DynamicSurveyQuestion {
  id: number;
  title: string;
  /** 입력 위젯 종류 (문장형/체크박스/드롭다운/이미지/다중선택 등). */
  formType: DynamicFormFieldType;
  /** 응답자가 값을 채우지 않으면 제출을 막을지 여부. */
  requiredStatus: boolean;
  /** 드롭다운·체크박스 등의 선택지 목록. */
  jsonData: JsonData;
  /** 기타 입력 허용·최대 선택 개수·조건부 표시 같은 부가 설정. 없으면 null(키는 늘 있다). */
  otherJson: OtherJson | null;
}

/** 아직 id를 받지 않은 새 문항. 저장할 때 store가 id를 붙인다. */
export type NewDynamicSurveyQuestion = Omit<DynamicSurveyQuestion, 'id'>;

/** 새 문항에 받은 id를 붙여 저장할 모양으로 만든다. 요청에 섞인 다른 키는 버리고, `otherJson`이 없으면 null로 둔다. */
export function toStoredQuestion(
  question: NewDynamicSurveyQuestion,
  id: number,
): DynamicSurveyQuestion {
  return {
    id,
    title: question.title,
    formType: question.formType,
    requiredStatus: question.requiredStatus,
    jsonData: question.jsonData,
    otherJson: question.otherJson ?? null,
  };
}
