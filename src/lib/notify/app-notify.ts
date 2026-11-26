import type { PushSender } from "./fcm.ts";
import type { Language, MessageType } from "./types.ts";

// Notifications for the student app — docs/STUDENT_APP_SPEC.md → "Rules →
// Notifications". Every message for someone with an app account is written to
// `notifications` (the app's bell) and pushed to their phones. When there is
// no device token, or no push arrives anywhere, the caller falls back to the
// student's Telegram link. Parents keep Telegram.

/** The four languages of the app's interface. */
export type AppLanguage = Language | "ko";

export type AppAccount = {
  profileId: string;
  /** The language chosen in the app. */
  language: AppLanguage;
  /** The language of messages to this family (uz, ru, en): the centre's templates have no Korean. */
  messageLanguage: Language;
  /** Push tokens of the phones the app is installed on. */
  tokens: string[];
};

export type AppNotification = {
  type: MessageType;
  title: string;
  body: string;
  /** Where a tap leads in the app, e.g. { screen: "coins" }. */
  data?: Record<string, string>;
  /** One notification per key and account: a repeated run tells nobody twice. */
  dedupeKey: string;
};

export interface AppNotifyStore {
  /** The app account linked to a student, or null when they have not signed up. */
  accountOfStudent(studentId: string): Promise<AppAccount | null>;
  /** Writes the notification. False when one with this key already exists. */
  insert(profileId: string, notification: AppNotification): Promise<boolean>;
  /** Forgets a token Firebase no longer knows. */
  dropToken(token: string): Promise<void>;
}

export type NotifyOutcome =
  /** Written, and delivered to at least one phone. */
  | "pushed"
  /** Written, but there is no phone to push to (or none took it): use Telegram. */
  | "stored"
  /** Already told. */
  | "duplicate"
  /** No app account: use Telegram. */
  | "none";

export type AppNotifyDeps = { store: AppNotifyStore; push: PushSender };

/** Writes one notification for an account and pushes it to every phone it has. */
export async function notifyAccount(deps: AppNotifyDeps, account: AppAccount, notification: AppNotification): Promise<NotifyOutcome> {
  if (!(await deps.store.insert(account.profileId, notification))) return "duplicate";
  let delivered = false;
  for (const token of account.tokens) {
    const result = await deps.push.send(token, {
      title: notification.title,
      body: notification.body,
      data: { type: notification.type, ...notification.data },
    });
    if (result.ok) delivered = true;
    else if (result.unregistered) await deps.store.dropToken(token);
  }
  return delivered ? "pushed" : "stored";
}

/**
 * A message for a student: by push when they have the app on a phone,
 * otherwise the caller sends it to the student's Telegram chat. `compose`
 * writes it in the account's language, or returns null when there is nothing to say.
 */
export async function notifyStudent(
  deps: AppNotifyDeps,
  studentId: string,
  compose: (account: AppAccount) => AppNotification | null,
): Promise<NotifyOutcome> {
  const account = await deps.store.accountOfStudent(studentId);
  if (!account) return "none";
  const notification = compose(account);
  if (!notification) return "none";
  return notifyAccount(deps, account, notification);
}

/** True when the student has been told in the app and Telegram must not repeat it. */
export const handledInApp = (outcome: NotifyOutcome) => outcome === "pushed" || outcome === "duplicate";

/**
 * What the reminders and the points messages need from the app: tell a
 * student something of a given type, written from the centre's template in
 * their message language. The title is the centre's name.
 */
export type StudentPush = (
  studentId: string,
  type: MessageType,
  dedupeKey: string,
  body: (language: Language) => string | null,
) => Promise<NotifyOutcome>;

export function studentPush(deps: AppNotifyDeps, centreName: () => Promise<string>): StudentPush {
  let title: Promise<string> | undefined;
  return async (studentId, type, dedupeKey, body) => {
    try {
      const account = await deps.store.accountOfStudent(studentId);
      if (!account) return "none";
      const text = body(account.messageLanguage);
      if (text === null) return "none";
      title ??= centreName();
      return await notifyAccount(deps, account, { type, title: await title, body: text, dedupeKey });
    } catch (error) {
      // The app must never stop a Telegram message from going out.
      console.error("app notification", error);
      return "none";
    }
  };
}

// ── Things the database did that the app should hear about ──

/** A text of the app's pushes in one language: `key` is under "studentApp" in messages/*.json. */
export type AppTexts = (language: AppLanguage) => (key: string, values?: Record<string, string | number>) => string;

export type LinkedAccount = { account: AppAccount; linkedAt: string };

export interface AppEventData {
  centreName(): Promise<string>;
  /** Accounts linked to a student since then. */
  linkedSince(since: Date): Promise<LinkedAccount[]>;
}

/** A link older than this is no longer announced. */
export const LINK_WINDOW_HOURS = 48;

export type AppRunSummary = { pushed: number; stored: number; duplicate: number };

/**
 * One run, every 15 minutes with the reminders job: "Your account is linked
 * to the centre" for every account linked since the last runs, whether the
 * phone matched at sign-up or staff saved the phone later. Sent at once, also
 * in quiet hours: it answers something the person has just done.
 */
export async function runAppNotifications(
  now: Date,
  deps: AppNotifyDeps & { data: AppEventData; texts: AppTexts },
): Promise<AppRunSummary> {
  const summary: AppRunSummary = { pushed: 0, stored: 0, duplicate: 0 };
  const linked = await deps.data.linkedSince(new Date(now.getTime() - LINK_WINDOW_HOURS * 60 * 60 * 1000));
  if (linked.length === 0) return summary;
  const centre = await deps.data.centreName();
  for (const { account, linkedAt } of linked) {
    const t = deps.texts(account.language);
    const outcome = await notifyAccount(deps, account, {
      type: "account_linked",
      title: t("account_linked.title"),
      body: t("account_linked.body", { centre }),
      data: { screen: "home" },
      dedupeKey: `account_linked:${account.profileId}:${Date.parse(linkedAt)}`,
    });
    if (outcome !== "none") summary[outcome] += 1;
  }
  return summary;
}
