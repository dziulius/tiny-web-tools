import {
  applyGravity,
  canPlace,
  cellsFor,
  countBlights,
  disconnectClearedPairs,
  emptyBoard,
  findMatches,
  gravityFramesFor,
  randomPair,
  scoreForBlights,
  seedBlights
} from './engine.js';
import {createInput} from './input.js';
import {GameAudio} from './audio.js';
import {Renderer} from './renderer.js';
import {
  clearProgress,
  readBest,
  readProgress,
  writeBest,
  writeProgress
} from './storage.js';

const FRAME_DURATION = 1000 / 60;
const SPEEDS = ['low', 'medium', 'high'];
const AUDIO_STYLES = ['bright', 'soft', 'off'];

const elements = {
  gameCanvas: document.querySelector('#gameCanvas'),
  nextCanvas: document.querySelector('#nextCanvas'),
  best: document.querySelector('#best'),
  score: document.querySelector('#score'),
  levelDisplay: document.querySelector('#levelDisplay'),
  speedDisplay: document.querySelector('#speedDisplay'),
  blights: document.querySelector('#blights'),
  status: document.querySelector('#status'),
  overlay: document.querySelector('#overlay'),
  overlayKicker: document.querySelector('#overlayKicker'),
  overlayTitle: document.querySelector('#overlayTitle'),
  overlayText: document.querySelector('#overlayText'),
  setupPanel: document.querySelector('#setupPanel'),
  levelInput: document.querySelector('#levelInput'),
  levelOutput: document.querySelector('#levelOutput'),
  levelTrack: document.querySelector('#levelTrack'),
  startButton: document.querySelector('#startBtn'),
  restartButton: document.querySelector('#restartBtn'),
  homeButton: document.querySelector('#pickerBtn'),
  soundButton: document.querySelector('#soundBtn'),
  audioHelp: document.querySelector('#audioHelp'),
  audioNotice: document.querySelector('#audioNotice'),
  musicPlayer: document.querySelector('#musicPlayer'),
  trackInput: document.querySelector('#trackInput'),
  trackName: document.querySelector('#trackName'),
  resetTrackButton: document.querySelector('#resetTrackBtn'),
  pauseButton: document.querySelector('#pauseBtn'),
  performanceCard: document.querySelector('.performance-card')
};

const renderer = new Renderer(elements.gameCanvas, elements.nextCanvas);
const audio = new GameAudio(elements.musicPlayer, updateAudioStatus);

let board = emptyBoard();
let activePiece = null;
let nextColors = randomPair();
let score = 0;
let bestScore = readBest();
let level = 1;
let selectedLevel = 1;
let selectedSpeed = 'medium';
let selectedAudio = 'bright';
let selectedSetupRow = 0;
let piecesLocked = 0;
let nextPairId = 1;
let running = false;
let paused = false;
let resolving = false;
let lastFrameTime = 0;
let accumulatedFallTime = 0;
let animationFrame = 0;
let runToken = 0;
let primaryOverlayAction = () => startNewRun(selectedLevel, 0);
let secondaryOverlayAction = null;

buildLevelTrack();
wireInterface();
createInput({
  getMode,
  onAction: handleAction
});
showHomeScreen();

function buildLevelTrack() {
  for (let room = 1; room <= 20; room++) {
    const tick = document.createElement('i');
    tick.dataset.level = String(room);
    elements.levelTrack.append(tick);
  }
}

function wireInterface() {
  elements.startButton.addEventListener('click', () => {
    primaryOverlayAction();
  });

  elements.restartButton.addEventListener('click', () => {
    if (secondaryOverlayAction) {
      secondaryOverlayAction();
    }
  });

  elements.homeButton.addEventListener('click', showHomeScreen);
  elements.pauseButton.addEventListener('click', togglePause);
  elements.soundButton.addEventListener('click', toggleSound);
  elements.trackInput.addEventListener('change', chooseTrack);
  elements.resetTrackButton.addEventListener('click', useBuiltInTrack);

  for (const row of document.querySelectorAll('[data-setup-row]')) {
    row.addEventListener('click', () => {
      selectSetupRow(Number(row.dataset.setupRow));
    });
  }

  for (const button of document.querySelectorAll('[data-speed]')) {
    button.addEventListener('click', () => {
      selectSetupRow(1);
      setSpeed(button.dataset.speed);
    });
  }

  for (const button of document.querySelectorAll('[data-audio]')) {
    button.addEventListener('click', () => {
      selectSetupRow(2);
      setAudio(button.dataset.audio, true);
    });
  }
}

