"use client";

import jsQR from "jsqr";
import { ArrowLeft, Camera, CameraOff, CircleAlert, LogIn, LogOut, ScanLine, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { initials } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { looksLikeCode, type CheckinMatch, type CheckinResult } from "@/lib/checkin/types";
import { cn } from "@/lib/utils";

/** The result card stays this long. */
export const CARD_MS = 3000;
/** The camera looks for a code this often. */
const SCAN_EVERY_MS = 200;
/** A handheld scanner types fast: keys further apart than this are a person. */
const SCANNER_GAP_MS = 100;
/** The same code is not sent again while its card is still up. */
const SAME_CODE_MS = CARD_MS;

export type CheckinActions = {
  scan: (code: string) => Promise<CheckinResult>;
  search: (query: string) => Promise<CheckinMatch[]>;
  byHand: (studentId: string) => Promise<CheckinResult>;
};

/** Two letters or more that are not a scanned code. */
const searchable = (text: string) => text.length >= 2 && !looksLikeCode(text);

/** Two rising notes for a visit, one low note for a refusal: made in the browser. */
function sound(ok: boolean) {
  try {
    const context = new AudioContext();
    const start = context.currentTime;
    for (const [index, frequency] of (ok ? [784, 1175] : [196]).entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + index * 0.12;
      oscillator.type = ok ? "sine" : "square";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(ok ? 0.2 : 0.08, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + (ok ? 0.25 : 0.45));
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.5);
    }
    setTimeout(() => void context.close(), 1000);
  } catch {
    // No sound is not a problem: the card still shows.
  }
}

