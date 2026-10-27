/** 박람회 프로젝션을 켜는 환경 변수. 정확히 `true`일 때만 켜진다(기본 꺼짐). */
export const EXPO_PROJECTION_ENABLED_KEY = 'KAFKA_EXPO_PROJECTION_ENABLED';

/** 박람회 변경 이벤트 토픽(환경 변수 이름과 기본값). */
export const EXPO_CHANGED_TOPIC_KEY = 'KAFKA_EXPO_CHANGED_TOPIC';
export const DEFAULT_EXPO_CHANGED_TOPIC = 'expo.expo.changed';

/** 박람회 변경 이벤트 컨슈머 그룹(환경 변수 이름과 기본값). */
export const EXPO_CHANGED_GROUP_ID_KEY = 'KAFKA_EXPO_CHANGED_GROUP_ID';
export const DEFAULT_EXPO_CHANGED_GROUP_ID = 'expo-form-server.expo-changed';

/** 처리하지 못한 메시지를 보내는 토픽. 원래 토픽 이름에 `.dlt`를 붙인다. */
export function deadLetterTopicOf(topic: string): string {
  return `${topic}.dlt`;
}

/** `KAFKA_EXPO_PROJECTION_ENABLED` 값으로 프로젝션을 켤지 정한다. */
export function isExpoProjectionEnabled(value: string | undefined): boolean {
  return value === 'true';
}