function getMode() {
  if (!elements.setupPanel.hidden) {
    return 'setup';
  }

  if (paused) {
    return 'paused';
  }

  if (running) {
    return 'playing';
  }

  return 'overlay';
}

function handleAction(action) {
  const mode = getMode();

  if (mode === 'setup') {
    handleSetupAction(action);
    return;
  }

  if (mode === 'paused') {
    if (action === 'pause' || action === 'start') {
      resumeGame();
    } else if (action === 'home') {
      showHomeScreen();
    }
    return;
  }

  if (mode === 'overlay') {
    if (action === 'start' || action === 'rotate-clockwise') {
      elements.startButton.click();
    } else if (action === 'home') {
      showHomeScreen();
    }
    return;
  }

  handlePlayingAction(action);
}

function handleSetupAction(action) {
  if (action === 'up') {
    selectSetupRow((selectedSetupRow + 2) % 3);
  } else if (action === 'down') {
    selectSetupRow((selectedSetupRow + 1) % 3);
  } else if (action === 'left') {
    adjustSetupValue(-1);
  } else if (action === 'right') {
    adjustSetupValue(1);
  } else if (action === 'start' || action === 'rotate-clockwise') {
    elements.startButton.click();
  }
}

function handlePlayingAction(action) {
  if (action === 'home') {
    showHomeScreen();
    return;
  }

  if (action === 'pause') {
    pauseGame();
    return;
  }

  if (!activePiece || resolving) {
    return;
  }

  if (action === 'left') {
    moveActivePiece(-1, 0);
  } else if (action === 'right') {
    moveActivePiece(1, 0);
  } else if (action === 'down') {
    stepDown(true);
  } else if (action === 'rotate-clockwise') {
    rotateActivePiece(1);
  } else if (action === 'rotate-counterclockwise') {
    rotateActivePiece(-1);
  } else if (action === 'drop') {
    hardDrop();
  }
}

function selectSetupRow(rowIndex) {
  selectedSetupRow = rowIndex;

  for (const row of document.querySelectorAll('[data-setup-row]')) {
    row.classList.toggle('active', Number(row.dataset.setupRow) === rowIndex);
  }
}

function adjustSetupValue(direction) {
  if (selectedSetupRow === 0) {
    selectedLevel = clamp(selectedLevel + direction, 1, 20);
    updateSetupDisplay();
    return;
  }

  if (selectedSetupRow === 1) {
    const currentIndex = SPEEDS.indexOf(selectedSpeed);
    const nextIndex = clamp(currentIndex + direction, 0, SPEEDS.length - 1);
    setSpeed(SPEEDS[nextIndex]);
    return;
  }

  const currentIndex = AUDIO_STYLES.indexOf(selectedAudio);
  const nextIndex = clamp(currentIndex + direction, 0, AUDIO_STYLES.length - 1);
  setAudio(AUDIO_STYLES[nextIndex], true);
}

function setSpeed(speed) {
  selectedSpeed = speed;

  for (const button of document.querySelectorAll('[data-speed]')) {
    button.classList.toggle('active', button.dataset.speed === speed);
  }

  updateSetupDisplay();
}

function setAudio(style, preview = false) {
  selectedAudio = style;
  audio.setStyle(style);

  if ((running && !paused || preview) && style !== 'off') {
    audio.start();
  }

  for (const button of document.querySelectorAll('[data-audio]')) {
    button.classList.toggle('active', button.dataset.audio === style);
  }

  updateAudioStatus();
}

