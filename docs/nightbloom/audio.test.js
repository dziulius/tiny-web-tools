import test from 'node:test';
import assert from 'node:assert/strict';

import {GameAudio} from './audio.js';

class FakeMusicElement {
  constructor() {
    this.volume = 0;
    this.paused = true;
    this.playCount = 0;
    this.allowPlayback = true;
    this.src = 'music.wav';
    this.loadCount = 0;
  }

  addEventListener() {}

  load() {
    this.loadCount++;
  }

  play() {
    this.playCount++;

    if (!this.allowPlayback) {
      return Promise.reject(new Error('Playback blocked'));
    }

    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

test('music starts, stops, and can retry after blocked playback', async () => {
  const music = new FakeMusicElement();
  const audio = new GameAudio(music);

  await audio.start();
  assert.equal(music.playCount, 1);
  assert.equal(music.paused, false);
  assert.equal(music.volume, 0.85);

  audio.stop();
  assert.equal(music.paused, true);

  music.allowPlayback = false;
  await audio.start();
  assert.equal(audio.blocked, true);

  music.allowPlayback = true;
  await audio.start();
  assert.equal(audio.blocked, false);
  assert.equal(music.paused, false);

  audio.setStyle('off');
  assert.equal(music.paused, true);
  assert.equal(music.volume, 0);
});

test('a local soundtrack file replaces the built-in loop without a network request', () => {
  const music = new FakeMusicElement();
  const audio = new GameAudio(music);
  const song = new Blob(['local audio'], {type: 'audio/mpeg'});

  audio.setTrack(song);
  assert.match(music.src, /^blob:/);
  assert.equal(music.loadCount, 1);

  audio.useBuiltInTrack();
  assert.equal(music.src, 'music.wav');
  assert.equal(music.loadCount, 2);
});
