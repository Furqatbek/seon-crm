"use client";

import { useState } from "react";

/**
 * A sheet whose record comes from the URL stays on screen until the server
 * has answered the new address. On a slow connection that looks stuck. This
 * hides it the moment the person closes it; the address follows.
 */
export function useInstantClose(openId: string | null, onClose: () => void): { open: boolean; close: () => void } {
  const [closedId, setClosedId] = useState<string | null>(null);
  // Once the address has caught up, the same record can be opened again.
  if (openId === null && closedId !== null) setClosedId(null);
  return {
    open: openId !== null && openId !== closedId,
    close: () => {
      setClosedId(openId);
      onClose();
    },
  };
}
