export class GameAudio {
  constructor(musicElement, onStatusChange = () => {}) {
    this.music = musicElement;
    this.onStatusChange = onStatusChange;
    this.context = null;
    this.style = 'bright';
    this.wantsMusic = false;
    this.blocked = false;
    this.failure = null;
    this.playAttempt = 0;
    this.customTrackUrl = null;
    this.updateVolume();

    this.music.addEventListener('playing', () => {
      if (this.wantsMusic) {
        this.blocked = false;
        this.failure = null;
        this.onStatusChange();
      }
    });
  }

  setStyle(style) {
    this.style = style;
    this.updateVolume();

    if (style === 'off') {
      this.stop();
    }

    this.onStatusChange();
  }

  setTrack(file) {
    this.stop();
    this.releaseCustomTrack();
    this.customTrackUrl = URL.createObjectURL(file);
    this.music.src = this.customTrackUrl;
    this.music.load();
  }

  useBuiltInTrack() {
    this.stop();
    this.releaseCustomTrack();
    this.music.src = 'music.wav';
    this.music.load();
  }

  releaseCustomTrack() {
    if (this.customTrackUrl) {
      URL.revokeObjectURL(this.customTrackUrl);
      this.customTrackUrl = null;
    }
  }

  async start() {
    if (this.style === 'off') {
      return;
    }

    this.wantsMusic = true;
    const attempt = ++this.playAttempt;

    try {
      // Calling play() directly inside the Start button handler is important.
      // Browsers can reject playback that begins outside a user gesture.
      await this.music.play();

      if (attempt !== this.playAttempt || !this.wantsMusic) {
        return;
      }

      this.blocked = false;
      this.failure = null;
      this.onStatusChange();
    } catch (error) {
      if (attempt !== this.playAttempt || !this.wantsMusic) {
        return;
      }

      this.blocked = true;
      this.failure = error?.name ?? 'UnknownError';
      this.onStatusChange();
    }
  }

  stop() {
    this.wantsMusic = false;
    this.playAttempt++;
    this.music.pause();
    this.blocked = false;
    this.failure = null;
    this.onStatusChange();
  }

  async playTone(frequency, duration) {
    if (this.style === 'off') {
      return;
    }

    const context = await this.unlockEffects();

    if (!context || this.style === 'off') {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const volume = this.style === 'soft' ? 0.035 : 0.065;

    oscillator.type = this.style === 'soft' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  updateVolume() {
    this.music.volume = this.style === 'soft' ? 0.45 : this.style === 'off' ? 0 : 0.85;
  }

  async unlockEffects() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        return null;
      }

      try {
        this.context = new AudioContextClass();
      } catch {
        return null;
      }
    }

    if (this.context.state !== 'running') {
      try {
        await this.context.resume();
      } catch {
        return null;
      }
    }

    return this.context.state === 'running' ? this.context : null;
  }
}
