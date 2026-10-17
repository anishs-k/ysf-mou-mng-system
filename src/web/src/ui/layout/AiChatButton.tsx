/**
 * Purpose: The floating "AI" assistant button pinned to the bottom-right of every
 * signed-in screen. It is visual only for now; the assistant itself is out of
 * scope of the clone.
 */

import { Icon } from "../Icon.tsx";
import { BRAND } from "../theme.ts";

export function AiChatButton() {
  return (
    <button
      type="button"
      title="AI assistant"
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all active:scale-95 hover:scale-105"
      style={{ background: BRAND.blue }}
    >
      <span className="text-white">
        <Icon name="chat" className="w-6 h-6" />
      </span>
      <span
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
        style={{ background: BRAND.orange }}
      >
        AI
      </span>
    </button>
  );
}