function updateSetupDisplay() {
  elements.levelInput.value = String(selectedLevel);
  elements.levelOutput.value = String(selectedLevel).padStart(2, '0');
  const levelPosition = ((selectedLevel - 1) / 19) * 100;
  elements.levelTrack.style.setProperty('--level-pos', `${levelPosition}%`);

  for (const tick of elements.levelTrack.children) {
    const tickLevel = Number(tick.dataset.level);
    tick.classList.toggle('filled', tickLevel <= selectedLevel);
    tick.classList.toggle('current', tickLevel === selectedLevel);
  }
}

function showHomeScreen() {
  runToken++;
  audio.stop();
  running = false;
  paused = false;
  resolving = false;
  activePiece = null;
  cancelAnimationFrame(animationFrame);

  document.body.classList.add('setup-mode');
  elements.overlay.hidden = false;
  elements.setupPanel.hidden = false;
  elements.overlayKicker.textContent = 'HUNTR/X // Encore';
  elements.overlayTitle.textContent = 'Protect the Honmoon.';
  elements.overlayText.textContent = 'The Saja Boys have weakened the Honmoon. Match four notes in a line to seal every demon breach.';
  elements.startButton.textContent = 'Start the show';
  elements.restartButton.hidden = true;
  primaryOverlayAction = () => startNewRun(selectedLevel, 0);
  secondaryOverlayAction = null;

  const progress = readProgress();
  if (progress) {
    elements.restartButton.hidden = false;
    elements.restartButton.textContent = `Continue stage ${progress.level}`;
    secondaryOverlayAction = () => {
      selectedSpeed = progress.speed;
      selectedAudio = progress.audio;
      startNewRun(progress.level, progress.score);
    };
  }

  updateSetupDisplay();
  setSpeed(selectedSpeed);
  setAudio(selectedAudio);
  selectSetupRow(selectedSetupRow);
  updateStatistics();
}

function startNewRun(startingLevel, startingScore) {
  audio.stop();
  setSpeed(selectedSpeed);
  setAudio(selectedAudio);
  runToken++;
  level = startingLevel;
  score = startingScore;
  piecesLocked = 0;
  nextPairId = 1;
  board = emptyBoard();
  seedBlights(board, level);
  activePiece = null;
  nextColors = randomPair();
  running = true;
  paused = false;
  resolving = false;
  lastFrameTime = performance.now();
  accumulatedFallTime = 0;

  document.body.classList.remove('setup-mode');
  elements.overlay.hidden = true;
  elements.setupPanel.hidden = true;
  elements.pauseButton.textContent = 'Ⅱ';
  elements.status.innerHTML = '<strong>Tip:</strong> harmonize four matching notes in one straight line.';

  renderer.drawNext(nextColors);
  updateStatistics();
  spawnPiece();
  audio.start();
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(gameLoop);
}

function spawnPiece() {
  activePiece = {
    x: 3,
    y: 0,
    rotation: 0,
    colors: nextColors
  };

  nextColors = randomPair();
  renderer.drawNext(nextColors);
  playPerformanceCue();

  if (!canPlace(board, activePiece)) {
    endGame();
  }
}

function gameLoop(now) {
  if (!running || paused) {
    return;
  }

  renderer.setTime(now);

  if (!resolving && activePiece) {
    accumulatedFallTime += now - lastFrameTime;
    const fallInterval = gravityFramesFor(selectedSpeed, piecesLocked) * FRAME_DURATION;

    while (accumulatedFallTime >= fallInterval && activePiece && !resolving) {
      stepDown(false);
      accumulatedFallTime -= fallInterval;
    }

    renderer.draw(board, activePiece);
  }

  lastFrameTime = now;
  animationFrame = requestAnimationFrame(gameLoop);
}

function moveActivePiece(deltaX, deltaY) {
  const nextX = activePiece.x + deltaX;
  const nextY = activePiece.y + deltaY;

  if (!canPlace(board, activePiece, activePiece.rotation, nextX, nextY)) {
    return false;
  }

  activePiece.x = nextX;
  activePiece.y = nextY;

  if (deltaX !== 0) {
    playTone(260, 0.025);
  }

  return true;
}

