// A one-line reminder, shown until you sign in, that a guest's collection lives on this device only.

import { href } from "../app/router";
import { useAccount } from "./account";

export function GuestNotice() {
  if (useAccount().status === "signedIn") return null;
  return (
    <p className="guest-note">
      You're playing as a guest, so your cards are saved on this device only. <a href={href.settings()}>Sign in</a> to keep them everywhere.
    </p>
  );
}
