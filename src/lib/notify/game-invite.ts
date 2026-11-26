import { notifyAccount, type AppAccount, type AppNotifyDeps, type AppTexts, type NotifyOutcome } from "./app-notify.ts";

// The push for a classmate's challenge in the 1v1 game —
// docs/STUDENT_APP_SPEC.md → "App behaviour → Game tab". Sent the moment the
// invite is written; the invite is open for 60 seconds.

export type InviteToPush = {
  id: string;
  /** Who challenged: a first name and an initial, as the game shows names. */
  fromName: string;
  /** The invited student's app account. */
  to: AppAccount;
  status: string;
  expiresAt: Date;
};

export interface GameInviteDeps extends AppNotifyDeps {
  invite(id: string): Promise<InviteToPush | null>;
  centreName(): Promise<string>;
  texts: AppTexts;
  now?: () => Date;
}

export type InvitePushOutcome = NotifyOutcome | "gone";

/** One challenge, one push, in the app's language, while the challenge is still open. */
export async function pushGameInvite(deps: GameInviteDeps, inviteId: string): Promise<InvitePushOutcome> {
  const invite = await deps.invite(inviteId);
  const now = (deps.now ?? (() => new Date()))();
  if (!invite || invite.status !== "pending" || invite.expiresAt <= now) return "gone";
  return notifyAccount(deps, invite.to, {
    type: "game_invite",
    title: await deps.centreName(),
    body: deps.texts(invite.to.language)("game_invite.body", { name: invite.fromName }),
    // A tap opens the Game tab, where the challenge card is.
    data: { screen: "game", invite_id: invite.id },
    dedupeKey: `game_invite:${invite.id}`,
  });
}

/** "Aziza Karimova" → "Aziza K.", as public.tv_name() writes it. */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? `${parts[0]} ${Array.from(parts[parts.length - 1])[0]}.` : (parts[0] ?? "");
}
