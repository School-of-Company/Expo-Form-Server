#!/usr/bin/env bash
# 단일 노드 Kafka를 띄우고 브로커가 요청을 받을 때까지 기다린 뒤(최대 60초), 인자로 받은 토픽을 미리 만든다.
# 토픽이 없으면 컨슈머 구독이 자동 생성과 경합해 "does not host this topic-partition"으로 실패한다.
# 사용: start-kafka.sh <토픽...>
set -euo pipefail

docker run -d --name kafka -p 9092:9092 apache/kafka:3.9.1 >/dev/null
for _ in $(seq 1 30); do
  if docker exec kafka /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 >/dev/null 2>&1; then
    for topic in "$@"; do
      docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic "$topic" >/dev/null
    done
    exit 0
  fi
  sleep 2
done

docker logs kafka
exit 1
