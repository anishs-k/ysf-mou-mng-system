/**
 * Purpose: The full-area confirmation shown after "Generate Code & Save" - the
 * green tick, the generated MoU code, and the Add Another / Go to Dashboard actions.
 */

import { Icon } from "../../ui/Icon.tsx";
import { Button } from "../../ui/primitives.tsx";

interface RegisteredStateProps {
  readonly mouCode: string;
  readonly onAddAnother: () => void;
  readonly onDashboard: () => void;
}

export function RegisteredState({ mouCode, onAddAnother, onDashboard }: RegisteredStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-white" style={{ background: "#39B54A" }}>
          <Icon name="check" className="w-10 h-10" strokeWidth={3} />
        </div>
        <h2 className="font-bold text-2xl mb-2" style={{ color: "#0D2E5A" }}>
          Company Registered!
        </h2>
        <p className="text-muted-foreground text-sm mb-1">MoU Code generated:</p>
        <p className="mono font-bold text-base mb-6" style={{ color: "#1B5FAE" }}>
          {mouCode}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={onAddAnother}
            className="inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary border-border hover:bg-blue-100 px-4 py-2 text-sm"
          >
            Add Another
          </button>
          <Button onClick={onDashboard}>Go to Dashboard</Button>
        </div>
      </div>
    </div>
  );
}
