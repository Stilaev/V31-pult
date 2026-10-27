#!/usr/bin/env python3
"""Разбор «Parameter Address Map» из текста V31 MIDI Implementation (pdftotext -layout).

Выход: JSON со всеми блоками ([Click], [KitUnitLayer], …): для каждого параметра —
смещение (в 7-битной адресации, как в документе), число байт, разрядность,
диапазон, подписи значений и правило отображения.
"""
import json
import re
import sys

ROW = re.compile(r'^\|(#?)\s*([0-9A-F]{2}) ([0-9A-F]{2})\s*\|\s*([0a-d ]{9})\s*\|(.*)\|\s*$')
CONT = re.compile(r'^\|\s*\|\s*\|(.*)\|\s*$')
TOTAL = re.compile(r'^\|\s*([0-9A-F]{2}) ([0-9A-F]{2}) ([0-9A-F]{2}) ([0-9A-F]{2})\s*\|Total Size')
NAME_RANGE = re.compile(r'^(.*?)\s*\((-?\d+)\s*-\s*(-?\d*)\s*\)\s*$')


def off7(hi, lo):
    return int(hi, 16) * 128 + int(lo, 16)


def parse_blocks(lines):
    blocks = {}
    cur = None
    params = []
    pending = None  # параметр, который ещё собирается из нескольких строк
    for raw in lines:
        line = raw.replace('\f', '').rstrip('\n')
        m = re.match(r'^\* \[(\w+)\]\s*$', line.strip())
        if m:
            cur = m.group(1)
            params = []
            pending = None
            continue
        if cur is None:
            continue
        t = TOTAL.match(line)
        if t:
            size = 0
            for b in t.groups():
                size = size * 128 + int(b, 16)
            blocks[cur] = {'size': size, 'params': params}
            cur = None
            continue
        r = ROW.match(line)
        if r:
            multi, hi, lo, bits, desc = r.groups()
            off = off7(hi, lo)
            desc = desc.strip()
            if multi == '#':
                pending = {'off': off, 'bytes': 1, 'bits': bits.strip()}
                if desc:
                    # бывает «#00 00 | 0000 aaaa | (reserved)»
                    pending['desc'] = desc
                    params.append(pending)
                    pending = None
                continue
            if pending is not None and off == pending['off'] + pending['bytes']:
                pending['bytes'] += 1
                if desc:
                    pending['desc'] = desc
                    params.append(pending)
                    pending = None
                continue
            pending = None
            params.append({'off': off, 'bytes': 1, 'bits': bits.strip(), 'desc': desc})
            continue
        c = CONT.match(line)
        if c and params:
            txt = c.group(1).strip()
            if txt:
                params[-1].setdefault('labels_raw', []).append(txt)
    return blocks


# ---------- подписи значений ----------

NUM = r'[-+]?\d+(?:\.\d+)?'


def expand_item(item):
    """«L30 - 1» → [L30..L1]; «INSIDE -5 - -1» → [...]; «OFF» → [OFF]."""
    item = item.strip()
    m = re.match(r'^(.*?)(' + NUM + r')\s*-\s*(' + NUM + r')(.*)$', item)
    if not m:
        return [item]
    pre, a, b, post = m.groups()
    if '.' in a or '.' in b:
        return None  # дробный диапазон не раскрывается поштучно
    # «R1 - 30» → префикс переносится и на второе число
    ia, ib = int(a), int(b)
    if abs(ib - ia) > 400:
        return None
    step = 1 if ib >= ia else -1
    out = []
    for v in range(ia, ib + step, step):
        sv = str(v)
        if a.startswith('+') and v > 0:
            sv = '+' + sv
        out.append((pre + sv + post).strip())
    return out


def interpret(p):
    desc = p.get('desc', '')
    m = NAME_RANGE.match(desc)
    if m:
        name, lo, hi = m.group(1).strip(), int(m.group(2)), m.group(3)
        hi = int(hi) if hi not in ('', None) else None
    else:
        name, lo, hi = desc, None, None
    p['name'] = name
    p['min'] = lo
    p['max'] = hi
    labels = ' '.join(p.pop('labels_raw', []))
    labels = re.sub(r'\s+', ' ', labels).strip()
    p['labels'] = labels
    if lo is None or hi is None:
        return p
    count = hi - lo + 1
    if not labels:
        return p
    if '[ASCII]' in labels:
        p['fmt'] = {'t': 'char'}
        return p
    # -INF, -60.0 - +6.0 [dB]
    mm = re.match(r'^-?INF, (' + NUM + r') - (' + NUM + r') ?\[?(dB)?\]?$', labels.replace('[0.1dB]', '[dB]'))
    if mm:
        a, b = float(mm.group(1)), float(mm.group(2))
        p['fmt'] = {'t': 'db', 'inf': lo, 'scale': round((b - a) / (hi - lo - 1), 6) if hi - lo - 1 else 1}
        return p
    items = [s for s in re.split(r',\s*', labels) if s]
    expanded = []
    ok = True
    for it in items:
        e = expand_item(it)
        if e is None:
            ok = False
            break
        expanded.extend(e)
    if ok and len(expanded) == count and count > 1:
        if expanded == [str(v) for v in range(lo, hi + 1)]:
            return p  # просто число
        nm = [re.match(r'^([-+]?\d+(?:\.\d+)?)\s*\(?\[?([A-Za-z%]*)\]?\)?$', x) for x in expanded]
        if all(nm) and len({m.group(2) for m in nm}) == 1:
            vals = [float(m.group(1)) for m in nm]
            if all(abs(vals[i] - (lo + i)) < 1e-9 for i in range(len(vals))):
                if nm[0].group(2):
                    p['fmt'] = {'t': 'lin', 'a': lo, 'b': hi, 'dec': 0, 'unit': nm[0].group(2)}
                return p
        p['fmt'] = {'t': 'enum', 'items': expanded}
        return p
    # «1.0 - 32.0», «0 - 4.0(ms)», «-12.0 - +6.0 [dB]» — линейная шкала
    mm = re.match(r'^(.*?)(' + NUM + r') ?- ?(' + NUM + r')\s*(.*)$', labels)
    if mm and len(items) == 1:
        a, b = float(mm.group(2)), float(mm.group(3))
        unit = re.sub(r'[\[\]()]', '', mm.group(4)).strip()
        dec = max(len(x.split('.')[1]) if '.' in x else 0 for x in (mm.group(2), mm.group(3)))
        p['fmt'] = {'t': 'lin', 'a': a, 'b': b, 'dec': dec, 'unit': unit}
        return p
    return p


def main(path):
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()
    # карта начинается с «3. Parameter Address Map»
    start = next(i for i, l in enumerate(lines) if 'Parameter Address Map' in l and l.strip().startswith('3.'))
    blocks = parse_blocks(lines[start:])
    for b in blocks.values():
        for p in b['params']:
            interpret(p)
            if p['bits'] == '0000 aaaa' and p['bytes'] > 1:
                p['nib'] = True
            p.pop('bits', None)
    return blocks


if __name__ == '__main__':
    blocks = main(sys.argv[1])
    json.dump(blocks, sys.stdout, ensure_ascii=False, indent=1)
