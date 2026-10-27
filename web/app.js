/*
 * V31 Пульт — интерфейс. Работает одинаково в Android WebView, iOS WKWebView и в браузере
 * (демо-режим с эмулятором модуля или Web MIDI на компьютере).
 */
(function () {
  'use strict';
  const V = window.V31, T = window.V31TYPED, D = V.D;
  const { BLOCKS, ADDR, PADS, ZONES } = V;

  // ---------- мелочи ----------
  const $ = (s, el) => (el || document).querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem('v31.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('v31.' + k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } },
  };
  let toastTimer;
  function toast(msg, err) {
    let t = $('.toast');
    if (!t) { t = h('div', { class: 'toast', role: 'status' }); document.body.append(t); }
    t.className = 'toast' + (err ? ' err' : '');
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), err ? 6000 : 2600);
  }

  // ---------- состояние ----------
  const S = {
    tab: store.get('tab', 'pads'),
    kit: 1,
    pad: 2,
    zoneIdx: 0,
    xstick: false,
    bus: 1,
    amb: 'overhead',
    trigBank: 1,
    trigInput: 1,
    trigDigital: false,
    setList: 1,
    hr: store.get('hr', true),
    renderId: 0,
    names: store.get('kitnames', {}), // номер кита → [имя, подимя, цвет]
    vedit: {}, // выбранная вручную таблица V-EDIT по ключу слоя
  };
  Object.assign(V.settings, store.get('settings', {}));
  V.Link.gapMs = V.settings.gapMs || 15;
  const saveSettings = () => store.set('settings', { deviceId: V.settings.deviceId, signed: V.settings.signed, engineering: V.settings.engineering, gapMs: V.Link.gapMs, globalCh: V.settings.globalCh || 10 });

  // ---------- привязки контролов к памяти модуля ----------
  let binds = [];
  V.memListeners.add((addr, len, touched) => {
    for (const b of binds) {
      if (touched.includes(b.base) && addr < b.base + b.off + b.bytes && addr + len > b.base + b.off) b.update();
    }
    if (touched.includes(ADDR.kitCommon(S.kit))) updateHeader();
  });

  // ---------- запись с прореживанием (ползунки) ----------
  const pending = new Map();
  function writeSoon(key, fn, now) {
    let w = pending.get(key);
    if (!w) { w = { fn: null, t: null }; pending.set(key, w); }
    w.fn = fn;
    if (now) { clearTimeout(w.t); w.t = null; const f = w.fn; w.fn = null; f && f(); return; }
    if (!w.t) w.t = setTimeout(() => { w.t = null; const f = w.fn; w.fn = null; f && f(); }, 60);
  }

  // ---------- загрузка ----------
  async function need(list, token) {
    for (const [type, base] of list) {
      if (token !== undefined && token !== S.renderId) throw new Error('stale');
      await V.load(type, base);
    }
  }
  const val = (type, base, name) => {
    const p = typeof name === 'string' ? BLOCKS[type].byName[name] : name;
    return V.getValue(type, base, p);
  };

  // ---------- строки параметров ----------
  function isOnOff(f) { return f && f.t === 'enum' && f.items.length === 2 && f.items[0] === 'OFF' && f.items[1] === 'ON'; }

  /**
   * Строка параметра карты. opts: {label, note, link:[base…], onSet(v), compact}
   * link — дополнительные блоки того же типа (связь «голова + обод»).
   */
  function row(type, base, pname, opts) {
    opts = opts || {};
    const p = typeof pname === 'string' ? BLOCKS[type].byName[pname] : pname;
    if (!p) return h('div', { class: 'row muted' }, 'нет параметра ' + pname);
    const f = p.fmt;
    const valEl = h('span', { class: 'val' });
    const rawEl = V.settings.engineering ? h('span', { class: 'raw' }) : null;
    let control, set;
    const write = (v) => {
      const bases = [base, ...((S.hr && opts.link) || [])];
      for (const b of bases) V.setValue(type, b, p, v);
      if (opts.onSet) opts.onSet(v);
    };
    const lo = p.min === null ? 0 : p.min;
    const hi = p.max === null ? null : p.max;
    if (f && f.t === 'enum' && isOnOff(f)) {
      control = h('button', { class: 'toggle', 'aria-label': p.name, role: 'switch' });
      control.addEventListener('click', () => {
        const cur = val(type, base, p);
        write(cur ? 0 : 1);
      });
      set = (v) => { control.classList.toggle('on', !!v); control.setAttribute('aria-checked', v ? 'true' : 'false'); };
    } else if (f && f.t === 'enum' && f.items.length <= 4 && f.items.join('').length <= 32 && !opts.select) {
      control = h('div', { class: 'seg', role: 'group' });
      f.items.forEach((it, i) => control.append(h('button', { onclick: () => write(lo + i) }, it)));
      set = (v) => [...control.children].forEach((b, i) => b.classList.toggle('on', i === v - lo));
    } else if (f && f.t === 'enum') {
      control = h('select', { 'aria-label': p.name });
      f.items.forEach((it, i) => control.append(h('option', { value: lo + i }, it)));
      control.addEventListener('change', () => write(+control.value));
      set = (v) => { control.value = v; };
    } else if (hi === null || hi - lo > 20000) {
      control = h('input', { type: 'number', inputmode: 'numeric', 'aria-label': p.name });
      control.addEventListener('change', () => write(+control.value));
      set = (v) => { if (document.activeElement !== control) control.value = v; };
    } else {
      const r = h('input', { type: 'range', min: lo, max: hi, step: 1, 'aria-label': p.name });
      r.addEventListener('input', () => { valEl.textContent = V.format(p, +r.value); writeSoon(base + ':' + p.off, () => write(+r.value)); });
      r.addEventListener('change', () => writeSoon(base + ':' + p.off, () => write(+r.value), true));
      const step = (d) => {
        const cur = val(type, base, p);
        if (cur === null) return;
        const big = hi - lo > 200 ? 10 : 1;
        write(Math.max(lo, Math.min(hi, cur + d * big)));
      };
      control = h('div', { class: 'stepper' }, h('button', { onclick: () => step(-1), 'aria-label': 'меньше' }, '−'), r, h('button', { onclick: () => step(1), 'aria-label': 'больше' }, '+'));
      set = (v) => { if (document.activeElement !== r) r.value = v; };
    }
    const label = h('div', { class: 'lbl' }, opts.label || p.name, opts.note ? h('small', null, opts.note) : null, rawEl);
    const el = h('div', { class: 'row' }, label, control, valEl);
    const update = () => {
      const v = val(type, base, p);
      if (v === null) { valEl.textContent = '…'; return; }
      valEl.textContent = V.format(p, v);
      if (rawEl) rawEl.textContent = V.addrHex(base + p.off) + ' · ' + v;
      set(v);
    };
    binds.push({ base, off: p.off, bytes: p.bytes, update });
    update();
    return el;
  }

  /** Строка обобщённого параметра (V-EDIT, FX, Room, Reverb, Comp Parameter N) с подписью из Data List. */
  function typedRow(type, base, p, name, hint, opts) {
    opts = opts || {};
    const spec = V.parseHint(hint);
    const range = V.hintRange(spec);
    const valEl = h('span', { class: 'val' });
    const rawEl = V.settings.engineering ? h('span', { class: 'raw' }) : null;
    const write = (v) => {
      const bases = [base, ...((S.hr && opts.link) || [])];
      for (const b of bases) V.setValue(type, b, p, v);
    };
    let control, set;
    if (spec && spec.kind === 'enum' && spec.items.length === 2 && spec.items[0] === 'OFF' && spec.items[1] === 'ON') {
      control = h('button', { class: 'toggle', role: 'switch', 'aria-label': name, onclick: () => write(val(type, base, p) ? 0 : 1) });
      set = (v) => control.classList.toggle('on', !!v);
    } else if (spec && spec.kind === 'enum') {
      control = h('select', { 'aria-label': name });
      spec.items.forEach((it, i) => control.append(h('option', { value: i }, it)));
      control.addEventListener('change', () => write(+control.value));
      set = (v) => {
        if (v < 0 || v >= spec.items.length) {
          if (!control.querySelector(`option[value="${v}"]`)) control.append(h('option', { value: v }, '#' + v));
        }
        control.value = v;
      };
    } else if (range) {
      const [lo, hi] = range;
      const r = h('input', { type: 'range', min: lo, max: hi, step: 1, 'aria-label': name });
      r.addEventListener('input', () => { valEl.textContent = V.hintFormat(spec, +r.value); writeSoon(base + ':' + p.off, () => write(+r.value)); });
      r.addEventListener('change', () => writeSoon(base + ':' + p.off, () => write(+r.value), true));
      const step = (d) => { const c = val(type, base, p); if (c !== null) write(Math.max(lo, Math.min(hi, c + d))); };
      control = h('div', { class: 'stepper' }, h('button', { onclick: () => step(-1), 'aria-label': 'меньше' }, '−'), r, h('button', { onclick: () => step(1), 'aria-label': 'больше' }, '+'));
      set = (v) => { if (document.activeElement !== r) r.value = v; };
    } else {
      control = h('input', { type: 'number', inputmode: 'numeric', 'aria-label': name, min: -20000, max: 20000 });
      control.addEventListener('change', () => write(+control.value));
      set = (v) => { if (document.activeElement !== control) control.value = v; };
    }
    const el = h('div', { class: 'row' + (spec ? '' : ' unknown') },
      h('div', { class: 'lbl' }, name, hint && !spec ? h('small', null, hint) : null, rawEl), control, valEl);
    const update = () => {
      const v = val(type, base, p);
      if (v === null) { valEl.textContent = '…'; return; }
      valEl.textContent = spec ? V.hintFormat(spec, v) : String(v);
      if (rawEl) rawEl.textContent = p.name + ' · ' + V.addrHex(base + p.off) + ' · ' + v;
      set(v);
    };
    binds.push({ base, off: p.off, bytes: p.bytes, update });
    update();
    return el;
  }

  /** Обобщённые параметры блока («<prefix> 1…N») по таблице [[имя, подпись]…]. */
  function typedList(type, base, prefix, table, opts) {
    const box = h('div');
    const params = BLOCKS[type].params.filter((p) => p.name.startsWith(prefix + ' ')).sort((a, b) => a.off - b.off);
    const n = V.settings.engineering ? params.length : Math.min(params.length, (table || []).length);
    for (let i = 0; i < n; i++) {
      const t = (table || [])[i];
      box.append(typedRow(type, base, params[i], t ? t[0] : `${prefix} ${i + 1}`, t ? t[1] : '', opts));
    }
    if (!n) box.append(h('div', { class: 'muted small', style: 'padding:10px 0' }, 'У этого типа нет параметров.'));
    return box;
  }

  /** Текстовое поле из последовательности параметров «<prefix> 1…N». */
  function textRow(type, base, prefix, label, opts) {
    const params = BLOCKS[type].params.filter((p) => new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\d+$').test(p.name)).sort((a, b) => a.off - b.off);
    const inp = h('input', { type: 'text', maxlength: params.length, autocomplete: 'off', spellcheck: 'false', 'aria-label': label });
    const read = () => params.map((p) => { const v = val(type, base, p); return v === null ? '' : String.fromCharCode(v >= 32 && v < 127 ? v : 32); }).join('').replace(/\s+$/, '');
    inp.addEventListener('change', () => {
      V.setText(type, base, params, inp.value.replace(/[^\x20-\x7E]/g, '?').slice(0, params.length));
      if (opts && opts.onSet) opts.onSet(inp.value);
    });
    const update = () => { if (document.activeElement !== inp) inp.value = read(); };
    binds.push({ base, off: params[0].off, bytes: params[params.length - 1].off + params[params.length - 1].bytes - params[0].off, update });
    update();
    return h('div', { class: 'row wide' }, h('div', { class: 'lbl' }, label, h('small', null, `до ${params.length} символов, латиница`)), inp);
  }

  /** Все параметры блока, сгруппированные по смыслу. skip — регулярное выражение имён, которые не показывать. */
  const GROUPS = [/^Pre Transient/, /^Pre EQ/, /^Pre Comp/, /^Post Comp/, /^Post EQ/, /^Filter \d-A/, /^Filter \d-B/, /^Strainer Lever/, /^Bus-[A-D]/, /^Pad EQ/, /^Layer EQ/, /^Transient/, /^Velocity/, /^Side /, /^OutEQ/, /^HI-HAT/, /XTalk Cancel$/];
  const GROUP_RU = { 'Pre Transient': 'Транзиент на входе', 'Pre EQ': 'EQ на входе', 'Pre Comp': 'Компрессор на входе', 'Post Comp': 'Компрессор на выходе', 'Post EQ': 'EQ на выходе', 'Filter 1-A': 'Фильтры A', 'Filter 1-B': 'Фильтры B', 'Side ': 'Side (Mid/Side)' };
  function blockEditor(type, base, opts) {
    opts = opts || {};
    const box = h('div');
    let lastGroup = null;
    for (const p of BLOCKS[type].params) {
      if (/reserved/i.test(p.name) || !p.name) continue;
      if (opts.skip && opts.skip.test(p.name)) continue;
      if (opts.only && !opts.only.test(p.name)) continue;
      if (/ Name \d+$|Name \d+$/.test(p.name)) continue;
      if (/Parameter \d+$/.test(p.name)) continue;
      const g = GROUPS.find((re) => re.test(p.name));
      const gname = g ? (p.name.match(g) || [''])[0] : null;
      if (gname !== lastGroup) {
        lastGroup = gname;
        if (gname) box.append(h('div', { class: 'grp' }, GROUP_RU[gname] || gname.replace(/^\/|\/$/g, '')));
      }
      box.append(row(type, base, p, { link: opts.link && opts.link(p) }));
    }
    return box;
  }

  function section(title, body, opts) {
    opts = opts || {};
    const s = h('section', { class: 'section' + (opts.fold ? ' fold' : '') + (opts.closed ? ' closed' : '') });
    const head = h('div', { class: 'sh' }, h('h2', { class: 'grow' }, title), opts.tools || null);
    const sb = h('div', { class: 'sb' });
    s.append(head, sb);
    let built = false;
    const build = async () => {
      if (built) return;
      built = true;
      if (typeof body === 'function') {
        sb.append(h('div', { class: 'muted small', style: 'padding:10px 0' }, 'Читаю из модуля…'));
        try {
          const content = await body();
          sb.replaceChildren(content);
        } catch (e) {
          if (e.message === 'stale') return;
          sb.replaceChildren(h('div', { class: 'note warn' }, 'Не удалось прочитать: ' + e.message + '. ', h('button', { class: 'btn', onclick: () => { built = false; build(); } }, 'Повторить')));
        }
      } else sb.append(body);
    };
    if (opts.fold) {
      head.addEventListener('click', (e) => {
        if (e.target.closest('button,select,input')) return;
        s.classList.toggle('closed');
        if (!s.classList.contains('closed')) build();
      });
      if (!opts.closed) build();
    } else build();
    return s;
  }

  // ---------- инструменты ----------
  const GROUPS_INST = [];
  D.inst.forEach(([g], i) => { if (!GROUPS_INST.includes(g)) GROUPS_INST.push(g); });
  function instName(bank, n) {
    if (bank === 0 && D.inst[n]) return D.inst[n][1];
    if (bank === null || n === null) return '…';
    return `Банк ${bank} · №${n}`;
  }
  function instGroup(bank, n) { return bank === 0 && D.inst[n] ? D.inst[n][0] : null; }

  function instPicker(base, opts) {
    const P = BLOCKS.KitUnitLayer.byName;
    const name = h('div', { class: 'iname' });
    const gsel = h('select', { 'aria-label': 'Группа инструментов' });
    GROUPS_INST.forEach((g) => gsel.append(h('option', { value: g }, g)));
    const nsel = h('select', { 'aria-label': 'Инструмент' });
    const bankIn = h('input', { type: 'number', min: 0, 'aria-label': 'Банк', style: 'width:90px' });
    const numIn = h('input', { type: 'number', min: 0, 'aria-label': 'Номер', style: 'width:110px' });
    const other = h('div', { class: 'btns' }, h('span', { class: 'muted small' }, 'Банк'), bankIn, h('span', { class: 'muted small' }, 'Номер'), numIn);
    const write = (bank, n) => {
      V.setValue('KitUnitLayer', base, P['Inst Bank'], bank === null ? 0 : bank);
      V.setValue('KitUnitLayer', base, P.Instrument, n);
      // Голова+обод: ободу/краю/куполу — парный инструмент («… S» → «… SR», «… Rd» → «… RdE», «… RdB»)
      if (S.hr && opts && opts.pair && bank === 0 && D.inst[n]) {
        const head = D.inst[n][1];
        for (const { base: b, role } of opts.pair) {
          let found = null;
          for (let i = n + 1; i <= n + 3 && i < D.inst.length; i++) {
            const nm = D.inst[i][1];
            if (!nm.startsWith(head) || nm.length !== head.length + 1) continue;
            const suf = nm.slice(-1);
            if ((role === 'BELL' && suf === 'B') || (role !== 'BELL' && suf !== 'B')) { found = i; break; }
          }
          if (found !== null) {
            V.setValue('KitUnitLayer', b, P['Inst Bank'], 0);
            V.setValue('KitUnitLayer', b, P.Instrument, found);
          }
        }
      }
      if (opts && opts.onSet) setTimeout(opts.onSet, 50);
    };
    const fillNames = (g, cur) => {
      nsel.replaceChildren();
      D.inst.forEach(([gg, nm], i) => { if (gg === g) nsel.append(h('option', { value: i }, nm)); });
      if (cur !== undefined) nsel.value = cur;
    };
    gsel.addEventListener('change', () => { fillNames(gsel.value); write(0, +nsel.value); });
    nsel.addEventListener('change', () => write(0, +nsel.value));
    bankIn.addEventListener('change', () => write(+bankIn.value, +numIn.value));
    numIn.addEventListener('change', () => write(+bankIn.value, +numIn.value));
    const update = () => {
      const bank = val('KitUnitLayer', base, 'Inst Bank');
      const n = val('KitUnitLayer', base, 'Instrument');
      name.textContent = instName(bank, n);
      bankIn.value = bank === null ? '' : bank;
      numIn.value = n === null ? '' : n;
      const g = instGroup(bank, n);
      if (g) {
        gsel.value = g;
        fillNames(g, n);
      }
      gsel.disabled = nsel.disabled = !g && bank !== 0;
      other.classList.toggle('hide', bank === 0 && !V.settings.engineering);
    };
    binds.push({ base, off: P.Instrument.off, bytes: P['Inst Bank'].off + P['Inst Bank'].bytes - P.Instrument.off, update });
    update();
    return h('div', { class: 'inst' }, name, gsel, nsel, other);
  }

  // ---------- шапка ----------
  const KIT_COLORS = ['#ededed', '#e5484d', '#3dbe6e', '#3e7bfa', '#4cc3e8', '#f178b6', '#9b6cf0', '#f08a24', '#f2cf3a', '#1fb89a'];
  function kitNameOf(k) {
    const n = S.names[k];
    if (n) return n;
    const d = D.kits[k - 1];
    return d ? [d[0], d[1], null] : ['', '', null];
  }
  function applyAccent(color) {
    const c = color || '#c9a24a';
    document.documentElement.style.setProperty('--accent', c);
    // тёмный или светлый текст на акценте
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    document.documentElement.style.setProperty('--accent-ink', (r * 0.3 + g * 0.59 + b * 0.11) > 140 ? '#15130e' : '#ffffff');
  }
  function readKitHeader() {
    const base = ADDR.kitCommon(S.kit);
    const e = V.mem.get(base);
    if (!e || !e.loaded) return;
    const P = BLOCKS.KitCommon.params;
    const txt = (re) => P.filter((p) => re.test(p.name)).map((p) => String.fromCharCode(Math.max(32, val('KitCommon', base, p) || 32))).join('').trim();
    const name = txt(/^Kit Name \d+$/), sub = txt(/^Kit Sub Name \d+$/);
    const ci = val('KitCommon', base, 'Kit Color');
    let color = KIT_COLORS[ci] || null;
    if (ci === 10) {
      const hx = (v) => ('0' + Math.max(0, Math.min(255, v || 0)).toString(16)).slice(-2);
      color = '#' + hx(val('KitCommon', base, 'Red')) + hx(val('KitCommon', base, 'Green')) + hx(val('KitCommon', base, 'Blue'));
    }
    S.names[S.kit] = [name, sub, color];
    store.set('kitnames', S.names);
  }
  function updateHeader() {
    readKitHeader();
    const [name, sub, color] = kitNameOf(S.kit);
    $('#knum').textContent = String(S.kit).padStart(3, '0');
    $('#kname').textContent = name || '—';
    $('#ksub').textContent = sub || '';
    applyAccent(color);
  }
  function setConnState() {
    const c = $('#conn');
    const on = V.Link.connected;
    c.classList.toggle('on', on);
    c.querySelector('.ct').textContent = on ? (V.Link.name || 'Подключено') : 'Не подключено';
    c.title = on ? V.Link.kind : '';
    $('#undo').disabled = !on;
    $('#reload').disabled = !on;
  }

  // ---------- выбор кита ----------
  async function readCurrent() {
    const e = await V.load('Current', ADDR.current, true);
    const k = V.decode(BLOCKS.Current.params[0], e.bytes) + 1;
    if (k >= 1 && k <= 200) S.kit = k;
    await V.load('KitCommon', ADDR.kitCommon(S.kit));
    updateHeader();
  }
  async function selectKit(k) {
    if (k < 1) k = 200;
    if (k > 200) k = 1;
    S.kit = k;
    if (V.Link.connected) {
      V.setValue('Current', ADDR.current, BLOCKS.Current.params[0], k - 1);
      try { await V.load('KitCommon', ADDR.kitCommon(k)); } catch (e) { /* покажется при отрисовке */ }
    }
    updateHeader();
    render();
  }
  function kitChanged() {
    // Модуль переключил кит сам — перечитать текущий.
    clearTimeout(kitChanged.t);
    kitChanged.t = setTimeout(async () => {
      const old = S.kit;
      try { await readCurrent(); } catch (e) { return; }
      if (S.kit !== old) render();
    }, 150);
  }

  /** Сбросить кэш кита (после копирования, загрузки из файла). */
  function forgetKit(k) {
    for (const b of V.kitBlocks(k)) V.mem.delete(b.base);
  }

  async function undoKit() {
    let n = 0;
    const lo = ADDR.kit(S.kit), hi = ADDR.kit(S.kit) + V.A4(0, 4, 0, 0);
    for (const [base, e] of V.mem) {
      if (base < lo || base >= hi || !e.loaded || !e.orig) continue;
      let diff = false;
      for (let i = 0; i < e.orig.length; i++) if (e.orig[i] !== e.bytes[i]) { diff = true; break; }
      if (!diff) continue;
      V.Link.write(base, Array.from(e.orig), 'Отмена: ' + V.describe(base).text);
      n++;
    }
    toast(n ? `Вернул исходные значения: ${n} блок(ов)` : 'В этом ките ничего не менялось');
  }

  // ---------- навигация ----------
  const TABS = [
    ['kits', 'Киты'], ['pads', 'Пэды'], ['mixer', 'Микшер'], ['fx', 'Эффекты'], ['amb', 'Эмбиенс'],
    ['kit', 'Настройки кита'], ['trig', 'Триггеры'], ['set', 'Сет-листы'], ['sys', 'Система'], ['mon', 'Монитор'],
  ];
  function buildNav() {
    const nav = $('#rail');
    nav.replaceChildren(...TABS.map(([id, label]) => h('button', { 'data-tab': id, class: S.tab === id ? 'on' : '', onclick: () => { S.tab = id; store.set('tab', id); render(); } }, label)));
  }

  function render() {
    S.renderId++;
    binds = [];
    buildNav();
    const view = $('#view');
    view.replaceChildren();
    if (render.lastTab !== S.tab) { view.scrollTop = 0; render.lastTab = S.tab; }
    if (!V.Link.connected && !['sys', 'mon'].includes(S.tab)) {
      view.append(h('h1', { class: 'view' }, 'Модуль не подключён'),
        h('p', { class: 'muted' }, 'Подключитесь к V31 по Bluetooth или кабелем USB. Можно включить демо — тогда пульт работает с виртуальным модулем.'),
        h('button', { class: 'btn primary', onclick: showConnect }, 'Подключить'));
      return;
    }
    const views = { kits: viewKits, pads: viewPads, mixer: viewMixer, fx: viewFx, amb: viewAmb, kit: viewKit, trig: viewTrig, set: viewSet, sys: viewSys, mon: viewMon };
    (views[S.tab] || viewPads)(view);
  }

  // =====================================================================
  // Киты
  // =====================================================================
  function viewKits(view) {
    view.append(h('h1', { class: 'view' }, 'Киты'));
    const grid = h('div', { class: 'kits' });
    const draw = () => {
      grid.replaceChildren();
      for (let k = 1; k <= 200; k++) {
        const [n, sub, color] = kitNameOf(k);
        grid.append(h('button', { class: 'kit' + (k === S.kit ? ' on' : ''), onclick: () => selectKit(k) },
          h('b', null, String(k).padStart(3, '0')),
          h('span', null, color ? h('i', { class: 'sw', style: 'background:' + color }) : null, n || '—'),
          sub ? h('small', null, sub) : null));
      }
    };
    const prog = h('div', { class: 'progress hide' }, h('i'));
    const readNames = async () => {
      prog.classList.remove('hide');
      const token = S.renderId;
      const P = BLOCKS.KitCommon.params.filter((p) => /^Kit (Sub )?Name \d+$/.test(p.name));
      for (let k = 1; k <= 200; k++) {
        if (token !== S.renderId || !V.Link.connected) return;
        try {
          const data = await V.Link.request(ADDR.kitCommon(k), 0x50, `Имя кита ${k}`);
          const txt = (re) => P.filter((p) => re.test(p.name)).map((p) => String.fromCharCode(Math.max(32, data[p.off] || 32))).join('').trim();
          const prev = S.names[k] || [];
          S.names[k] = [txt(/^Kit Name/), txt(/^Kit Sub Name/), prev[2] || null];
        } catch (e) { break; }
        prog.firstChild.style.width = (k / 2) + '%';
        if (k % 10 === 0) { store.set('kitnames', S.names); draw(); }
      }
      store.set('kitnames', S.names);
      draw();
      prog.classList.add('hide');
    };
    view.append(h('div', { class: 'btns', style: 'margin-bottom:10px' },
      h('button', { class: 'btn', onclick: readNames }, 'Прочитать имена всех китов'),
      h('span', { class: 'muted small' }, 'Около полуминуты по Bluetooth. Имена запоминаются.')), prog);
    view.append(grid);
    draw();
    view.append(h('div', { style: 'height:16px' }));
    view.append(section('Копия, резервная копия, восстановление', () => kitTools(), { fold: true }));
  }

  async function readKitData(k, onProgress) {
    const blocks = V.kitBlocks(k);
    const out = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const data = await V.Link.request(b.base, BLOCKS[b.type].size, `Чтение кита ${k}: ${b.label}`);
      out.push([b.base - ADDR.kit(k), Array.from(data).map(V.hex2).join('')]);
      if (onProgress) onProgress((i + 1) / blocks.length);
    }
    return out;
  }
  async function writeKitData(k, blocks, onProgress) {
    for (let i = 0; i < blocks.length; i++) {
      const [rel, hex] = blocks[i];
      const bytes = hex.match(/../g).map((x) => parseInt(x, 16));
      V.Link.write(ADDR.kit(k) + rel, bytes, `Запись кита ${k}: ${V.describe(ADDR.kit(k) + rel).text}`);
      if (onProgress) onProgress((i + 1) / blocks.length);
      // даём очереди отправки разгрузиться
      while (V.Link.sendQ.length > 6) await new Promise((r) => setTimeout(r, 20));
    }
    while (V.Link.sendQ.length) await new Promise((r) => setTimeout(r, 20));
    forgetKit(k);
  }

  function kitTools() {
    const box = h('div');
    const prog = h('div', { class: 'progress hide' }, h('i'));
    const setP = (x) => { prog.classList.remove('hide'); prog.firstChild.style.width = Math.round(x * 100) + '%'; };
    const kitSel = (def) => {
      const s = h('select');
      for (let k = 1; k <= 200; k++) s.append(h('option', { value: k }, String(k).padStart(3, '0') + ' ' + (kitNameOf(k)[0] || '')));
      s.value = def;
      return s;
    };
    const from = kitSel(S.kit), to = kitSel(Math.min(200, Math.max(71, S.kit + 1)));
    let busy = false;
    const lock = async (fn) => {
      if (busy) return;
      busy = true;
      try { await fn(); } catch (e) { toast('Ошибка: ' + e.message, true); }
      busy = false;
      prog.classList.add('hide');
    };
    box.append(h('div', { class: 'row wide' }, h('div', { class: 'lbl' }, 'Копировать кит'), h('div', { class: 'btns' }, from, h('span', null, 'в'), to,
      h('button', { class: 'btn primary', onclick: () => lock(async () => {
        const a = +from.value, b = +to.value;
        if (a === b) return toast('Выберите разные киты');
        if (!confirm(`Кит ${b} «${kitNameOf(b)[0]}» будет заменён копией кита ${a}. Продолжить?`)) return;
        const data = await readKitData(a, (x) => setP(x / 2));
        await writeKitData(b, data, (x) => setP(0.5 + x / 2));
        delete S.names[b];
        toast(`Кит ${a} скопирован в ${b}`);
      }) }, 'Копировать'))));

    // библиотека резервных копий
    const lib = store.get('library', []);
    const libList = h('div');
    const drawLib = () => {
      libList.replaceChildren();
      const items = store.get('library', []);
      if (!items.length) libList.append(h('p', { class: 'muted small' }, 'Сохранённых китов пока нет.'));
      items.forEach((it, idx) => {
        const target = kitSel(S.kit);
        libList.append(h('div', { class: 'row wide' },
          h('div', { class: 'lbl' }, it.name || 'Без имени', h('small', null, `из кита ${it.kit} · ${new Date(it.date).toLocaleString()}`)),
          h('div', { class: 'btns' }, target,
            h('button', { class: 'btn', onclick: () => lock(async () => {
              const k = +target.value;
              if (!confirm(`Записать «${it.name}» в кит ${k}? Текущие настройки кита ${k} будут заменены.`)) return;
              await writeKitData(k, it.blocks, setP);
              delete S.names[k];
              toast(`Записано в кит ${k}`);
              if (k === S.kit) { await V.load('KitCommon', ADDR.kitCommon(k), true); updateHeader(); }
            }) }, 'Записать в модуль'),
            h('button', { class: 'btn', onclick: () => exportFile(`V31-${(it.name || 'kit').replace(/[^\w-]+/g, '_')}.v31kit.json`, JSON.stringify({ format: 'v31-kit', version: 1, ...it })) }, 'Экспорт'),
            h('button', { class: 'btn danger', onclick: () => { if (!confirm('Удалить копию «' + it.name + '»?')) return; const a = store.get('library', []); a.splice(idx, 1); store.set('library', a); drawLib(); } }, 'Удалить'))));
      });
    };
    void lib;
    const backupSel = kitSel(S.kit);
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', class: 'hide' });
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0];
      if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.format !== 'v31-kit' || !Array.isArray(j.blocks)) throw new Error('это не файл кита V31 Пульта');
        const a = store.get('library', []);
        a.unshift({ name: j.name, kit: j.kit, date: j.date || Date.now(), blocks: j.blocks });
        store.set('library', a);
        drawLib();
        toast('Файл добавлен в сохранённые киты');
      } catch (e) { toast('Не удалось открыть файл: ' + e.message, true); }
      fileIn.value = '';
    });
    box.append(h('div', { class: 'row wide' }, h('div', { class: 'lbl' }, 'Сохранить кит в планшет'),
      h('div', { class: 'btns' }, backupSel, h('button', { class: 'btn primary', onclick: () => lock(async () => {
        const k = +backupSel.value;
        const blocks = await readKitData(k, setP);
        const a = store.get('library', []);
        a.unshift({ name: kitNameOf(k)[0] || `Кит ${k}`, kit: k, date: Date.now(), blocks });
        store.set('library', a);
        drawLib();
        toast(`Кит ${k} сохранён`);
      }) }, 'Сохранить'), h('button', { class: 'btn', onclick: () => fileIn.click() }, 'Открыть файл…'), fileIn)));
    box.append(prog, h('div', { class: 'grp' }, 'Сохранённые киты'), libList);
    drawLib();
    return box;
  }

  function exportFile(name, text) {
    if (window.V31Native && window.V31Native.share) return window.V31Native.share(name, text);
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.v31) {
      return window.webkit.messageHandlers.v31.postMessage({ cmd: 'share', name, text });
    }
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
    document.body.append(a);
    a.click();
    a.remove();
  }

  // =====================================================================
  // Пэды
  // =====================================================================
  const PAD_LAYOUT = [8, 3, 4, 9, 10, 7, 2, 5, 6, 11, 12, 13, 14, 1];
  const CYM = new Set([7, 8, 9, 10]);
  const padEls = {};

  function viewPads(view) {
    const k = S.kit;
    const pad = PADS[S.pad - 1];
    const zones = pad.zones;
    if (S.zoneIdx >= zones.length) S.zoneIdx = 0;
    const z = zones[S.zoneIdx];
    const sib = (zz) => zones.filter((x) => x !== zz);

    // карта пэдов
    const map = h('div', { class: 'padmap' });
    for (const id of PAD_LAYOUT) {
      const p = PADS[id - 1];
      const instEl = h('span', { class: 'pi' }, '');
      const b = h('button', { class: 'pad' + (id === S.pad ? ' on' : '') + (CYM.has(id) ? ' cym' : '') + (id === 1 ? ' kick' : ''), onclick: () => { S.pad = id; S.zoneIdx = 0; S.xstick = false; render(); } },
        h('span', { class: 'pn' }, p.ru), instEl, h('i', { class: 'hit' }));
      padEls[id] = b;
      map.append(b);
      const base = ADDR.layer(k, 0, p.zones[0]);
      const upd = () => { const bank = val('KitUnitLayer', base, 'Inst Bank'), n = val('KitUnitLayer', base, 'Instrument'); instEl.textContent = n === null ? '' : instName(bank, n); };
      binds.push({ base, off: BLOCKS.KitUnitLayer.byName.Instrument.off, bytes: 8, update: upd });
      upd();
    }
    view.append(map);
    // имена инструментов на пэдах подгружаются фоном
    (async () => {
      const token = S.renderId;
      for (const id of PAD_LAYOUT) {
        try { await need([['KitUnitLayer', ADDR.layer(k, 0, PADS[id - 1].zones[0])]], token); } catch (e) { return; }
      }
    })();

    // зоны
    const zlabel = (zz) => ({ HEAD: 'Голова', RIM: 'Обод', EDGE: 'Край', BELL: 'Купол' }[ZONES[zz - 1].split(' ').pop()] || 'Пэд');
    const zseg = h('div', { class: 'seg' });
    zones.forEach((zz, i) => zseg.append(h('button', { class: !S.xstick && i === S.zoneIdx ? 'on' : '', onclick: () => { S.zoneIdx = i; S.xstick = false; render(); } }, zones.length > 1 ? zlabel(zz) : 'Пэд')));
    if (pad.xstick) zseg.append(h('button', { class: S.xstick ? 'on' : '', onclick: () => { S.xstick = true; render(); } }, 'Кросс-стик'));
    const hrBtn = h('button', { class: 'btn' + (S.hr ? ' primary' : ''), onclick: () => { S.hr = !S.hr; store.set('hr', S.hr); render(); }, title: 'Менять голову и обод вместе' }, S.hr ? 'Голова+обод: вместе' : 'Голова+обод: раздельно');
    const play = h('button', { class: 'btn', onclick: () => playZone(z) }, '▶ Прослушать');
    view.append(h('div', { class: 'btns', style: 'margin-bottom:12px' }, h('h1', { class: 'view', style: 'margin:0 8px 0 0' }, pad.ru), zseg, zones.length > 1 ? hrBtn : null, h('span', { class: 'spacer' }), play));

    if (S.xstick) {
      const xb = ADDR.xstick(k);
      view.append(section('Кросс-стик (XSTICK)', async () => {
        await need([['KitUnitLayer', xb], ['KitCommon', ADDR.kitCommon(k)]]);
        return h('div', null,
          row('KitCommon', ADDR.kitCommon(k), 'Analog XStick', { label: 'Кросс-стик (аналоговый пэд)' }),
          layerCard(xb, 'XStick', null, true));
      }));
      return;
    }

    // слои
    const layersBox = h('div', { class: 'layers' });
    view.append(section('Инструменты', async () => {
      await need([0, 1, 2].map((L) => ['KitUnitLayer', ADDR.layer(k, L, z)]), S.renderId);
      await need([['KitUnitCommon', ADDR.unit(k, z)]], S.renderId);
      for (let L = 0; L < 3; L++) {
        const pair = S.zoneIdx === 0 ? sib(z).map((zz) => ({ base: ADDR.layer(k, L, zz), role: ZONES[zz - 1].split(' ').pop() })) : null;
        layersBox.append(layerCard(ADDR.layer(k, L, z), 'Слой ' + 'ABC'[L], sib(z).map((zz) => ADDR.layer(k, L, zz)), false, pair));
      }
      const lm = row('KitUnitCommon', ADDR.unit(k, z), 'Layer Mode', { label: 'Как звучат слои', link: sib(z).map((zz) => ADDR.unit(k, zz)) });
      return h('div', null, lm, layersBox);
    }));

    // подробности слоёв
    for (let L = 0; L < 3; L++) {
      const base = ADDR.layer(k, L, z);
      const link = sib(z).map((zz) => ADDR.layer(k, L, zz));
      view.append(section(`Слой ${'ABC'[L]}: транзиент, EQ, динамика, V-EDIT`, async () => {
        await need([['KitUnitLayer', base]], S.renderId);
        return layerDetails(base, link, `${k}:${L}:${z}`);
      }, { fold: true, closed: true }));
    }

    // зона
    const ub = ADDR.unit(k, z);
    const ulink = sib(z).map((zz) => ADDR.unit(k, zz));
    view.append(h('div', { class: 'cols' },
      section('Громкость и посылы', async () => {
        await need([['KitUnitCommon', ub]], S.renderId);
        return blockEditor('KitUnitCommon', ub, { only: /^(Volume|Minimum Volume|Overhead Send|Room Send|Reverb Send|Kit Resonance Send|Mute Group|Position|Pedal Bend|Output Routing|Bus Send Level|Snare Buzz Sens|Buzz Muffling)/, link: () => ulink });
      }),
      section('EQ пэда', async () => {
        await need([['KitUnitCommon', ub]], S.renderId);
        return blockEditor('KitUnitCommon', ub, { only: /^Pad EQ/, link: () => ulink });
      })));
    const pb = ADDR.pad(k, S.pad);
    view.append(section('Панорама и компрессор пэда', async () => {
      await need([['KitPad', pb]], S.renderId);
      return padCompEditor(pb);
    }, { fold: true }));
  }

  function layerCard(base, title, link, xstick, pair) {
    const card = h('div', { class: 'layer' });
    const P = BLOCKS.KitUnitLayer.byName;
    const sw = row('KitUnitLayer', base, 'Inst Switch', { label: 'Слой включён', link });
    const updOff = () => card.classList.toggle('off', !val('KitUnitLayer', base, 'Inst Switch'));
    binds.push({ base, off: P['Inst Switch'].off, bytes: 1, update: updOff });
    card.append(h('div', { class: 'lh' }, h('h2', null, title)), sw,
      instPicker(base, { pair }),
      row('KitUnitLayer', base, 'Volume', { link }),
      row('KitUnitLayer', base, 'Inst Pitch', { label: 'Pitch', note: 'в центах', link }),
      xstick ? null : row('KitUnitLayer', base, 'Inst Decay', { label: 'Decay', link }));
    updOff();
    return card;
  }

  function layerDetails(base, link, key) {
    const box = h('div');
    box.append(h('div', { class: 'grp' }, 'Транзиент'));
    for (const n of ['Transient Switch', 'Transient Attack Time', 'Transient Attack Depth', 'Transient Attack Type', 'Transient Release Depth', 'Transient Gain', 'User Sample Transient Type']) box.append(row('KitUnitLayer', base, n, { link }));
    box.append(h('div', { class: 'grp' }, 'Звук'));
    for (const n of ['Inst Pitch Sweep', 'Dynamic Enhancer']) box.append(row('KitUnitLayer', base, n, { link }));
    box.append(h('div', { class: 'grp' }, 'EQ слоя'));
    for (const p of BLOCKS.KitUnitLayer.params.filter((q) => /^Layer EQ/.test(q.name))) box.append(row('KitUnitLayer', base, p, { link }));
    box.append(h('div', { class: 'grp' }, 'Слои по силе удара (Layer Mode = VELOCITY)'));
    for (const n of ['Velocity Lower', 'Velocity Upper', 'Velocity Fade In Sens', 'Velocity Fade Out Sens', 'Dynamics', 'Threshold']) box.append(row('KitUnitLayer', base, n, { link }));
    // V-EDIT
    const bank = val('KitUnitLayer', base, 'Inst Bank');
    const inst = val('KitUnitLayer', base, 'Instrument');
    const auto = T.veditForGroup(instGroup(bank, inst));
    const chosen = S.vedit[key] || auto || 'OTHER';
    const vbox = h('div');
    const tsel = h('select', { 'aria-label': 'Таблица V-EDIT' });
    for (const t in T.VEDIT) tsel.append(h('option', { value: t }, T.VEDIT_NAMES[t] + (t === auto ? ' (по инструменту)' : '')));
    tsel.value = chosen;
    tsel.addEventListener('change', () => { S.vedit[key] = tsel.value; drawV(); });
    const drawV = () => {
      binds = binds.filter((b) => !b.vedit || b.vedit !== key);
      vbox.replaceChildren(typedList('KitUnitLayer', base, 'V-EDIT Parameter', T.VEDIT[tsel.value], { link }));
    };
    box.append(h('div', { class: 'grp' }, 'V-EDIT'), h('div', { class: 'row wide' }, h('div', { class: 'lbl' }, 'Параметры для', h('small', null, 'определяется по группе инструмента')), tsel), vbox);
    drawV();
    return box;
  }

  function padCompEditor(pb) {
    const box = h('div');
    box.append(row('KitPad', pb, 'Pan', { label: 'Панорама' }));
    box.append(h('div', { class: 'grp' }, 'Компрессор пэда'));
    const params = h('div');
    const draw = () => {
      const t = val('KitPad', pb, 'Pad Comp Type');
      params.replaceChildren(
        row('KitPad', pb, t ? 'Template (Type: FETCOMP-76)' : 'Template (Type: STANDARD)', { label: 'Шаблон', select: true, onSet: () => setTimeout(() => V.load('KitPad', pb, true), 200) }),
        typedList('KitPad', pb, 'Pad Comp Parameter', t ? T.COMP.PAD_FET : T.COMP.PAD_STANDARD));
    };
    box.append(row('KitPad', pb, 'Pad Comp Switch', { label: 'Включён' }),
      row('KitPad', pb, 'Pad Comp Type', { label: 'Тип', onSet: () => setTimeout(() => { draw(); V.load('KitPad', pb, true); }, 200) }),
      row('KitPad', pb, 'Pad Comp Output Volume', { label: 'Громкость на выходе' }), params);
    draw();
    box.append(h('div', { class: 'grp' }, 'Шины и сайдчейн'));
    for (const n of ['Bus Send Head/Rim', 'Output Routing', 'Bus Send Level', 'Pad Side Chain Control', 'Side Chain Control Send Level']) box.append(row('KitPad', pb, n));
    return box;
  }

  // прослушивание зоны: нота из KIT MIDI
  const NOTE_PARAM = {
    1: 'Note Kick', 2: 'Note Snare Head', 3: 'Note Snare Rim', 4: 'Note Tom1 Head', 5: 'Note Tom1 Rim', 6: 'Note Tom2 Head', 7: 'Note Tom2 Rim',
    8: 'Note Tom3 Head', 9: 'Note Tom3 Rim', 10: 'Note Tom4 Head', 11: 'Note Tom4 Rim', 12: 'Note Hi-Hat Close Head', 13: 'Note Hi-Hat Close Rim',
    14: 'Note Crash1 Head', 15: 'Note Crash1 Rim', 16: 'Note Crash2 Head', 17: 'Note Crash2 Rim', 18: 'Note Ride Head', 19: 'Note Ride Rim', 20: 'Note Ride Bell',
    21: 'Note Aux Head', 22: 'Note Aux Rim', 23: 'Note Aux2 Head', 24: 'Note Aux2 Rim', 25: 'Note Aux3 Head', 26: 'Note Aux3 Rim', 27: 'Note Aux4 Head', 28: 'Note Aux4 Rim',
  };
  const DEFAULT_NOTES = { 1: 36, 2: 38, 3: 40, 4: 48, 5: 50, 6: 45, 7: 47, 8: 43, 9: 58, 10: 41, 11: 39, 12: 42, 13: 22, 14: 49, 15: 55, 16: 57, 17: 52, 18: 51, 19: 59, 20: 53 };
  async function playZone(z) {
    let note = DEFAULT_NOTES[z] || 36;
    const mb = ADDR.kitMidi(S.kit);
    try {
      await V.load('KitMidi', mb);
      const n = val('KitMidi', mb, NOTE_PARAM[z]);
      if (n !== null && n < 128) note = n;
    } catch (e) { /* используем ноту по умолчанию */ }
    const ch = ((V.settings.globalCh || 10) - 1) & 15;
    V.Link.rawSend([0x90 | ch, note, 100], `Нота ${note}`);
    setTimeout(() => V.Link.rawSend([0x80 | ch, note, 64], false), 400);
  }

  // =====================================================================
  // Микшер
  // =====================================================================
  function fader(type, base, p, link, label) {
    const lo = -601, hi = p.max;
    // шкала: -60…+6 дБ линейно по дБ, ниже — −∞
    const el = h('div', { class: 'fader', role: 'slider', 'aria-label': label, tabindex: 0 });
    const fill = h('div', { class: 'fill' }), cap = h('div', { class: 'cap' });
    const zero = h('div', { class: 'zero' });
    el.append(zero, fill, cap);
    const H = 260 - 22;
    const toY = (v) => { const x = v <= lo ? 0 : (v + 600) / (hi + 600); return H - Math.max(0, Math.min(1, x)) * H; };
    const fromY = (y) => { const x = 1 - Math.max(0, Math.min(H, y)) / H; return x <= 0.003 ? lo : Math.round(x * (hi + 600) - 600); };
    zero.style.top = (toY(0) + 11) + 'px';
    const sv = h('div', { class: 'sv' });
    let cur = null, drag = false;
    const show = (v) => { cap.style.top = toY(v) + 'px'; fill.style.height = (H - toY(v)) + 'px'; sv.textContent = V.format(p, v); el.setAttribute('aria-valuetext', sv.textContent); };
    const write = (v) => { for (const b of [base, ...((S.hr && link) || [])]) V.setValue(type, b, p, v); };
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const v = fromY(e.clientY - r.top - 11);
      cur = v; show(v);
      writeSoon(base + ':' + p.off, () => write(v));
    };
    el.addEventListener('pointerdown', (e) => { drag = true; el.setPointerCapture(e.pointerId); move(e); });
    el.addEventListener('pointermove', (e) => { if (drag) move(e); });
    el.addEventListener('pointerup', () => { drag = false; if (cur !== null) writeSoon(base + ':' + p.off, () => write(cur), true); });
    el.addEventListener('dblclick', () => { cur = 0; show(0); write(0); });
    el.addEventListener('keydown', (e) => {
      const v = val(type, base, p); if (v === null) return;
      const d = e.key === 'ArrowUp' ? 10 : e.key === 'ArrowDown' ? -10 : 0;
      if (d) { e.preventDefault(); write(Math.max(lo, Math.min(hi, v + d))); }
    });
    const update = () => { if (drag) return; const v = val(type, base, p); if (v !== null) show(v); else sv.textContent = '…'; };
    binds.push({ base, off: p.off, bytes: p.bytes, update });
    update();
    return [el, sv];
  }

  function viewMixer(view) {
    const k = S.kit;
    view.append(h('div', { class: 'btns', style: 'margin-bottom:12px' }, h('h1', { class: 'view', style: 'margin:0' }, 'Микшер'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn' + (S.hr ? ' primary' : ''), onclick: () => { S.hr = !S.hr; store.set('hr', S.hr); render(); } }, S.hr ? 'Голова+обод: вместе' : 'Голова+обод: раздельно')));
    const mix = h('div', { class: 'mixer' });
    view.append(section('Громкость пэдов', async () => {
      const list = [['KitCommon', ADDR.kitCommon(k)]];
      for (const p of PADS) { list.push(['KitUnitCommon', ADDR.unit(k, p.zones[0])]); list.push(['KitPad', ADDR.pad(k, p.id)]); }
      await need(list, S.renderId);
      // остальные зоны — для связи голова+обод
      const rest = [];
      for (const p of PADS) for (const z of p.zones.slice(1)) rest.push(['KitUnitCommon', ADDR.unit(k, z)]);
      need(rest, S.renderId).catch(() => {});
      const PV = BLOCKS.KitUnitCommon.byName.Volume;
      const cb = ADDR.kitCommon(k);
      const [mf, msv] = fader('KitCommon', cb, BLOCKS.KitCommon.byName.Volume, null, 'Кит');
      const [hf, hsv] = fader('KitCommon', cb, BLOCKS.KitCommon.byName['Closed Pedal Volume'], null, 'Педаль хай-хэта');
      mix.append(h('div', { class: 'strip master' }, h('div', { class: 'sn' }, 'Кит'), msv, mf));
      for (const p of PADS) {
        const base = ADDR.unit(k, p.zones[0]);
        const [f, sv] = fader('KitUnitCommon', base, PV, p.zones.slice(1).map((z) => ADDR.unit(k, z)), p.ru);
        const pb = ADDR.pad(k, p.id);
        const pan = h('input', { type: 'range', class: 'pan', min: -30, max: 30, 'aria-label': 'Панорама ' + p.ru });
        const pp = BLOCKS.KitPad.byName.Pan;
        const pv = h('div', { class: 'sv' });
        pan.addEventListener('input', () => { pv.textContent = V.format(pp, +pan.value); writeSoon(pb + ':pan', () => V.setValue('KitPad', pb, pp, +pan.value)); });
        pan.addEventListener('dblclick', () => V.setValue('KitPad', pb, pp, 0));
        const upd = () => { const v = val('KitPad', pb, pp); if (v !== null) { if (document.activeElement !== pan) pan.value = v; pv.textContent = V.format(pp, v); } };
        binds.push({ base: pb, off: pp.off, bytes: pp.bytes, update: upd });
        upd();
        mix.append(h('div', { class: 'strip' }, h('div', { class: 'sn' }, p.ru), sv, f, pan, pv));
      }
      mix.append(h('div', { class: 'strip' }, h('div', { class: 'sn' }, 'Педаль х/х'), hsv, hf));
      return h('div', null, mix, h('p', { class: 'muted small' }, 'Двойное касание фейдера — 0 dB. Ручки громкости на самом модуле аппаратные и по MIDI не меняются.'));
    }));
    view.append(section('Посылы в эмбиенс', async () => {
      const list = PADS.map((p) => ['KitUnitCommon', ADDR.unit(k, p.zones[0])]);
      await need(list, S.renderId);
      const tbl = h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Пэд'), h('th', null, 'Overhead'), h('th', null, 'Room'), h('th', null, 'Reverb'), h('th', null, 'Kit Reso')));
      for (const p of PADS) {
        const base = ADDR.unit(k, p.zones[0]);
        const link = p.zones.slice(1).map((z) => ADDR.unit(k, z));
        const cell = (n) => { const r = row('KitUnitCommon', base, n, { label: ' ', link }); r.style.gridTemplateColumns = '0 1fr auto'; return h('td', null, r); };
        tbl.append(h('tr', null, h('td', null, p.ru), cell('Overhead Send Level'), cell('Room Send Level'), cell('Reverb Send Level'), cell('Kit Resonance Send Level')));
      }
      return h('div', { class: 'scrollx' }, tbl);
    }, { fold: true, closed: true }));
  }

  // =====================================================================
  // Эффекты
  // =====================================================================
  function viewFx(view) {
    const k = S.kit;
    view.append(h('h1', { class: 'view' }, 'Эффекты (Bus FX)'));
    const seg = h('div', { class: 'seg', style: 'margin-bottom:12px' });
    ['A', 'B', 'C', 'D'].forEach((b, i) => seg.append(h('button', { class: S.bus === i + 1 ? 'on' : '', onclick: () => { S.bus = i + 1; render(); } }, 'Шина ' + b)));
    view.append(seg);
    const bus = S.bus;
    const bb = ADDR.bus(k, bus);
    view.append(h('div', { class: 'cols' },
      fxSlot(k, (bus - 1) * 2 + 1),
      fxSlot(k, (bus - 1) * 2 + 2)));
    view.append(section(`Шина ${'ABCD'[bus - 1]}: уровень и сайдчейн`, async () => {
      await need([['KitBusSetup', bb]], S.renderId);
      return blockEditor('KitBusSetup', bb);
    }, { fold: true }));
    view.append(section('Маршрутизация шин', async () => {
      const cb = ADDR.kitCommon(k);
      await need([['KitCommon', cb]], S.renderId);
      return blockEditor('KitCommon', cb, { only: /^(Bus-[A-D] |Room Send Bus|Overhead Send Bus|Reverb Send Bus|Kit Resonance Send Bus|Room Bus Send|Overhead Bus Send|Reverb Bus Send|Kit Resonance Bus Send)/ });
    }, { fold: true, closed: true }));
    view.append(section('Какие пэды идут в шины', async () => {
      await need(PADS.map((p) => ['KitPad', ADDR.pad(k, p.id)]), S.renderId);
      const tbl = h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Пэд'), h('th', null, 'Маршрут'), h('th', null, 'Посыл')));
      for (const p of PADS) {
        const pb = ADDR.pad(k, p.id);
        const r1 = row('KitPad', pb, 'Output Routing', { label: ' ' }); r1.style.gridTemplateColumns = '0 1fr 0';
        const r2 = row('KitPad', pb, 'Bus Send Level', { label: ' ' }); r2.style.gridTemplateColumns = '0 1fr auto';
        tbl.append(h('tr', null, h('td', null, p.ru), h('td', null, r1), h('td', null, r2)));
      }
      return h('div', { class: 'scrollx' }, tbl);
    }, { fold: true, closed: true }));
    view.append(section('Bus Reverb', async () => {
      const rb = ADDR.busReverb(k);
      await need([['KitReverb', rb]], S.renderId);
      return reverbEditor(rb);
    }, { fold: true, closed: true }));
  }

  function fxSlot(k, n) {
    const fb = ADDR.kitFx(k, n);
    return section(V.FX_SLOTS[n - 1], async () => {
      await need([['KitFx', fb]], S.renderId);
      const box = h('div');
      const params = h('div');
      const types = BLOCKS.KitFx.byName['Bus Fx Type'].fmt.items;
      const draw = () => {
        const t = types[val('KitFx', fb, 'Bus Fx Type')] || '';
        params.replaceChildren(typedList('KitFx', fb, 'FX Parameter', D.fx[t] || []));
      };
      box.append(row('KitFx', fb, 'Bus Fx Switch', { label: 'Включён' }),
        row('KitFx', fb, 'Bus Fx Type', { label: 'Тип', onSet: () => setTimeout(async () => { await V.load('KitFx', fb, true); draw(); }, 250) }),
        params);
      draw();
      return box;
    });
  }

  // =====================================================================
  // Эмбиенс
  // =====================================================================
  function reverbEditor(base) {
    const box = h('div');
    const params = h('div');
    const draw = () => {
      const t = T.REVERB_TYPES[val('KitReverb', base, 'ReverbType')];
      params.replaceChildren(h('div', { class: 'grp' }, t || 'Параметры'), typedList('KitReverb', base, 'Reverb Parameter', T.REVERB[t] || []));
    };
    box.append(blockEditor('KitReverb', base, { only: /^(Reverb Switch|Level)$/ }),
      row('KitReverb', base, 'ReverbType', { label: 'Тип реверба', onSet: () => setTimeout(async () => { await V.load('KitReverb', base, true); draw(); }, 250) }),
      params,
      blockEditor('KitReverb', base, { skip: /^(Reverb Switch|Level|ReverbType)$/ }));
    draw();
    return box;
  }

  function viewAmb(view) {
    const k = S.kit;
    view.append(h('h1', { class: 'view' }, 'Эмбиенс'));
    const tabs = [['overhead', 'Overhead'], ['room', 'Room'], ['reverb', 'Reverb'], ['reso', 'Kit Resonance']];
    const seg = h('div', { class: 'seg', style: 'margin-bottom:12px' });
    tabs.forEach(([id, l]) => seg.append(h('button', { class: S.amb === id ? 'on' : '', onclick: () => { S.amb = id; render(); } }, l)));
    view.append(seg);
    if (S.amb === 'overhead') {
      const b = ADDR.overhead(k);
      view.append(section('Overhead', async () => { await need([['KitOverhead', b]], S.renderId); return blockEditor('KitOverhead', b, { skip: /^Filter/ }); }));
      view.append(section('Фильтры overhead', async () => { await need([['KitOverhead', b]], S.renderId); return blockEditor('KitOverhead', b, { only: /^Filter/ }); }, { fold: true, closed: true }));
    } else if (S.amb === 'room') {
      const b = ADDR.room(k);
      view.append(section('Room', async () => {
        await need([['KitRoom', b]], S.renderId);
        const params = h('div');
        const draw = () => {
          const t = val('KitRoom', b, 'Type') ? 'SYNTHETIC' : 'REALISTIC';
          params.replaceChildren(h('div', { class: 'grp' }, t === 'REALISTIC' ? 'Помещение (REALISTIC)' : 'Синтетический (SYNTHETIC)'), typedList('KitRoom', b, 'Room Parameter', T.ROOM[t]));
        };
        const box = h('div', null, row('KitRoom', b, 'Room Switch', { label: 'Включён' }), row('KitRoom', b, 'Type', { label: 'Тип', onSet: () => setTimeout(async () => { await V.load('KitRoom', b, true); draw(); }, 250) }), row('KitRoom', b, 'Level'), params);
        draw();
        box.append(blockEditor('KitRoom', b, { skip: /^(Room Switch|Type|Level)$/ }));
        return box;
      }));
    } else if (S.amb === 'reverb') {
      const b = ADDR.reverb(k);
      view.append(section('Reverb', async () => { await need([['KitReverb', b]], S.renderId); return reverbEditor(b); }));
    } else {
      const b = ADDR.resonance(k);
      view.append(section('Kit Resonance', async () => { await need([['KitResonance', b]], S.renderId); return blockEditor('KitResonance', b); }));
    }
    view.append(h('p', { class: 'muted small' }, 'Сколько каждого пэда идёт в эмбиенс — в разделе «Микшер → Посылы в эмбиенс» и на странице пэда.'));
  }

  // =====================================================================
  // Настройки кита
  // =====================================================================
  function viewKit(view) {
    const k = S.kit;
    const cb = ADDR.kitCommon(k);
    view.append(h('h1', { class: 'view' }, 'Настройки кита ' + k));
    view.append(section('Общие', async () => {
      await need([['KitCommon', cb]], S.renderId);
      return h('div', null,
        textRow('KitCommon', cb, 'Kit Name', 'Имя кита', { onSet: () => setTimeout(updateHeader, 50) }),
        textRow('KitCommon', cb, 'Kit Sub Name', 'Подпись'),
        blockEditor('KitCommon', cb, { only: /^(Volume|Closed Pedal Volume|HH Open\/Close Balance|Kit Tempo|Kit Tempo Switch|Kit Phrase|Kit Color|Red|Green|Blue|Kit Favorite Switch|Overhead Template|Kit Image|Kit Name Size)$/ }));
    }));
    view.append(section('Малый барабан: кросс-стик, щётки, страйнер, buzz', async () => {
      await need([['KitCommon', cb]], S.renderId);
      return blockEditor('KitCommon', cb, { only: /^(Analog XStick|Brush Switch|Strainer|Snare Throw|Snare Buzz)/ });
    }, { fold: true, closed: true }));
    view.append(section('Компрессор кита', async () => {
      const b = ADDR.kitComp(k);
      await need([['KitMasterComp', b]], S.renderId);
      const params = h('div');
      const draw = () => {
        const t = val('KitMasterComp', b, 'Kit Comp Type');
        params.replaceChildren(row('KitMasterComp', b, t ? 'Template (Type: FETCOMP-76)' : 'Template (Type: STANDARD)', { label: 'Шаблон', select: true, onSet: () => setTimeout(() => V.load('KitMasterComp', b, true), 200) }),
          typedList('KitMasterComp', b, 'Comp Parameter', t ? T.COMP.KIT_FET : T.COMP.KIT_STANDARD));
      };
      const box = h('div', null, row('KitMasterComp', b, 'Kit Comp Switch', { label: 'Включён' }),
        row('KitMasterComp', b, 'Kit Comp Type', { label: 'Тип', onSet: () => setTimeout(async () => { await V.load('KitMasterComp', b, true); draw(); }, 250) }), params);
      draw();
      return box;
    }, { fold: true, closed: true }));
    view.append(section('EQ кита', async () => {
      const b = ADDR.kitEq(k);
      await need([['KitMasterEQ', b]], S.renderId);
      return blockEditor('KitMasterEQ', b);
    }, { fold: true, closed: true }));
    view.append(section('KIT MIDI: ноты, длительность, каналы', async () => {
      const b = ADDR.kitMidi(k);
      await need([['KitMidi', b]], S.renderId);
      const tbl = h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Зона'), h('th', null, 'Нота'), h('th', null, 'Gate'), h('th', null, 'Канал')));
      const P = BLOCKS.KitMidi.params;
      const cell = (p) => {
        if (!p) return h('td');
        const r = row('KitMidi', b, p, { label: ' ' });
        r.style.gridTemplateColumns = '0 1fr auto';
        return h('td', null, r);
      };
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace('hihat', 'hh');
      for (const p of P.filter((q) => /^Note /.test(q.name))) {
        const zone = p.name.slice(5);
        const zn = norm(zone).replace('open', '').replace('close', '').replace('closed', '');
        const gate = P.find((q) => /^Gate Time /.test(q.name) && norm(q.name.slice(10)) === zn);
        const chan = P.find((q) => /^Channel /.test(q.name) && norm(q.name.slice(8)) === zn);
        const nr = row('KitMidi', b, p, { label: ' ' });
        nr.style.gridTemplateColumns = '0 1fr auto';
        tbl.append(h('tr', null, h('td', null, zone), h('td', null, nr), cell(gate), cell(chan)));
      }
      return h('div', { class: 'scrollx' }, tbl);
    }, { fold: true, closed: true }));
  }

  // =====================================================================
  // Триггеры
  // =====================================================================
  function viewTrig(view) {
    view.append(h('h1', { class: 'view' }, 'Триггеры'));
    const bank = S.trigBank;
    view.append(section('Банк триггеров', async () => {
      await need([['SetupControl', ADDR.setupControl], ['TrigMisc', ADDR.trigMisc(bank)]], S.renderId);
      const sel = h('select', { 'aria-label': 'Банк для правки' });
      for (let i = 1; i <= 16; i++) sel.append(h('option', { value: i }, 'Банк ' + i));
      sel.value = bank;
      sel.addEventListener('change', () => { S.trigBank = +sel.value; render(); });
      return h('div', null,
        row('SetupControl', ADDR.setupControl, 'Trig Bank Number', { label: 'Активный банк на модуле' }),
        h('div', { class: 'row wide' }, h('div', { class: 'lbl' }, 'Правлю банк'), sel),
        textRow('TrigMisc', ADDR.trigMisc(bank), 'Trigger Bank Name', 'Имя банка'));
    }));
    const seg = h('div', { class: 'seg', style: 'margin:0 0 12px' });
    seg.append(h('button', { class: !S.trigDigital ? 'on' : '', onclick: () => { S.trigDigital = false; S.trigInput = 1; render(); } }, 'Аналоговые входы'));
    seg.append(h('button', { class: S.trigDigital ? 'on' : '', onclick: () => { S.trigDigital = true; S.trigInput = 1; render(); } }, 'Цифровые пэды'));
    view.append(seg);
    const inSeg = h('div', { class: 'seg', style: 'margin:0 0 12px' });
    const count = S.trigDigital ? 14 : 11;
    for (let i = 1; i <= count; i++) {
      if (!S.trigDigital && i === 6) continue;
      inSeg.append(h('button', { class: S.trigInput === i ? 'on' : '', onclick: () => { S.trigInput = i; render(); } }, S.trigDigital ? 'Цифр. ' + i : V.TRIG_ANALOG[i - 1]));
    }
    view.append(inSeg);
    const type = S.trigDigital ? 'TrigDigital' : 'TrigAnalog';
    const base = S.trigDigital ? ADDR.trigDigital(bank, S.trigInput) : ADDR.trigAnalog(bank, S.trigInput);
    view.append(section(S.trigDigital ? `Цифровой пэд ${S.trigInput}` : `Вход ${V.TRIG_ANALOG[S.trigInput - 1]}`, async () => {
      await need([[type, base]], S.renderId);
      const box = h('div');
      if (!S.trigDigital) box.append(trigTypeRow(base));
      else box.append(h('div', { class: 'note' }, 'Roland советует настраивать цифровые пэды на самом модуле. Значения дополнительных параметров зависят от модели пэда.'));
      box.append(blockEditor(type, base, { skip: /^(Trig Type|Digital Pad Advanced)/ }));
      if (S.trigDigital) {
        const adv = BLOCKS.TrigDigital.params.filter((p) => /^Digital Pad Advanced/.test(p.name));
        for (const p of adv) box.append(row(type, base, p));
      }
      return box;
    }));
    view.append(section('Общие настройки банка: хай-хэт, перекрёстные помехи', async () => {
      await need([['TrigMisc', ADDR.trigMisc(bank)]], S.renderId);
      return blockEditor('TrigMisc', ADDR.trigMisc(bank));
    }, { fold: true, closed: true }));
  }

  function trigTypeRow(base) {
    const p = BLOCKS.TrigAnalog.byName['Trig Type'];
    const sel = h('select', { 'aria-label': 'Тип пэда' });
    T.TRIG_TYPES.forEach((t, i) => sel.append(h('option', { value: i }, t)));
    sel.addEventListener('change', () => V.setValue('TrigAnalog', base, p, +sel.value));
    const raw = h('span', { class: 'val' });
    const update = () => { const v = val('TrigAnalog', base, p); if (v === null) return; if (!sel.querySelector(`option[value="${v}"]`)) sel.append(h('option', { value: v }, '#' + v)); sel.value = v; raw.textContent = '#' + v; };
    binds.push({ base, off: p.off, bytes: 1, update });
    update();
    return h('div', { class: 'row' }, h('div', { class: 'lbl' }, 'Тип пэда (Trig Type)', h('small', null, 'по списку Data List, сверьте с экраном модуля')), sel, raw);
  }

  // =====================================================================
  // Сет-листы
  // =====================================================================
  function viewSet(view) {
    view.append(h('h1', { class: 'view' }, 'Сет-листы'));
    const sel = h('select', { 'aria-label': 'Сет-лист', style: 'max-width:260px' });
    for (let i = 1; i <= 32; i++) sel.append(h('option', { value: i }, 'Сет-лист ' + i));
    sel.value = S.setList;
    sel.addEventListener('change', () => { S.setList = +sel.value; render(); });
    view.append(h('div', { class: 'btns', style: 'margin-bottom:12px' }, sel));
    const base = ADDR.setList(S.setList);
    view.append(section('Сет-лист ' + S.setList, async () => {
      await need([['SetListParams', base]], S.renderId);
      const box = h('div', null, textRow('SetListParams', base, 'Set List Bank Name', 'Название'));
      const tbl = h('div');
      const draw = () => {
        tbl.replaceChildren();
        const steps = BLOCKS.SetListParams.params.filter((p) => /^Step \d+ Kit$/.test(p.name));
        let ended = false;
        steps.forEach((p, i) => {
          if (ended) return;
          const v = val('SetListParams', base, p);
          const s = h('select', { 'aria-label': 'Шаг ' + (i + 1) });
          s.append(h('option', { value: -1 }, '— конец списка —'));
          for (let k = 1; k <= 200; k++) s.append(h('option', { value: k - 1 }, String(k).padStart(3, '0') + ' ' + (kitNameOf(k)[0] || '')));
          s.value = v;
          s.addEventListener('change', () => { V.setValue('SetListParams', base, p, +s.value); setTimeout(draw, 30); });
          tbl.append(h('div', { class: 'row wide' }, h('div', { class: 'lbl' }, 'Шаг ' + (i + 1)), s));
          if (v === -1) ended = true;
        });
      };
      draw();
      box.append(tbl);
      return box;
    }));
  }

  // =====================================================================
  // Система
  // =====================================================================
  function viewSys(view) {
    view.append(h('h1', { class: 'view' }, 'Система'));
    // настройки приложения
    const dev = h('select', { 'aria-label': 'Device ID' });
    for (let i = 17; i <= 32; i++) dev.append(h('option', { value: i - 1 }, String(i)));
    dev.value = V.settings.deviceId;
    dev.addEventListener('change', () => { V.settings.deviceId = +dev.value; saveSettings(); });
    const sg = h('select', { 'aria-label': 'Отрицательные значения' }, h('option', { value: 'twos' }, 'Дополнительный код (обычно)'), h('option', { value: 'offset' }, 'Со смещением'));
    sg.value = V.settings.signed;
    sg.addEventListener('change', () => { V.settings.signed = sg.value; saveSettings(); for (const e of V.mem.values()) e.loaded = false; toast('Значения будут перечитаны'); });
    const eng = h('button', { class: 'toggle' + (V.settings.engineering ? ' on' : ''), role: 'switch', onclick: () => { V.settings.engineering = !V.settings.engineering; saveSettings(); render(); } });
    const gap = h('input', { type: 'number', min: 0, max: 100, value: V.Link.gapMs });
    gap.addEventListener('change', () => { V.Link.gapMs = Math.max(0, +gap.value); saveSettings(); });
    const ch = h('input', { type: 'number', min: 1, max: 16, value: V.settings.globalCh || 10 });
    ch.addEventListener('change', () => { V.settings.globalCh = Math.max(1, Math.min(16, +ch.value)); saveSettings(); });
    view.append(section('Приложение', h('div', null,
      h('div', { class: 'row wide' }, h('div', { class: 'lbl' }, 'Device ID', h('small', null, 'как на модуле: MENU → SYSTEM → MIDI → BASIC, по умолчанию 17')), dev),
      h('div', { class: 'row wide' }, h('div', { class: 'lbl' }, 'MIDI-канал для прослушивания', h('small', null, 'Global MIDI Channel модуля, по умолчанию 10')), ch),
      h('div', { class: 'row wide' }, h('div', { class: 'lbl' }, 'Пауза между сообщениями, мс', h('small', null, 'увеличьте, если по Bluetooth теряются данные')), gap),
      h('div', { class: 'row wide' }, h('div', { class: 'lbl' }, 'Кодировка отрицательных значений', h('small', null, 'проверяется на модуле по Pan и Pitch')), sg),
      h('div', { class: 'row wide' }, h('div', { class: 'lbl' }, 'Инженерный режим', h('small', null, 'показывать адреса и «сырые» значения, все параметры эффектов и V-EDIT')), eng),
      h('div', { class: 'btns', style: 'padding-top:10px' },
        h('button', { class: 'btn', onclick: () => { V.Link.identity(); toast('Запрос отправлен — ответ появится в «Мониторе»'); } }, 'Проверить связь'),
        h('button', { class: 'btn', onclick: () => { V.mem.clear(); render(); toast('Всё будет прочитано заново'); } }, 'Перечитать всё из модуля'),
        h('button', { class: 'btn', onclick: () => { S.names = {}; store.set('kitnames', {}); toast('Имена китов забыты'); } }, 'Забыть имена китов')))));
    if (!V.Link.connected) {
      view.append(h('div', { class: 'note' }, 'Настройки модуля (выходы, метроном) появятся после подключения.'));
      return;
    }
    view.append(section('Метроном (Click)', async () => {
      await need([['Click', ADDR.click]], S.renderId);
      return h('div', null, blockEditor('Click', ADDR.click),
        h('p', { class: 'muted small' }, 'Включение метронома, общий темп и размер Roland в MIDI не открыл — темп можно задать для кита (Kit Tempo в «Настройках кита»).'));
    }));
    view.append(section('Выходы (Output)', async () => {
      await need([['SetupOutput', ADDR.setupOutput]], S.renderId);
      return blockEditor('SetupOutput', ADDR.setupOutput);
    }, { fold: true, closed: true }));
    view.append(section('Mix In, Bluetooth, USB-аудио', async () => {
      await need([['SetupMisc', ADDR.setupMisc]], S.renderId);
      return blockEditor('SetupMisc', ADDR.setupMisc);
    }, { fold: true, closed: true }));
  }

  // =====================================================================
  // Монитор
  // =====================================================================
  let monLog = null, monHits = null;
  function viewMon(view) {
    view.append(h('h1', { class: 'view' }, 'Монитор'));
    monHits = h('div', { class: 'hits' });
    view.append(section('Удары', h('div', null, h('p', { class: 'muted small', style: 'margin-top:4px' }, 'Сыграйте на пэдах — здесь видно силу удара. Модуль должен передавать MIDI (MENU → SYSTEM → MIDI).'), monHits)));
    monLog = h('div', { class: 'log' });
    const tools = h('div', { class: 'btns' },
      h('button', { class: 'btn', onclick: () => { V.log.length = 0; monLog.replaceChildren(); } }, 'Очистить'),
      h('button', { class: 'btn', onclick: () => exportFile('V31-log.txt', V.log.map(fmtLog).join('\n')) }, 'Сохранить журнал'));
    view.append(section('Журнал MIDI', h('div', null, h('p', { class: 'muted small', style: 'margin-top:4px' }, 'Если включить на модуле Transmit Edit Data, правки на самом модуле тоже появятся здесь — с названием параметра.'), tools, monLog)));
    for (const l of V.log.slice(-150)) monLog.prepend(logLine(l));
  }
  const fmtLog = (l) => `${l.t.toLocaleTimeString()} ${l.dir} ${l.note} ${l.hex}`;
  function logLine(l) {
    return h('div', { class: l.dir === '←' ? 'd-in' : l.dir === '!' ? 'd-err' : 'd-out' }, `${l.t.toLocaleTimeString()} ${l.dir} ${l.note}`, l.hex ? h('div', { class: 'muted' }, l.hex) : null);
  }
  V.logListeners.add((l) => {
    if (S.tab === 'mon' && monLog && monLog.isConnected) {
      monLog.prepend(logLine(l));
      while (monLog.children.length > 200) monLog.lastChild.remove();
    }
  });

  const hitCells = {};
  function showHit(note, vel) {
    // пэд по ноте из KIT MIDI текущего кита
    const mb = ADDR.kitMidi(S.kit);
    let zone = null;
    const e = V.mem.get(mb);
    if (e && e.loaded) {
      for (const z in NOTE_PARAM) if (val('KitMidi', mb, NOTE_PARAM[z]) === note) { zone = +z; break; }
    } else {
      for (const z in DEFAULT_NOTES) if (DEFAULT_NOTES[z] === note) { zone = +z; break; }
    }
    const label = zone ? ZONES[zone - 1] : 'Нота ' + note;
    if (zone) {
      const pad = PADS.find((p) => p.zones.includes(zone));
      const el = padEls[pad.id];
      if (el && el.isConnected) {
        const bar = el.querySelector('.hit');
        bar.style.width = Math.round(vel / 127 * 100) + '%';
        el.classList.add('flash');
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.classList.remove('flash'); bar.style.width = '0'; }, 250);
      }
    }
    if (S.tab === 'mon' && monHits && monHits.isConnected) {
      let c = hitCells[label];
      if (!c || !c.isConnected) {
        c = h('div', { class: 'hitcell' }, h('div', null, label), h('div', { class: 'v' }), h('div', { class: 'bar' }, h('i')));
        hitCells[label] = c;
        monHits.append(c);
      }
      c.querySelector('.v').textContent = 'velocity ' + vel;
      c.querySelector('.bar i').style.width = Math.round(vel / 127 * 100) + '%';
    }
  }

  // =====================================================================
  // Подключение
  // =====================================================================
  const isAndroid = !!window.V31Native;
  const isIOS = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.v31);
  let demo = null, webMidi = null;

  function nativeSend(bytes) {
    const hex = bytes.map(V.hex2).join(' ');
    if (isAndroid) window.V31Native.send(hex);
    else if (isIOS) window.webkit.messageHandlers.v31.postMessage({ cmd: 'send', hex });
  }

  function onConnected(name, kind) {
    V.Link.setConnected(true, name, kind);
    setConnState();
    closeConnect();
    V.mem.clear();
    V.Link.identity();
    readCurrent().then(render).catch((e) => { toast('Модуль не отвечает на запросы: ' + e.message + '. На модуле: MENU → SYSTEM → MIDI → BASIC → Receive Exclusive = ON; Device ID должен совпадать с «Системой» пульта.', true); render(); });
  }
  function onClosed(msg) {
    V.Link.setConnected(false);
    V.Link.transport = null;
    setConnState();
    if (msg) toast(msg, true);
    render();
  }

  // события от Android/iOS
  window.v31NativeEvent = function (e) {
    switch (e.type) {
      case 'connected': V.Link.transport = { send: nativeSend }; onConnected(e.name || 'V31', e.kind === 'USB' ? 'USB' : 'Bluetooth'); break;
      case 'closed': onClosed('Связь с модулем потеряна'); break;
      case 'error': toast(e.message, true); setBusy(false); break;
      case 'status': toast(e.message); break;
      case 'cancel': setBusy(false); break;
      case 'midi': V.Link.receive(e.hex.split(' ').map((x) => parseInt(x, 16))); break;
    }
  };
  // для совместимости с оболочкой TD-17
  window.tdNativeEvent = window.v31NativeEvent;

  function setBusy(on) { $('#conn').classList.toggle('busy', on); }

  V.Link.onEvent = (ev) => {
    if (ev.type === 'note') showHit(ev.note, ev.vel);
    else if (ev.type === 'program') kitChanged();
    else if (ev.type === 'remoteEdit' && ev.addr < V.A4(0, 0, 0, 4)) kitChanged();
    else if (ev.type === 'identity') {
      const ok = ev.info.family[0] === 1 && ev.info.family[1] === 6;
      toast(ok ? 'Модуль V31 на связи' : 'Ответило устройство другой модели');
    }
  };

  function connectDemo() {
    demo = V.makeEmulator((bytes) => V.Link.receive(bytes));
    V.Link.transport = demo;
    V.Link.gapMs = 2;
    onConnected('Демо: виртуальный V31', 'Демо');
  }

  async function connectWebMidi() {
    try {
      const acc = await navigator.requestMIDIAccess({ sysex: true });
      let out = null, inp = null;
      for (const o of acc.outputs.values()) if (/V31/i.test(o.name)) out = o;
      for (const i of acc.inputs.values()) if (/V31/i.test(i.name)) inp = i;
      if (!out || !inp) throw new Error('V31 не найден среди MIDI-устройств компьютера');
      inp.onmidimessage = (m) => V.Link.receive(Array.from(m.data));
      webMidi = { inp, out };
      V.Link.transport = { send: (b) => out.send(b) };
      onConnected(out.name, 'Web MIDI');
    } catch (e) {
      toast('Web MIDI: ' + e.message, true);
    }
  }

  function disconnect() {
    if (isAndroid) window.V31Native.disconnect();
    else if (isIOS) window.webkit.messageHandlers.v31.postMessage({ cmd: 'disconnect' });
    if (webMidi) { webMidi.inp.onmidimessage = null; webMidi = null; }
    demo = null;
    V.Link.gapMs = V.settings.gapMs || 15;
    onClosed();
  }

  let connEl = null;
  function closeConnect() { if (connEl) { connEl.remove(); connEl = null; } }
  function showConnect() {
    closeConnect();
    const choices = h('div', { class: 'choices' });
    if (isAndroid || isIOS) {
      choices.append(h('button', { class: 'btn primary', onclick: () => {
        setBusy(true);
        if (isAndroid) window.V31Native.connect('ble', false);
        else window.webkit.messageHandlers.v31.postMessage({ cmd: 'connect', kind: 'ble' });
      } }, 'По Bluetooth', h('small', null, 'На модуле: MENU → SYSTEM → Bluetooth → Bluetooth MIDI = ON. В списке выберите «V31 MIDI».')));
      choices.append(h('button', { class: 'btn', onclick: () => {
        setBusy(true);
        if (isAndroid) window.V31Native.connect('usb', false);
        else window.webkit.messageHandlers.v31.postMessage({ cmd: 'connect', kind: 'usb' });
      } }, 'Кабелем USB', h('small', null, 'Порт USB COMPUTER модуля → планшет (USB-C или переходник OTG).')));
      if (isAndroid) choices.append(h('button', { class: 'btn', onclick: () => { setBusy(true); window.V31Native.connect('ble', true); } }, 'Показать все Bluetooth-устройства', h('small', null, 'Если «V31 MIDI» не находится в обычном поиске.')));
    } else if (navigator.requestMIDIAccess) {
      choices.append(h('button', { class: 'btn primary', onclick: connectWebMidi }, 'MIDI этого компьютера', h('small', null, 'V31 подключён кабелем USB, браузер Chrome или Edge.')));
    }
    choices.append(h('button', { class: 'btn', onclick: connectDemo }, 'Демо без модуля', h('small', null, 'Виртуальный V31: можно посмотреть все экраны.')));
    connEl = h('div', { class: 'overlay', onclick: (e) => { if (e.target === connEl) closeConnect(); } },
      h('div', { class: 'dialog', role: 'dialog', 'aria-label': 'Подключение' },
        h('h2', null, 'Подключение к V31'),
        h('p', { class: 'muted' }, 'Bluetooth MIDI удобнее на репетиции; кабель надёжнее на концерте. Пока пульт подключён, другие приложения (V-Drums Play, V31 Editor) к модулю не подключайте.'),
        choices,
        V.Link.connected ? h('button', { class: 'btn danger', onclick: () => { disconnect(); closeConnect(); } }, 'Отключиться') : null,
        h('button', { class: 'btn', style: 'margin-left:8px', onclick: closeConnect }, 'Закрыть')));
    document.body.append(connEl);
  }

  // ---------- запуск ----------
  function boot() {
    const app = h('div', { id: 'app' },
      h('header', { class: 'top' },
        h('div', { class: 'kitscreen' },
          h('button', { class: 'step', 'aria-label': 'Предыдущий кит', onclick: () => selectKit(S.kit - 1) }, '‹'),
          h('div', { class: 'num', id: 'knum' }, '—'),
          h('div', { class: 'names', onclick: () => { S.tab = 'kits'; store.set('tab', 'kits'); render(); } }, h('div', { class: 'kname', id: 'kname' }, 'V31 Пульт'), h('div', { class: 'ksub', id: 'ksub' }, '')),
          h('button', { class: 'step', 'aria-label': 'Следующий кит', onclick: () => selectKit(S.kit + 1) }, '›')),
        h('button', { class: 'iconbtn', id: 'reload', title: 'Перечитать кит из модуля', onclick: () => { forgetKit(S.kit); render(); } }, '⟳'),
        h('button', { class: 'iconbtn', id: 'undo', title: 'Вернуть значения, прочитанные при загрузке кита', onclick: undoKit }, 'Отменить'),
        h('button', { class: 'conn', id: 'conn', onclick: showConnect }, h('span', { class: 'dot' }), h('span', { class: 'ct' }, 'Не подключено'))),
      h('div', { class: 'body' }, h('nav', { class: 'rail', id: 'rail', 'aria-label': 'Разделы' }), h('main', { id: 'view' })));
    document.body.append(app);
    setConnState();
    applyAccent(null);
    render();
    if (!isAndroid && !isIOS && /[?&]demo/.test(location.search)) connectDemo();
    else if (!V.Link.connected) showConnect();
  }
  // Кнопка «Назад» на Android: закрыть диалог.
  window.v31Back = () => { if (connEl) { closeConnect(); return true; } return false; };
  window.tdBack = window.v31Back;
  document.addEventListener('DOMContentLoaded', boot);
})();
