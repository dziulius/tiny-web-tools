const REPEAT_DELAY = 180;
const REPEAT_INTERVAL = 75;

const KEY_ACTIONS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyX: 'rotate-clockwise',
  KeyZ: 'rotate-counterclockwise',
  Space: 'drop',
  Enter: 'start',
  KeyP: 'pause',
  Escape: 'pause',
  KeyR: 'home'
};

export function createInput({getMode, onAction}) {
  const gamepadState = new Map();
  let animationFrame = 0;

  function handleKeyDown(event) {
    const action = KEY_ACTIONS[event.code];

    if (!action) {
      return;
    }

    event.preventDefault();

    if (event.repeat && !isRepeatable(action, getMode())) {
      return;
    }

    onAction(action);
  }

  function pollGamepads(now) {
    const gamepads = navigator.getGamepads?.() ?? [];

    for (const gamepad of gamepads) {
      if (!gamepad) {
        continue;
      }

      const actions = readGamepadActions(gamepad);
      emitGamepadActions(gamepad.index, actions, now);
    }

    animationFrame = requestAnimationFrame(pollGamepads);
  }

  function emitGamepadActions(gamepadIndex, actions, now) {
    const previous = gamepadState.get(gamepadIndex) ?? new Map();
    const next = new Map();
    const mode = getMode();

    for (const action of actions) {
      const oldState = previous.get(action);
      const firstPress = !oldState;
      const repeatable = isRepeatable(action, mode);
      const repeatIsDue = repeatable && oldState && now >= oldState.nextRepeat;

      if (firstPress || repeatIsDue) {
        onAction(action);
      }

      const nextRepeat = firstPress
        ? now + REPEAT_DELAY
        : repeatIsDue
          ? now + REPEAT_INTERVAL
          : oldState.nextRepeat;

      next.set(action, {nextRepeat});
    }

    gamepadState.set(gamepadIndex, next);
  }

  function bindTouchControls() {
    const touchActions = {
      left: 'left',
      right: 'right',
      down: 'down',
      rotate: 'rotate-clockwise',
      drop: 'drop'
    };

    for (const button of document.querySelectorAll('[data-action]')) {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        const action = touchActions[button.dataset.action];

        if (action) {
          onAction(action);
        }
      });
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  bindTouchControls();
  animationFrame = requestAnimationFrame(pollGamepads);

  return function destroyInput() {
    window.removeEventListener('keydown', handleKeyDown);
    cancelAnimationFrame(animationFrame);
  };
}

function isRepeatable(action, mode) {
  if (mode === 'setup') {
    return action === 'left' || action === 'right';
  }

  if (mode === 'playing') {
    return action === 'left' || action === 'right' || action === 'down';
  }

  return false;
}

function readGamepadActions(gamepad) {
  const actions = new Set();
  const horizontalAxis = gamepad.axes[0] ?? 0;
  const verticalAxis = gamepad.axes[1] ?? 0;

  addWhenPressed(actions, 'left', gamepad.buttons[14]?.pressed || horizontalAxis < -0.55);
  addWhenPressed(actions, 'right', gamepad.buttons[15]?.pressed || horizontalAxis > 0.55);
  addWhenPressed(actions, 'up', gamepad.buttons[12]?.pressed || verticalAxis < -0.55);
  addWhenPressed(actions, 'down', gamepad.buttons[13]?.pressed || verticalAxis > 0.55);
  addWhenPressed(actions, 'rotate-clockwise', gamepad.buttons[0]?.pressed);
  addWhenPressed(actions, 'rotate-counterclockwise', gamepad.buttons[1]?.pressed);
  addWhenPressed(actions, 'drop', gamepad.buttons[2]?.pressed || gamepad.buttons[3]?.pressed);
  addWhenPressed(actions, 'home', gamepad.buttons[8]?.pressed);
  addWhenPressed(actions, 'pause', gamepad.buttons[9]?.pressed);

  return actions;
}

function addWhenPressed(actions, action, isPressed) {
  if (isPressed) {
    actions.add(action);
  }
}
