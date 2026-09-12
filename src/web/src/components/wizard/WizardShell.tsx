/**
 * Purpose: The 3-step wizard shell for SPEC-03. Shows a step indicator and
 * Next/Back/Cancel buttons. The current page content is rendered as children.
 * Next is disabled when `canProceed` is false.
 */

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
  const isLastStep = currentStep === STEPS.length;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Add New Company</h1>

      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-between">
        {STEPS.map((label, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === currentStep;
          const isCompleted = stepNumber < currentStep;
          return (
            <div key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : isCompleted
                        ? "bg-green-600 text-white"
                        : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {isCompleted ? "✓" : stepNumber}
                </div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    isActive ? "text-blue-600" : isCompleted ? "text-green-600" : "text-gray-500"
                  }`}
                >
                  {label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`mx-2 h-1 flex-1 ${
                    isCompleted ? "bg-green-600" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Page content */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {children}
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>

        <div className="flex gap-3">
          {canGoBack && (
            <button
              type="button"
              onClick={onBack}
              disabled={isSubmitting}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            disabled={!canProceed || isSubmitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Saving…" : isLastStep ? "Save" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
