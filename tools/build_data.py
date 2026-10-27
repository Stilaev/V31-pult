#!/usr/bin/env python3
"""Собирает web/data.js из документов Roland V31.

Запуск (из папки tools):
  pdftotext -layout V31_MIDI_Implementation_eng01_W.pdf midi.txt
  python3 build_data.py midi.txt V31_DataList_eng02_W.pdf ../web/data.js
"""
import json
import re
import sys

from parse_map import main as parse_map
from parse_datalist import extract
from fx_group import group as fx_group
from parse_lists import instruments, kits

# Опечатки документа: недостающие запятые и т. п.
LABEL_FIX = {
    ('KitPad', 'Pad Side Chain Control'): 'OFF, BUS-A FX1, BUS-A FX2, BUS-B FX1, BUS-B FX2, BUS-C FX1, BUS-C FX2, BUS-D FX1, BUS-D FX2',
}


def compact_map(blocks):
    """Компактный вид: блок → [размер, [[off, bytes, name, min, max, fmt], …]]."""
    out = {}
    for bname, b in blocks.items():
        ps = []
        for p in b['params']:
            fix = LABEL_FIX.get((bname, p['name']))
            if fix:
                p['fmt'] = {'t': 'enum', 'items': [s.strip() for s in fix.split(',')]}
            if p['name'] == 'User Sample Transient Type':
                p['fmt'] = {'t': 'enum', 'items': ['Type 1', 'Type 2', 'Type 3', 'Type 4']}
            if 'Balance' in p['name'] and p.get('labels', '').startswith('D100:0W'):
                p['fmt'] = {'t': 'bal'}
            ps.append([p['off'], p['bytes'], p['name'], p['min'], p['max'], p.get('fmt')])
        out[bname] = [b['size'], ps]
    return out


SPLIT_PREFIX = ('Saturator ', 'P2 Dly ', 'P1 Dly ')


def split_name(name):
    """Разделяет имена, склеенные при извлечении из PDF."""
    toks = name.split()
    if len(toks) > 1 and all(re.match(r'^Band\d$', t) for t in toks):
        return toks
    m = re.match(r'^(Step) (\d+)–(\d+)$', name)
    if m:
        return [f'Step {i}' for i in range(int(m.group(2)), int(m.group(3)) + 1)]
    if name == 'Mic Level Direct Level':
        return ['Mic Level', 'Direct Level']
    for pre in SPLIT_PREFIX:
        if name.count(pre) > 1:
            parts = [pre + s.strip() for s in name.split(pre) if s.strip()]
            return parts
    return [name]


def fx_params(fx):
    out = {}
    for t, rows in fx.items():
        ps = []
        for r in rows:
            name = re.sub(r'\s*\*\d+$', '', r['name']).strip()
            if not name or name.startswith('*') or name.startswith('[F'):
                continue
            for n in split_name(name):
                if ps and ps[-1][0] == n:
                    continue
                v = re.sub(r'[\x00-\x1f\x7f\ue000-\uf8ff]', '', r['value']).replace('Ø', '').strip()
                ps.append([n, v])
        out[t] = ps
    return out


def main(midi_txt, datalist_pdf, out_js):
    blocks = parse_map(midi_txt)
    m = compact_map(blocks)
    types = next(p for p in blocks['KitFx']['params'] if p['name'] == 'Bus Fx Type')['fmt']['items']
    fx = fx_params(fx_group(extract(datalist_pdf, 68, 107), types))
    lists = instruments(datalist_pdf)
    preset = lists.pop('PRESET')['list']
    inst = [preset[str(i)] if str(i) in preset else preset.get(i) for i in range(len(preset))]
    exp = {k: {'title': v['title'], 'list': v['list']} for k, v in lists.items()}
    kl = kits(datalist_pdf)
    kit_names = [kl.get(i, kl.get(str(i), ['', ''])) for i in range(1, 201)]
    data = {
        'map': m,
        'fx': fx,
        'inst': inst,
        'exp': exp,
        'kits': kit_names,
    }
    with open(out_js, 'w', encoding='utf-8') as f:
        f.write('/* Сгенерировано tools/build_data.py из документов Roland V31 (MIDI Implementation 2.00, Data List). */\n')
        f.write('window.V31DATA=')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('blocks', len(m), 'fx', len(fx), 'inst', len(inst), 'exp', len(exp), 'kits', len(kit_names))


if __name__ == '__main__':
    main(*sys.argv[1:4])
