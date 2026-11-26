import { describe, expect, it } from "vitest";

import { handleUpdate, packId, unpackId, type BotReply, type BotStore } from "./bot";
import { botTexts } from "./bot-texts";
import type { Link, PointsSummary, RewardOffer } from "./points-data";
import type { Language, LinkRole } from "./types";

// The bot against an in-memory store: nothing here reaches Telegram or a database.

const AZIZA = { id: "11111111-1111-4111-8111-111111111111", fullName: "Aziza Karimova", language: "ru" as Language, student: "Abc123Def456Ghi789Jkl0", parent: "Zyx987Wvu654Tsr321Qpo0" };
const BOBUR = { id: "22222222-2222-4222-8222-222222222222", fullName: "Bobur Karimov", language: "uz" as Language, student: "Stu000000000000000000B", parent: "Par000000000000000000B" };
const TSHIRT: RewardOffer = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "T-shirt", cost: 100, stock: 3 };
const LESSON: RewardOffer = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Free lesson", cost: 150, stock: null };
const NOTEBOOK: RewardOffer = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Notebook", cost: 40, stock: 0 };

const summary = (student: typeof AZIZA, balance: number): PointsSummary => ({
  student_id: student.id,
  name: student.fullName,
  active: true,
  month: "2026-11",
  balance,
  week_points: 14,
  month_points: 44,
  centre_rank: 7,
  groups: [{ name: "English B1", points: 30, rank: 2 }],
  perfect_month_bonus: 0,
  last: [
    { delta: 2, source: "attendance", reason: null, preset: null },
    { delta: -2, source: "teacher_deduction", reason: null, preset: { uz: "Darsda telefon", ru: "Телефон на уроке", en: "Phone in class" } },
  ],
  next_reward: balance < 150 ? { name: "Free lesson", cost: 150, needed: 150 - balance } : null,
});

function world(balances: Record<string, number> = { [AZIZA.id]: 120, [BOBUR.id]: 10 }) {
  const links: Link[] = [];
  const requests: Array<{ studentId: string; rewardId: string; role: LinkRole; key: string | null }> = [];
  const students = [AZIZA, BOBUR];
  const store: BotStore = {
    async link(role, code, chatId) {
      const student = students.find((entry) => entry[role] === code);
      if (!student) return null;
      const at = links.findIndex((link) => link.studentId === student.id && link.role === role);
      if (at !== -1) links.splice(at, 1);
      links.push({ studentId: student.id, fullName: student.fullName, role, chatId, language: student.language });
      return { fullName: student.fullName, language: student.language };
    },
    async unlink(chatId) {
      const mine = links.filter((link) => link.chatId === chatId);
      for (const link of mine) links.splice(links.indexOf(link), 1);
      return mine.length;
    },
    links: async (chatId) => links.filter((link) => link.chatId === chatId),
    async setLanguage(chatId, language) {
      for (const link of links) if (link.chatId === chatId) link.language = language;
    },
    centreName: async () => "Seon",
    summary: async (studentId) => summary(students.find((entry) => entry.id === studentId)!, balances[studentId] ?? 0),
    top: async () => ({
      centre: [{ name: "Aziza K.", points: 44, rank: 1 }],
      own: { rank: 1, points: 44 },
      groups: [{ name: "English B1", rows: [{ name: "Aziza K.", points: 30, rank: 1 }], own: { rank: 1, points: 30 } }],
    }),
    rewards: async () => [NOTEBOOK, TSHIRT, LESSON],
    async requestReward(studentId, rewardId, role, key) {
      // As the database does: a key seen before is the same request.
      if (!key || !requests.some((request) => request.key === key)) requests.push({ studentId, rewardId, role, key });
      return "ok";
    },
  };
  const send = (text: string, chatId = 501, language = "en") =>
    handleUpdate({ message: { text, chat: { id: chatId, type: "private" }, from: { language_code: language } } }, store, botTexts);
  const press = (data: string, chatId = 501) =>
    handleUpdate(
      { callback_query: { id: "cb1", data, message: { message_id: 77, chat: { id: chatId, type: "private" } }, from: { language_code: "en" } } },
      store,
      botTexts,
    );
  return { store, links, requests, send, press };
}

const data = (reply: BotReply | null) => (reply?.buttons ?? []).flat().map((button) => button.data);

