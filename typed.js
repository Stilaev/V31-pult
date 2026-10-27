/*
 * Параметры, которые в адресной карте V31 названы обобщённо («V-EDIT Parameter 1–40»,
 * «Reverb Parameter 1–20», «Comp Parameter 1–16» …). Их смысл зависит от типа
 * (группы инструмента, типа реверба, компрессора) и взят из V31 Data List по порядку строк.
 * Каждая запись: [имя, диапазон значения как в Data List].
 * Порядок и кодировку значений нужно сверить на модуле (в приложении — «Инженерный режим»).
 */
window.V31TYPED = (function () {
  const MUFF_MICDIST = '-5–NORMAL–+5';
  const VEDIT = {
    KICK: [
      ['Tuning', '-100–+100'],
      ['Muffling', 'OFF, TAPE1–2, BLANKET1–3, WEIGHT1–2'],
      ['Head Type', 'CLEAR, COATED, PINSTRIPE'],
      ['Shell Depth', '1.0–30.0 [inch]'],
      ['Beater Type', 'FELT1–2, WOOD, PLASTIC1–2'],
      ['Mic Distance', MUFF_MICDIST],
      ['Mic Size', 'NORMAL, LARGE'],
    ],
    SNARE: [
      ['Tuning', '-100–+100'],
      ['Muffling', 'OFF, TAPE1–TAPE4, GEL1–3, RING1–2'],
      ['Head Type', 'CLEAR, COATED, PINSTRIPE'],
      ['Shell Depth', '1.0–20.0 [inch]'],
      ['Overtone', '-5–+5'],
      ['Mic Distance', MUFF_MICDIST],
      ['Strainer Adjust', '0–32'],
      ['Wire Type', 'DEFAULT, TYPE1–TYPE3'],
      ['Wire Level', '-6–NORMAL–+6'],
    ],
    TOM: [
      ['Tuning', '-100–+100'],
      ['Muffling', 'OFF, TAPE1–6, GEL1–4, FELT1–2'],
      ['Head Type', 'CLEAR, COATED, PINSTRIPE'],
      ['Shell Depth', '1.0–30.0 [inch]'],
      ['Mic Distance', MUFF_MICDIST],
    ],
    HIHAT: [
      ['Size', '1.0–40.0 [inch]'],
      ['Thickness', '-5–NORMAL–+5'],
      ['Fixed', 'NORMAL, PRESS, CLOSE, HALF1, HALF2, OPEN'],
    ],
    CYMBAL: [
      ['Size', '1.0–40.0 [inch]'],
      ['Thickness', '-5–NORMAL–+5'],
      ['Muffling', 'OFF, TAPE1–12'],
      ['Sizzle Type', 'OFF, RIVET1, CHAIN, BEADS, COIN, RIVET2'],
      ['Sizzle Amount', '-3–+3'],
      ['Low Cut', 'OFF, HALF, FULL'],
    ],
    SYNTH: [
      ['Template', ''],
      ['Waveform', 'SINE, WNOISE, SAW, TRI, SQR, RAMP, JUNO'],
      ['Mono/Poly', 'MONO, POLY'],
      ['Start Phase', 'OFF, 45, 90, 135, 180, 225, 270, 315°'],
      ['Shape', '0–127'],
      ['Fat', '0–127'],
      ['Pitch EnvSw', 'OFF, ON'],
      ['Pitch T1', '5–10000 [ms]'], ['Pitch T2', '5–10000 [ms]'], ['Pitch T3', '5–10000 [ms]'],
      ['Pitch L0', '20–10000 [Hz]'], ['Pitch L1', '20–10000 [Hz]'], ['Pitch L2', '20–10000 [Hz]'], ['Pitch L3/FREQ', '20–10000 [Hz]'],
      ['Pitch VeloSens', '0–127'],
      ['Pitch EnvCurve', '0–127'],
      ['Filter EnvSw', 'OFF, ON'],
      ['Filter T1', '5–10000 [ms]'], ['Filter T2', '5–10000 [ms]'], ['Filter T3', '5–10000 [ms]'],
      ['Filter L0', '20–10000 [Hz]'], ['Filter L1', '20–10000 [Hz]'], ['Filter L2', '20–10000 [Hz]'], ['Filter L3/FREQ', '20–10000 [Hz]'],
      ['Filter VeloSens', '0–127'],
      ['Filter EnvCurve', '0–127'],
      ['Filter Type', 'THRU, LPF12, BPF12, HPF12, LPF24, BPF24, HPF24'],
      ['Filter Reso', '0–127'],
      ['Amp T1', '5–10000 [ms]'], ['Amp T2', '5–10000 [ms]'], ['Amp T3', '5–10000 [ms]'],
      ['Amp L0', '-INF, -60–0 [dB]'], ['Amp L1', '-INF, -60–0 [dB]'], ['Amp L2', '-INF, -60–0 [dB]'],
      ['Amp VeloCurve', 'LIN, LOG1, LOG2, EXP1, EXP2, ARCT, TAN'],
      ['Amp EnvCurve', '0–127'],
      ['Volume', '-INF, -60–+12 [dB]'],
    ],
    USER: [
      ['Pitch', '-100–+100'],
      ['Decay', '1–100'],
      ['Nuance', 'OFF, SNR HEAD, TOM HEAD, CYM EDGE'],
    ],
    OTHER: [
      ['Pitch', '-100–+100'],
      ['Muffling', 'OFF, MUFF+1–MUFF+8, MUFF MAX'],
    ],
  };
  const VEDIT_NAMES = {
    KICK: 'Бочка', SNARE: 'Малый / кросс-стик', TOM: 'Том', HIHAT: 'Хай-хэт',
    CYMBAL: 'Тарелки', SYNTH: 'Synth Wave', USER: 'Пользовательский сэмпл', OTHER: 'Прочие группы',
  };
  function veditForGroup(g) {
    if (!g) return null;
    if (g === 'KICK') return 'KICK';
    if (g === 'SNARE' || g === 'CROSS STICK') return 'SNARE';
    if (g === 'TOM') return 'TOM';
    if (/^HI-HAT/.test(g)) return 'HIHAT';
    if (/^(RIDE|CRASH|CHINA|SPLASH|STACKED CYMBAL)$/.test(g)) return 'CYMBAL';
    if (g === 'SYNTH WAVE') return 'SYNTH';
    if (g === 'OFF') return null;
    return 'OTHER';
  }

  const REVERB = {
    'TD-50 REVERB': [
      ['Reverb Type', 'ROOM1, ROOM2, HALL1, HALL2, PLATE'],
      ['Pre Delay', '0–100 [ms]'], ['Time', '0.1–10.0 [s]'], ['Density', '0–127'], ['Diffusion', '0–127'],
      ['LF Damp', '0–100'], ['HF Damp', '0–100'], ['Spread', '0–127'], ['Tone', '0–127'],
    ],
    'TD-50 ROOM': [
      ['Type', 'BEACH, LIVING ROOM, BATH ROOM, STUDIO, GARAGE, LOCKER ROOM, THEATER, CAVE, GYMNASIUM, DOME STADIUM, BOOTH A, BOOTH B, STUDIO A, STUDIO B, BASEMENT, JAZZ CLUB, ROCK CLUB, BALLROOM, GATE, CONCERT HALL, SPORTS ARENA, EXPO HALL, BOTTLE, CITY, SPIRAL'],
      ['Room Size', 'TINY, SMALL, MEDIUM, LARGE, HUGE'], ['Room Shape', '0–100'],
      ['Wall Type', 'CURTAIN, CLOTH, WOOD, PLASTER, CONCRETE, GLASS'],
      ['Mic Position', 'NEXT DOOR, LOW FLOOR, LOW, MID LOW, MID, MID HIGH, HIGH, CEILING A, CEILING B'],
    ],
    'WARM HALL': [
      ['Pre Delay', '0.0–100.0 [ms]'], ['Time', '0.3–30.0 [s]'], ['Pre LPF', '16–15000 [Hz]'], ['Pre HPF', '16–15000 [Hz]'],
      ['PreLoop LPF', '16–15000 [Hz]'], ['Diffusion', '0–127'], ['HF Damp Freq', '1000–8000 [Hz]'], ['HF Damp Ratio', '0.1–1.0'],
    ],
    'SRV-2000': [
      ['Selection', 'R0.3, R1.0, R7.0, R15, R22, R26, R32, R37, H15, H22, H26, H32, H37, P-B, P-A'],
      ['Pre Delay', '0–160 [ms]'], ['Time', '0.1–99.0 [s]'], ['HF Damp', '0.05–1.00'], ['Density', '0–9'],
      ['Attack Gain', '0–9'], ['Attack Time', '0–9'], ['ER Density', '0–9'], ['ER Level', '0–99'],
      ['EQ Low Freq', '0.04–1.00 [kHz]'], ['EQ Low Gain', '-24–+12 [dB]'], ['EQ Mid Freq', '0.25–9.99 [kHz]'],
      ['EQ Mid Gain', '-24–+12 [dB]'], ['EQ Mid Q', '0.2–9.0'], ['EQ Hi Freq', '0.80–9.99 [kHz]'],
      ['EQ Hi Gain', '-24–+12 [dB]'], ['EQ Hi Q', '0.2–9.0'],
    ],
    'SRV-2000(NLR)': [
      ['Pre Delay', '0–120 [ms]'], ['Reverb Time', '-0.9–+99.0 [s]'], ['Gate Time', '10–450 [ms]'],
      ['EQ Low Freq', '0.04–1.00 [kHz]'], ['EQ Low Gain', '-24–+12 [dB]'], ['EQ Mid Freq', '0.25–9.99 [kHz]'],
      ['EQ Mid Gain', '-24–+12 [dB]'], ['EQ Mid Q', '0.2–9.0'], ['EQ Hi Freq', '0.80–9.99 [kHz]'],
      ['EQ Hi Gain', '-24–+12 [dB]'], ['EQ Hi Q', '0.2–9.0'],
    ],
    'SIMPLE REVERB': [
      ['Type', 'ROOM1, ROOM2, STAGE1, STAGE2, HALL1, HALL2, DELAY, PAN-DELAY'], ['Time', '0–127'],
      ['HF Damp', '200 [Hz]–BYPASS'], ['Delay Feedback', '0–127'],
    ],
    'LONG REVERB': [
      ['Depth', '0–127'], ['Time', '0–127'], ['Pre LPF', '16–15000 [Hz]'], ['Pre HPF', '16–15000 [Hz]'],
      ['Peaking Freq', '200–8000 [Hz]'], ['Peaking Gain', '-15–+15 [dB]'], ['Peaking Q', '0.5–8.0'],
      ['HF Damp', '16–15000 [Hz]'], ['LF Damp', '16–15000 [Hz]'],
    ],
  };
  const REVERB_TYPES = ['TD-50 REVERB', 'TD-50 ROOM', 'WARM HALL', 'SRV-2000', 'SRV-2000(NLR)', 'SIMPLE REVERB', 'LONG REVERB'];

  const ROOM = {
    REALISTIC: [
      ['Place', 'ISOLATION ROOM, WOOD STUDIO, MODERN STUDIO, LIVE HOUSE, SMALL STAGE, SMALL HALL, HALL STAGE, HALL AUDIENCE, CATHEDRAL, STADIUM STAGE, STADIUM AUDIENCE, CAVE'],
      ['Distance', '0–6'],
      ['Time', '-64–0'],
    ],
    SYNTHETIC: [
      ['Input Gain', '-48–+16 [dB]'],
      ['Character', 'Air, Dimensional, Fog, Roomy, Chamber, Solid, Light, Session, Metal'],
      ['Time', '0.1–1.5 [s]'],
      ['Attack Time', '1–10'],
      ['HF Damp Freq', '1000–8000 [Hz]'],
      ['HF Damp', '0.01–1.00'],
      ['Pre Delay', '0–50 [ms]'],
      ['Spread', '0.00–1.50'],
      ['Gate Switch', 'OFF, ON'],
      ['Gate Threshold', '-60–+6 [dB]'],
      ['Gate Hold Time', '0–500 [ms]'],
      ['Gate Release Time', '10–500 [ms]'],
    ],
  };

  // Список из MIDI Implementation (Pre/Post Comp Ratio Room/Overhead): тот же компрессор Roland
  const RATIO = '1:1, 2:1, 3:1, 4:1, 8:1, 16:1, 32:1, INF:1';
  const KNEE = 'HARD, SOFT1–3';
  const FET = [
    ['Compression', 'OFF, ON'],
    ['Input Level', '-INF, -30.0–+30.0 [dB]'],
    ['Output Level', '-INF, -54.0–+6.0 [dB]'],
    ['Attack', '0.0–7.0'],
    ['Release', '0.0–7.0'],
    ['Ratio Mode', 'ALL, 20, 12, 8, 4'],
    ['Balance', 'D100:0W–D0:100W'],
  ];
  const COMP = {
    PAD_STANDARD: [
      ['Threshold', '-48–0 [dB]'], ['Gain', '-24.0–+24.0 [dB]'], ['Attack', '0.1–100 [ms]'], ['Release', '10–1000 [ms]'],
      ['Ratio', RATIO], ['Knee', KNEE], ['Balance', 'D100:0W–D0:100W'],
    ],
    PAD_FET: FET,
    KIT_STANDARD: [
      ['Balance', 'D100:0W–D0:100W'], ['Split Freq', 'SINGLE, 10–16000 [Hz]'],
      ['Hi Threshold', '-60–0 [dB]'], ['Hi Gain', '-60.0–+24.0 [dB]'], ['Hi Attack', '0.1–100 [ms]'], ['Hi Release', '10–1000 [ms]'],
      ['Hi Ratio', RATIO], ['Hi Knee', KNEE],
      ['Lo Threshold', '-60–0 [dB]'], ['Lo Gain', '-60.0–+24.0 [dB]'], ['Lo Attack', '0.1–100 [ms]'], ['Lo Release', '10–1000 [ms]'],
      ['Lo Ratio', RATIO], ['Lo Knee', KNEE],
    ],
    KIT_FET: FET,
  };

  // Порядок как в «Trig Type list» Data List (стр. 47); соответствие номерам сверить на модуле.
  const TRIG_TYPES = ['KD-A22', 'KD-22', 'KD-222', 'KD-220', 'KD-200', 'KD-20', 'KD-18', 'KD-180', 'KD-180L', 'KD-140', 'KD-12',
    'KD-120', 'KD-85', 'KD-10', 'KD-9', 'KD-8', 'KD-7', 'KDQ-8', 'KT-10', 'KT-9', 'PDA120', 'PDA120L', 'PDA100', 'PDA100L',
    'PDA140F', 'PD-12X', 'PD-12P', 'PD-128', 'PD-125X', 'PD-125', 'PD-10X', 'PD-10P', 'PD-108', 'PD-105X', 'PD-105', 'PD-85',
    'PDX-100', 'PDX-12', 'PD-10H', 'PD-8H', 'PDX-8', 'PDX-6', 'PDQ-8S', 'PDQ-8', 'PD-8', 'VH-13', 'VH-12', 'VH-11', 'VH-10',
    'CY-16R-T', 'CY-15R', 'CY-14R-T', 'CY-14C-T', 'CY-14C', 'CY-13R', 'CY-12C', 'CY-12R/C', 'CY-12C-T', 'CY-8', 'CY-5',
    'CYQ-12', 'BT-1', 'BT-1 SENS', 'PAD1', 'PAD2', 'PAD3', 'RT-30K', 'RT-30HR', 'RT-30H SN', 'RT-30H TM', 'RT-10K', 'RT-10S',
    'RT-10T'];

  return { VEDIT, VEDIT_NAMES, veditForGroup, REVERB, REVERB_TYPES, ROOM, COMP, TRIG_TYPES };
})();
