"""Проверка ползунков, фейдеров, эквалайзера, замка и микшера в демо: python3 tests/ui_controls.py [папка_для_снимков]"""
import os, sys
from playwright.sync_api import sync_playwright
URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'web', 'index.html')) + '?demo'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
errors = []
def check(cond, msg):
    if not cond: errors.append(msg)
def last_writes(pg, n=6):
    return pg.evaluate(f"V31.log.filter(l=>l.dir==='→' && l.note.includes('=')).slice(-{n}).map(l=>l.note)")
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1180, 'height': 820}, has_touch=True)
    pg.on('pageerror', lambda e: errors.append('PAGEERR ' + str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.wait_for_timeout(1200)
    pg.evaluate("localStorage.clear()")
    pg.click('nav button[data-tab="pads"]'); pg.wait_for_timeout(1800)

    # 1. касание дорожки ползунка не меняет значение
    layer = pg.locator('.layer').first
    sl = layer.locator('.sl').first
    sl.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    n0 = len(last_writes(pg, 999))
    box = sl.bounding_box()
    pg.mouse.click(box['x'] + 20, box['y'] + box['height'] / 2)   # левый край дорожки
    pg.wait_for_timeout(300)
    check(len(last_writes(pg, 999)) == n0, 'касание дорожки изменило значение')

    # 2. перетягивание ручки меняет значение
    th = sl.locator('.sl-thumb').bounding_box()
    pg.mouse.move(th['x'] + th['width'] / 2, th['y'] + th['height'] / 2)
    pg.mouse.down(); pg.mouse.move(th['x'] - 60, th['y'] + 14, steps=6); pg.mouse.up()
    pg.wait_for_timeout(300)
    w = last_writes(pg, 2)
    check(len(last_writes(pg, 999)) > n0 and 'Volume' in w[-1], 'перетягивание ручки не записало значение: %s' % w)

    # 3. ввод числа по касанию значения
    layer.locator('.val.tap').first.click(); pg.wait_for_timeout(200)
    pg.locator('.small-dialog input').fill('-3')
    pg.locator('.small-dialog button:has-text("Готово")').click(); pg.wait_for_timeout(300)
    check('-3.0 dB' in last_writes(pg, 2)[-1], 'ввод числа: %s' % last_writes(pg, 2))

    # 4. эквалайзер пэда: перетягивание точки Mid 1
    pg.locator('section:has-text("EQ пэда")').first.scroll_into_view_if_needed(); pg.wait_for_timeout(500)
    h1 = pg.locator('section:has-text("EQ пэда") .eq-h[data-i="2"]').first
    hb = h1.bounding_box()
    cx, cy = hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2
    pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx + 120, cy - 60, steps=8); pg.mouse.up()
    pg.wait_for_timeout(400)
    w = last_writes(pg, 8)
    check(any('Pad EQ Mid 1 Freq' in x for x in w) and any('Pad EQ Mid 1 Gain' in x for x in w), 'EQ: точка не записала частоту/усиление: %s' % w)
    # касание графика мимо точки не меняет ничего
    n1 = len(last_writes(pg, 999))
    g = pg.locator('section:has-text("EQ пэда") .eq-svg').first.bounding_box()
    pg.mouse.click(g['x'] + g['width'] * 0.9, g['y'] + g['height'] * 0.85); pg.wait_for_timeout(300)
    check(len(last_writes(pg, 999)) == n1, 'касание графика изменило значение')
    pg.locator('section:has-text("EQ пэда")').first.screenshot(path=f'{OUT}/eq_pad.png')

    # 5. микшер: фейдер — касание дорожки не меняет, колпачок двигает пластик и обод вместе
    pg.click('nav button[data-tab="mixer"]'); pg.wait_for_timeout(1800)
    strip = pg.locator('.strip-group').nth(1)   # Малый
    fd = strip.locator('.fader').first
    n2 = len(last_writes(pg, 999))
    fb = fd.bounding_box()
    pg.mouse.click(fb['x'] + fb['width'] / 2, fb['y'] + fb['height'] - 20); pg.wait_for_timeout(300)
    check(len(last_writes(pg, 999)) == n2, 'касание дорожки фейдера изменило значение')
    cap = fd.locator('.cap').bounding_box()
    pg.mouse.move(cap['x'] + 20, cap['y'] + 11); pg.mouse.down(); pg.mouse.move(cap['x'] + 20, cap['y'] + 70, steps=6); pg.mouse.up()
    pg.wait_for_timeout(400)
    w = last_writes(pg, 4)
    check(any('SNARE HEAD' in x for x in w) and any('SNARE RIM' in x for x in w), 'фейдер пэда не двигает обод: %s' % w)
    # раскрыть пластик/обод
    strip.locator('.sn-btn').click(); pg.wait_for_timeout(1200)
    check(pg.locator('.strip-group.open .strip.zone').count() == 2, 'не раскрылись пластик/обод')
    pg.screenshot(path=f'{OUT}/mixer2.png')

    # 6. замок
    pg.click('#lock'); pg.wait_for_timeout(500)
    check(pg.locator('nav button[data-tab="pads"]').is_disabled(), 'в замке вкладка «Пэды» доступна')
    check(not pg.locator('nav button[data-tab="mixer"]').is_disabled(), 'в замке микшер недоступен')
    pg.click('#lock'); pg.wait_for_timeout(300)
    check(pg.evaluate("document.body.classList.contains('locked')"), 'замок снялся коротким нажатием')
    lb = pg.locator('#lock').bounding_box()
    pg.mouse.move(lb['x'] + 10, lb['y'] + 10); pg.mouse.down(); pg.wait_for_timeout(1200); pg.mouse.up(); pg.wait_for_timeout(400)
    check(not pg.evaluate("document.body.classList.contains('locked')"), 'замок не снялся удержанием')

    # 7. EQ кита, эмбиенс, выход открываются
    for tab, title in [('kit', 'EQ кита'), ('amb', 'Overhead'), ('sys', 'EQ выхода')]:
        pg.click(f'nav button[data-tab="{tab}"]'); pg.wait_for_timeout(1200)
        for _ in range(10):
            c = pg.locator('section.fold.closed .sh')
            if not c.count(): break
            c.first.click(); pg.wait_for_timeout(300)
        pg.wait_for_timeout(1200)
        check(pg.locator('.eq-svg').count() >= 1, f'{tab}: нет графика эквалайзера')
        check(pg.locator('.note.warn').count() == 0, f'{tab}: ошибка чтения')
    pg.click('nav button[data-tab="kit"]'); pg.wait_for_timeout(1000)
    for _ in range(6):
        c = pg.locator('section.fold.closed .sh')
        if not c.count(): break
        c.first.click(); pg.wait_for_timeout(300)
    pg.wait_for_timeout(1200)
    pg.locator('section:has-text("EQ кита")').first.screenshot(path=f'{OUT}/eq_kit.png')
    pg.click('nav button[data-tab="amb"]'); pg.wait_for_timeout(800)
    pg.click('.seg button:has-text("Room")'); pg.wait_for_timeout(1200)
    print('\n'.join(errors) or 'OK: ползунки, фейдеры, эквалайзер, замок, микшер')
    b.close()
sys.exit(1 if errors else 0)