describe("linking", () => {
  it("/start s_<code> links the student's own chat and p_<code> the parent's, each confirmed in the student's language", async () => {
    const { links, send } = world();
    const own = await send(`/start s_${AZIZA.student}`, 501);
    expect(own?.text).toContain("Aziza Karimova, чат подключён.");
    const parent = await send(`/start p_${AZIZA.parent}`, 900);
    expect(parent?.text).toContain("Aziza Karimova: чат подключён как родительский.");
    expect(links.map((link) => [link.role, link.chatId, link.language])).toEqual([
      ["student", 501, "ru"],
      ["parent", 900, "ru"],
    ]);
  });

  it("a link from before students had two codes is still the parent's", async () => {
    const { links, send } = world();
    await send(`/start ${AZIZA.parent}`, 900);
    expect(links).toMatchObject([{ studentId: AZIZA.id, role: "parent", chatId: 900 }]);
    // The student's code does not work as a parent's, nor the other way round.
    expect((await send(`/start p_${AZIZA.student}`, 901))?.text).toBe("This link is not valid. Ask Seon for a new one.");
    expect((await send(`/start s_${AZIZA.parent}`, 901))?.text).toBe("This link is not valid. Ask Seon for a new one.");
    expect((await send("/start s_short", 901))?.text).toBe("This link is not valid. Ask Seon for a new one.");
  });

  it("/stop removes only this chat's links", async () => {
    const { links, send } = world();
    await send(`/start s_${AZIZA.student}`, 501);
    await send(`/start p_${AZIZA.parent}`, 900);
    expect((await send("/stop", 900))?.text).toBe("Отключено. В этот чат больше не будут приходить сообщения от Seon.");
    expect(links).toMatchObject([{ role: "student", chatId: 501 }]);
    expect((await send("/stop", 900))?.text).toBe("Nothing is linked to this chat.");
  });

  it("/language offers three buttons and changes this chat only", async () => {
    const { links, send, press } = world();
    await send(`/start s_${AZIZA.student}`, 501);
    await send(`/start p_${AZIZA.parent}`, 900);
    const ask = await send("/language", 900);
    expect(ask?.text).toBe("Выберите язык этого чата:");
    expect(data(ask)).toEqual(["lang:uz", "lang:ru", "lang:en"]);
    const done = await press("lang:en", 900);
    expect(done).toMatchObject({ text: "Done. This chat is now in English.", callbackId: "cb1" });
    expect(links.map((link) => [link.chatId, link.language])).toEqual([
      [501, "ru"],
      [900, "en"],
    ]);
  });

  it("answers nothing in a group, and explains itself to a stranger", async () => {
    const { store, send } = world();
    expect(await handleUpdate({ message: { text: "/points", chat: { id: -5, type: "group" } } }, store, botTexts)).toBeNull();
    expect(await handleUpdate({ message: { chat: { id: 5, type: "private" } } }, store, botTexts)).toBeNull();
    expect((await send("hello"))?.text).toContain("This bot sends reminders and coin news from Seon.");
    expect((await send("/points"))?.text).toBe("This chat is not linked yet. Open the personal link Seon gave you.");
  });
});

