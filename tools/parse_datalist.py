#!/usr/bin/env python3
"""Извлекает таблицы «Parameter / Value / Explanation» из V31 Data List по координатам слов.

pdftotext -bbox даёт каждое слово с координатами. Заголовок таблицы — строка
«Parameter  Value  Explanation»; колонки таблицы определяются по x этих слов.
Имя параметра — слова в первой колонке, значение — во второй. Строки значения
относятся к ближайшему по вертикали имени (в PDF ячейки центрированы).
Заголовки (крупный шрифт) задают, к какому эффекту/группе относится таблица.
"""
import json
import re
import subprocess
import sys

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>')
PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">')


def unescape(t):
    return t.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&#39;', "'")


def pages(pdf, first, last):
    html = subprocess.run(['pdftotext', '-f', str(first), '-l', str(last), '-bbox', pdf, '-'],
                          capture_output=True, text=True, check=True).stdout
    chunks = html.split('<page ')[1:]
    for i, ch in enumerate(chunks):
        ws = []
        for m in WORD.finditer(ch):
            x0, y0, x1, y1 = map(float, m.groups()[:4])
            ws.append({'x': x0, 'y': y0, 'x1': x1, 'y1': y1, 'h': y1 - y0, 't': unescape(m.group(5))})
        yield first + i, ws


def lines_of(words, tol=1.5):
    """Группирует слова в строки по y."""
    out = []
    for w in sorted(words, key=lambda w: (round(w['y'] / tol), w['x'])):
        if out and abs(out[-1][0]['y'] - w['y']) <= tol:
            out[-1].append(w)
        else:
            out.append([w])
    return [sorted(l, key=lambda w: w['x']) for l in out]


def extract(pdf, first, last, title_h=12.0):
    """Возвращает список событий в порядке чтения: ('title', text, page) и ('table', rows, page)."""
    events = []
    for pno, ws in pages(pdf, first, last):
        ws = [w for w in ws if w['y'] > 60 and w['y'] < 800]  # без колонтитулов
        if not ws:
            continue
        mid = 300.0
        for col in (0, 1):
            cw = [w for w in ws if (w['x'] < mid) == (col == 0)]
            if not cw:
                continue
            # заголовки таблиц в этой колонке
            heads = []
            for w in cw:
                if w['t'] == 'Parameter':
                    same = [v for v in cw if abs(v['y'] - w['y']) < 1.5]
                    vx = next((v['x'] for v in same if v['t'] == 'Value' and v['x'] > w['x']), None)
                    ex = next((v['x'] for v in same if v['t'] == 'Explanation' and v['x'] > w['x']), None)
                    if vx and ex:
                        heads.append({'y': w['y'], 'px': w['x'], 'vx': vx, 'ex': ex})
            heads.sort(key=lambda h: h['y'])
            titles = [l for l in lines_of([w for w in cw if w['h'] >= title_h])]
            titles = [t for t in titles if len(re.findall(r'[A-Za-z]', ' '.join(w['t'] for w in t))) >= 2]
            marks = [('title', t[0]['y'], ' '.join(w['t'] for w in t)) for t in titles]
            marks += [('head', h['y'], h) for h in heads]
            marks.sort(key=lambda m: m[1])
            for i, (kind, y, data) in enumerate(marks):
                if kind == 'title':
                    events.append(('title', data, pno))
                    continue
                h = data
                yend = marks[i + 1][1] if i + 1 < len(marks) else 1e9
                body = [w for w in cw if h['y'] + 2 < w['y'] < yend - 1 and w['x'] >= h['px'] - 3 and w['h'] < title_h]
                names = [w for w in body if w['x'] < h['vx'] - 3]
                vals = [w for w in body if h['vx'] - 3 <= w['x'] < h['ex'] - 3]
                rows = []
                for l in lines_of(names):
                    txt = ' '.join(w['t'] for w in l)
                    # продолжение имени на следующей строке (близко по y)
                    if rows and l[0]['y'] - rows[-1]['y1'] < 3.0 and not vals_between(vals, rows[-1]['y1'], l[0]['y']):
                        rows[-1]['name'] += ' ' + txt
                        rows[-1]['y1'] = l[0]['y1']
                        continue
                    rows.append({'name': txt, 'y': l[0]['y'], 'y1': l[0]['y1'], 'vals': []})
                if not rows:
                    continue
                vlines = lines_of(vals)
                blocks = []
                for l in vlines:
                    txt = ' '.join(w['t'] for w in l)
                    if blocks and blocks[-1]['open']:
                        blocks[-1]['lines'].append((l[0]['y'], txt))
                    else:
                        blocks.append({'lines': [(l[0]['y'], txt)]})
                    blocks[-1]['open'] = txt.rstrip().endswith((',', '–', '-', '('))
                if len(blocks) == len(rows):
                    for r, b in zip(rows, blocks):
                        r['vals'] = b['lines']
                else:
                    for l in vlines:
                        yc = (l[0]['y'] + l[0]['y1']) / 2
                        best = min(rows, key=lambda r: abs((r['y'] + r['y1']) / 2 - yc))
                        best['vals'].append((l[0]['y'], ' '.join(w['t'] for w in l)))
                out = []
                for r in rows:
                    v = ' '.join(t for _, t in sorted(r['vals']))
                    out.append({'name': clean(r['name']), 'value': clean(v)})
                events.append(('table', out, pno))
    return events


def vals_between(vals, y0, y1):
    return any(y0 - 0.5 <= v['y'] <= y1 + 0.5 for v in vals)


def clean(s):
    s = s.replace('Ó', '->').replace('“', '"').replace('”', '"').replace('’', "'")
    return re.sub(r'\s+', ' ', s).strip()


if __name__ == '__main__':
    pdf, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    ev = extract(pdf, first, last)
    json.dump(ev, sys.stdout, ensure_ascii=False, indent=1)
