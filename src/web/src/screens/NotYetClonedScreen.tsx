/**
 * Purpose: Temporary stand-in, inside the shell, for screens whose clone lands in
 * a later phase, so every sidebar link already leads somewhere. Removed once the
 * last screen is cloned.
 */

import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Card } from "../ui/primitives.tsx";

export function NotYetClonedScreen({ title }: { readonly title: string }) {
  return (
    <ScreenFrame title={title}>
      <Card className="p-8 text-center">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">This screen is being cloned in a later phase.</p>
      </Card>
    </ScreenFrame>
  );
}
