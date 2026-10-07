import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyGravity,
  canPlace,
  cellsFor,
  disconnectClearedPairs,
  emptyBoard,
  findMatches,
  gravityFramesFor,
  scoreForBlights
} from './engine.js';

function seed(color, pairId) {
  return {
    color,
    kind: 'seed',
    pairId
  };
}

function blight(color) {
  return {
    color,
    kind: 'blight'
  };
}

test('a cross clears only an axis that reaches four', () => {
  const board = emptyBoard();

  board[8][1] = seed(0);
  board[8][2] = seed(0);
  board[8][3] = seed(0);
  board[8][4] = seed(0);
  board[6][3] = seed(0);
  board[7][3] = seed(0);

  const matches = findMatches(board);

  assert.deepEqual(
    [...matches].sort(),
    ['1,8', '2,8', '3,8', '4,8']
  );
});

test('two adjacent groups of three do not clear', () => {
  const board = emptyBoard();

  for (let y = 10; y <= 12; y++) {
    board[y][2] = seed(1);
    board[y][3] = seed(1);
  }

  assert.equal(findMatches(board).size, 0);
});

test('a connected pair remains rigid when either half is blocked', () => {
  const board = emptyBoard();

  board[8][2] = seed(0, 7);
  board[8][3] = seed(1, 7);
  board[9][3] = blight(2);

  applyGravity(board);

  assert.equal(board[8][2]?.pairId, 7);
  assert.equal(board[8][3]?.pairId, 7);
});

test('the surviving half disconnects and falls after its partner clears', () => {
  const board = emptyBoard();
  const matches = new Set(['3,8']);

  board[8][2] = seed(0, 12);
  board[8][3] = seed(1, 12);
  board[15][2] = blight(3);

  disconnectClearedPairs(board, matches);
  board[8][3] = null;
  applyGravity(board);

  assert.equal(board[14][2]?.color, 0);
  assert.equal(board[14][2]?.pairId, undefined);
});

test('clockwise and counterclockwise rotations use distinct cells', () => {
  const piece = {
    x: 3,
    y: 7,
    rotation: 0,
    colors: [0, 1]
  };

  assert.deepEqual(cellsFor(piece, 1), [
    {x: 3, y: 6, color: 0},
    {x: 3, y: 7, color: 1}
  ]);
  assert.deepEqual(cellsFor(piece, 3), [
    {x: 3, y: 7, color: 0},
    {x: 3, y: 6, color: 1}
  ]);
});

test('placement below the board is rejected without reading past its bounds', () => {
  const board = emptyBoard();
  const piece = {
    x: 2,
    y: 15,
    rotation: 0,
    colors: [0, 1]
  };

  assert.equal(canPlace(board, piece, 0, 2, 15), true);
  assert.equal(canPlace(board, piece, 0, 2, 16), false);
});

test('gravity accelerates after eight locked pairs', () => {
  assert.equal(gravityFramesFor('low', 0), 40);
  assert.equal(gravityFramesFor('medium', 0), 20);
  assert.equal(gravityFramesFor('high', 0), 14);
  assert.equal(gravityFramesFor('medium', 7), 20);
  assert.equal(gravityFramesFor('medium', 8), 19);
  assert.equal(gravityFramesFor('medium', 18), 18);
});

test('only cleared blights contribute points', () => {
  assert.equal(scoreForBlights(0, 'high', 4), 0);
  assert.equal(scoreForBlights(2, 'medium', 1), 400);
  assert.equal(scoreForBlights(2, 'medium', 3), 1200);
});
