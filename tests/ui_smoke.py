"""Прогон интерфейса в демо-режиме (виртуальный модуль): python3 tests/ui_smoke.py"""
import os, sys
from playwright.sync_api import sync_playwright
URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'web', 'index.html')) + '?demo'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1180, 'height': 820})
    pg.on('pageerror', lambda e: errors.append('PAGEERR ' + str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.wait_for_timeout(1200)
    # инженерный режим
    pg.click('nav button[data-tab="sys"]'); pg.wait_for_timeout(800)
    pg.locator('.row:has-text("Инженерный режим") .toggle').click(); pg.wait_for_timeout(300)
    for tab in ['kits', 'pads', 'mixer', 'fx', 'amb', 'kit', 'trig', 'set', 'sys', 'mon']:
        pg.click(f'nav button[data-tab="{tab}"]'); pg.wait_for_timeout(1500)
        # раскрыть все свёрнутые разделы
        for _ in range(12):
            closed = pg.locator('section.fold.closed .sh')
            if not closed.count(): break
            closed.first.click(); pg.wait_for_timeout(300)
        pg.wait_for_timeout(1500)
        bad = pg.locator('.note.warn').count()
        if bad: errors.append(f'{tab}: {bad} ошибок чтения')
        pg.screenshot(path=f'{OUT}/ui_{tab}.png')
    # вкладки эмбиенса и шины
    pg.click('nav button[data-tab="amb"]'); pg.wait_for_timeout(500)
    for t in ['Room', 'Reverb', 'Kit Resonance']:
        pg.click(f'.seg button:has-text("{t}")'); pg.wait_for_timeout(900)
    # сет-лист: шаг 4
    pg.click('nav button[data-tab="set"]'); pg.wait_for_timeout(1200)
    pg.locator('select[aria-label="Шаг 4"]').select_option(value='9'); pg.wait_for_timeout(300)
    steps = pg.locator('select[aria-label^="Шаг"]').count()
    if steps != 5: errors.append(f'сет-лист: шагов {steps}, ожидалось 5')
    # копирование кита 1 → 80
    pg.click('nav button[data-tab="kits"]'); pg.wait_for_timeout(800)
    sec = pg.locator('section:has-text("Копия, резервная копия")')
    pg.wait_for_timeout(500)
    sec.locator('select').nth(1).select_option(value='80')
    sec.locator('button:has-text("Копировать")').click()
    pg.wait_for_selector('.toast:has-text("скопирован")', timeout=20000)
    # сохранение в планшет
    sec.locator('button:has-text("Сохранить")').first.click()
    pg.wait_for_selector('.toast:has-text("сохранён")', timeout=20000)
    saved = pg.evaluate("JSON.parse(localStorage.getItem('v31.library')).length")
    if saved != 1: errors.append('резервная копия не сохранилась')
    # переход на кит 80 и проверка имени
    pg.click('.kit:has-text("080")'); pg.wait_for_timeout(1200)
    name = pg.locator('#kname').inner_text()
    if name != 'Studio A': errors.append('копия кита: имя ' + name)
    print('\n'.join(errors) or 'OK: все экраны и операции без ошибок')
    b.close()
sys.exit(1 if errors else 0)
