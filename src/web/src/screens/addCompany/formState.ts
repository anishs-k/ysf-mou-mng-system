/**
 * Purpose: The shape every wizard step uses to read and write its fields - one flat
 * map of field key to typed text, owned by the screen so values survive Back/Next.
 */

export type FormValues = Readonly<Record<string, string>>;

export interface StepFormProps {
  readonly values: FormValues;
  readonly onChange: (key: string, value: string) => void;
}

/** Shared description of a plain labelled text field. */
export interface TextFieldSpec {
  readonly key: string;
  readonly label: string;
  readonly placeholder: string;
  readonly required?: boolean;
  readonly type?: "text" | "email" | "tel";
  readonly hint?: string;
  readonly className?: string;
}
