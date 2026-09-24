// The opener's own controls, above the pack: the sound toggle, and the guest reminder. The main menu is AppNav.

import { GuestNotice } from "../account/GuestNotice";
import { updateSettings, useSettings } from "../app/settings";

export function OpenerBar() {
  const { sound } = useSettings();
  return (
    <div className="topbar">
      <div className="topbar-tools">
        <button type="button" className="icon-button sound-toggle" aria-pressed={sound} aria-label="Sound" title={sound ? "Sound on" : "Sound off"} onClick={() => updateSettings({ sound: !sound })}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            {sound ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m23 9-6 6M17 9l6 6" />}
          </svg>
        </button>
      </div>
      <GuestNotice />
    </div>
  );
}
