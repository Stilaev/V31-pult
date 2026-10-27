/*
 * V31 Пульт — ядро: адресная карта, кодирование значений, SysEx Roland (RQ1/DT1),
 * очередь обмена с модулем, кэш памяти модуля и эмулятор модуля для демо-режима.
 */
(function () {
  'use strict';
  const D = window.V31DATA;

  // ---------- 7-битные адреса ----------
  // Адреса Roland состоят из 4 байт по 7 бит. Внутри программы адрес хранится
  // как одно число: a·128³ + b·128² + c·128 + d — так смещения просто складываются.
  const A4 = (a, b, c, d) => ((a * 128 + b) * 128 + c) * 128 + d;
  const O3 = (a, b, c) => (a * 128 + b) * 128 + c;
  const toBytes = (n) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
  const hex2 = (b) => (b < 16 ? '0' : '') + b.toString(16).toUpperCase();
  const addrHex = (n) => toBytes(n).map(hex2).join(' ');

  // ---------- блоки ----------
  const BLOCKS = {};
  for (const name in D.map) {
    const [size, ps] = D.map[name];
    BLOCKS[name] = {
      name, size,
      params: ps.map(([off, bytes, pname, min, max, fmt]) => ({ off, bytes, name: pname, min, max, fmt, block: name })),
    };
    BLOCKS[name].byName = {};
    for (const p of BLOCKS[name].params) {
      if (!(p.name in BLOCKS[name].byName)) BLOCKS[name].byName[p.name] = p;
    }
  }

  // Зоны (KitUnitCommon / KitUnitLayer) и пэды (KitPad) в порядке карты.
  const ZONES = ['KICK', 'SNARE HEAD', 'SNARE RIM', 'TOM1 HEAD', 'TOM1 RIM', 'TOM2 HEAD', 'TOM2 RIM', 'TOM3 HEAD', 'TOM3 RIM',
    'TOM4 HEAD', 'TOM4 RIM', 'HI-HAT HEAD', 'HI-HAT RIM', 'CRASH1 HEAD', 'CRASH1 RIM', 'CRASH2 HEAD', 'CRASH2 RIM',
    'RIDE HEAD', 'RIDE EDGE', 'RIDE BELL', 'AUX HEAD', 'AUX RIM', 'AUX2 HEAD', 'AUX2 RIM', 'AUX3 HEAD', 'AUX3 RIM',
    'AUX4 HEAD', 'AUX4 RIM'];
  const PADS = [
    { id: 1, name: 'KICK', ru: 'Бочка', zones: [1] },
    { id: 2, name: 'SNARE', ru: 'Малый', zones: [2, 3], xstick: true },
    { id: 3, name: 'TOM1', ru: 'Том 1', zones: [4, 5] },
    { id: 4, name: 'TOM2', ru: 'Том 2', zones: [6, 7] },
    { id: 5, name: 'TOM3', ru: 'Том 3', zones: [8, 9] },
    { id: 6, name: 'TOM4', ru: 'Том 4', zones: [10, 11] },
    { id: 7, name: 'HI-HAT', ru: 'Хай-хэт', zones: [12, 13] },
    { id: 8, name: 'CRASH1', ru: 'Крэш 1', zones: [14, 15] },
    { id: 9, name: 'CRASH2', ru: 'Крэш 2', zones: [16, 17] },
    { id: 10, name: 'RIDE', ru: 'Райд', zones: [18, 19, 20] },
    { id: 11, name: 'AUX', ru: 'AUX 1', zones: [21, 22] },
    { id: 12, name: 'AUX2', ru: 'AUX 2', zones: [23, 24] },
    { id: 13, name: 'AUX3', ru: 'AUX 3', zones: [25, 26] },
    { id: 14, name: 'AUX4', ru: 'AUX 4', zones: [27, 28] },
  ];
  const FX_SLOTS = ['BUS-A FX1', 'BUS-A FX2', 'BUS-B FX1', 'BUS-B FX2', 'BUS-C FX1', 'BUS-C FX2', 'BUS-D FX1', 'BUS-D FX2'];
  const BUSES = ['BUS-A', 'BUS-B', 'BUS-C', 'BUS-D'];
  const TRIG_ANALOG = ['KICK', 'SNARE', 'TOM1', 'TOM2', 'TOM3', '(6)', 'HI-HAT', 'CRASH1', 'CRASH2', 'RIDE', 'AUX/TOM4', '(12)', '(13)', '(14)'];

  // ---------- абсолютные адреса ----------
  const ADDR = {
    current: A4(0, 0, 0, 0),
    setup: A4(1, 0, 0, 0),
    setupOutput: A4(1, 0, 0, 0),
    setupControl: A4(1, 0, 0, 0) + O3(0, 1, 0),
    click: A4(1, 0, 0, 0) + O3(0, 2, 0),
    setupMisc: A4(1, 0, 0, 0) + O3(0, 3, 0),
    trig: (bank) => A4(2, 0, 0, 0) + (bank - 1) * A4(0, 1, 0, 0),
    trigMisc: (bank) => ADDR.trig(bank),
    trigAnalog: (bank, i) => ADDR.trig(bank) + O3(0, i, 0),
    trigDigital: (bank, i) => ADDR.trig(bank) + O3(0, 0x0E + i, 0),
    setList: (n) => A4(3, 0, 0, 0) + (n - 1) * O3(0, 0x10, 0),
    kit: (k) => A4(4, 0, 0, 0) + (k - 1) * A4(0, 4, 0, 0),
    kitCommon: (k) => ADDR.kit(k),
    kitMidi: (k) => ADDR.kit(k) + O3(0, 2, 0),
    kitComp: (k) => ADDR.kit(k) + O3(0, 4, 0),
    kitEq: (k) => ADDR.kit(k) + O3(0, 5, 0),
    kitFx: (k, n) => ADDR.kit(k) + O3(0, 0x10, 0) + (n - 1) * O3(0, 2, 0),
    unit: (k, z) => ADDR.kit(k) + O3(0, 0x20, 0) + (z - 1) * O3(0, 1, 0),
    xstick: (k) => ADDR.kit(k) + O3(0, 0x40, 0),
    layer: (k, L, z) => ADDR.kit(k) + [O3(0, 0x50, 0), O3(1, 0x10, 0), O3(1, 0x50, 0)][L] + (z - 1) * O3(0, 2, 0),
    pad: (k, p) => ADDR.kit(k) + O3(2, 0x10, 0) + (p - 1) * O3(0, 1, 0),
    bus: (k, b) => ADDR.kit(k) + O3(2, 0x20, 0) + (b - 1) * O3(0, 1, 0),
    room: (k) => ADDR.kit(k) + O3(2, 0x30, 0),
    overhead: (k) => ADDR.kit(k) + O3(2, 0x50, 0),
    reverb: (k) => ADDR.kit(k) + O3(2, 0x70, 0),
    busReverb: (k) => ADDR.kit(k) + O3(3, 0, 0),
    resonance: (k) => ADDR.kit(k) + O3(3, 0x10, 0),
  };

  /** Все блоки одного кита — для копирования, резервной копии и отмены. */
  function kitBlocks(k) {
    const list = [
      ['KitCommon', ADDR.kitCommon(k), 'Общие'],
      ['KitMidi', ADDR.kitMidi(k), 'KIT MIDI'],
      ['KitMasterComp', ADDR.kitComp(k), 'Компрессор кита'],
      ['KitMasterEQ', ADDR.kitEq(k), 'EQ кита'],
    ];
    for (let n = 1; n <= 8; n++) list.push(['KitFx', ADDR.kitFx(k, n), FX_SLOTS[n - 1]]);
    for (let z = 1; z <= 28; z++) list.push(['KitUnitCommon', ADDR.unit(k, z), ZONES[z - 1]]);
    list.push(['KitUnitLayer', ADDR.xstick(k), 'XSTICK']);
    for (let L = 0; L < 3; L++) for (let z = 1; z <= 28; z++) list.push(['KitUnitLayer', ADDR.layer(k, L, z), ZONES[z - 1] + ' слой ' + 'ABC'[L]]);
    for (let p = 1; p <= 14; p++) list.push(['KitPad', ADDR.pad(k, p), PADS[p - 1].name]);
    for (let b = 1; b <= 4; b++) list.push(['KitBusSetup', ADDR.bus(k, b), BUSES[b - 1]]);
    list.push(['KitRoom', ADDR.room(k), 'Room']);
    list.push(['KitOverhead', ADDR.overhead(k), 'Overhead']);
    list.push(['KitReverb', ADDR.reverb(k), 'Reverb']);
    list.push(['KitReverb', ADDR.busReverb(k), 'Bus Reverb']);
    list.push(['KitResonance', ADDR.resonance(k), 'Kit Resonance']);
    return list.map(([type, base, label]) => ({ type, base, label }));
  }

  /** По абсолютному адресу находит блок и параметр — для журнала и разбора входящих данных. */
  function describe(addr) {
    const b = toBytes(addr);
    let where = null;
    const within = (base, type, label) => {
      const blk = BLOCKS[type];
      if (addr >= base && addr < base + blk.size) where = { base, type, label };
    };
    if (b[0] === 0) within(ADDR.current, 'Current', 'Текущий кит');
    else if (b[0] === 1) {
      within(ADDR.setupOutput, 'SetupOutput', 'Setup · Output');
      within(ADDR.setupControl, 'SetupControl', 'Setup · Control');
      within(ADDR.click, 'Click', 'Setup · Click');
      within(ADDR.setupMisc, 'SetupMisc', 'Setup · Misc');
    } else if (b[0] === 2) {
      const bank = b[1] + 1;
      if (bank <= 16) {
        within(ADDR.trigMisc(bank), 'TrigMisc', `Триггеры ${bank} · Misc`);
        for (let i = 1; i <= 14; i++) within(ADDR.trigAnalog(bank, i), 'TrigAnalog', `Триггеры ${bank} · Analog ${i}`);
        for (let i = 1; i <= 14; i++) within(ADDR.trigDigital(bank, i), 'TrigDigital', `Триггеры ${bank} · Digital ${i}`);
      }
    } else if (b[0] === 3) {
      for (let n = 1; n <= 32; n++) within(ADDR.setList(n), 'SetListParams', `Сет-лист ${n}`);
    } else if (b[0] >= 4 && b[0] <= 0x0A) {
      const k = Math.floor((addr - ADDR.kit(1)) / A4(0, 4, 0, 0)) + 1;
      if (k >= 1 && k <= 200) {
        for (const blk of kitBlocks(k)) {
          within(blk.base, blk.type, `Кит ${k} · ${blk.label}`);
          if (where) break;
        }
      }
    }
    if (!where) return { text: addrHex(addr) };
    const off = addr - where.base;
    const p = BLOCKS[where.type].params.find((q) => off >= q.off && off < q.off + q.bytes);
    return { ...where, param: p, text: where.label + (p ? ' · ' + p.name : '') };
  }

  // ---------- кодирование значений ----------
  const settings = {
    deviceId: 0x10,
    signed: 'twos', // 'twos' — дополнительный код; 'offset' — со смещением
    engineering: false,
  };

  function decode(p, bytes) {
    if (p.bytes === 1) return bytes[0];
    let v = 0;
    for (let i = 0; i < p.bytes; i++) v = v * 16 + (bytes[i] & 15);
    if (p.min !== null && p.min < 0) {
      const bits = 4 * p.bytes;
      if (settings.signed === 'twos') {
        if (v >= 1 << (bits - 1)) v -= 1 << bits;
      } else {
        v -= 1 << (bits - 1);
      }
    }
    return v;
  }

  function encode(p, v) {
    v = Math.round(v);
    if (p.bytes === 1) return [v & 127];
    const bits = 4 * p.bytes;
    if (p.min !== null && p.min < 0) {
      if (settings.signed === 'twos') {
        if (v < 0) v += 1 << bits;
      } else {
        v += 1 << (bits - 1);
      }
    }
    const out = new Array(p.bytes);
    for (let i = 0; i < p.bytes; i++) out[i] = (v >> (4 * (p.bytes - 1 - i))) & 15;
    return out;
  }

  function clampP(p, v) {
    const lo = p.min === null ? 0 : p.min;
    const hi = p.max === null ? (p.bytes === 1 ? 127 : (1 << (4 * p.bytes)) - 1) : p.max;
    return Math.max(lo, Math.min(hi, v));
  }

  /** Текст значения по правилу из карты. */
  function format(p, v) {
    const f = p.fmt;
    if (!f) return (p.min !== null && p.min < 0 && v > 0 ? '+' : '') + v;
    switch (f.t) {
      case 'enum': return f.items[v - p.min] !== undefined ? f.items[v - p.min] : String(v);
      case 'db': return v <= f.inf ? '−∞' : ((v * f.scale) > 0 ? '+' : '') + (v * f.scale).toFixed(1) + ' dB';
      case 'lin': {
        const x = p.max === p.min ? f.a : f.a + (v - p.min) * (f.b - f.a) / (p.max - p.min);
        return (f.a < 0 && x > 0 ? '+' : '') + x.toFixed(f.dec) + (f.unit ? ' ' + f.unit : '');
      }
      case 'char': return v >= 32 && v < 127 ? String.fromCharCode(v) : '·';
      case 'bal': return `D${100 - v}:${v}W`;
    }
    return String(v);
  }

  // ---------- подписи значений из Data List («-15–+15 [dB]», «OFF, TAPE1–2») ----------
  function expandToken(tok) {
    tok = tok.trim();
    // TAPE1–TAPE4, TAPE1–2, SOFT1–3, BUS A–D, MUFF+1–MUFF+8, WIDE+1–WIDE+6
    let m = tok.match(/^(.*?)(\d+)–\1?(\d+)$/);
    if (m && !/^[-+]?\d+$/.test(m[1]) && m[1] !== '' && !/[\d.]$/.test(m[1])) {
      const out = [];
      const a = +m[2], b = +m[3];
      if (b > a && b - a < 64) {
        for (let i = a; i <= b; i++) out.push(m[1] + i);
        return out;
      }
    }
    m = tok.match(/^(.*?\s)([A-Z])–([A-Z])$/);
    if (m) {
      const out = [];
      for (let c = m[2].charCodeAt(0); c <= m[3].charCodeAt(0); c++) out.push(m[1] + String.fromCharCode(c));
      return out;
    }
    return [tok];
  }

  // Длительности для синхронизации с темпом (Data List, «Note», стр. 107)
  const NOTES = ['1/64T', '1/64', '1/32T', '1/32', '1/16T', '1/32.', '1/16', '1/8T', '1/16.', '1/8', '1/4T', '1/8.', '1/4', '1/2T', '1/4.', '1/2', '1/1T', '1/2.', '1/1', '2/1T', '1/1.', '2/1'];
  const NUMRE = /^\s*(-?INF,\s*)?([-+]?\d+(?:\.\d+)?)\s*(?:k)?–\s*(NORMAL–\s*)?([-+]?\d+(?:\.\d+)?)\s*(?:\[?([A-Za-z°%]+)\]?)?\s*(?:\(([A-Za-z]+)\))?\s*$/;

  /** Разбирает подпись значения. Возвращает {kind:'enum', items} | {kind:'num', lo, hi, dec, unit, inf, normal} | null. */
  function parseHint(h) {
    if (!h) return null;
    h = h.replace(/\s+/g, ' ').trim();
    const m = h.match(NUMRE);
    if (m) {
      const lo = parseFloat(m[2]), hi = parseFloat(m[4]);
      const dec = Math.max((m[2].split('.')[1] || '').length, (m[4].split('.')[1] || '').length);
      return { kind: 'num', lo, hi, dec, unit: m[5] || m[6] || '', inf: !!m[1], normal: !!m[3] };
    }
    if (/^Note\b/.test(h)) return { kind: 'enum', items: NOTES };
    const pm = h.match(/^L(\d+)–(\d+)R$/);
    if (pm) return { kind: 'pan', lo: -(+pm[1]), hi: +pm[2] };
    if (/^D100:0W–D0:100W$/.test(h)) return { kind: 'num', lo: 0, hi: 100, dec: 0, unit: '', bal: true };
    if (h.includes(',') || /^[A-Z]/.test(h)) {
      const parts = h.split(/,\s*/).filter(Boolean);
      // числа вида «20, 25, 31 … 400 [Hz]» — единица у последнего
      let unit = '';
      const last = parts[parts.length - 1];
      const um = last && last.match(/^(.*?)\s*\[([A-Za-z]+)\]$/);
      if (um) { parts[parts.length - 1] = um[1]; unit = um[2]; }
      const items = [];
      for (const t of parts) items.push(...expandToken(t));
      if (items.length >= 2 && items.every((x) => x.length < 28)) return { kind: 'enum', items: items.map((x) => (unit && /^[\d.]+$/.test(x) ? x + ' ' + unit : x)) };
    }
    return null;
  }

  function hintRange(spec) {
    if (!spec) return null;
    if (spec.kind === 'enum') return [0, spec.items.length - 1];
    if (spec.kind === 'pan') return [spec.lo, spec.hi];
    const s = Math.pow(10, spec.dec);
    return [Math.round(spec.lo * s) - (spec.inf ? 1 : 0), Math.round(spec.hi * s)];
  }

  function hintFormat(spec, v) {
    if (!spec) return String(v);
    if (spec.kind === 'enum') return spec.items[v] !== undefined ? spec.items[v] : '#' + v;
    if (spec.bal) return `D${100 - v}:${v}W`;
    if (spec.kind === 'pan') return v < 0 ? 'L' + -v : v > 0 ? 'R' + v : 'C';
    const s = Math.pow(10, spec.dec);
    if (spec.inf && v < Math.round(spec.lo * s)) return '−∞';
    if (spec.normal && v === 0) return 'NORMAL';
    const x = v / s;
    return (spec.lo < 0 && x > 0 ? '+' : '') + x.toFixed(spec.dec) + (spec.unit ? ' ' + spec.unit : '');
  }

  // ---------- SysEx ----------
  function checksum(arr) {
    const s = arr.reduce((a, b) => a + b, 0) % 128;
    return s === 0 ? 0 : 128 - s;
  }
  const MODEL = [0x01, 0x06, 0x01];
  function rq1(addr, size) {
    const body = [...toBytes(addr), ...toBytes(size)];
    return [0xF0, 0x41, settings.deviceId, ...MODEL, 0x11, ...body, checksum(body), 0xF7];
  }
  function dt1(addr, data) {
    const body = [...toBytes(addr), ...data];
    return [0xF0, 0x41, settings.deviceId, ...MODEL, 0x12, ...body, checksum(body), 0xF7];
  }
  function parseSysex(m) {
    if (m[0] !== 0xF0 || m[m.length - 1] !== 0xF7) return null;
    if (m[1] === 0x7E && m[3] === 0x06 && m[4] === 0x02) {
      return { kind: 'identity', dev: m[2], family: m.slice(6, 8), number: m.slice(8, 10), rev: m.slice(10, 14) };
    }
    if (m[1] !== 0x41 || m[3] !== 1 || m[4] !== 6 || m[5] !== 1) return null;
    const cmd = m[6];
    const body = m.slice(7, m.length - 2);
    const sum = m[m.length - 2];
    const ok = checksum(body) === sum;
    const addr = A4(body[0], body[1], body[2], body[3]);
    if (cmd === 0x12) return { kind: 'dt1', addr, data: body.slice(4), ok, dev: m[2] };
    if (cmd === 0x11) return { kind: 'rq1', addr, size: A4(body[4], body[5], body[6], body[7]), ok, dev: m[2] };
    return null;
  }

  // ---------- кэш памяти модуля ----------
  // Ключ — базовый адрес блока. Значение: {type, bytes:Uint8Array, at}
  const mem = new Map();
  const memListeners = new Set();
  function memPut(addr, data) {
    // Раскладывает пришедшие байты по известным блокам.
    let touched = [];
    for (const [base, e] of mem) {
      const size = e.bytes.length;
      const lo = Math.max(addr, base), hi = Math.min(addr + data.length, base + size);
      if (lo < hi) {
        for (let a = lo; a < hi; a++) e.bytes[a - base] = data[a - addr];
        e.at = Date.now();
        touched.push(base);
      }
    }
    if (touched.length) for (const f of memListeners) f(addr, data.length, touched);
    return touched.length > 0;
  }
  function memEnsure(type, base) {
    let e = mem.get(base);
    if (!e) {
      e = { type, bytes: new Uint8Array(BLOCKS[type].size), loaded: false, orig: null };
      mem.set(base, e);
    }
    return e;
  }

  function getValue(type, base, p) {
    const e = mem.get(base);
    if (!e || !e.loaded) return null;
    return decode(p, e.bytes.subarray(p.off, p.off + p.bytes));
  }

  // ---------- связь с модулем ----------
  const log = [];
  const logListeners = new Set();
  function addLog(dir, bytes, note) {
    const line = { t: new Date(), dir, hex: bytes ? bytes.map(hex2).join(' ') : '', note: note || '' };
    log.push(line);
    if (log.length > 400) log.splice(0, log.length - 400);
    for (const f of logListeners) f(line);
  }

  const Link = {
    transport: null, // {send(bytes)}
    connected: false,
    name: '',
    kind: '',
    gapMs: 15,
    sendQ: [],
    sending: false,
    pendingRq: null,
    rqQ: [],
    onEvent: null, // (ev) => void — состояние для интерфейса
    stats: { sent: 0, recv: 0, timeouts: 0 },

    rawSend(bytes, note) {
      if (!this.transport) return;
      this.sendQ.push({ bytes, note });
      this.pump();
    },
    pump() {
      if (this.sending) return;
      const item = this.sendQ.shift();
      if (!item) return;
      this.sending = true;
      try {
        this.transport.send(item.bytes);
        this.stats.sent++;
        if (item.note !== false) addLog('→', item.bytes, item.note);
      } catch (e) {
        addLog('!', null, 'Ошибка отправки: ' + e.message);
      }
      setTimeout(() => { this.sending = false; this.pump(); }, this.gapMs);
    },

    /** Запрос блока: Promise с массивом байт. Запросы идут по одному. */
    request(addr, size, note) {
      return new Promise((resolve, reject) => {
        this.rqQ.push({ addr, size, note, resolve, reject, tries: 0 });
        this.nextRq();
      });
    },
    nextRq() {
      if (this.pendingRq || !this.rqQ.length) return;
      if (!this.connected) {
        const q = this.rqQ.splice(0);
        q.forEach((r) => r.reject(new Error('нет связи')));
        return;
      }
      const r = this.rqQ.shift();
      r.got = new Uint8Array(r.size);
      r.have = new Uint8Array(r.size);
      r.count = 0;
      this.pendingRq = r;
      this.sendRq(r);
    },
    sendRq(r) {
      r.tries++;
      this.rawSend(rq1(r.addr, r.size), r.note || describe(r.addr).text);
      clearTimeout(r.timer);
      r.timer = setTimeout(() => {
        if (this.pendingRq !== r) return;
        if (r.tries < 3) return this.sendRq(r);
        this.stats.timeouts++;
        this.pendingRq = null;
        addLog('!', null, 'Нет ответа: ' + describe(r.addr).text);
        r.reject(new Error('Модуль не ответил'));
        this.nextRq();
      }, 700 + Math.min(1500, r.size * 2));
    },
    /** Запись: DT1. Длинные данные делятся на пакеты по 128 байт. */
    write(addr, data, note) {
      for (let i = 0; i < data.length; i += 128) {
        const part = data.slice(i, i + 128);
        this.rawSend(dt1(addr + i, part), note);
      }
      memPut(addr, data);
    },

    receive(bytes) {
      this.stats.recv++;
      if (bytes[0] === 0xF0) {
        const s = parseSysex(bytes);
        if (!s) { addLog('←', bytes, 'SysEx не распознан'); return; }
        if (s.kind === 'identity') {
          addLog('←', bytes, 'Identity Reply');
          if (this.onEvent) this.onEvent({ type: 'identity', info: s });
          return;
        }
        if (s.kind === 'dt1') {
          if (!s.ok) addLog('!', bytes, 'Неверная контрольная сумма');
          const r = this.pendingRq;
          let solicited = false;
          if (r && s.addr >= r.addr && s.addr < r.addr + r.size) {
            solicited = true;
            for (let i = 0; i < s.data.length && s.addr - r.addr + i < r.size; i++) {
              const j = s.addr - r.addr + i;
              if (!r.have[j]) { r.have[j] = 1; r.count++; }
              r.got[j] = s.data[i];
            }
          }
          memPut(s.addr, s.data);
          addLog('←', bytes, (solicited ? '' : 'изменено на модуле: ') + describe(s.addr).text);
          if (!solicited && this.onEvent) this.onEvent({ type: 'remoteEdit', addr: s.addr, data: s.data });
          if (r && solicited && r.count >= r.size) {
            clearTimeout(r.timer);
            this.pendingRq = null;
            r.resolve(r.got);
            this.nextRq();
          }
        }
        return;
      }
      // каналовые сообщения
      const st = bytes[0] & 0xF0;
      if (st === 0x90 && bytes[2] > 0) {
        if (this.onEvent) this.onEvent({ type: 'note', ch: bytes[0] & 15, note: bytes[1], vel: bytes[2] });
      } else if (st === 0xC0) {
        addLog('←', bytes, 'Program Change ' + (bytes[1] + 1));
        if (this.onEvent) this.onEvent({ type: 'program', ch: bytes[0] & 15, pc: bytes[1] });
      } else if (st === 0xB0) {
        if (this.onEvent) this.onEvent({ type: 'cc', ch: bytes[0] & 15, cc: bytes[1], val: bytes[2] });
      }
    },

    setConnected(on, name, kind) {
      this.connected = on;
      this.name = name || '';
      this.kind = kind || '';
      if (!on) {
        this.sendQ = [];
        if (this.pendingRq) { clearTimeout(this.pendingRq.timer); this.pendingRq.reject(new Error('связь потеряна')); this.pendingRq = null; }
        const q = this.rqQ.splice(0);
        q.forEach((r) => r.reject(new Error('связь потеряна')));
      }
    },
    identity() {
      this.rawSend([0xF0, 0x7E, settings.deviceId, 0x06, 0x01, 0xF7], 'Identity Request');
    },
  };

  // ---------- загрузка блоков ----------
  async function load(type, base, force) {
    const e = memEnsure(type, base);
    if (e.loaded && !force) return e;
    const data = await Link.request(base, BLOCKS[type].size);
    e.bytes.set(data);
    e.loaded = true;
    if (!e.orig) e.orig = new Uint8Array(data);
    e.at = Date.now();
    return e;
  }

  function setValue(type, base, p, v) {
    v = clampP(p, v);
    const bytes = encode(p, v);
    const e = memEnsure(type, base);
    Link.write(base + p.off, bytes, describe(base + p.off).text + ' = ' + format(p, v));
    if (!e.loaded) e.loaded = false;
  }

  /** Записывает строку (имя кита и т. п.) в последовательность параметров «… Name N». */
  function setText(type, base, params, text) {
    const e = memEnsure(type, base);
    const first = params[0];
    const per = first.bytes;
    const data = [];
    for (let i = 0; i < params.length; i++) {
      const c = i < text.length ? text.charCodeAt(i) : 32;
      const code = c >= 32 && c < 127 ? c : 63;
      data.push(...encode(params[i], code));
    }
    Link.write(base + first.off, data, describe(base + first.off).text + ' = "' + text + '"');
    return e;
  }

  // ---------- эмулятор модуля (демо без устройства) ----------
  function makeEmulator(deliver) {
    const ram = new Map(); // адрес → байт
    const def = (type, base) => {
      for (const p of BLOCKS[type].params) {
        let v = p.min === null ? 0 : Math.max(0, p.min);
        if (/Volume|Level/.test(p.name) && p.fmt && p.fmt.t === 'db') v = 0;
        if (/Switch|Sw$/.test(p.name)) v = 1;
        if (p.name === 'Instrument') v = 1;
        if (/Kit Tempo$/.test(p.name)) v = 1200;
        if (p.name === 'Sensitivity') v = 20;
        const enc = encode(p, v);
        for (let i = 0; i < enc.length; i++) ram.set(base + p.off + i, enc[i]);
      }
    };
    const inits = [['Current', ADDR.current], ['SetupOutput', ADDR.setupOutput], ['SetupControl', ADDR.setupControl], ['Click', ADDR.click], ['SetupMisc', ADDR.setupMisc]];
    for (const [t, a] of inits) def(t, a);
    const kitDone = new Set();
    const ensureKit = (k) => {
      if (kitDone.has(k)) return;
      kitDone.add(k);
      for (const b of kitBlocks(k)) def(b.type, b.base);
      const nm = (D.kits[k - 1] && D.kits[k - 1][0]) || 'User Kit';
      for (let i = 0; i < 16; i++) ram.set(ADDR.kitCommon(k) + i, i < nm.length ? nm.charCodeAt(i) : 32);
      // разные инструменты на зонах, чтобы демо выглядело живым
      const groupFirst = { 1: 1, 2: 35, 3: 36, 4: 90, 5: 91, 6: 92, 7: 93, 8: 94, 9: 95, 10: 96, 11: 97, 12: 143, 13: 144, 14: 176, 15: 177, 16: 180, 17: 181, 18: 155, 19: 156, 20: 157 };
      for (let z = 1; z <= 28; z++) {
        const p = BLOCKS.KitUnitLayer.byName.Instrument;
        const inst = groupFirst[z] ? groupFirst[z] + ((k * 7) % 3) * 2 : 0;
        const enc = encode(p, inst);
        for (let i = 0; i < enc.length; i++) ram.set(ADDR.layer(k, 0, z) + p.off + i, enc[i]);
        const sw = BLOCKS.KitUnitLayer.byName['Inst Switch'];
        ram.set(ADDR.layer(k, 1, z) + sw.off, 0);
        ram.set(ADDR.layer(k, 2, z) + sw.off, 0);
      }
    };
    const ensureTrig = (bank) => {
      const key = 'T' + bank;
      if (kitDone.has(key)) return;
      kitDone.add(key);
      def('TrigMisc', ADDR.trigMisc(bank));
      for (let i = 1; i <= 14; i++) { def('TrigAnalog', ADDR.trigAnalog(bank, i)); def('TrigDigital', ADDR.trigDigital(bank, i)); }
    };
    const ensureSet = (n) => {
      const key = 'S' + n;
      if (kitDone.has(key)) return;
      kitDone.add(key);
      def('SetListParams', ADDR.setList(n));
      const p = BLOCKS.SetListParams.byName['Step 1 Kit'];
      for (let s = 0; s < 32; s++) {
        const q = BLOCKS.SetListParams.params.find((x) => x.name === `Step ${s + 1} Kit`);
        const enc = encode(q, s < 3 ? s : -1);
        for (let i = 0; i < enc.length; i++) ram.set(ADDR.setList(n) + q.off + i, enc[i]);
      }
      void p;
    };
    const touch = (addr) => {
      const b = toBytes(addr);
      if (b[0] >= 4) {
        const k = Math.floor((addr - ADDR.kit(1)) / A4(0, 4, 0, 0)) + 1;
        if (k >= 1 && k <= 200) ensureKit(k);
      } else if (b[0] === 2) ensureTrig(b[1] + 1);
      else if (b[0] === 3) for (let n = 1; n <= 32; n++) if (addr >= ADDR.setList(n) && addr < ADDR.setList(n) + 160) ensureSet(n);
    };
    return {
      send(bytes) {
        setTimeout(() => {
          if (bytes[1] === 0x7E && bytes[4] === 0x01) {
            deliver([0xF0, 0x7E, settings.deviceId, 0x06, 0x02, 0x41, 0x01, 0x06, 0x03, 0x00, 0x00, 0x02, 0x00, 0x00, 0xF7]);
            return;
          }
          const s = parseSysex(bytes);
          if (!s) {
            if ((bytes[0] & 0xF0) === 0x90) deliver(bytes);
            return;
          }
          if (s.kind === 'rq1') {
            touch(s.addr);
            const data = [];
            for (let i = 0; i < s.size; i++) data.push(ram.get(s.addr + i) || 0);
            deliver(dt1(s.addr, data));
          } else if (s.kind === 'dt1') {
            touch(s.addr);
            s.data.forEach((v, i) => ram.set(s.addr + i, v));
          }
        }, 8 + Math.random() * 10);
      },
    };
  }

  window.V31 = {
    D, BLOCKS, ZONES, PADS, FX_SLOTS, BUSES, TRIG_ANALOG, ADDR, A4, O3, toBytes, addrHex, hex2,
    kitBlocks, describe, settings, decode, encode, clampP, format, parseHint, hintRange, hintFormat,
    rq1, dt1, parseSysex, checksum, mem, memListeners, memPut, memEnsure, getValue, load, setValue, setText,
    Link, log, logListeners, addLog, makeEmulator,
  };
})();
