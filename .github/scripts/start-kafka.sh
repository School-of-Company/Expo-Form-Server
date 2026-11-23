#!/usr/bin/env bash
# 단일 노드 Kafka를 띄우고 브로커가 요청을 받을 때까지 기다린다(최대 60초).
set -euo pipefail

docker run -d --name kafka -p 9092:9092 apache/kafka:3.9.1 >/dev/null
for _ in $(seq 1 30); do
  if docker exec kafka /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 >/dev/null 2>&1; then
    exit 0
  fi
  sleep 2
done

docker logs kafka
exit 1
