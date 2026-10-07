export const COLS = 8;
export const ROWS = 16;

// Frames per row from the original NTSC gravity curve. The selected speed
// chooses a starting point; play advances through the curve as pieces lock.
export const GRAVITY_FRAMES = [
  70, 68, 66, 64, 62, 60, 58, 56, 54, 52,
  50, 48, 46, 44, 42, 40, 38, 36, 34, 32,
  30, 28, 26, 24, 22, 20, 19, 18, 17, 16,
  15, 14, 13, 12, 11, 10, 10, 9, 9, 8,
  8, 7, 7, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 5, 5, 5, 5,
  5, 4, 4, 4, 4, 4, 3, 3, 3, 3,
  3, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  1
];

const SPEED_START_INDEX = {
  low: 15,
  medium: 25,
  high: 31
};

export function emptyBoard() {
  return Array.from({length: ROWS}, () => Array(COLS).fill(null));
}

export function randomColor() {
  return Math.floor(Math.random() * 4);
}

export function randomPair() {
  return [randomColor(), randomColor()];
}

export function cellsFor(piece, rotation = piece.rotation, x = piece.x, y = piece.y) {
  const layouts = [
    [[0, 0], [1, 0]],
    [[0, -1], [0, 0]],
    [[1, 0], [0, 0]],
    [[0, 0], [0, -1]]
  ];

  return layouts[rotation].map(([offsetX, offsetY], index) => ({
    x: x + offsetX,
    y: y + offsetY,
    color: piece.colors[index]
  }));
}

export function canPlace(board, piece, rotation = piece.rotation, x = piece.x, y = piece.y) {
  return cellsFor(piece, rotation, x, y).every(cell => {
    if (cell.x < 0 || cell.x >= COLS) {
      return false;
    }

    if (cell.y >= ROWS) {
      return false;
    }

    if (cell.y < 0) {
      return true;
    }

    return !board[cell.y][cell.x];
  });
}

export function gravityFramesFor(speed, piecesLocked) {
  const startingIndex = SPEED_START_INDEX[speed] ?? SPEED_START_INDEX.medium;
  const speedIncreases = Math.max(0, Math.floor((piecesLocked - 8) / 10) + 1);
  const index = piecesLocked < 8
    ? startingIndex
    : Math.min(startingIndex + speedIncreases, 49);

  return GRAVITY_FRAMES[index];
}

export function scoreForBlights(blightCount, speed, chain = 1) {
  const speedMultiplier = {
    low: 1,
    medium: 2,
    high: 3
  }[speed] ?? 1;

  return blightCount * 100 * speedMultiplier * chain;
}

export function countBlights(board) {
  let count = 0;

  for (const row of board) {
    for (const cell of row) {
      if (cell?.kind === 'blight') {
        count++;
      }
    }
  }

  return count;
}

export function findMatches(board) {
  const clear = new Set();

  const scan = cells => {
    let start = 0;

    while (start < cells.length) {
      const [startX, startY] = cells[start];
      const first = board[startY][startX];

      if (!first) {
        start++;
        continue;
      }

      let end = start + 1;

      while (end < cells.length) {
        const [x, y] = cells[end];
        const cell = board[y][x];

        if (!cell || cell.color !== first.color) {
          break;
        }
        end++;
      }

      if (end - start >= 4) {
        for (let index = start; index < end; index++) {
          const [x, y] = cells[index];
          clear.add(`${x},${y}`);
        }
      }

      start = end;
    }
  };

  for (let y = 0; y < ROWS; y++) {
    const row = Array.from({length: COLS}, (_, x) => [x, y]);
    scan(row);
  }

  for (let x = 0; x < COLS; x++) {
    const column = Array.from({length: ROWS}, (_, y) => [x, y]);
    scan(column);
  }

  return clear;
}

function createsStartingMatch(board, x, y, color) {
  const countDirection = (dx, dy) => {
    let total = 0;
    let nextX = x + dx;
    let nextY = y + dy;

    while (
      nextX >= 0 &&
      nextX < COLS &&
      nextY >= 0 &&
      nextY < ROWS &&
      board[nextY][nextX]?.color === color
    ) {
      total++;
      nextX += dx;
      nextY += dy;
    }

    return total;
  };

  const horizontalLength = 1 + countDirection(1, 0) + countDirection(-1, 0);
  const verticalLength = 1 + countDirection(0, 1) + countDirection(0, -1);
  return horizontalLength >= 4 || verticalLength >= 4;
}

export function seedBlights(board, level) {
  const count = Math.min(level * 4, 80);
  const topRow = Math.max(4, 10 - Math.floor(level / 3));
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < 6000) {
    attempts++;
    const y = topRow + Math.floor(Math.random() * (ROWS - topRow));
    const x = Math.floor(Math.random() * COLS);
    const color = randomColor();

    if (board[y][x] || createsStartingMatch(board, x, y, color)) {
      continue;
    }

    board[y][x] = {color, kind: 'blight'};
    placed++;
  }

  return placed;
}

export function disconnectClearedPairs(board, clear) {
  const pairs = collectPairs(board);

  for (const parts of pairs.values()) {
    const clearedParts = parts.filter(({x, y}) => clear.has(`${x},${y}`));
    const onlyOneHalfWasCleared = clearedParts.length > 0 && clearedParts.length < parts.length;

    if (!onlyOneHalfWasCleared) {
      continue;
    }

    for (const part of parts) {
      if (!clear.has(`${part.x},${part.y}`)) {
        delete part.cell.pairId;
      }
    }
  }
}

export function applyGravity(board) {
  let anythingMoved = false;
  let movedThisPass = true;

  while (movedThisPass) {
    movedThisPass = false;
    const processedPairs = new Set();

    for (let y = ROWS - 1; y >= 0; y--) {
      for (let x = 0; x < COLS; x++) {
        const cell = board[y][x];
        if (!cell || cell.kind === 'blight') {
          continue;
        }

        if (!cell.pairId) {
          if (canSingleCellFall(board, x, y)) {
            board[y + 1][x] = cell;
            board[y][x] = null;
            movedThisPass = true;
            anythingMoved = true;
          }
          continue;
        }

        if (processedPairs.has(cell.pairId)) {
          continue;
        }
        processedPairs.add(cell.pairId);

        const pair = findPair(board, cell.pairId);
        if (pair.length !== 2) {
          for (const part of pair) {
            delete part.cell.pairId;
          }
          continue;
        }

        if (!canPairFall(board, pair, cell.pairId)) {
          continue;
        }

        movePairDown(board, pair);
        movedThisPass = true;
        anythingMoved = true;
      }
    }
  }

  return anythingMoved;
}

function collectPairs(board) {
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
      pairs.get(cell.pairId).push({x, y, cell});
    }
  }

  return pairs;
}

function findPair(board, pairId) {
  return collectPairs(board).get(pairId) ?? [];
}

function canSingleCellFall(board, x, y) {
  return y + 1 < ROWS && !board[y + 1][x];
}

function canPairFall(board, pair, pairId) {
  return pair.every(({x, y}) => {
    if (y + 1 >= ROWS) {
      return false;
    }

    const cellBelow = board[y + 1][x];
    return !cellBelow || cellBelow.pairId === pairId;
  });
}

function movePairDown(board, pair) {
  for (const {x, y} of pair) {
    board[y][x] = null;
  }

  for (const {x, y, cell} of pair) {
    board[y + 1][x] = cell;
  }
}
