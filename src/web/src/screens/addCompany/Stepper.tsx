/**
 * Purpose: The wizard's progress card - numbered circles joined by bars, where
 * finished steps turn green with a tick, the current one is brand blue and the
 * rest stay outlined grey.
 */

import { Icon } from "../../ui/Icon.tsx";

interface StepperProps {
  readonly steps: readonly string[];
  /** Zero-based index of the step being edited. */
  readonly current: number;
}

const CIRCLE = "w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all";
const CAPTION = "text-[10px] sm:text-xs mt-1.5 whitespace-nowrap font-semibold";

export function Stepper({ steps, current }: StepperProps) {
  return (
    <div className="glass-card rounded-xl p-4 md:p-6 mb-4 md:mb-6 overflow-x-auto">
      <div className="flex items-center min-w-max w-full">
        {steps.map((label, index) => {
          const done = index < current;
          const active = index === current;
          const circleLook = done
            ? "bg-[#39B54A] border-[#39B54A] text-white"
            : active
              ? "bg-[#1B5FAE] border-[#1B5FAE] text-white"
              : "bg-white border-[#CDDAEE] text-[#5A7AA8]";
          const captionLook = done ? "text-[#39B54A]" : active ? "text-[#1B5FAE]" : "text-[#5A7AA8]";
          return (
            <div key={label} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`${CIRCLE} ${circleLook}`}>
                  {done ? <Icon name="check" className="w-4 h-4" strokeWidth={2.5} /> : <span>{index + 1}</span>}
                </div>
                <p className={`${CAPTION} ${captionLook}`}>{label}</p>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 sm:mx-2 mb-4 transition-all rounded-full ${done ? "bg-[#39B54A]" : "bg-[#CDDAEE]"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
