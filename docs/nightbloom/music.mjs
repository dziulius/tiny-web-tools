import {writeFile} from 'node:fs/promises';

const SAMPLE_RATE = 22050;
const STEPS_PER_LOOP = 32;
const STEP_DURATION = 60 / 116 / 2;
const LOOP_DURATION = STEPS_PER_LOOP * STEP_DURATION;

// Original melody made for the game; no film recordings or melodies are used.
const MELODY = [
  659.25, 0, 783.99, 659.25, 587.33, 0, 523.25, 0,
  659.25, 0, 880, 783.99, 698.46, 659.25, 587.33, 0,
  587.33, 0, 659.25, 698.46, 783.99, 0, 659.25, 0,
  523.25, 0, 587.33, 659.25, 698.46, 587.33, 523.25, 0
];

const BASS_ROOTS = [
  164.81, 130.81, 146.83, 130.81,
  174.61, 146.83, 130.81, 130.81
];

export async function buildMusic(fileName) {
  const sampleCount = Math.floor(LOOP_DURATION * SAMPLE_RATE);
  const pcmBytes = sampleCount * 2;
  const wav = Buffer.alloc(44 + pcmBytes);
  writeWavHeader(wav, pcmBytes);

  let randomState = 123456789;

  for (let sample = 0; sample < sampleCount; sample++) {
    const time = sample / SAMPLE_RATE;
    const step = Math.floor(time / STEP_DURATION);
    const stepTime = time - step * STEP_DURATION;
    const groupTime = time - Math.floor(step / 4) * 4 * STEP_DURATION;
    const melodyFrequency = MELODY[step];
    const bassFrequency = BASS_ROOTS[Math.floor(step / 4)];

    let sound = 0;

    if (melodyFrequency) {
      const attack = Math.min(1, stepTime / 0.012);
      const release = Math.min(1, (STEP_DURATION - stepTime) / 0.05);
      const envelope = attack * release * Math.exp(-stepTime * 2.4);
      const phase = 2 * Math.PI * melodyFrequency * stepTime;
      sound += 0.17 * envelope * (Math.sin(phase) + 0.3 * Math.sin(2 * phase));
    }

    const bassRelease = Math.min(1, (4 * STEP_DURATION - groupTime) / 0.08);
    const bassAttack = Math.min(1, groupTime / 0.02);
    sound += 0.13 * bassAttack * bassRelease
      * Math.sin(2 * Math.PI * bassFrequency * groupTime);

    if (step % 4 === 0) {
      const kickFrequency = 55 + 85 * Math.exp(-stepTime * 24);
      sound += 0.28 * Math.exp(-stepTime * 26)
        * Math.sin(2 * Math.PI * kickFrequency * stepTime);
    }

    randomState = (1664525 * randomState + 1013904223) >>> 0;
    const noise = randomState / 0xffffffff * 2 - 1;

    if (step % 8 === 4) {
      sound += 0.1 * noise * Math.exp(-stepTime * 36);
    }

    if (step % 2 === 0) {
      sound += 0.028 * noise * Math.exp(-stepTime * 70);
    }

    const clamped = Math.max(-1, Math.min(1, sound * 0.78));
    wav.writeInt16LE(Math.round(clamped * 32767), 44 + sample * 2);
  }

  await writeFile(fileName, wav);
}

function writeWavHeader(wav, pcmBytes) {
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + pcmBytes, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcmBytes, 40);
}
