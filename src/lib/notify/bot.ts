import type { BotTop, Link, PointsSummary, RewardOffer, Texts } from "./points-data.ts";
import type { Language, LinkRole } from "./types.ts";

// The Telegram bot — docs/SPEC.md → "Telegram for students and parents".
// /start s_<code> links a student's own chat, /start p_<code> a parent's;
// /stop unlinks this chat; /language changes its language; /points, /top and
// /rewards answer for the linked student. A parent of several children is
// asked which child first.

export type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { language_code?: string };
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { language_code?: string };
    message?: { chat?: { id?: number; type?: string } };
  };
};

export type RequestOutcome = "ok" | "notEnough" | "outOfStock" | "notOnOffer" | "failed";

export interface BotStore {
  /** Saves this chat as the student's or the parent's link. Null when no student has the code. */
  link(role: LinkRole, code: string, chatId: number): Promise<{ fullName: string; language: Language } | null>;
  /** Removes every link of this chat; returns how many there were. */
  unlink(chatId: number): Promise<number>;
  /** The students this chat is linked to. */
  links(chatId: number): Promise<Link[]>;
  setLanguage(chatId: number, language: Language): Promise<void>;
  centreName(): Promise<string>;
  summary(studentId: string): Promise<PointsSummary | null>;
  top(studentId: string): Promise<BotTop | null>;
  rewards(): Promise<RewardOffer[]>;
  /** Holds the points and one unit of stock: request_reward(via = bot). */
  requestReward(studentId: string, rewardId: string, role: LinkRole): Promise<RequestOutcome>;
}

export type Button = { text: string; data: string };
export type BotReply = {
  chatId: number;
  text: string;
  /** Inline buttons, one row each. */
  buttons?: Button[][];
  /** The button press this answers, so Telegram stops its spinner. */
  callbackId?: string;
};

const LINK_CODE = /^[A-Za-z0-9]{22}$/;
const COMMANDS = ["points", "top", "rewards"] as const;
type Command = (typeof COMMANDS)[number];
export const BOT_COMMANDS = [...COMMANDS, "language", "stop"] as const;
const LANGUAGE_NAMES: Record<Language, string> = { uz: "Oʻzbekcha", ru: "Русский", en: "English" };

/** The language Telegram reports for the person, when it is one of ours. */
function languageOf(code: string | undefined): Language {
  const short = code?.slice(0, 2).toLowerCase();
  return short === "ru" || short === "en" ? short : "uz";
}

