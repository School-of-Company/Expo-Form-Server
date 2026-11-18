#!/usr/bin/env python3
"""JMeter 결과(JTL, CSV) 하나를 한 줄로 요약한다: 건수, 오류율, 초당 처리량, p50/p95/p99(ms). 표준 라이브러리만 쓴다."""
import csv
import sys


def percentile(sorted_values, p):
    if not sorted_values:
        return 0
    index = min(len(sorted_values) - 1, int(round(p / 100 * (len(sorted_values) - 1))))
    return sorted_values[index]


def main(path):
    elapsed, failed, first, last = [], 0, None, None
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            elapsed.append(int(row["elapsed"]))
            if row["success"] != "true":
                failed += 1
            start = int(row["timeStamp"])
            end = start + int(row["elapsed"])
            first = start if first is None else min(first, start)
            last = end if last is None else max(last, end)
    if not elapsed:
        sys.exit(f"no samples in {path}")
    values = sorted(elapsed)
    seconds = max((last - first) / 1000, 0.001)
    print(
        f"count={len(values)} err={failed / len(values) * 100:.2f} rps={len(values) / seconds:.1f} "
        f"p50={percentile(values, 50)} p95={percentile(values, 95)} p99={percentile(values, 99)}"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: summarize.py <result.jtl>")
    main(sys.argv[1])
