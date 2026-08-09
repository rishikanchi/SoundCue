"use client";

import { useState } from "react";
import { Mic } from "lucide-react";
import { beginScreening } from "@/app/actions/consent";

export function ConsentForm() {
  const [accepted, setAccepted] = useState(false);

  return (
    <form action={beginScreening} className="consent-form" id="consent">
      <button className="button button--primary button--large consent-form__button" disabled={!accepted}>
        <Mic aria-hidden="true" size={28} strokeWidth={1.7} />
        Begin screening
      </button>
      <label className="consent-form__check">
        <input
          checked={accepted}
          name="screening-consent"
          onChange={(event) => setAccepted(event.target.checked)}
          type="checkbox"
          value="accepted"
        />
        <span aria-hidden="true" className="consent-form__box" />
        <span>
          I understand SoundCue is a Parkinson’s voice screening aid, not a diagnosis, and I consent to my
          recording and age at screening being processed by the research model and retained
          in my private account until I delete them.
        </span>
      </label>
    </form>
  );
}
