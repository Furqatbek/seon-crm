"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

type FocusHandlers = {
  onCloseAutoFocus?: (event: Event) => void;
};

// The controls that had focus most recently, newest last. One listener for the
// whole page.
const recent: HTMLElement[] = [];
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener(
    "focusin",
    (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const at = recent.indexOf(event.target);
      if (at !== -1) recent.splice(at, 1);
      recent.push(event.target);
      if (recent.length > 12) recent.shift();
    },
    true,
  );
  if (document.activeElement instanceof HTMLElement) recent.push(document.activeElement);
}

// From the moment the page loads in a browser, so the first sheet is covered too.
if (typeof document !== "undefined") listen();

/**
 * Rendered inside the layer. When the layer appears it notes the control that
 * last had focus outside it: the one to go back to. (Radix's own "open" event
 * is no use here: it is not sent when a field in the layer has autoFocus.)
 */
function Marker({ openerRef }: { openerRef: RefObject<HTMLElement | null> }) {
  const marker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    listen();
    const layer = marker.current?.parentElement;
    openerRef.current =
      recent.findLast((candidate) => candidate !== document.body && !layer?.contains(candidate)) ?? null;
  }, [openerRef]);
  return <span ref={marker} hidden />;
}

/**
 * Sheets and dialogs here are opened from state, not from a Radix trigger, so
 * Radix does not know where focus came from and would drop it on the page
 * body when they close. This gives focus back to the control that last had it
 * outside the layer — the button that opened it — so a keyboard user carries
 * on from where they were. Render `marker` inside the layer's content.
 */
export function useReturnFocus(handlers: FocusHandlers) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    marker: <Marker openerRef={opener} />,
    onCloseAutoFocus(event: Event) {
      handlers.onCloseAutoFocus?.(event);
      const target = opener.current;
      // The opener may be gone (a menu item, a row that was removed): then Radix decides.
      if (event.defaultPrevented || !target?.isConnected) return;
      event.preventDefault();
      target.focus();
    },
  };
}
