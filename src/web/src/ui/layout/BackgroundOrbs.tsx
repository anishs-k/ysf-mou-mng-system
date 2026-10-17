/**
 * Purpose: The blurred, slowly drifting colour orbs behind the glass surfaces. The
 * login screen and the signed-in shell each use their own arrangement, so both
 * sets are declared here and picked by `variant`.
 */

import type { CSSProperties } from "react";

interface Orb {
  readonly animation: "orb-a" | "orb-b" | "orb-c";
  readonly position: CSSProperties;
  readonly size: number;
  readonly color: string;
  readonly fade: number;
  readonly blur: number;
}

const ORBS: Record<"login" | "shell", readonly Orb[]> = {
  login: [
    { animation: "orb-a", position: { top: "-15%", right: "-10%" }, size: 700, color: "rgba(27,95,174,0.32)", fade: 65, blur: 36 },
    { animation: "orb-b", position: { bottom: "-18%", left: "0%" }, size: 600, color: "rgba(242,101,34,0.22)", fade: 65, blur: 44 },
    { animation: "orb-c", position: { top: "40%", left: "40%" }, size: 400, color: "rgba(57,181,74,0.12)", fade: 70, blur: 54 },
  ],
  shell: [
    { animation: "orb-a", position: { top: "-12%", right: "-8%" }, size: 640, color: "rgba(27,95,174,0.30)", fade: 68, blur: 32 },
    { animation: "orb-b", position: { bottom: "-15%", left: "5%" }, size: 520, color: "rgba(242,101,34,0.22)", fade: 68, blur: 40 },
    { animation: "orb-c", position: { top: "38%", left: "28%" }, size: 420, color: "rgba(57,181,74,0.14)", fade: 70, blur: 50 },
    { animation: "orb-a", position: { top: "10%", left: "-5%" }, size: 360, color: "rgba(27,95,174,0.18)", fade: 65, blur: 36 },
  ],
};

export function BackgroundOrbs({ variant }: { readonly variant: "login" | "shell" }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {ORBS[variant].map((orb, index) => (
        <div
          key={index}
          className={`${orb.animation} absolute`}
          style={{
            ...orb.position,
            width: orb.size,
            height: orb.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${orb.color} 0%, transparent ${orb.fade}%)`,
            filter: `blur(${orb.blur}px)`,
          }}
        />
      ))}
    </div>
  );
}
