# ADR 0005 — The canvas is the classroom; the editor is a separate view

**Status:** accepted · 2026-10-22 (product owner feedback)

**Context.** v0 laid code, visual and explanation out as equal side-by-side panels, which read like an IDE. The product owner wants teaching to happen on a canvas and the code editor to be a different surface.

**Decision.** Default view is a pan/zoom whiteboard. Per step the tutor writes the objective as a board title and the narration as a handwritten note, circles `scene.focus[0]`, and draws an arrow from the note to it. Questions, variables and a one/two-line "current code" strip sit on the board. The full code lives in an **Editor** tab driven by the same active step. Learners can draw (pen/highlighter/eraser). The board is DOM/SVG on a transformed "world", not an HTML `<canvas>` bitmap — it keeps text selectable/accessible, reuses the scene renderer and makes elements testable.

**Consequences.** + Teaching reads like a teacher at a board; still one source of truth. + Scene contract gained a small additive field (`focus`), no version bump. − On phones the board is scaled (~60%) and relies on pinch/pan. − Ink is per-session until persistence lands. Revisit `<canvas>`/WebGL rendering only if scene size makes the DOM slow.
