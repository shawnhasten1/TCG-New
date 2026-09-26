// A small spinning ring for "working on it" moments. Decorative: put the words next to it in a role="status" element.

import "./spinner.css";

export function Spinner({ size = "1em" }: { size?: string }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}