// A button carries at most 64 bytes: ids travel as 22 characters, not 36.
export const packId = (uuid: string) => Buffer.from(uuid.replace(/-/g, ""), "hex").toString("base64url");
export function unpackId(packed: string): string | null {
  if (!/^[A-Za-z0-9_-]{22}$/.test(packed)) return null;
  const hex = Buffer.from(packed, "base64url").toString("hex");
  return hex.length === 32 ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` : null;
}

const signed = (points: number) => (points > 0 ? `+${points}` : points < 0 ? `−${-points}` : "0");

function pointsText(t: ReturnType<Texts>, language: Language, summary: PointsSummary): string {
  const lines = [
    t("points.title", { student: summary.name }),
    t("points.balance", { points: summary.balance }),
    t("points.month", { points: summary.month_points }),
  ];
  if (summary.centre_rank !== null) lines.push(t("points.centreRank", { rank: summary.centre_rank }));
  for (const group of summary.groups) lines.push(t("points.groupRank", { group: group.name, rank: group.rank, points: group.points }));
  if (summary.last.length > 0) {
    lines.push("", t("points.last"));
    for (const entry of summary.last) {
      const what = entry.preset?.[language] ?? (entry.source === "referral" ? null : entry.reason);
      lines.push(`${signed(entry.delta)}  ${t(`source.${entry.source}`)}${what ? ` · ${what}` : ""}`);
    }
  }
  if (summary.next_reward) {
    lines.push("", t("goal", { points: summary.next_reward.needed, reward: summary.next_reward.name }));
  }
  return lines.join("\n");
}

function topText(t: ReturnType<Texts>, top: BotTop, name: string): string {
  const board = (rows: BotTop["centre"]) =>
    rows.length === 0 ? [t("top.empty")] : rows.map((row) => `${row.rank}. ${row.name} — ${row.points}`);
  const lines = [t("top.centre"), ...board(top.centre)];
  if (top.own) lines.push(t("top.own", { student: name, rank: top.own.rank, points: top.own.points }));
  for (const group of top.groups) {
    lines.push("", t("top.group", { group: group.name }), ...board(group.rows));
    lines.push(t("top.own", { student: name, rank: group.own.rank, points: group.own.points }));
  }
  return lines.join("\n");
}

/**
 * Handles one update and says what to reply, or null for anything the bot
 * does not answer (no text, a group chat, an edited message).
 */
export async function handleUpdate(update: TelegramUpdate, store: BotStore, texts: Texts): Promise<BotReply | null> {
  const callback = update.callback_query;
  const chat = update.message?.chat ?? callback?.message?.chat;
  const chatId = chat?.id;
  if (typeof chatId !== "number" || chat?.type !== "private") return null;
  const input = callback ? callback.data : update.message?.text?.trim();
  if (!input) return null;

  const links = await store.links(chatId);
  const fallback = languageOf((update.message?.from ?? callback?.from)?.language_code);
  const language = links[0]?.language ?? fallback;
  const t = texts(language);
  const centre = await store.centreName();
  const reply = (text: string, buttons?: Button[][]): BotReply => ({ chatId, text, buttons, callbackId: callback?.id });
  /** The link of this chat to that student; a button from another chat finds none. */
  const linkTo = (packed: string | undefined) => {
    const studentId = packed ? unpackId(packed) : null;
    return links.find((link) => link.studentId === studentId) ?? null;
  };

  async function answer(command: Command, link: Link): Promise<BotReply> {
    if (command === "points") {
      const summary = await store.summary(link.studentId);
      return reply(summary ? pointsText(t, language, summary) : t("failed"));
    }
    if (command === "top") {
      const top = await store.top(link.studentId);
      return reply(top ? topText(t, top, link.fullName) : t("failed"));
    }
    const [summary, rewards] = await Promise.all([store.summary(link.studentId), store.rewards()]);
    if (!summary) return reply(t("failed"));
    if (rewards.length === 0) return reply(t("rewards.empty"));
    const lines = [t("rewards.title", { student: summary.name, points: summary.balance })];
    const buttons: Button[][] = [];
    for (const reward of rewards) {
      const stock = reward.stock === null ? "" : reward.stock === 0 ? ` · ${t("rewards.outOfStock")}` : ` · ${t("rewards.left", { count: reward.stock })}`;
      lines.push(`${reward.name} — ${t("pointsCount", { points: reward.cost })}${stock}`);
      if (reward.cost <= summary.balance && reward.stock !== 0) {
        buttons.push([{ text: t("rewards.request", { reward: reward.name }), data: `rq:${packId(link.studentId)}:${packId(reward.id)}` }]);
      }
    }
    return reply(lines.join("\n"), buttons.length > 0 ? buttons : undefined);
  }

  // ── A button was pressed ──
  if (callback) {
    const [kind, first, second] = input.split(":");
    if (kind === "lang" && (first === "uz" || first === "ru" || first === "en")) {
      await store.setLanguage(chatId, first);
      return reply(texts(first)("languageSet"));
    }
    if (kind === "pick" && (COMMANDS as readonly string[]).includes(first)) {
      const link = linkTo(second);
      return link ? answer(first as Command, link) : reply(t("notLinked", { centre }));
    }
    if (kind === "rq" || kind === "ry") {
      const link = linkTo(first);
      const rewardId = second ? unpackId(second) : null;
      const reward = rewardId ? (await store.rewards()).find((offer) => offer.id === rewardId) : undefined;
      if (!link) return reply(t("notLinked", { centre }));
      if (!reward) return reply(t("request.notOnOffer"));
      if (kind === "rq") {
        // The confirm step: nothing is held until Yes.
        return reply(t("request.confirm", { reward: reward.name, points: reward.cost, student: link.fullName }), [
          [
            { text: t("request.yes"), data: `ry:${first}:${second}` },
            { text: t("request.no"), data: "rn" },
          ],
        ]);
      }
      const outcome = await store.requestReward(link.studentId, reward.id, link.role);
      return reply(outcome === "ok" ? t("request.done", { reward: reward.name, centre }) : t(`request.${outcome}`));
    }
    if (kind === "rn") return reply(t("request.cancelled"));
    return reply(t("help", { centre }));
  }

  // ── A message ──
  const [command, argument] = input.split(/\s+/, 2);
  // "/start@bot_name" is the same command.
  const name = command.split("@")[0].toLowerCase();

  if (name === "/start") {
    if (!argument) return reply(t("help", { centre }));
    // s_<code> is the student's own link, p_<code> the parent's. A bare code is
    // a link from before students had two: it was, and stays, the parent's.
    const role: LinkRole = argument.startsWith("s_") ? "student" : "parent";
    const code = argument.replace(/^[sp]_/, "");
    const student = LINK_CODE.test(code) ? await store.link(role, code, chatId) : null;
    if (!student) return reply(t("unknownCode", { centre }));
    // The confirmation is in the student's language.
    return reply(texts(student.language)(role === "student" ? "linkedStudent" : "linked", { student: student.fullName, centre }));
  }

  if (name === "/stop") {
    return reply((await store.unlink(chatId)) > 0 ? t("stopped", { centre }) : t("nothingLinked"));
  }

  if (name === "/language") {
    return reply(t("chooseLanguage"), [
      (["uz", "ru", "en"] as const).map((code) => ({ text: LANGUAGE_NAMES[code], data: `lang:${code}` })),
    ]);
  }

  const asked = COMMANDS.find((candidate) => name === `/${candidate}`);
  if (asked) {
    // One student can be linked to a chat in both roles: ask about each child once.
    const children = links.filter((link, index) => links.findIndex((other) => other.studentId === link.studentId) === index);
    if (children.length === 0) return reply(t("notLinked", { centre }));
    if (children.length === 1) return answer(asked, children[0]);
    return reply(
      t("whichChild"),
      children.map((child) => [{ text: child.fullName, data: `pick:${asked}:${packId(child.studentId)}` }]),
    );
  }

  return reply(t("help", { centre }));
}
