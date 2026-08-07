import { ShieldPlus } from "lucide-react";

type DisclaimerBarProps = {
  placeholder?: boolean;
};

export function DisclaimerBar({ placeholder = false }: DisclaimerBarProps) {
  return (
    <aside className="disclaimer-bar" aria-label="Important information">
      <div className="page-container disclaimer-bar__inner">
        <ShieldPlus aria-hidden="true" size={28} strokeWidth={1.6} />
        <p>
          SoundCue is a screening aid, not a diagnosis.
          {placeholder ? " This result was created by a placeholder analyzer." : ""}
        </p>
      </div>
    </aside>
  );
}
