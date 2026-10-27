#!/usr/bin/env python3
"""Сопоставляет таблицы Data List с типами Bus FX из адресной карты."""
import json
import re
import sys


def norm(s):
    return re.sub(r'[^A-Z0-9]', '', re.sub(r'\(.*', '', s).upper())


def group(events, types):
    keys = {norm(t): t for t in types}
    keys['AUTOWAH'] = 'AUTO WAH'
    fx, cur = {}, None
    for e in events:
        if e[0] == 'title':
            t = e[1].strip()
            if t.endswith(')') and '(' not in t:
                continue  # вторая строка длинного заголовка
            letters = re.sub(r'[^A-Za-z]', '', re.sub(r'\(.*', '', t))
            if letters and letters != letters.upper():
                cur = None  # раздел («Phaser», «Delay») или подзаголовок
                if t.startswith('When '):
                    cur = last
                continue
            k = norm(t)
            if k in keys:
                cur = keys[k]
                last = cur
                fx.setdefault(cur, [])
            continue
        if cur:
            fx[cur].extend(e[1])
    return fx


if __name__ == '__main__':
    events = json.load(open(sys.argv[1]))
    types = json.load(open(sys.argv[2]))
    json.dump(group(events, types), sys.stdout, ensure_ascii=False, indent=1)
