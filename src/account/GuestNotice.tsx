// A one-line reminder, shown until you sign up, that a guest's collection belongs to this browser.

import { href } from "../app/router";
import { isMember, useAccount } from "./account";

export function GuestNotice() {
  if (isMember(useAccount())) return null;
  return (
    <p className="guest-note">
      You're playing as a guest, so your cards belong to this browser. <a href={href.settings()}>Sign up or sign in</a> to keep them everywhere.
    </p>
  );
}
