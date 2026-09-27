// Switches between games: a button with the current game's badge, opening a menu of the others. Each game has its
// own collection and packs; the account is the same. Hidden while only Pokémon is on (see app/game.ts).

import { useEffect, useId, useRef, useState } from "react";
import { GAMES, type Game } from "../game";
import { GAME, switchGame, useGames } from "./game";
import "./game.css";

/** A game's round badge: a Poké Ball, or the five colors of mana. */
export function GameBadge({ game }: { game: Game }) {
  const short = GAMES.find((g) => g.id === game)!.short;
  return (
    <span className="game-badge" data-game={game} aria-hidden="true">
      <svg viewBox="0 0 32 32">
        {game === "pokemon" ? (
          <>
            <path className="top" d="M3 16a13 13 0 0 1 26 0z" />
            <path className="bottom" d="M3 16a13 13 0 0 0 26 0z" />
            <path className="line" d="M3 16h26" />
            <circle className="line" cx="16" cy="16" r="4.2" />
            <circle className="button" cx="16" cy="16" r="2.2" />
          </>
        ) : (
          // Five pips around a circle, in WUBRG order from the top, clockwise.
          (["w", "u", "b", "r", "g"] as const).map((c, i) => {
            const a = (-90 + i * 72) * (Math.PI / 180);
            return <circle key={c} className={`pip ${c}`} cx={16 + 8.6 * Math.cos(a)} cy={16 + 8.6 * Math.sin(a)} r="4.6" />;
          })
        )}
      </svg>
      <span className="game-badge-tag">{short}</span>
    </span>
  );
}

export function GameSwitch({ className }: { className?: string }) {
  const games = useGames();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Closes on a tap outside or Escape.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>(".game-switch-button")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (games.length < 2) return null;
  const current = GAMES.find((g) => g.id === GAME)!;

  return (
    <div className={`game-switch${className ? " " + className : ""}`} ref={root}>
      <button type="button" className="game-switch-button" aria-haspopup="true" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
        <GameBadge game={GAME} />
        <span className="game-switch-name">{current.name}</span>
        <svg className="chevrons" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <ul className="game-switch-menu" id={menuId} aria-label="Games">
          {GAMES.filter((g) => games.includes(g.id)).map((g) => (
            <li key={g.id}>
              <button type="button" aria-current={g.id === GAME ? "true" : undefined} onClick={() => (g.id === GAME ? setOpen(false) : switchGame(g.id))}>
                <GameBadge game={g.id} />
                <span>{g.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
