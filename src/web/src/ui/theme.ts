/**
 * Purpose: Design constants shared by the clone's components - the four brand
 * colours and the rule mapping an MoU status to its badge tone - kept out of the
 * component files so those export components only.
 */

export const BRAND = {
  blue: "#1B5FAE",
  orange: "#F26522",
  green: "#39B54A",
  navy: "#0D2E5A",
} as const;

export type BadgeTone = "default" | "success" | "warning" | "danger" | "info";

/** Status words map to tones the same way on every screen. */
export function statusTone(status: string): BadgeTone {
  if (status === "Active") return "success";
  if (status === "Expiring") return "warning";
  if (status === "Expired") return "danger";
  if (status === "New") return "info";
  return "default";
}

/** The input border of the signed-out login and sign-up cards (screens/login/AuthPageFrame.tsx). */
export const AUTH_INPUT_STYLE = { border: "1.5px solid #D8E3F0", fontFamily: "inherit", color: BRAND.navy } as const;