function rotateActivePiece(direction) {
  const nextRotation = (activePiece.rotation + direction + 4) % 4;
  const kicks = rotationKicks(activePiece.rotation, nextRotation);

  for (const kick of kicks) {
    const nextX = activePiece.x + kick;

    if (canPlace(board, activePiece, nextRotation, nextX, activePiece.y)) {
      activePiece.rotation = nextRotation;
      activePiece.x = nextX;
      playTone(direction > 0 ? 440 : 380, 0.04);
      return;
    }
  }
}

function rotationKicks(oldRotation, newRotation) {
  const becameHorizontal = newRotation === 0 || newRotation === 2;
  const wasVertical = oldRotation === 1 || oldRotation === 3;

  if (becameHorizontal && wasVertical) {
    return [0, -1, 1];
  }

  return [0];
}

function stepDown(softDrop) {
  if (moveActivePiece(0, 1)) {
    if (softDrop) {
      accumulatedFallTime = 0;
    }
    return;
  }

  lockActivePiece();
}

function hardDrop() {
  while (moveActivePiece(0, 1)) {
    // Stop only when the pair reaches an occupied cell or the floor.
  }

  lockActivePiece();
}

function lockActivePiece() {
  const lockedCells = cellsFor(activePiece);
  const pairId = nextPairId++;

  for (const cell of lockedCells) {
    if (cell.y < 0) {
      endGame();
      return;
    }

    board[cell.y][cell.x] = {
      color: cell.color,
      kind: 'seed',
      pairId
    };
  }

  renderer.showLanding(lockedCells);
  activePiece = null;
  piecesLocked++;
  accumulatedFallTime = 0;
  playTone(130, 0.06);

  const token = runToken;
  resolveBoard(token);
}

async function resolveBoard(token) {
  resolving = true;
  let chain = 1;

  while (running && token === runToken) {
    const matches = findMatches(board);

    if (matches.size === 0) {
      break;
    }

    const clearedBlights = countMatchedBlights(matches);
    await animateBurn(matches, token);

    if (!running || token !== runToken) {
      return;
    }

    disconnectClearedPairs(board, matches);

    for (const key of matches) {
      const [x, y] = key.split(',').map(Number);
      board[y][x] = null;
    }

    score += scoreForBlights(clearedBlights, selectedSpeed, chain);
    updateBestScore();
    applyGravity(board);
    updateStatistics();
    chain++;
  }

  if (!running || token !== runToken) {
    return;
  }

  resolving = false;

  if (countBlights(board) === 0) {
    completeLevel();
  } else {
    spawnPiece();
  }
}

function countMatchedBlights(matches) {
  let count = 0;

  for (const key of matches) {
    const [x, y] = key.split(',').map(Number);

    if (board[y][x]?.kind === 'blight') {
      count++;
    }
  }

  return count;
}

function animateBurn(matches, token) {
  return new Promise(resolve => {
    const duration = 420;
    const startedAt = performance.now();

    function drawBurnFrame(now) {
      if (!running || token !== runToken) {
        resolve();
        return;
      }

      const progress = Math.min(1, (now - startedAt) / duration);
      renderer.setTime(now);
      renderer.draw(board, null, matches, progress);

      if (progress < 1) {
        requestAnimationFrame(drawBurnFrame);
      } else {
        playTone(620, 0.09);
        resolve();
      }
    }

    requestAnimationFrame(drawBurnFrame);
  });
}

function completeLevel() {
  running = false;
  audio.stop();
  level++;

  writeProgress({
    level,
    score,
    speed: selectedSpeed,
    audio: selectedAudio
  });

  elements.overlay.hidden = false;
  elements.setupPanel.hidden = true;
  elements.overlayKicker.textContent = 'Honmoon restored';
  elements.overlayTitle.textContent = `Stage ${level - 1} sealed.`;
  elements.overlayText.textContent = `Stage ${level} is ready. Your progress has been saved in this browser.`;
  elements.startButton.textContent = `Enter stage ${level}`;
  elements.restartButton.hidden = false;
  elements.restartButton.textContent = 'Home';
  primaryOverlayAction = () => startNewRun(level, score);
  secondaryOverlayAction = showHomeScreen;
  playTone(820, 0.22);
}

