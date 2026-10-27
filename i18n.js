/*
 * Перевод только «бытовых» слов. Музыкальные термины (Pan, Decay, Gain, Q, Attack, Release,
 * Threshold, Transient, Overhead, Room, Reverb, Bus, Send, FX, Velocity, Note, названия
 * барабанов и эффектов) остаются как на модуле.
 */
window.V31I18N = (function () {
  'use strict';

  // Названия параметров целиком
  const EXACT = {
    'Volume': 'Громкость',
    'Level': 'Уровень',
    'Sound': 'Звук',
    'Type': 'Тип',
    'Time': 'Время',
    'Distance': 'Расстояние',
    'Character': 'Характер',
    'Switch': 'Включён',
    'Head Type': 'Тип пластика (Head)',
    'Beater Type': 'Колотушка (Beater)',
    'Mic Distance': 'Расстояние до микрофона',
    'Mic Size': 'Размер микрофона',
    'Wire Type': 'Тип пружин (Wire)',
    'Wire Level': 'Громкость пружин (Wire Level)',
    'Buzz Muffling': 'Buzz Muffling (глушение дребезга)',
    'Shell Depth': 'Глубина корпуса (Shell Depth)',
    'Transient Attack Type': 'Transient Attack Type',
    'Overhead Send Level': 'Посыл в Overhead',
    'Room Send Level': 'Посыл в Room',
    'Reverb Send Level': 'Посыл в Reverb',
    'Kit Resonance Send Level': 'Посыл в Kit Resonance',
    'Side Chain Control Send Level': 'Уровень сигнала для сайдчейна',
    'Usb Audio Input Gain': 'USB-вход: Gain',
    'Usb Audio Output Gain': 'USB-выход: Gain',
    'Low Cut Freq': 'Low Cut: частота',
    'AmbVol': 'Громкость эмбиенса (AmbVol)',
    'Snare Buzz Sens': 'Snare Buzz Sens (дребезг малого от этого пэда)',
    'Red': 'Красный',
    'Green': 'Зелёный',
    'Blue': 'Синий',
    'Kit Color': 'Цвет кита',
    'Kit Image': 'Картинка кита',
    'Kit Name Size': 'Размер имени кита',
    'Kit Favorite Switch': 'Избранный кит',
    'Kit Tempo': 'Темп кита',
    'Kit Tempo Switch': 'Свой темп кита',
    'Kit Phrase': 'Фраза кита',
    'Global Kit Image': 'Картинка кита (для всех)',
    'Global Kit Name Size': 'Размер имени кита (для всех)',
    'Global Sens': 'Общая чувствительность',
    'Trig Bank Number': 'Банк триггеров',
    'Trig Type': 'Тип пэда',
    'Closed Pedal Volume': 'Громкость закрытой педали',
    'Minimum Volume': 'Минимальная громкость',
    'Output Width': 'Ширина',
    'Mic Type': 'Тип микрофона',
    'Drums Type': 'Тип набора',
    'Room Switch': 'Room',
    'Reverb Switch': 'Reverb',
    'Overhead Switch': 'Overhead',
    'Inst Switch': 'Слой включён',
    'Inst Bank': 'Банк инструмента',
    'Bus Fx Switch': 'Эффект включён',
    'Bus Fx Type': 'Тип эффекта',
    'Bus Level': 'Уровень шины',
    'Layer Mode': 'Режим слоёв',
    'Strainer Mode': 'Режим страйнера',
    'Strainer Lever Function': 'Функция рычага страйнера',
    'Strainer Knob Function': 'Функция ручки страйнера',
    'Strainer Switch Function': 'Функция кнопки страйнера',
    'Brush Switch': 'Щётки',
    'Analog XStick': 'XStick (аналоговый пэд)',
    'MASTER/PHONES Knob Type': 'Ручка MASTER/PHONES',
    'Fixed Master Volume': 'Фиксированная громкость MASTER',
    'Phones Low Cut': 'Low Cut на наушниках',
    'Master Low Cut': 'Low Cut на MASTER',
    'Usb Audio Input MAIN Volume Select': 'USB-вход MAIN: регулятор громкости',
    'Usb Audio Input SUB Volume Select': 'USB-вход SUB: регулятор громкости',
    'Pad Comp Output Volume': 'Громкость после компрессора',
    'Pedal Bend Range': 'Диапазон Pedal Bend',
    'Position Area': 'Зона Position',
    'Velocity Lower': 'Velocity: нижняя граница',
    'Velocity Upper': 'Velocity: верхняя граница',
    'Mute Group Send': 'Mute Group: глушит группу',
    'Mute Group Receive': 'Mute Group: глушится группой',
    'Overhead Send Filter Select': 'Фильтр посыла в Overhead',
    'Overhead Template': 'Шаблон Overhead',
    'Template (Type: STANDARD)': 'Шаблон (STANDARD)',
    'Template (Type: FETCOMP-76)': 'Шаблон (FETCOMP-76)',
    'ReverbType': 'Тип реверба',
    'Reverb Type': 'Вариант (Reverb Type)',
    'User Sample Transient Type': 'Тип транзиента (user sample)',
    'HH Open/Close Balance': 'Баланс открытого/закрытого хай-хэта',
    'Output Routing': 'Отправка в шину эффектов',
    'Ext Noise Cancel': 'Подавление внешних помех (Ext Noise Cancel)',
    'Position Control': 'Position (по месту удара)',
    'Pad Side Chain Control': 'Управление сайдчейном',
    'Bus Send Level': 'Уровень посыла в шину',
    'Bus-A Output': 'Шина A → дальше', 'Bus-B Output': 'Шина B → дальше', 'Bus-C Output': 'Шина C → дальше',
    'Bus Send Head/Rim': 'Посыл в шину: пэд целиком / пластик и обод отдельно',
  };

  // Последнее слово названия → русское слово в начало: «Kit Comp Type» → «Тип Kit Comp»
  const TAIL = {
    Type: 'Тип', Mode: 'Режим', Level: 'Уровень', Volume: 'Громкость', Select: 'Выбор', Function: 'Функция',
    Control: 'Управление', Size: 'Размер', Color: 'Цвет', Image: 'Картинка', Number: 'Номер', Template: 'Шаблон',
    Offset: 'Смещение', Sens: 'Чувствительность', Width: 'Ширина', Distance: 'Расстояние', Output: 'Выход',
    Routing: 'Маршрут', Area: 'Зона', Range: 'Диапазон', Character: 'Характер', Time: 'Время',
  };
  // В этих сочетаниях «Time»/«Sens» — термины, не переводим
  const KEEP = /^(Scan Time|Mask Time|Gate Time.*|Snare Buzz Sens|Velocity Fade (In|Out) Sens|Transient Attack Time|Inst Pitch|Inst Decay|.*Attack Time)$/;

  function name(n) {
    if (!n) return n;
    if (EXACT[n]) return EXACT[n];
    let m;
    if ((m = n.match(/^(.*) Master Assign$/))) return m[1] + ': на какие выходы';
    if ((m = n.match(/^(.*) XTalk Cancel$/))) return m[1] + ': подавление XTalk';
    if ((m = n.match(/^Channel (.*)$/))) return 'Канал ' + m[1];
    if ((m = n.match(/^Strainer Lever (.*) Control$/))) return 'Рычаг страйнера → ' + m[1];
    if ((m = n.match(/^(.*?) ?(Switch|Sw)$/)) && m[1]) return m[1];
    if ((m = n.match(/^(.*) Noise Cancel$/))) return m[1] + ': подавление шумов';
    if ((m = n.match(/^(.*) Foot Splash Sens$/))) return m[1] + ': чувствительность Foot Splash';
    if (KEEP.test(n)) return n;
    const words = n.split(' ');
    const last = words[words.length - 1];
    if (words.length > 1 && TAIL[last]) return TAIL[last] + ' ' + words.slice(0, -1).join(' ');
    return n;
  }

  // Значения целиком
  const VAL = {
    OFF: 'ВЫКЛ', ON: 'ВКЛ', 'ALWAYS ON': 'ВСЕГДА ВКЛ', 'ALWAYS OFF': 'ВСЕГДА ВЫКЛ', DISABLE: 'НЕТ',
    'LEVER ON': 'РЫЧАГ ВКЛ', 'LEVER OFF': 'РЫЧАГ ВЫКЛ', 'FUNCTION OFF': 'НЕТ', DEFAULT: 'ПО УМОЛЧАНИЮ',
    GLOBAL: 'ОБЩИЙ', 'END (*2)': 'КОНЕЦ',
    'PHONES ONLY': 'ТОЛЬКО НАУШНИКИ',
    'PHONES+MASTER(L+R)': 'НАУШНИКИ + MASTER',
    DRUM: 'БЕЗ ЭФФЕКТА', 'DRUM + SEND BUS A': 'ПОСЫЛ В ШИНУ A', 'DRUM + SEND BUS B': 'ПОСЫЛ В ШИНУ B',
    'DRUM + SEND BUS C': 'ПОСЫЛ В ШИНУ C', 'DRUM + SEND BUS D': 'ПОСЫЛ В ШИНУ D',
    'INSERT TO BUS A': 'ЦЕЛИКОМ ЧЕРЕЗ ШИНУ A', 'INSERT TO BUS B': 'ЦЕЛИКОМ ЧЕРЕЗ ШИНУ B',
    'INSERT TO BUS C': 'ЦЕЛИКОМ ЧЕРЕЗ ШИНУ C', 'INSERT TO BUS D': 'ЦЕЛИКОМ ЧЕРЕЗ ШИНУ D', 'ON (Rim Click OFF)': 'ВКЛ (без щелчка обода)',
    '1: WHITE': 'Белый', '2: RED': 'Красный', '3: GREEN': 'Зелёный', '4: BLUE': 'Синий', '5: LIGHT BLUE': 'Голубой',
    '6: PINK': 'Розовый', '7: PURPLE': 'Фиолетовый', '8: ORANGE': 'Оранжевый', '9: YELLOW': 'Жёлтый',
    '10: EMERALD': 'Изумрудный', '11: CUSTOM': 'Свой (RGB)', SHELV: 'SHELF',
  };
  // Где «бытовые» слова зависят от параметра
  const CTX = [
    [/Mic Size|Размер микрофона/, { NORMAL: 'ОБЫЧНЫЙ', LARGE: 'БОЛЬШОЙ' }],
    [/Kit Name Size|Размер имени/, { SMALL: 'МАЛЕНЬКИЙ', MEDIUM: 'СРЕДНИЙ', LARGE: 'БОЛЬШОЙ' }],
  ];
  function value(s, ctx) {
    if (s === undefined || s === null) return s;
    if (ctx) for (const [re, map] of CTX) if (re.test(ctx) && map[s]) return map[s];
    if (VAL[s]) return VAL[s];
    const m = String(s).match(/^Channel (\d+)$/);
    if (m) return 'Канал ' + m[1];
    return s;
  }

  return { name, value };
})();
