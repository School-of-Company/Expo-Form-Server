import type { z } from 'zod';
import { DynamicFormFieldType } from '../../common/enums/dynamic-form-field-type.enum.js';
import {
  checkConditional,
  type FormLike,
} from '../../form/dto/program-form-fields.rule.js';
import type { JsonData, OtherJson } from '../../json/field-spec.schema.js';

type SurveyQuestionLike = {
  formType: DynamicFormFieldType;
  requiredStatus: boolean;
  jsonData: JsonData;
  otherJson: OtherJson | null;
};

const CHOICE_TYPES: ReadonlySet<DynamicFormFieldType> = new Set([
  DynamicFormFieldType.DROPDOWN,
  DynamicFormFieldType.MULTIPLE,
]);

/**
 * 설문 문항 정의가 답변을 받을 수 있는 모양인지 검증한다. 프로그램 폼 규칙({@link checkProgramFormFields})의
 * 일부만 가져온다 — 이미 만들어진 설문이 수정 때 거절되지 않도록, 답할 수 없는 문항을 막는 것만 적용한다.
 * 제목 중복(답변 키가 문항 id다), 이미지 문항, 선택지 없는 유형의 `jsonData`는 설문에서 계속 허용한다.
 *
 * - 필수 드롭다운·다중 선택은 선택지가 하나 이상이다
 * - 기타 입력(`hasEtc`)은 답변 스키마가 선택지 키만 받아 자유 입력을 담을 수 없으므로 쓰지 않는다
 * - 조건부 표시의 기준 필드는 자기보다 앞에 있는 선택지형 필드이고, 반응하는 값은 그 선택지 키다
 */
export function checkSurveyQuestions(
  survey: { dynamicSurveyRequestDto: SurveyQuestionLike[] },
  ctx: z.RefinementCtx,
): void {
  const issue = (message: string, index: number) => {
    ctx.addIssue({
      code: 'custom',
      message,
      path: ['dynamicSurveyRequestDto', index],
    });
  };

  const form: FormLike = {
    dynamicForm: survey.dynamicSurveyRequestDto.map((question, index) => ({
      ...question,
      title: String(index),
    })),
  };

  for (const [index, question] of survey.dynamicSurveyRequestDto.entries()) {
    if (
      question.requiredStatus &&
      CHOICE_TYPES.has(question.formType) &&
      Object.keys(question.jsonData).length === 0
    ) {
      issue('필수 선택 문항은 선택지가 하나 이상 있어야 합니다.', index);
    }

    if (question.otherJson?.hasEtc === true) {
      issue('기타 입력은 설문에서 아직 쓸 수 없습니다.', index);
    }

    checkConditional(form, form.dynamicForm[index], index, issue);
  }
}
