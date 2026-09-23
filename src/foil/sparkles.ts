// Sparkle texture for foil glitter, generated once and shared through --sparkles.
let done = false;

export function ensureSparkles() {
  if (done || typeof document === "undefined") return;
  done = true;
  const c = document.createElement("canvas");
  c.width = c.height = 180;
  const g = c.getContext("2d");
  if (!g) return;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 180, 180);
  for (let i = 0; i < 260; i++) {
    const r = Math.random() < 0.08 ? 1.6 : Math.random() * 0.9 + 0.3;
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8 + 0.2})`;
    g.beginPath();
    g.arc(Math.random() * 180, Math.random() * 180, r, 0, 7);
    g.fill();
  }
  document.documentElement.style.setProperty("--sparkles", `url(${c.toDataURL()})`);
}
