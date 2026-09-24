// The main menu, on every page: a tab bar along the bottom on phones (in reach of a thumb), and a header
// across the top on wider screens. Layout is all in nav.css; the markup is the same for both.

import type { ReactNode } from "react";
import { isMember, useAccount } from "../account/account";
import { useInbox } from "../social/friends";
import { href, type NavSection } from "./router";
import "./nav.css";

const ICONS: Record<NavSection, ReactNode> = {
  // A booster pack with its crimped top.
  open: (
    <>
      <path d="M6 3h12v18H6z" />
      <path d="M6 7h12M12 11l1.2 2.3 2.3 1.2-2.3 1.2L12 18l-1.2-2.3-2.3-1.2 2.3-1.2z" />
    </>
  ),
  // A binder.
  collection: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 3v18M13 8h4M13 12h4" />
    </>
  ),
  // Stacked sets.
  sets: (
    <>
      <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
      <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
    </>
  ),
  social: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14a6.5 6.5 0 0 1 4 6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

const ITEMS: { id: NavSection; label: string; href: string }[] = [
  { id: "open", label: "Open", href: href.open() },
  { id: "collection", label: "Collection", href: href.collection() },
  { id: "sets", label: "Sets", href: href.picker() },
  { id: "social", label: "Friends", href: href.feed() },
  { id: "settings", label: "Settings", href: href.settings() },
];

export function AppNav({ current }: { current: NavSection }) {
  const signedIn = isMember(useAccount());
  const { friendRequests, feedNew, tradeOffers } = useInbox();
  const waiting = signedIn ? friendRequests + feedNew + tradeOffers : 0;
  return (
    <header className="app-nav">
      <a className="brand" href={href.open()}>
        <img src="./favicon.svg" alt="" width="28" height="28" />
        Pack Opener
      </a>
      <nav aria-label="Main">
        <ul>
          {ITEMS.map((item) => (
            <li key={item.id} className={`nav-${item.id}`}>
              <a href={item.href} aria-current={item.id === current ? "page" : undefined} title={item.id === "settings" ? item.label : undefined}>
                <span className="nav-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {ICONS[item.id]}
                  </svg>
                  {item.id === "social" && waiting > 0 && (
                    <span className="badge" aria-hidden="true">
                      {waiting > 9 ? "9+" : waiting}
                    </span>
                  )}
                </span>
                <span className="nav-label">
                  {item.label}
                  {item.id === "social" && waiting > 0 && <span className="visually-hidden">{badgeLabel(friendRequests, feedNew, tradeOffers)}</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

/** ", 2 friend requests, 3 new posts, 1 trade offer" for screen readers. */
function badgeLabel(requests: number, posts: number, offers: number): string {
  const n = (count: number, word: string) => count && `${count} ${word}${count === 1 ? "" : "s"}`;
  const parts = [n(requests, "friend request"), n(posts, "new post"), n(offers, "trade offer")].filter(Boolean);
  return parts.length ? `, ${parts.join(", ")}` : "";
}
