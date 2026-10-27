// Проверка протокола без модуля: node tests/protocol.test.js
global.window = global;
require('../web/data.js');
require('../web/typed.js');
require('../web/core.js');
const V = window.V31;
let fails = 0;
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', msg, a, b); } };

// 1. Примеры из MIDI Implementation (стр. 48)
const h = (a) => a.map(V.hex2).join(' ');
eq(h(V.dt1(V.ADDR.layer(1, 0, 2) + V.BLOCKS.KitUnitLayer.byName['Layer EQ Switch'].off, [1])), 'F0 41 10 01 06 01 12 04 00 52 21 01 08 F7', 'DT1 пример');
eq(h(V.rq1(V.ADDR.pad(1, 2) + V.BLOCKS.KitPad.byName['Pad Comp Switch'].off, 1)), 'F0 41 10 01 06 01 11 04 02 11 0D 00 00 00 01 5B F7', 'RQ1 пример');

// 2. Адреса из карты
eq(V.addrHex(V.ADDR.kit(200)), '0A 1C 00 00', 'Kit 200');
eq(V.addrHex(V.ADDR.setList(32)), '03 03 70 00', 'SetList 32');
eq(V.addrHex(V.ADDR.trig(16)), '02 0F 00 00', 'Trigger 16');
eq(V.addrHex(V.ADDR.trigDigital(1, 14)), '02 00 1C 00', 'Trigger Digital 14');
eq(V.addrHex(V.ADDR.layer(1, 0, 28)), '04 01 06 00', 'LayerA 28');
eq(V.addrHex(V.ADDR.layer(1, 1, 28)), '04 01 46 00', 'LayerB 28');
eq(V.addrHex(V.ADDR.layer(1, 2, 28)), '04 02 06 00', 'LayerC 28');
eq(V.addrHex(V.ADDR.unit(1, 28)), '04 00 3B 00', 'Unit Common 28');
eq(V.addrHex(V.ADDR.kitFx(1, 8)), '04 00 1E 00', 'Kit FX 8');
eq(V.addrHex(V.ADDR.pad(1, 14)), '04 02 1D 00', 'Kit Pad 14');
eq(V.addrHex(V.ADDR.bus(1, 4)), '04 02 23 00', 'Kit Bus 4');
eq(V.addrHex(V.ADDR.resonance(1)), '04 03 10 00', 'Kit Resonance');

// 3. Блоки кита не перекрываются и помещаются в 00 04 00 00
const blocks = V.kitBlocks(7).map((b) => [b.base, b.base + V.BLOCKS[b.type].size, b.label]).sort((a, b) => a[0] - b[0]);
for (let i = 1; i < blocks.length; i++) if (blocks[i][0] < blocks[i - 1][1]) { fails++; console.log('FAIL перекрытие', blocks[i - 1][2], blocks[i][2]); }
if (blocks[blocks.length - 1][1] > V.ADDR.kit(8)) { fails++; console.log('FAIL кит не помещается'); }
eq(blocks.length, 148, 'число блоков кита');

// 4. Кодирование: туда и обратно для границ каждого параметра
let n = 0;
for (const name in V.BLOCKS) {
  for (const p of V.BLOCKS[name].params) {
    if (p.min === null || p.max === null) continue;
    for (const v of [p.min, p.max, Math.round((p.min + p.max) / 2)]) {
      const enc = V.encode(p, v);
      eq(enc.length, p.bytes, `${name}.${p.name} длина`);
      if (enc.some((b) => b < 0 || b > 127)) { fails++; console.log('FAIL байт вне 0..127', name, p.name, v, enc); }
      eq(V.decode(p, enc), v, `${name}.${p.name} = ${v}`);
      n++;
    }
  }
}
// 5. Разбор адресов: каждый параметр кита находится по своему адресу
for (const b of V.kitBlocks(3)) {
  for (const p of V.BLOCKS[b.type].params) {
    const d = V.describe(b.base + p.off);
    if (!d.param || d.param !== p) { fails++; console.log('FAIL describe', b.label, p.name, d.text); break; }
  }
}
// 6. Подписи Data List
eq(V.hintRange(V.parseHint('1.0–30.0 [inch]')), [10, 300], 'Shell Depth');
eq(V.hintFormat(V.parseHint('-5–NORMAL–+5'), 0), 'NORMAL', 'NORMAL');
eq(V.parseHint('OFF, TAPE1–TAPE4, GEL1–3, RING1–2').items.length, 10, 'Muffling snare');
eq(V.parseHint('Note "Note"(p. 107)').items.length, 22, 'Note');
// 7. Все типы FX имеют таблицу параметров (кроме THRU) и не длиннее 32
const types = V.BLOCKS.KitFx.byName['Bus Fx Type'].fmt.items;
for (const t of types) {
  const ps = V.D.fx[t] || [];
  if (t !== 'THRU' && !ps.length) { fails++; console.log('FAIL нет параметров FX', t); }
  if (ps.length > 32) { fails++; console.log('FAIL больше 32 параметров', t, ps.length); }
}
for (const t in window.V31TYPED.VEDIT) if (window.V31TYPED.VEDIT[t].length > 40) { fails++; console.log('FAIL V-EDIT > 40', t); }

// 8. Эмулятор: запрос блока возвращает DT1 правильного размера
let got = null;
const emu = V.makeEmulator((m) => { got = V.parseSysex(m); });
emu.send(V.rq1(V.ADDR.layer(5, 1, 12), V.BLOCKS.KitUnitLayer.size));
setTimeout(() => {
  eq(got && got.kind, 'dt1', 'эмулятор DT1');
  eq(got && got.data.length, V.BLOCKS.KitUnitLayer.size, 'эмулятор размер');
  eq(got && got.ok, true, 'эмулятор checksum');
  console.log(`${n} проверок кодирования; ошибок: ${fails}`);
  process.exit(fails ? 1 : 0);
}, 100);
