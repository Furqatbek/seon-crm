import { describe, expect, it } from "vitest";

import type { AppAccount, AppNotification, AppNotifyStore } from "./app-notify.ts";
import type { PushMessage, PushSender } from "./fcm.ts";
import { pushGameInvite, shortName, type GameInviteDeps, type InviteToPush } from "./game-invite.ts";

// docs/STUDENT_APP_SPEC.md → "App behaviour → Game tab": incoming challenge card and push.

const now = new Date("2026-11-26T10:00:00Z");
const account: AppAccount = { profileId: "p-2", language: "uz", messageLanguage: "uz", tokens: ["token-a", "token-b"] };
const invite = (changes: Partial<InviteToPush> = {}): InviteToPush => ({ id: "invite-1", fromName: "Jasur T.", to: account, status: "pending", expiresAt: new Date(now.getTime() + 55_000), ...changes });

function world(found: InviteToPush | null) {
  const rows: Array<{ profileId: string } & AppNotification> = [];
  const sent: Array<{ token: string } & PushMessage> = [];
  const store: AppNotifyStore = {
    accountOfStudent: async () => null,
    insert: async (profileId, notification) => (rows.some((row) => row.dedupeKey === notification.dedupeKey) ? false : (rows.push({ profileId, ...notification }), true)),
    dropToken: async () => {},
  };
  const push: PushSender = { send: async (token, message) => (sent.push({ token, ...message }), { ok: true }) };
  const texts: GameInviteDeps["texts"] = (language) => (key, values) => `${language}:${key}:${values?.name}`;
  const deps: GameInviteDeps = { store, push, invite: async () => found, centreName: async () => "Seon", texts, now: () => now };
  return { deps, rows, sent };
}

describe("the push for a classmate's challenge", () => {
  it("goes to every phone of the invited student, in the app's language, and opens the Game tab", async () => {
    const { deps, rows, sent } = world(invite({ to: { ...account, language: "ko" } }));
    expect(await pushGameInvite(deps, "invite-1")).toBe("pushed");
    expect(sent).toEqual([
      { token: "token-a", title: "Seon", body: "ko:game_invite.body:Jasur T.", data: { type: "game_invite", screen: "game", invite_id: "invite-1" } },
      { token: "token-b", title: "Seon", body: "ko:game_invite.body:Jasur T.", data: { type: "game_invite", screen: "game", invite_id: "invite-1" } },
    ]);
    expect(rows).toEqual([expect.objectContaining({ profileId: "p-2", type: "game_invite", dedupeKey: "game_invite:invite-1" })]);
  });

  it("is sent once, however many times it is asked for", async () => {
    const { deps, sent } = world(invite());
    await pushGameInvite(deps, "invite-1");
    expect(await pushGameInvite(deps, "invite-1")).toBe("duplicate");
    expect(sent).toHaveLength(2);
  });

  it("is not sent for a challenge that is answered, expired or unknown", async () => {
    for (const found of [invite({ status: "accepted" }), invite({ status: "declined" }), invite({ expiresAt: now }), null]) {
      const { deps, sent, rows } = world(found);
      expect(await pushGameInvite(deps, "invite-1")).toBe("gone");
      expect(sent).toEqual([]);
      expect(rows).toEqual([]);
    }
  });

  it("without a phone it is still listed among the notifications", async () => {
    const { deps, sent, rows } = world(invite({ to: { ...account, tokens: [] } }));
    expect(await pushGameInvite(deps, "invite-1")).toBe("stored");
    expect(sent).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it("names the challenger by first name and initial", () => {
    expect(shortName("Jasur Toshmatov")).toBe("Jasur T.");
    expect(shortName("  Aziza   Karimova qizi ")).toBe("Aziza q.");
    expect(shortName("Madina")).toBe("Madina");
    expect(shortName("")).toBe("");
  });
});
