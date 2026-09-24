// The opener's top bar: the opener is home, so this is the way to everything else.

import { isMember, useAccount } from "../account/account";
import { GuestNotice } from "../account/GuestNotice";
import { href } from "../app/router";
import { updateSettings, useSettings } from "../app/settings";
import { useInbox } from "../social/friends";
import "../social/social.css";

export function OpenerNav() {
  const { sound } = useSettings();
  const signedIn = isMember(useAccount());
  const { friendRequests, feedNew } = useInbox();
  const waiting = friendRequests + feedNew;
  return (
    <header className="topbar">
      <nav className="topbar-links" aria-label="Main">
        <a href={href.collection()}>Collection</a>
        <a href={href.picker()}>Sets</a>
      </nav>
      <div className="topbar-tools">
        {signedIn && (
          <a className="icon-button friends-link" href={href.feed()} aria-label={`Friends and feed${badgeLabel(friendRequests, feedNew)}`} title="Friends and feed">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
              <path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14a6.5 6.5 0 0 1 4 6" />
            </svg>
            {waiting > 0 && (
              <span className="badge" aria-hidden="true">
                {waiting > 9 ? "9+" : waiting}
              </span>
            )}
          </a>
        )}
        <a className="icon-button" href={href.settings()} aria-label="Settings" title="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </a>
        <button type="button" className="icon-button sound-toggle" aria-pressed={sound} aria-label="Sound" title={sound ? "Sound on" : "Sound off"} onClick={() => updateSettings({ sound: !sound })}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            {sound ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m23 9-6 6M17 9l6 6" />}
          </svg>
        </button>
      </div>
      <GuestNotice />
    </header>
  );
}

/** ", 2 friend requests, 3 new posts" for the button's label. */
function badgeLabel(requests: number, posts: number): string {
  const parts = [requests && `${requests} friend request${requests === 1 ? "" : "s"}`, posts && `${posts} new post${posts === 1 ? "" : "s"}`].filter(Boolean);
  return parts.length ? `, ${parts.join(", ")}` : "";
}
