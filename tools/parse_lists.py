#!/usr/bin/env python3
"""Списки из Data List: инструменты (пресеты и расширения EXV), пресетные киты.

Используются координаты слов: у таблиц четыре колонки (No., группа, имя, примечания),
на странице две такие таблицы рядом.
"""
import json
import re
import subprocess
import sys

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from parse_datalist import pages, lines_of  # noqa: E402


def column_tables(ws, header_first='No.'):
    """Находит заголовки таблиц («No.» … ) и возвращает x-границы колонок для каждой половины страницы."""
    heads = []
    for w in ws:
        if w['t'] == header_first:
            same = sorted([v for v in ws if abs(v['y'] - w['y']) < 1.5 and v['x'] >= w['x'] - 1], key=lambda v: v['x'])
            heads.append((w, same))
    return heads


def instruments(pdf):
    sections = {}
    order = []
    cur = None
    for pno, ws in pages(pdf, 110, 118):
        ws = [w for w in ws if 60 < w['y'] < 800]
        for col in (0, 1):
            cw = [w for w in ws if (w['x'] < 300) == (col == 0)]
            if not cw:
                continue
            # x колонок: по заголовку «No. Instrument group Instrument name Remarks»
            head = next((w for w in cw if w['t'] == 'No.'), None)
            if head is None:
                continue
            hl = sorted([v for v in cw if abs(v['y'] - head['y']) < 1.5], key=lambda v: v['x'])
            xs = [v['x'] for v in hl]
            # группа начинается со слова «Instrument» (первое), имя — со второго «Instrument», примечания — «Remarks»
            ins = [v['x'] for v in hl if v['t'] == 'Instrument']
            rem = next((v['x'] for v in hl if v['t'] == 'Remarks'), 1e9)
            if len(ins) < 2:
                continue
            gx, nx = ins[0], ins[1]
            for line in lines_of(cw):
                txt = ' '.join(w['t'] for w in line)
                m = re.match(r'^(EXV\d{3}): (.+)$', txt)
                if m:
                    cur = m.group(1)
                    sections[cur] = {'title': m.group(2), 'list': {}}
                    order.append(cur)
                    continue
                if txt.startswith('Preset') and cur is None:
                    cur = 'PRESET'
                    sections[cur] = {'title': 'Preset', 'list': {}}
                    order.append(cur)
                    continue
                if not re.match(r'^\d{1,3}$', line[0]['t']) or abs(line[0]['x'] - head['x']) > 8:
                    continue
                if cur is None:
                    cur = 'PRESET'
                    sections[cur] = {'title': 'Preset', 'list': {}}
                    order.append(cur)
                no = int(line[0]['t'])
                grp = ' '.join(w['t'] for w in line if gx - 2 <= w['x'] < nx - 2)
                name = ' '.join(w['t'] for w in line if nx - 2 <= w['x'] < rem - 2)
                remark = ' '.join(w['t'] for w in line if w['x'] >= rem - 2)
                sections[cur]['list'][no] = [grp, name.replace('’', "'").replace('”', '"'), remark]
    return {k: {'title': sections[k]['title'], 'list': sections[k]['list']} for k in order}


def kits(pdf):
    out = {}
    for pno, ws in pages(pdf, 108, 109):
        ws = [w for w in ws if 60 < w['y'] < 800]
        heads = [w for w in ws if w['t'] == 'No.']
        for h in heads:
            hl = sorted([v for v in ws if abs(v['y'] - h['y']) < 1.5 and v['x'] >= h['x']], key=lambda v: v['x'])
            # колонки: No., Drum kit name, Sub name (до следующего No.)
            nexts = [v['x'] for v in hl if v['t'] == 'No.' and v['x'] > h['x'] + 5]
            right = nexts[0] if nexts else 1e9
            namex = next(v['x'] for v in hl if v['t'] == 'Drum')
            subx = next(v['x'] for v in hl if v['t'] == 'Sub')
            col = [w for w in ws if h['x'] - 3 <= w['x'] < right - 3 and w['y'] > h['y'] + 2]
            for line in lines_of(col):
                if not re.match(r'^\d{1,3}$', line[0]['t']):
                    continue
                no = int(line[0]['t'])
                name = ' '.join(w['t'] for w in line if namex - 2 <= w['x'] < subx - 2)
                sub = ' '.join(w['t'] for w in line if w['x'] >= subx - 2)
                out[no] = [name.replace('’', "'").replace('”', '"'), sub.replace('’', "'")]
    return out


if __name__ == '__main__':
    pdf = sys.argv[1]
    json.dump({'instruments': instruments(pdf), 'kits': kits(pdf)}, sys.stdout, ensure_ascii=False, indent=1)
