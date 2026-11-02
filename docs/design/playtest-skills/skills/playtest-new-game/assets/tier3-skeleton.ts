// Minimal Playtest Tier 3 game: plain canvas, a box that moves and jumps.
// TODO(api): import paths and helper names follow the @playtest/kit draft and may change.
import { defineGame, type InputFrame, type TickContext } from "@playtest/kit";
import { BTN } from "@playtest/kit/manifest"; // generated from playtest.json input.buttons order

type State = { x: number; y: number; vy: number; onGround: boolean; coins: number };

const GROUND = 220, GRAVITY = 0.5, JUMP = -9, SPEED = 2.5;
let ctx2d: CanvasRenderingContext2D | null = null; // view-only cache, never part of State

export default defineGame<State>({
  init: () => ({ x: 40, y: GROUND, vy: 0, onGround: true, coins: 0 }),

  tick(s: State, input: InputFrame, _ctx: TickContext): State {
    if (input.buttons & BTN.left) s.x -= SPEED;
    if (input.buttons & BTN.right) s.x += SPEED;
    if (input.buttons & BTN.jump && s.onGround) { s.vy = JUMP; s.onGround = false; }
    s.vy += GRAVITY;
    s.y += s.vy;
    if (s.y >= GROUND) { s.y = GROUND; s.vy = 0; s.onGround = true; }
    return s;
  },

  render(s: State, { canvas }) {
    ctx2d ??= canvas.getContext("2d");
    if (!ctx2d) return;
    ctx2d.fillStyle = "#1d1f24"; ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.fillStyle = "#e8c547"; ctx2d.fillRect(Math.round(s.x), Math.round(s.y) - 20, 20, 20);
  },

  describe: (s) => ({ x: s.x, y: s.y, vy: s.vy, onGround: s.onGround, coins: s.coins }),
});
