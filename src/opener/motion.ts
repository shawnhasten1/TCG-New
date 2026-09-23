// Phone tilt drives card tilt, from deviceorientation. "Level" is however the phone is being held
// (it's rarely flat), and it slowly follows the hand so a new posture re-centres by itself.
// iOS only sends events after the page asks on a tap; other phones send them straight away.
// Desktops send nothing (or nulls), so this does nothing there. Needs HTTPS (or localhost).

import type { Tilt } from "./tilt";

/** Degrees of phone tilt, either way from level, that take the card to its full tilt. */
const RANGE = 35;
/** Until the phone moves this many degrees, it counts as still, so an idle sway keeps going. */
const DEADZONE = 5;
/** Tilt within this many degrees of level is ignored, so a hand's small wobble doesn't move the card. */
const STEADY = 2.5;
/** How quickly level follows the hand, per event (about 60 a second): a held tilt settles back over about 5 seconds. */
const DRIFT = 0.004;
/** A bigger jump than this is the sensor flipping (e.g. past upright), not a tilt: start level again. */
const JUMP = 60;

type PermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };
const api = typeof DeviceOrientationEvent === "undefined" ? undefined : (DeviceOrientationEvent as unknown as PermissionApi);
/** iOS needs asking once per page load; elsewhere events just arrive. */
let asked = !api?.requestPermission;

interface Follower {
  tilt: Tilt;
  level?: [number, number];
  engaged: boolean;
}
let follower: Follower | null = null;
let listening = false;
let askPending = false;

/** Phone tilt as [across, down] in screen terms, whichever way the screen is rotated. */
function screenAxes(e: DeviceOrientationEvent): [number, number] | null {
  if (e.beta == null || e.gamma == null) return null;
  switch ((((screen.orientation?.angle ?? 0) % 360) + 360) % 360) {
    case 90:
      return [e.beta, -e.gamma];
    case 180:
      return [-e.gamma, -e.beta];
    case 270:
      return [-e.beta, e.gamma];
    default:
      return [e.gamma, e.beta];
  }
}

function onOrientation(e: DeviceOrientationEvent) {
  const f = follower;
  const a = screenAxes(e);
  if (!f || !a) return;
  if (!f.level || Math.abs(a[0] - f.level[0]) > JUMP || Math.abs(a[1] - f.level[1]) > JUMP) {
    f.level = a;
    return;
  }
  const dx = a[0] - f.level[0];
  const dy = a[1] - f.level[1];
  f.level = [f.level[0] + dx * DRIFT, f.level[1] + dy * DRIFT];
  if (!f.engaged && Math.hypot(dx, dy) < DEADZONE) return;
  f.engaged = true;
  // Tipping the right edge down leans the card right; tipping the top away leans it back.
  f.tilt.lean(0.5 + steady(dx) / (2 * RANGE), 0.5 + steady(dy) / (2 * RANGE));
}

/** Degrees past the steady band, so the card starts moving smoothly from level rather than jumping. */
const steady = (d: number) => Math.sign(d) * Math.max(0, Math.abs(d) - STEADY);

function listen() {
  removeEventListener("deviceorientation", onOrientation);
  addEventListener("deviceorientation", onOrientation);
  listening = true;
}

/** iOS: asks for motion access. Runs from the first tap anywhere, since it must be inside one. */
function askOnTap() {
  if (askPending) return;
  askPending = true;
  const ask = () => {
    removeEventListener("click", ask, true);
    removeEventListener("touchend", ask, true);
    if (asked) return;
    asked = true;
    api!.requestPermission!().then((r) => r === "granted" && listen(), () => undefined);
  };
  addEventListener("click", ask, true);
  addEventListener("touchend", ask, true);
}

/** Tilts `tilt`'s card with the phone until the returned function is called. */
export function followMotion(tilt: Tilt): () => void {
  if (!api) return () => undefined;
  follower = { tilt, engaged: false };
  if (!listening) listen();
  if (!asked) askOnTap();
  return () => {
    if (follower?.tilt === tilt) follower = null;
  };
}

/** Takes however the phone is held now as level, e.g. for each new card. */
export function recenterMotion() {
  if (follower) Object.assign(follower, { level: undefined, engaged: false });
}
