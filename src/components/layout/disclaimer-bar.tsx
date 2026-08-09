import { ShieldPlus } from "lucide-react";

export function DisclaimerBar() {
  return (
    <aside className="disclaimer-bar" aria-label="Important information">
      <div className="page-container disclaimer-bar__inner">
        <ShieldPlus aria-hidden="true" size={28} strokeWidth={1.6} />
        <p>
          SoundCue looks for voice patterns associated with Parkinson’s disease. It is a screening aid, not a diagnosis.
        </p>
      </div>
    </aside>
  );
}