describe("/points, /top and /rewards", () => {
  it("a student gets their own points straight away", async () => {
    const { send } = world();
    await send(`/start s_${BOBUR.student}`, 501);
    const reply = await send("/points", 501);
    expect(reply?.buttons).toBeUndefined();
    expect(reply?.text.split("\n")).toEqual([
      "Bobur Karimov",
      "Sarflash mumkin: 10",
      "Shu oyda toʻplandi: 44",
      "Markaz: 7-oʻrin",
      "English B1: 2-oʻrin (30)",
      "",
      "Soʻnggilari:",
      "+2  Davomat",
      "−2  Oʻqituvchi oldi · Darsda telefon",
      "",
      "“Free lesson” uchun yana 140 ta tanga kerak.",
    ]);
  });

  it("a parent with two children is asked which child before any command answers", async () => {
    const { send, press } = world();
    await send(`/start p_${AZIZA.parent}`, 900);
    await send(`/start p_${BOBUR.parent}`, 900);
    for (const command of ["points", "top", "rewards"]) {
      const ask = await send(`/${command}`, 900);
      expect(ask?.text).toBe("Какой ребёнок?");
      expect(ask?.buttons?.map((row) => row[0].text)).toEqual(["Aziza Karimova", "Bobur Karimov"]);
      expect(data(ask)).toEqual([`pick:${command}:${packId(AZIZA.id)}`, `pick:${command}:${packId(BOBUR.id)}`]);
    }
    const aziza = await press(`pick:points:${packId(AZIZA.id)}`, 900);
    expect(aziza?.text.split("\n")[0]).toBe("Aziza Karimova");
    expect(aziza?.text).toContain("Можно потратить: 120");
    const bobur = await press(`pick:top:${packId(BOBUR.id)}`, 900);
    expect(bobur?.text).toContain("Bobur Karimov: 1-е место (44)");
  });

  it("a button for a child this chat is not linked to answers nothing about them", async () => {
    const { send, press } = world();
    await send(`/start p_${BOBUR.parent}`, 900);
    const reply = await press(`pick:points:${packId(AZIZA.id)}`, 900);
    expect(reply?.text).toBe("Bu chat hali ulanmagan. Seon bergan shaxsiy havolani oching.");
    expect((await press(`ry:${packId(AZIZA.id)}:${packId(TSHIRT.id)}`, 900))?.text).toContain("hali ulanmagan");
  });

  it("/rewards lists the catalogue and offers Request only for what the student can afford and is in stock", async () => {
    const { send } = world();
    await send(`/start s_${AZIZA.student}`, 501);
    const reply = await send("/rewards", 501);
    expect(reply?.text.split("\n")).toEqual([
      "Награды. У Aziza Karimova 120 для обмена.",
      "Notebook — 40 монет · нет в наличии",
      "T-shirt — 100 монет · осталось 3",
      "Free lesson — 150 монет",
    ]);
    // Notebook is out of stock, the free lesson costs too much.
    expect(reply?.buttons).toEqual([[{ text: "Запросить: T-shirt", data: `rq:${packId(AZIZA.id)}:${packId(TSHIRT.id)}` }]]);
  });

  it("Request has a confirm step: nothing is held until Yes, and No holds nothing", async () => {
    const { requests, send, press } = world();
    await send(`/start p_${AZIZA.parent}`, 900);
    const ids = `${packId(AZIZA.id)}:${packId(TSHIRT.id)}`;
    const confirm = await press(`rq:${ids}`, 900);
    expect(confirm?.text).toBe("Запросить «T-shirt» за 100 монет для Aziza Karimova? Монеты удерживаются сразу.");
    expect(data(confirm)).toEqual([`ry:${ids}`, "rn"]);
    expect(requests).toEqual([]);
    expect((await press("rn", 900))?.text).toBe("Ничего не запрошено.");
    expect(requests).toEqual([]);

    const done = await press(`ry:${ids}`, 900);
    expect(done?.text).toBe("Запрос принят: «T-shirt». Заберите на ресепшене Seon.");
    // request_reward(via = bot), asked by the parent.
    expect(requests).toEqual([{ studentId: AZIZA.id, rewardId: TSHIRT.id, role: "parent", key: "bot:900:77" }]);
    // Yes pressed again on the same message, or the press delivered twice: still one request.
    expect((await press(`ry:${ids}`, 900))?.text).toBe("Запрос принят: «T-shirt». Заберите на ресепшене Seon.");
    expect(requests).toHaveLength(1);
  });

  it("says why a request did not go through", async () => {
    const { store, send, press } = world();
    await send(`/start s_${AZIZA.student}`, 501);
    const ids = `${packId(AZIZA.id)}:${packId(TSHIRT.id)}`;
    for (const [outcome, text] of [
      ["notEnough", "Не хватает монет на эту награду."],
      ["outOfStock", "Этой награды нет в наличии."],
      ["failed", "Запрос не прошёл. Попробуйте через минуту."],
    ] as const) {
      store.requestReward = async () => outcome;
      expect((await press(`ry:${ids}`, 501))?.text).toBe(text);
    }
    expect((await press(`rq:${packId(AZIZA.id)}:${packId(AZIZA.id)}`, 501))?.text).toBe("Эта награда больше недоступна.");
  });
});

describe("button data", () => {
  it("carries ids in 22 characters, so every button fits Telegram's 64 bytes", () => {
    expect(unpackId(packId(AZIZA.id))).toBe(AZIZA.id);
    expect(unpackId("not-an-id")).toBeNull();
    for (const value of [`pick:rewards:${packId(AZIZA.id)}`, `rq:${packId(AZIZA.id)}:${packId(TSHIRT.id)}`, `ry:${packId(AZIZA.id)}:${packId(TSHIRT.id)}`]) {
      expect(Buffer.byteLength(value)).toBeLessThanOrEqual(64);
    }
  });
});
