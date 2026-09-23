import type { PackProfile } from "../types";
import wotc from "./wotc.json";
import classic from "./classic.json";
import swsh from "./swsh.json";
import sv from "./sv.json";

// JSON imports are typed structurally; the unit tests exercise every profile.
export const profiles = [wotc, classic, swsh, sv] as unknown as PackProfile[];

/** Finds the profile for a set: an explicit set match wins over a serie match. */
export function profileFor(set: { id: string; serie: { id: string } }): PackProfile | undefined {
  return profiles.find((p) => p.sets?.includes(set.id)) ?? profiles.find((p) => p.series.includes(set.serie.id));
}
