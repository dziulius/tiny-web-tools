import {COLS, ROWS, cellsFor} from './engine.js';

const CELL_SIZE = 32;
const TILE_INSET = 3;
const TILE_COLORS = ['#ff74a8', '#ffe078', '#78dcf3', '#b896ff'];
const TILE_SHADOWS = ['#a93678', '#a97f29', '#338ab1', '#6847ae'];

export class Renderer {
  constructor(gameCanvas, nextCanvas) {
    this.gameCanvas = gameCanvas;
    this.gameContext = gameCanvas.getContext('2d');
    this.nextCanvas = nextCanvas;
    this.nextContext = nextCanvas.getContext('2d');
    this.time = 0;
    this.landingEffect = null;
  }

  setTime(time) {
    this.time = time;
  }

  showLanding(cells) {
    this.landingEffect = {
      cells,
      startedAt: performance.now()
    };
  }

  draw(board, activePiece, sealingCells = null, sealProgress = 0) {
    const context = this.gameContext;
    this.drawBoardBackground(context);

    const pairParts = this.collectPairParts(board);

    for (const parts of pairParts.values()) {
      if (parts.length === 2) {
        this.drawConnector(context, parts[0], parts[1]);
      }
    }

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = board[y][x];

        if (!cell) {
          continue;
        }

        const key = `${x},${y}`;
        if (sealingCells?.has(key)) {
          this.drawSealingCell(context, x, y, cell, sealProgress);
        } else {
          this.drawCell(context, x, y, cell);
        }
      }
    }

    if (activePiece) {
      const activeCells = cellsFor(activePiece);
      this.drawConnector(context, activeCells[0], activeCells[1]);

      for (const cell of activeCells) {
        if (cell.y >= 0) {
          this.drawCell(context, cell.x, cell.y, cell);
        }
      }
    }

    this.drawLandingEffect(context);
  }

  drawNext(colors) {
    const context = this.nextContext;
    context.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);

    const centerY = 44;
    const leftX = 44;
    const rightX = 76;

    this.drawConnectorAt(context, leftX, centerY, rightX, centerY, 20);
    this.drawPreviewCell(context, leftX, centerY, colors[0]);
    this.drawPreviewCell(context, rightX, centerY, colors[1]);
  }

  drawBoardBackground(context) {
    const width = this.gameCanvas.width;
    const height = this.gameCanvas.height;
    const gradient = context.createLinearGradient(0, 0, 0, height);

    gradient.addColorStop(0, '#0b0926');
    gradient.addColorStop(0.55, '#191044');
    gradient.addColorStop(1, '#291652');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.save();
    context.strokeStyle = 'rgba(223, 155, 255, 0.11)';
    context.lineWidth = 2;

    for (const radius of [60, 104, 148]) {
      context.beginPath();
      context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
      context.stroke();
    }

    context.restore();
    context.strokeStyle = 'rgba(182, 139, 246, 0.14)';
    context.lineWidth = 1;

    for (let x = 0; x <= COLS; x++) {
      context.beginPath();
      context.moveTo(x * CELL_SIZE + 0.5, 0);
      context.lineTo(x * CELL_SIZE + 0.5, height);
      context.stroke();
    }

    for (let y = 0; y <= ROWS; y++) {
      context.beginPath();
      context.moveTo(0, y * CELL_SIZE + 0.5);
      context.lineTo(width, y * CELL_SIZE + 0.5);
      context.stroke();
    }
  }

  drawCell(context, gridX, gridY, cell) {
    const x = gridX * CELL_SIZE + TILE_INSET;
    const y = gridY * CELL_SIZE + TILE_INSET;
    const size = CELL_SIZE - TILE_INSET * 2;

    if (cell.kind === 'blight') {
      this.drawDemonBreach(context, x, y, size, cell.color, gridX);
    } else {
      this.drawNoteTile(context, x, y, size, cell.color);
    }
  }

  drawNoteTile(context, x, y, size, colorIndex) {
    this.drawChamferedTile(context, x, y, size, colorIndex);
    this.drawMusicNote(context, x, y, size);
  }

  drawDemonBreach(context, x, y, size, colorIndex, gridX) {
    const pulse = (Math.sin(this.time / 300 + gridX) + 1) / 2;

    context.save();
    context.shadowColor = TILE_COLORS[colorIndex];
    context.shadowBlur = 5 + pulse * 8;
    context.fillStyle = '#160e2c';
    this.chamferedPath(context, x, y, size, 9);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = TILE_COLORS[colorIndex];
    context.lineWidth = 3;
    this.chamferedPath(context, x + 1.5, y + 1.5, size - 3, 8);
    context.stroke();

    const blinkPhase = (Math.floor(this.time / 180) + gridX * 7) % 29;
    const eyeHeight = blinkPhase === 0 ? 1 : 3;
    context.fillStyle = TILE_COLORS[colorIndex];
    context.fillRect(x + 7, y + 10, 4, eyeHeight);
    context.fillRect(x + size - 11, y + 10, 4, eyeHeight);

    context.beginPath();
    context.moveTo(x + 7, y + size - 8);
    context.lineTo(x + size / 2, y + size - 5);
    context.lineTo(x + size - 7, y + size - 8);
    context.stroke();
    context.restore();
  }

  drawChamferedTile(context, x, y, size, colorIndex) {
    const cut = 6;
    const shadow = 3;

    context.fillStyle = TILE_SHADOWS[colorIndex];
    this.chamferedPath(context, x, y + shadow, size, cut);
    context.fill();

    context.fillStyle = TILE_COLORS[colorIndex];
    this.chamferedPath(context, x, y, size, cut);
    context.fill();
  }

  chamferedPath(context, x, y, size, cut) {
    context.beginPath();
    context.moveTo(x + cut, y);
    context.lineTo(x + size - cut, y);
    context.lineTo(x + size, y + cut);
    context.lineTo(x + size, y + size - cut);
    context.lineTo(x + size - cut, y + size);
    context.lineTo(x + cut, y + size);
    context.lineTo(x, y + size - cut);
    context.lineTo(x, y + cut);
    context.closePath();
  }

  drawMusicNote(context, x, y, size) {
    context.save();
    context.fillStyle = '#25133c';
    context.strokeStyle = '#25133c';
    context.lineWidth = Math.max(2, size / 11);
    context.lineCap = 'round';

    context.beginPath();
    context.ellipse(x + size * 0.41, y + size * 0.66, size * 0.17, size * 0.12, -0.35, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.moveTo(x + size * 0.55, y + size * 0.62);
    context.lineTo(x + size * 0.55, y + size * 0.23);
    context.quadraticCurveTo(x + size * 0.76, y + size * 0.3, x + size * 0.76, y + size * 0.45);
    context.stroke();
    context.restore();
  }

  drawSealingCell(context, gridX, gridY, cell, progress) {
    const centerX = gridX * CELL_SIZE + CELL_SIZE / 2;
    const centerY = gridY * CELL_SIZE + CELL_SIZE / 2;
    const radius = 5 + progress * 25;

    context.save();
    context.globalAlpha = 1 - progress;
    context.fillStyle = TILE_COLORS[cell.color];
    context.beginPath();
    context.arc(centerX, centerY, Math.max(2, 12 * (1 - progress)), 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = '#fff7d5';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();

    for (let ray = 0; ray < 8; ray++) {
      const angle = ray * Math.PI / 4 + progress;
      const inner = 9 + progress * 9;
      const outer = inner + 5;
      context.beginPath();
      context.moveTo(
        centerX + Math.cos(angle) * inner,
        centerY + Math.sin(angle) * inner
      );
      context.lineTo(
        centerX + Math.cos(angle) * outer,
        centerY + Math.sin(angle) * outer
      );
      context.stroke();
    }

    context.restore();
  }

  collectPairParts(board) {
    const pairs = new Map();

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = board[y][x];

        if (!cell?.pairId) {
          continue;
        }

        if (!pairs.has(cell.pairId)) {
          pairs.set(cell.pairId, []);
        }

        pairs.get(cell.pairId).push({x, y, color: cell.color});
      }
    }

    return pairs;
  }

  drawConnector(context, first, second) {
    const firstX = first.x * CELL_SIZE + CELL_SIZE / 2;
    const firstY = first.y * CELL_SIZE + CELL_SIZE / 2;
    const secondX = second.x * CELL_SIZE + CELL_SIZE / 2;
    const secondY = second.y * CELL_SIZE + CELL_SIZE / 2;

    this.drawConnectorAt(context, firstX, firstY, secondX, secondY, 10);
  }

  drawConnectorAt(context, firstX, firstY, secondX, secondY, width) {
    context.save();
    context.strokeStyle = '#fff3ce';
    context.lineWidth = width;
    context.lineCap = 'butt';
    context.shadowColor = '#f79cfa';
    context.shadowBlur = 8;
    context.beginPath();
    context.moveTo(firstX, firstY);
    context.lineTo(secondX, secondY);
    context.stroke();

    context.shadowBlur = 0;
    context.strokeStyle = '#d876ef';
    context.lineWidth = Math.max(2, width / 3);
    context.stroke();
    context.restore();
  }

  drawPreviewCell(context, centerX, centerY, color) {
    const size = 24;
    const x = centerX - size / 2;
    const y = centerY - size / 2;

    this.drawChamferedTile(context, x, y, size, color);
    this.drawMusicNote(context, x, y, size);
  }

  drawLandingEffect(context) {
    if (!this.landingEffect) {
      return;
    }

    const elapsed = this.time - this.landingEffect.startedAt;
    const progress = elapsed / 240;

    if (progress >= 1) {
      this.landingEffect = null;
      return;
    }

    context.save();
    context.strokeStyle = `rgba(245, 169, 255, ${1 - progress})`;
    context.lineWidth = 2;

    for (const cell of this.landingEffect.cells) {
      if (cell.y < 0) {
        continue;
      }

      const centerX = cell.x * CELL_SIZE + CELL_SIZE / 2;
      const centerY = cell.y * CELL_SIZE + CELL_SIZE / 2;
      const radius = 12 + progress * 12;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
    }

    context.restore();
  }
}
