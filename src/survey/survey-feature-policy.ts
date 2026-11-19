import {
  SurveyFeatureDisabledException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import type {
  ExpoClient,
  ExpoFeatures,
} from '../expo-client/expo-client.interface.js';

/**
 * 새 설문 응답을 받기 전에 박람회 기능 설정을 확인한다(#302). 응답·순번을 만들기 전에 불러야 OFF·장애 거절이
 * 빈 응답이나 소모된 추첨 순번을 남기지 않는다. 돌려준 설정으로 추첨 참여 여부도 정한다.
 *
 * @throws {SurveyFeatureDisabledException} 설문 기능이 꺼져 있을 때(409)
 * @throws {SurveyNotFoundException} 박람회가 없을 때
 * @throws {ExternalServiceUnavailableException} 설정을 확인할 수 없을 때(503)
 */
export async function assertSurveyAcceptsAnswers(
  expoClient: ExpoClient,
  expoId: string,
): Promise<ExpoFeatures> {
  const features = await expoClient.findFeatures(expoId);
  if (!features) {
    throw new SurveyNotFoundException();
  }

  if (!features.survey) {
    throw new SurveyFeatureDisabledException();
  }

  return features;
}
