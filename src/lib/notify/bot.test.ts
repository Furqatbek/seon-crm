import { describe, expect, it } from "vitest";

import { handleUpdate, type BotStore, type TelegramUpdate } from "./bot";
import type { Language } from "./types";

const CODE_A = "Abc123Def456Ghi789Jkl0";
const CODE_B = "Zyx987Wvu654Tsr321Qpo0";

function store() {
  const students = [
    { code: CODE_A, fullName: "Aziza Karimova", language: "ru" as Language, chatId: null as number | null },
    { code: CODE_B, fullName: "Bobur Karimov", language: "uz" as Language, chatId: null as number | null },
  ];
  const bot: BotStore = {
    async link(code, chatId) {
      const student = students.find((entry) => entry.code === code);
      if (!student) return null;
      student.chatId = chatId;
      return { fullName: student.fullName, language: student.language };
    },
    async unlink(chatId) {
      const linked = students.filter((entry) => entry.chatId === chatId);
      for (const student of linked) student.chatId = null;
      return linked.map((entry) => entry.language);
    },
    centreName: async () => "Seon",
  };
  return { students, bot };
}

const text = (value: string, chatId = 501, language = "en"): TelegramUpdate => ({
  message: { text: value, chat: { id: chatId, type: "private" }, from: { language_code: language } },
});

describe("the Telegram bot", () => {
  it("/start <code> saves the chat on that student and confirms in the student's language", async () => {
    const { students, bot } = store();
    expect(await handleUpdate(text(`/start ${CODE_A}`), bot)).toEqual({
      chatId: 501,
      language: "ru",
      text: "linked",
      values: { student: "Aziza Karimova", centre: "Seon" },
    });
    expect(students[0].chatId).toBe(501);
    expect(students[1].chatId).toBeNull();
  });

  it("one parent links several children with separate links, and /stop unlinks them all", async () => {
    const { students, bot } = store();
    await handleUpdate(text(`/start ${CODE_A}`), bot);
    expect(await handleUpdate(text(`/start ${CODE_B}`), bot)).toMatchObject({ text: "linked", language: "uz" });
    expect(students.map((student) => student.chatId)).toEqual([501, 501]);

    expect(await handleUpdate(text("/stop"), bot)).toMatchObject({ chatId: 501, text: "stopped", language: "ru" });
    expect(students.map((student) => student.chatId)).toEqual([null, null]);
    expect(await handleUpdate(text("/stop"), bot)).toMatchObject({ text: "nothingLinked", language: "en" });
  });

  it("a second parent linking the same child takes the link over; /stop from the first changes nothing", async () => {
    const { students, bot } = store();
    await handleUpdate(text(`/start ${CODE_A}`, 501), bot);
    await handleUpdate(text(`/start ${CODE_A}`, 777), bot);
    expect(students[0].chatId).toBe(777);
    expect(await handleUpdate(text("/stop", 501), bot)).toMatchObject({ text: "nothingLinked" });
    expect(students[0].chatId).toBe(777);
  });

  it("a wrong or malformed code links nobody", async () => {
    const { students, bot } = store();
    expect(await handleUpdate(text("/start Wrong000000000000000000"), bot)).toMatchObject({ text: "unknownCode" });
    expect(await handleUpdate(text("/start short"), bot)).toMatchObject({ text: "unknownCode" });
    expect(await handleUpdate(text(`/start ${CODE_A}'; drop table students;--`), bot)).toMatchObject({ text: "unknownCode" });
    expect(students.every((student) => student.chatId === null)).toBe(true);
  });

  it("answers anything else with help, in the person's Telegram language", async () => {
    const { bot } = store();
    expect(await handleUpdate(text("/start", 501, "ru-RU"), bot)).toMatchObject({ text: "help", language: "ru" });
    expect(await handleUpdate(text("salom", 501, "uz"), bot)).toMatchObject({ text: "help", language: "uz" });
    expect(await handleUpdate(text("hello", 501, "de"), bot)).toMatchObject({ text: "help", language: "uz" });
    expect(await handleUpdate(text(`/START@seon_bot ${CODE_B}`), bot)).toMatchObject({ text: "linked" });
  });

  it("ignores updates that are not a private text message", async () => {
    const { students, bot } = store();
    expect(await handleUpdate({}, bot)).toBeNull();
    expect(await handleUpdate({ message: { chat: { id: 501, type: "private" } } }, bot)).toBeNull();
    expect(await handleUpdate({ message: { text: `/start ${CODE_A}`, chat: { id: -100, type: "group" } } }, bot)).toBeNull();
    expect(await handleUpdate({ message: { text: `/start ${CODE_A}`, chat: {} } }, bot)).toBeNull();
    expect(students[0].chatId).toBeNull();
  });
});
