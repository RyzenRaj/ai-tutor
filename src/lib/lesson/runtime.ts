/**
 * Lesson Runtime — transient playback state (never persisted with the lesson).
 * A pure reducer, so playback is deterministic and unit-testable.
 */

export type PlaybackState = {
  index: number;
  stepCount: number;
  playing: boolean;
};

export type PlaybackAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; index: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "replay" }
  | { type: "tick" } // autoplay timer fired
  | { type: "load"; stepCount: number };

export function initPlayback(stepCount: number): PlaybackState {
  return { index: 0, stepCount: Math.max(0, stepCount), playing: false };
}

const clamp = (i: number, n: number) => (n === 0 ? 0 : Math.min(Math.max(0, Math.trunc(i)), n - 1));

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  const last = Math.max(0, state.stepCount - 1);
  switch (action.type) {
    case "load":
      return initPlayback(action.stepCount);
    case "next":
      return { ...state, index: clamp(state.index + 1, state.stepCount), playing: false };
    case "prev":
      return { ...state, index: clamp(state.index - 1, state.stepCount), playing: false };
    case "goto":
      if (!Number.isFinite(action.index)) return state;
      return { ...state, index: clamp(action.index, state.stepCount), playing: false };
    case "play":
      if (state.stepCount <= 1) return state;
      // Pressing play at the end restarts from the beginning.
      return { ...state, index: state.index >= last ? 0 : state.index, playing: true };
    case "pause":
      return { ...state, playing: false };
    case "toggle":
      return playbackReducer(state, { type: state.playing ? "pause" : "play" });
    case "replay":
      return { ...state, index: 0, playing: state.stepCount > 1 };
    case "tick": {
      if (!state.playing) return state;
      const index = clamp(state.index + 1, state.stepCount);
      return { ...state, index, playing: index < last };
    }
    default:
      return state;
  }
}
