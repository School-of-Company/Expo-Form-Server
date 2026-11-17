# load-test/out/{as-is,to-be}.tsv로 전후 막대그래프(SVG)를 만든다. 사용법: python3 load-test/graphs/make_graphs.py
import csv, math, pathlib
HERE = pathlib.Path(__file__).parent
OUT = HERE.parent / 'out'
FONT = 'Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif'
INK, MUTED, GRID = '#222222', '#8a8a90', '#e6e6ea'
RED, BLUE = '#b8564b', '#4f6fc4'
TOP, BOTTOM, W = 110, 300, 180
LABEL = {'form': '폼 조회', 'survey': '공개 설문 조회'}

def load(name, target):
    with open(OUT / f'{name}.tsv') as f:
        rows = [r for r in csv.DictReader(f, delimiter='\t') if r['target'] == target]
    seen = {}
    for r in rows:  # 같은 단계가 두 번 적혔으면 마지막 줄을 쓴다
        seen[int(r['rate'])] = r
    return [seen[k] for k in sorted(seen)]

METRICS = [
    ('p95 응답시간 (ms)', lambda r: float(r['p95_ms']), 'linear'),
    ('초당 DB 쿼리 수', lambda r: float(r['db_queries_per_req']) * float(r['rps']), 'linear'),
    ('초당 읽은 행 수', lambda r: float(r['tuples_read_per_req']) * float(r['rps']), 'log'),
]

def nice_max(v):
    p = 10 ** math.floor(math.log10(v))
    return next(m * p for m in (1, 2, 5, 10) if m * p >= v)

def short(v):
    for unit, size in (('M', 1e6), ('k', 1e3)):
        if v >= size:
            return f'{v / size:g}{unit}'
    return f'{v:g}'

def panel(o, x0, title, color, rates, values, scale, vmax):
    o.append(f'<text x="{x0}" y="{TOP-22}" font-size="13" font-weight="700" fill="{INK}">{title}</text>')
    if scale == 'log':
        top = math.ceil(math.log10(vmax))
        ticks = [10 ** i for i in range(top + 1)]
        ypos = lambda v: BOTTOM - (BOTTOM - TOP) * math.log10(max(v, 1)) / top
    else:
        m = nice_max(vmax)
        ticks = [m * i / 5 for i in range(6)]
        ypos = lambda v: BOTTOM - (BOTTOM - TOP) * v / m
    for t in ticks:
        y = ypos(t)
        o.append(f'<line x1="{x0}" y1="{y:.1f}" x2="{x0+W}" y2="{y:.1f}" stroke="{GRID}" stroke-width="1"/>')
        o.append(f'<text x="{x0-8}" y="{y+4:.1f}" font-size="11" text-anchor="end" fill="{MUTED}">{short(t)}</text>')
    step = W / len(values); bw = 16
    for i, v in enumerate(values):
        cx = x0 + step * (i + .5); y = ypos(v)
        o.append(f'<rect x="{cx-bw/2:.1f}" y="{y:.1f}" width="{bw}" height="{BOTTOM-y:.1f}" rx="3" fill="{color}"/>')
        if i in (0, len(values) - 1):
            o.append(f'<text x="{cx:.1f}" y="{y-6:.1f}" font-size="11" text-anchor="middle" fill="{INK}">{v:,.0f}</text>')
        o.append(f'<text x="{cx:.1f}" y="{BOTTOM+18}" font-size="11" text-anchor="middle" fill="{MUTED}">{rates[i]}</text>')

for target in ('form', 'survey'):
    groups = [('AS-IS', RED, load('as-is', target)), ('TO-BE', BLUE, load('to-be', target))]
    rates = [int(r['rate']) for r in groups[0][2]]
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1560" height="370" viewBox="0 0 1560 370" font-family="{FONT}">',
         '<rect width="1560" height="370" fill="#ffffff"/>']
    for g, (name, color, rows) in enumerate(groups):
        gx = 40 + g * 780
        o.append(f'<text x="{gx}" y="44" font-size="26" fill="{INK}">{name}</text>')
        o.append(f'<text x="{gx+110}" y="44" font-size="13" fill="{MUTED}">{LABEL[target]} · 필드 20개</text>')
        for k, (title, fn, scale) in enumerate(METRICS):
            vmax = max(fn(r) for _, _, rs in groups for r in rs)  # 전후가 같은 축을 쓴다
            panel(o, gx + 50 + k * 245, title, color, rates, [fn(r) for r in rows], scale, vmax)
        o.append(f'<text x="{gx+380}" y="348" font-size="11" text-anchor="middle" fill="{MUTED}">초당 요청 수</text>')
    o.append('</svg>')
    (HERE / f'{target}.svg').write_text('\n'.join(o))
