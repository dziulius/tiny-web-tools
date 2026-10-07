const BEST_KEY = 'nightbloom-best-v1';
const PROGRESS_KEY = 'nightbloom-progress-v1';

export function readBest() {
  try {
    return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0);
  } catch {
    return 0;
  }
}

export function writeBest(score) {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Storage can be disabled by the browser. The game remains playable.
  }
}

export function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    const isValid = saved
      && Number.isInteger(saved.level)
      && saved.level >= 2
      && Number.isFinite(saved.score);

    if (!isValid) {
      return null;
    }

    return {
      level: saved.level,
      score: Math.max(0, Math.floor(saved.score)),
      speed: ['low', 'medium', 'high'].includes(saved.speed) ? saved.speed : 'medium',
      audio: ['bright', 'soft', 'off'].includes(saved.audio) ? saved.audio : 'bright'
    };
  } catch {
    return null;
  }
}

export function writeProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Saving is best-effort when storage is unavailable.
  }
}

export function clearProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Saving is best-effort when storage is unavailable.
  }
}
