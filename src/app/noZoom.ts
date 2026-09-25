// The app doesn't zoom. The viewport meta stops it on Android and stops iOS zooming into a focused field,
// but iOS Safari still pinch-zooms (it ignores user-scalable=no), and trackpads pinch as ctrl+wheel.

export function stopZoom(): void {
  const stop = (e: Event) => e.preventDefault();
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(type, stop, { passive: false });
  document.addEventListener("touchmove", (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
  window.addEventListener("wheel", (e) => e.ctrlKey && e.preventDefault(), { passive: false });
}
