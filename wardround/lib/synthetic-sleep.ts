import type { ReadSleep, Stage } from "./ward";

type Reading = readonly [minute: number, stage: Stage, n3Score: number];

const READINGS: Record<string, readonly Reading[]> = {
  th: [[0, "Light sleep", 12], [135, "REM sleep", 8], [240, "Deep sleep", 92], [307, "Awake", 2],
    [338, "Light sleep", 12], [400, "Awake", 1], [1320, "Light sleep", 15], [1390, "Deep sleep", 70]],
  mr: [[0, "Light sleep", 13], [108, "Deep sleep", 85], [157, "Light sleep", 11], [275, "Deep sleep", 91],
    [300, "Light sleep", 14], [318, "REM sleep", 4],
    [350, "Deep sleep", 85], [369, "Light sleep", 8], [415, "Awake", 3], [1350, "Light sleep", 11]],
  np: [[0, "Light sleep", 14], [98, "Deep sleep", 88], [134, "Light sleep", 12], [195, "REM sleep", 8], [280, "Light sleep", 13],
    [320, "Deep sleep", 77], [372, "Light sleep", 15], [407, "Awake", 1], [1330, "Light sleep", 18], [1380, "Deep sleep", 80]],
  er: [[0, "Light sleep", 15], [189, "Deep sleep", 90], [310, "Light sleep", 14], [362, "Awake", 4],
    [402, "Light sleep", 11], [435, "Awake", 2], [830, "Light sleep", 14], [855, "Awake", 2], [1370, "Light sleep", 16]],
  jw: [[0, "Deep sleep", 72], [116, "Light sleep", 17], [320, "Deep sleep", 63], [344, "Light sleep", 14],
    [388, "Awake", 2], [1305, "Light sleep", 14]],
};

export const syntheticReading: ReadSleep = (patientId, minute) => {
  const [, stage, deepSleepScore] = READINGS[patientId].findLast(([at]) => at <= minute)!;
  return { stage, deepSleepScore };
};
