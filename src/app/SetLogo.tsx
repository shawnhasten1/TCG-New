// A set's logo from TCGdex. Most sets have a .webp, but a few (Furious Fists, Undaunted, Wizards Black Star Promos)
// only have a .png, so a failed .webp retries as .png, and if that fails too the fallback renders instead.

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  logo?: string | null;
  fallback?: ReactNode;
};

const FORMATS = ["webp", "png"];

export function SetLogo({ logo, fallback = null, ...img }: Props) {
  const [attempt, setAttempt] = useState({ logo, format: 0 });
  // Start over when the logo changes, since the same element can be reused for another set.
  const format = attempt.logo === logo ? attempt.format : 0;
  if (!logo || format >= FORMATS.length) return <>{fallback}</>;
  return <img {...img} src={`${logo}.${FORMATS[format]}`} onError={() => setAttempt({ logo, format: format + 1 })} />;
}