function endGame() {
  running = false;
  audio.stop();
  activePiece = null;
  clearProgress();
  updateBestScore();

  elements.overlay.hidden = false;
  elements.setupPanel.hidden = true;
  elements.overlayKicker.textContent = 'The curtain falls';
  elements.overlayTitle.textContent = 'Show over.';
  elements.overlayText.textContent = `Final score: ${formatScore(score)}.`;
  elements.startButton.textContent = 'Try again';
  elements.restartButton.hidden = false;
  elements.restartButton.textContent = 'Home';
  primaryOverlayAction = () => startNewRun(selectedLevel, 0);
  secondaryOverlayAction = showHomeScreen;
  playTone(196, 0.28);
}

function pauseGame() {
  if (!running || resolving) {
    return;
  }

  paused = true;
  audio.stop();
  elements.overlay.hidden = false;
  elements.setupPanel.hidden = true;
  elements.overlayKicker.textContent = 'Intermission';
  elements.overlayTitle.textContent = 'Catch your breath.';
  elements.overlayText.textContent = 'Press P, Escape, Enter, or the controller menu button to resume.';
  elements.startButton.textContent = 'Resume';
  elements.restartButton.hidden = false;
  elements.restartButton.textContent = 'Home';
  primaryOverlayAction = resumeGame;
  secondaryOverlayAction = showHomeScreen;
  elements.pauseButton.textContent = '▶';
}

function resumeGame() {
  if (!paused) {
    return;
  }

  paused = false;
  elements.overlay.hidden = true;
  elements.pauseButton.textContent = 'Ⅱ';
  lastFrameTime = performance.now();
  audio.start();
  animationFrame = requestAnimationFrame(gameLoop);
}

function togglePause() {
  if (paused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

function toggleSound() {
  if (audio.blocked && selectedAudio !== 'off') {
    audio.start();
    return;
  }

  setAudio(selectedAudio === 'off' ? 'bright' : 'off', true);
}

function chooseTrack(event) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  audio.setTrack(file);
  elements.trackName.textContent = `Music: ${file.name}`;
  elements.resetTrackButton.hidden = false;

  if (selectedAudio !== 'off') {
    audio.start();
  }
}

function useBuiltInTrack() {
  audio.useBuiltInTrack();
  elements.trackInput.value = '';
  elements.trackName.textContent = 'Music: built-in loop';
  elements.resetTrackButton.hidden = true;

  if (selectedAudio !== 'off') {
    audio.start();
  }
}

function updateAudioStatus() {
  const isOff = selectedAudio === 'off';
  const isBlocked = audio.blocked && !isOff;

  elements.soundButton.textContent = isBlocked ? '♪!' : isOff ? '×' : '♪';
  elements.soundButton.title = isBlocked ? 'Click to enable music' : 'Sound';
  elements.soundButton.setAttribute(
    'aria-label',
    isBlocked ? 'Try to enable music' : isOff ? 'Turn sound on' : 'Turn sound off'
  );
  elements.audioHelp.hidden = !isBlocked;
  elements.audioNotice.textContent = audio.failure === 'NotAllowedError'
    ? 'Browser blocked music. Press Play here or allow audio for this page.'
    : 'Music did not start. Press Play here to retry.';
}

function updateStatistics() {
  elements.best.textContent = formatScore(bestScore);
  elements.score.textContent = formatScore(score);
  elements.levelDisplay.textContent = String(level);
  elements.speedDisplay.textContent = capitalize(selectedSpeed);
  elements.blights.textContent = String(countBlights(board));
}

function updateBestScore() {
  if (score <= bestScore) {
    return;
  }

  bestScore = score;
  writeBest(bestScore);
}

function playPerformanceCue() {
  elements.performanceCard.classList.remove('singing');
  void elements.performanceCard.offsetWidth;
  elements.performanceCard.classList.add('singing');
  setTimeout(() => {
    elements.performanceCard.classList.remove('singing');
  }, 340);
}

function playTone(frequency, duration) {
  audio.playTone(frequency, duration);
}

function formatScore(value) {
  return Math.floor(value).toLocaleString('en-US').replaceAll(',', ' ');
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
