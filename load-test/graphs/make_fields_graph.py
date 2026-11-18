# 필드 수별 폼 조회 p95 (초당 200건, 버전마다 2회 평균). 사용법: python3 load-test/graphs/make_fields_graph.py
import csv, pathlib
HERE = pathlib.Path(__file__).parent
OUT = HERE.parent / 'out'
FONT = 'Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif'
INK, MUTED, GRID = '#222222', '#8a8a90', '#e6e6ea'
RED, BLUE = '#b8564b', '#4f6fc4'
NS = [5, 20, 50, 100]

def p95(n, runs):
    vals = []
    for r in runs:
        with open(OUT / f'f{n}-{r}.tsv') as f:
            vals.append(float(next(csv.DictReader(f, delimiter='\t'))['p95_ms']))
    return sum(vals) / len(vals)

groups = [('AS-IS', RED, [p95(n, ['a1', 'a2']) for n in NS]), ('TO-BE', BLUE, [p95(n, ['t1', 't2']) for n in NS])]
TOP, BOTTOM, W, YMAX = 110, 300, 290, 15
y = lambda v: BOTTOM - (BOTTOM - TOP) * v / YMAX
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="780" height="370" viewBox="0 0 780 370" font-family="{FONT}">', '<rect width="780" height="370" fill="#ffffff"/>']
for g, (name, color, vals) in enumerate(groups):
    x0 = 80 + g * 380
    o.append(f'<text x="{x0-40}" y="44" font-size="26" fill="{INK}">{name}</text>')
    o.append(f'<text x="{x0}" y="{TOP-22}" font-size="13" font-weight="700" fill="{INK}">p95 응답시간</text>')
    for t in range(0, YMAX + 1, 5):
        o.append(f'<line x1="{x0}" y1="{y(t):.1f}" x2="{x0+W}" y2="{y(t):.1f}" stroke="{GRID}" stroke-width="1"/>')
        o.append(f'<text x="{x0-8}" y="{y(t)+4:.1f}" font-size="11" text-anchor="end" fill="{MUTED}">{t}</text>')
    step = W / len(NS)
    xs = [x0 + step * (i + .5) for i in range(len(NS))]
    o.append('<polyline fill="none" stroke="{}" stroke-width="2" points="{}"/>'.format(color, ' '.join(f'{x:.1f},{y(v):.1f}' for x, v in zip(xs, vals))))
    for i, (x, v) in enumerate(zip(xs, vals)):
        o.append(f'<circle cx="{x:.1f}" cy="{y(v):.1f}" r="4" fill="#fff" stroke="{color}" stroke-width="2"/>')
        o.append(f'<text x="{x:.1f}" y="{y(v)-10:.1f}" font-size="11" text-anchor="middle" fill="{color}">{v:g}ms</text>')
        o.append(f'<text x="{x:.1f}" y="{BOTTOM+18}" font-size="11" text-anchor="middle" fill="{MUTED}">{NS[i]}</text>')
    o.append(f'<text x="{x0}" y="348" font-size="11" fill="{MUTED}">단위: ms</text>')
    o.append(f'<text x="{x0+W/2}" y="348" font-size="11" text-anchor="middle" fill="{MUTED}">폼 필드 수</text>')
o.append('</svg>')
(HERE / 'fields.svg').write_text('\n'.join(o))
print([(n, a, t) for n, a, t in zip(NS, groups[0][2], groups[1][2])])
