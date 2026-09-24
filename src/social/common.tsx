// Pieces shared by the feed and friends pages.

import { href } from "../app/router";
import { useInbox } from "./friends";

export function Avatar({ friend }: { friend: { displayName: string; avatarUrl: string | null } }) {
  return friend.avatarUrl ? (
    <img className="avatar" src={friend.avatarUrl} alt="" referrerPolicy="no-referrer" loading="lazy" />
  ) : (
    <span className="avatar" aria-hidden="true">
      {[...friend.displayName][0]?.toUpperCase()}
    </span>
  );
}

/** "Feed / Friends" switch at the top of both pages, with waiting friend requests counted on its tab. */
export function SocialTabs({ current }: { current: "feed" | "friends" }) {
  const { friendRequests } = useInbox();
  return (
    <nav className="segmented view-switch" aria-label="Friends">
      <a href={href.feed()} aria-current={current === "feed" ? "page" : undefined}>
        Feed
      </a>
      <a href={href.friends()} aria-current={current === "friends" ? "page" : undefined}>
        Friends{friendRequests > 0 && <span className="tab-count"> ({friendRequests})</span>}
      </a>
    </nav>
  );
}

/** "today", "yesterday" or a short date. */
export function day(ms: number): string {
  const d = new Date(ms);
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", ...(d.getFullYear() !== new Date().getFullYear() && { year: "numeric" }) });
}

/** "just now", "5 min ago", "3 h ago", then as `day`. */
export function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return day(ms);
}
