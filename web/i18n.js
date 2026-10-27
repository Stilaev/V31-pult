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
    'Switch': 'Вкл',
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
    'User Sample Transient Type': 'Тип транзиента (user sample)',
    'HH Open/Close Balance': 'Баланс открытого/закрытого хай-хэта',
    'Output Routing': 'Маршрут выхода',
    'Position Control': 'Position (по месту удара)',
    'Pad Side Chain Control': 'Управление сайдчейном',
    'Bus Send Level': 'Уровень посыла в шину',
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
    if ((m = n.match(/^(.*) Master Assign$/))) return m[1] + ': выход';
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
    GLOBAL: 'ОБЩИЙ', 'END (*2)': 'КОНЕЦ', SMALL: 'МАЛЕНЬКИЙ', MEDIUM: 'СРЕДНИЙ', LARGE: 'БОЛЬШОЙ',
    LOW: 'НИЗКАЯ', NORMAL: 'ОБЫЧНЫЙ', HIGH: 'ВЫСОКАЯ', 'PHONES ONLY': 'ТОЛЬКО НАУШНИКИ',
    'PHONES+MASTER(L+R)': 'НАУШНИКИ + MASTER', 'ON (Rim Click OFF)': 'ВКЛ (без щелчка обода)',
    '1: WHITE': 'Белый', '2: RED': 'Красный', '3: GREEN': 'Зелёный', '4: BLUE': 'Синий', '5: LIGHT BLUE': 'Голубой',
    '6: PINK': 'Розовый', '7: PURPLE': 'Фиолетовый', '8: ORANGE': 'Оранжевый', '9: YELLOW': 'Жёлтый',
    '10: EMERALD': 'Изумрудный', '11: CUSTOM': 'Свой (RGB)', SHELV: 'SHELF',
  };
  function value(s) {
    if (s === undefined || s === null) return s;
    if (VAL[s]) return VAL[s];
    const m = String(s).match(/^Channel (\d+)$/);
    if (m) return 'Канал ' + m[1];
    return s;
  }

  return { name, value };
})();
