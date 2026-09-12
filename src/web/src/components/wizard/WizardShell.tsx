/**
 * Purpose: The 3-step wizard shell for SPEC-03. Shows a step indicator and
 * Next/Back/Cancel buttons. The current page content is rendered as children.
 * Next is disabled when `canProceed` is false.
 *
 * SPEC-14 restyles the stepper and the surrounding chrome (Topbar, glass
 * card) to match `figma_code`; the three page components' own field markup
 * is unchanged (D80 - Page 1/2/3's ids, labels and behaviour cannot move).
 */

import { useOutletContext } from "react-router-dom";
import type { AppShellContext } from "../layout/AppShell.tsx";
import { Topbar } from "../layout/Topbar.tsx";
import { Card, brand } from "../ui.tsx";

interface WizardShellProps {
  readonly currentStep: number;
  readonly canProceed: boolean;
  readonly canGoBack: boolean;
  readonly isSubmitting: boolean;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly onCancel: () => void;
  readonly children: React.ReactNode;
}

const STEPS = ["Company Detail", "Commercial Details", "Payroll Details"];

export function WizardShell({
  currentStep,
  canProceed,
  canGoBack,
  isSubmitting,
  onNext,
  onBack,
  onCancel,
  children,
}: WizardShellProps) {
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const isLastStep = currentStep === STEPS.length;

  return (
    <>
      <Topbar title="Add New Company" subtitle="Onboard a company through the three-page wizard" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl">
          {/* Step indicator */}
          <div className="mb-6 flex items-center justify-between">
            {STEPS.map((label, index) => {
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isCompleted = stepNumber < currentStep;
              return (
                <div key={label} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ background: isActive ? brand.blue : isCompleted ? brand.green : "#D8E3F0", color: isActive || isCompleted ? "#fff" : "#5A7AA8" }}
                    >
                      {isCompleted ? "✓" : stepNumber}
                    </div>
                    <span
                      className="mt-2 text-xs font-medium"
                      style={{ color: isActive ? brand.blue : isCompleted ? brand.green : "#8A9BB5" }}
                    >
                      {label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className="mx-2 h-1 flex-1 rounded-full" style={{ background: isCompleted ? brand.green : "#D8E3F0" }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Page content */}
          <Card className="mb-6 p-6">{children}</Card>

          {/* Navigation buttons */}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>

            <div className="flex gap-3">
              {canGoBack && (
                <button
                  type="button"
                  onClick={onBack}
                  disabled={isSubmitting}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={onNext}
                disabled={!canProceed || isSubmitting}
                className="rounded-lg text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: brand.blue }}
              >
                {isSubmitting ? "Saving…" : isLastStep ? "Save" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