function ResultCard({ result }: { result: CheckinResult }) {
  const t = useTranslations("checkin");
  if (!result.ok) {
    return (
      <div role="alert" data-slot="checkin-result" data-result="error" className="flex flex-col items-center gap-4 rounded-card bg-danger-tint p-8 text-center">
        <CircleAlert aria-hidden className="size-16 text-danger" />
        <p className="text-title text-danger">{t(`errors.${result.error}`)}</p>
      </div>
    );
  }
  const arrived = result.kind === "arrived";
  return (
    <div
      role="status"
      data-slot="checkin-result"
      data-result={result.kind}
      className={cn("flex flex-col gap-6 rounded-card p-8", arrived ? "bg-success-tint" : "bg-brand-tint")}
    >
      <div className="flex flex-wrap items-center gap-6">
        {result.student.photoUrl ? (
          // A short-lived signed link to a private file: not something to optimise or cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.student.photoUrl} alt="" className="size-28 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden className="inline-flex size-28 shrink-0 items-center justify-center rounded-full bg-bg text-large-title text-brand-ink select-none">
            {initials(result.student.name)}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-large-title text-text" data-cell="name">
            {result.student.name}
          </p>
          <p className={cn("flex flex-wrap items-center gap-2 text-title", arrived ? "text-success" : "text-brand-ink")}>
            {arrived ? <LogIn aria-hidden className="size-7" /> : <LogOut aria-hidden className="size-7" />}
            <span data-cell="kind">{t(arrived ? "arrived" : "left")}</span>
            <span className="numeric">{result.time}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {result.debt ? <StatusPill tone="danger">{t("debt")}</StatusPill> : null}
            {result.repeat ? <StatusPill tone="neutral">{t("repeat")}</StatusPill> : null}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-control bg-bg p-4">
        <p className="text-footnote text-text-secondary">{t("todayLessons")}</p>
        {result.lessons.length === 0 ? (
          <p className="text-body text-text">{t("noLessons")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {result.lessons.map((lesson) => (
              <li key={`${lesson.group}:${lesson.start_time}`} className="flex flex-wrap items-baseline gap-x-3 text-headline text-text">
                <span className="numeric">
                  {lesson.start_time}–{lesson.end_time}
                </span>
                <span>{lesson.group}</span>
                {lesson.room ? <span className="text-body text-text-secondary">{t("room", { room: lesson.room })}</span> : null}
                {lesson.exam ? <StatusPill tone="warning">{t("exam")}</StatusPill> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The reception scanner, full screen: a camera, a handheld scanner that types
 * the code like a keyboard, and search by name for a student without their
 * phone. Each scan shows a card for three seconds, with a sound.
 */
export function CheckinScreen({
  centreName,
  actions,
  exit,
  initial = null,
  camera: cameraWanted = true,
  cardMs = CARD_MS,
}: {
  centreName: string;
  actions: CheckinActions;
  /** Where the corner link leads: back to the CRM for staff, sign-out for a kiosk. */
  exit: { href: string; kind: "back" | "signOut" };
  /** A result to start with, for previews. */
  initial?: CheckinResult | null;
  camera?: boolean;
  cardMs?: number;
}) {
  const t = useTranslations("checkin");
  const [result, setResult] = useState<CheckinResult | null>(initial);
  // Reception opens the page to scan: the camera is asked for at once.
  const [camera, setCamera] = useState<"off" | "on" | "blocked">(cameraWanted ? "on" : "off");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CheckinMatch[] | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (next: CheckinResult) => {
      setResult(next);
      sound(next.ok);
      if (hide.current) clearTimeout(hide.current);
      hide.current = setTimeout(() => setResult(null), cardMs);
    },
    [cardMs],
  );

  const run = useCallback(
    async (work: () => Promise<CheckinResult>) => {
      if (busy.current) return;
      busy.current = true;
      try {
        show(await work());
      } catch {
        // The server was not reached.
        show({ ok: false, error: "offline" });
      } finally {
        busy.current = false;
      }
    },
    [show],
  );

  const submit = useCallback(
    (text: string) => {
      const code = text.trim();
      if (code === "") return;
      const now = Date.now();
      // Held to the camera, the same code is read many times a second.
      if (code === last.current.code && now - last.current.at < SAME_CODE_MS) return;
      last.current = { code, at: now };
      void run(() => actions.scan(code));
    },
    [actions, run],
  );

  useEffect(() => () => void (hide.current && clearTimeout(hide.current)), []);

  // A handheld scanner types the code and presses Enter, wherever the focus is.
  useEffect(() => {
    let typed = "";
    let at = 0;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const now = Date.now();
      if (now - at > SCANNER_GAP_MS) typed = "";
      at = now;
      if (event.key === "Enter") {
        if (typed.length >= 10) submit(typed);
        typed = "";
      } else if (event.key.length === 1) {
        typed += event.key;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [submit]);

  // The camera: every frame that holds a QR code is sent as a scan.
  useEffect(() => {
    if (camera !== "on") return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const canvas = document.createElement("canvas");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        if (!stopped) setCamera("blocked");
        return;
      }
      if (stopped || !video.current) return stream.getTracks().forEach((track) => track.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      timer = setInterval(() => {
        const frame = video.current;
        if (!frame || frame.videoWidth === 0 || busy.current) return;
        // Small enough to read five times a second on a tablet.
        const scale = Math.min(1, 640 / frame.videoWidth);
        canvas.width = Math.round(frame.videoWidth * scale);
        canvas.height = Math.round(frame.videoHeight * scale);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(frame, 0, 0, canvas.width, canvas.height);
        const found = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
        if (found?.data) submit(found.data);
      }, SCAN_EVERY_MS);
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [camera, submit]);

  // Search as the name is typed.
  useEffect(() => {
    const text = query.trim();
    if (!searchable(text)) return;
    let current = true;
    const timer = setTimeout(() => {
      actions.search(text).then(
        (found) => current && setMatches(found),
        () => current && setMatches([]),
      );
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, actions]);

  function onQuery(text: string) {
    setQuery(text);
    if (!searchable(text.trim())) setMatches(null);
  }

  function onSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    // A scanner that typed into the search box.
    if (looksLikeCode(query)) {
      submit(query);
      setQuery("");
    }
  }

  function byHand(match: CheckinMatch) {
    setQuery("");
    setMatches(null);
    void run(() => actions.byHand(match.id));
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle" data-slot="checkin">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg px-4 py-3 sm:px-8">
        <div className="flex min-w-0 flex-col">
          <h1 className="text-title text-text">{t("title")}</h1>
          <p className="truncate text-footnote text-text-secondary">{centreName}</p>
        </div>
        <Button asChild variant="ghost">
          <a href={exit.href}>
            {exit.kind === "back" ? <ArrowLeft aria-hidden /> : <LogOut aria-hidden />}
            {t(exit.kind === "back" ? "backToCrm" : "signOut")}
          </a>
        </Button>
      </header>

      <main className="mx-auto grid w-full max-w-[1400px] flex-1 gap-6 p-4 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section aria-label={t("camera")} className="order-2 flex flex-col gap-3 lg:order-1">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card bg-text" data-camera={camera}>
            <video ref={video} muted playsInline className={cn("size-full object-cover", camera !== "on" && "hidden")} />
            {camera === "on" ? (
              <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="size-3/5 rounded-card border-4 border-bg/80" />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-bg">
                <CameraOff aria-hidden className="size-12" />
                <p className="text-body">{t(camera === "blocked" ? "cameraBlocked" : "cameraOffHint")}</p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-footnote text-text-secondary">
              <ScanLine aria-hidden className="size-4 shrink-0" />
              {t("scannerHint")}
            </p>
            <Button onClick={() => setCamera(camera === "on" ? "off" : "on")}>
              {camera === "on" ? <CameraOff aria-hidden /> : <Camera aria-hidden />}
              {t(camera === "on" ? "cameraTurnOff" : "cameraTurnOn")}
            </Button>
          </div>
        </section>

        <section className="order-1 flex flex-col gap-6 lg:order-2">
          <div aria-live="polite" className="min-h-64">
            {result ? (
              <ResultCard result={result} />
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-bg p-8 text-center" data-slot="checkin-idle">
                <ScanLine aria-hidden className="size-12 text-text-tertiary" />
                <p className="text-headline text-text">{t("idle")}</p>
                <p className="text-body text-text-secondary">{t("idleHint")}</p>
              </div>
            )}
          </div>

          <form onSubmit={onSearchSubmit} className="flex flex-col gap-3 rounded-card bg-bg p-4" role="search">
            <label htmlFor="checkin-search" className="text-body font-medium text-text">
              {t("search")}
            </label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" />
              <Input id="checkin-search" value={query} onChange={(event) => onQuery(event.target.value)} autoComplete="off" placeholder={t("searchPlaceholder")} className="pl-9" />
            </div>
            {matches === null ? null : matches.length === 0 ? (
              <p className="text-footnote text-text-secondary">{t("searchEmpty")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border" data-slot="checkin-matches">
                {matches.map((match) => (
                  <li key={match.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body text-text">{match.name}</span>
                      {match.groups ? <span className="text-footnote text-text-secondary">{match.groups}</span> : null}
                    </span>
                    <Button variant="primary" onClick={() => byHand(match)}>
                      {t("checkIn")}
                      <span className="sr-only">: {match.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        </section>
      </main>
    </div>
  );
}
