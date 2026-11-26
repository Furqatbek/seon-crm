// The intake API for websites — docs/SPEC.md → "Lead forms add-on → Public
// intake URL and Meta lead ads": field mapping, key verification and each
// response. The database side (60 a minute per key, duplicates, 3 a day per
// phone) is in supabase/tests/intake-sources.test.ts.
import { describe, expect, it } from "vitest";

import { handleIntakeRequest, parseBody, type ApiRequest, type IntakeSource } from "./api";
import { fieldKey, mapLead, parseFieldMap, targetOf } from "./field-map";
import type { IntakeOutcome, IntakeStore } from "./intake";
import { generateKey, hashKey, looksLikeKey, presentedKey } from "./keys";

const lead = (body: Record<string, unknown>, map: Record<string, string> = {}) => {
  const mapped = mapLead(body, parseFieldMap(map));
  if (!mapped.check.ok) throw new Error(`not a lead: ${JSON.stringify(mapped.check.errors)}`);
  return { ...mapped.check.lead, language: mapped.language };
};
const errors = (body: Record<string, unknown>, map: Record<string, string> = {}) => {
  const mapped = mapLead(body, parseFieldMap(map));
  return mapped.check.ok ? null : mapped.check.errors;
};

describe("field mapping", () => {
  it("recognises common names without setup: ism, имя, phone, telefon and their kin", () => {
    expect(lead({ ism: "Aziza Karimova", telefon: "90 123 45 67" })).toMatchObject({ fullName: "Aziza Karimova", phone: "+998901234567" });
    expect(lead({ имя: "Азиза Каримова", телефон: "+998 (90) 123-45-67" })).toMatchObject({ fullName: "Азиза Каримова", phone: "+998901234567" });
    expect(lead({ name: "Aziza", phone: "998901234567" })).toMatchObject({ fullName: "Aziza", phone: "+998901234567" });
    expect(lead({ "Full Name": "Aziza", tel: "901234567" })).toMatchObject({ fullName: "Aziza", phone: "+998901234567" });
    expect(lead({ ФИО: "Каримова Азиза", "Номер телефона": "+7 912 345-67-89" })).toMatchObject({ fullName: "Каримова Азиза", phone: "+79123456789" });
    expect(lead({ Ismingiz: "Aziza", "Telefon raqami": "901234567" })).toMatchObject({ fullName: "Aziza", phone: "+998901234567" });
    for (const name of ["name", "Name", "full_name", "fullName", "ism", "Ismi", "имя", "Ваше имя", "ФИО", "fio"]) expect(targetOf(name, {}), name).toBe("name");
    for (const name of ["phone", "Phone", "phone_number", "tel", "telefon", "Telefon", "телефон", "Телефон", "mobile", "raqam"]) expect(targetOf(name, {}), name).toBe("phone");
  });

  it("compares names loosely: case, spaces, dashes, underscores and brackets do not matter", () => {
    expect(fieldKey("Full  Name")).toBe("fullname");
    expect(fieldKey("phone-number")).toBe("phonenumber");
    expect(fieldKey("fields[phone]")).toBe("fieldsphone");
    expect(fieldKey("Телефон:")).toBe("телефон");
  });

  it("a first and a last name sent apart become one name", () => {
    expect(lead({ first_name: "Aziza", last_name: "Karimova", phone: "901234567" }).fullName).toBe("Aziza Karimova");
    expect(lead({ firstname: "Aziza", phone: "901234567" }).fullName).toBe("Aziza");
    expect(lead({ name: "Whole Name", first_name: "Other", phone: "901234567" }).fullName).toBe("Whole Name");
  });

  it("course, time, message and language fill their own columns", () => {
    expect(lead({ name: "A", phone: "901234567", kurs: "TOPIK II", vaqt: "Kechqurun", izoh: "Salom", til: "RU" })).toMatchObject({
      subject: "TOPIK II",
      preferredTime: "Kechqurun",
      notes: "Salom",
      language: "ru",
      answers: [],
    });
    expect(lead({ имя: "А", телефон: "901234567", курс: "TOPIK", сообщение: "Здравствуйте", время: "Вечером" })).toMatchObject({
      subject: "TOPIK",
      preferredTime: "Вечером",
      notes: "Здравствуйте",
    });
    // A language that is not one of ours is left out.
    expect(lead({ name: "A", phone: "901234567", lang: "de" }).language).toBe(null);
  });

  it("unmapped fields go to the answers under the name the website sent", () => {
    expect(lead({ name: "A", phone: "901234567", utm_source: "instagram", Branch: "Chilanzar", age: 17, agree: true, tags: ["a", "b"], empty: "  " }).answers).toEqual([
      { id: "utmsource", type: "short_text", label: "utm_source", value: "instagram" },
      { id: "branch", type: "short_text", label: "Branch", value: "Chilanzar" },
      { id: "age", type: "short_text", label: "age", value: "17" },
      { id: "agree", type: "short_text", label: "agree", value: "true" },
      { id: "tags", type: "short_text", label: "tags", value: "a, b" },
    ]);
  });

  it("the source's own map wins over the built-in names, and can drop a field or keep it as an answer", () => {
    const map = { "field-17": "name", "field-18": "phone", "Qaysi kurs?": "subject", message: "answer", token: "ignore", name: "ignore" };
    const made = lead({ "field-17": "Aziza", "Field 18": "901234567", "qaysi kurs?": "TOPIK I", message: "Hello", token: "abc", name: "bot" }, map);
    expect(made).toMatchObject({ fullName: "Aziza", phone: "+998901234567", subject: "TOPIK I", notes: null });
    expect(made.answers).toEqual([{ id: "message", type: "short_text", label: "message", value: "Hello" }]);
    // A map with unknown targets or empty names is cleaned, not trusted.
    expect(parseFieldMap({ a: "name", b: "password", "": "phone", c: 5 })).toEqual({ a: "name" });
    expect(parseFieldMap("name")).toEqual({});
    expect(parseFieldMap(null)).toEqual({});
  });

  it("the key and a test flag are never part of a lead", () => {
    expect(lead({ name: "A", phone: "901234567", key: "lk_secret", test: "1" }).answers).toEqual([]);
  });

  it("the same validation as a form: a name and a phone are required, the phone must be a real number", () => {
    expect(errors({})).toEqual({ name: "required", phone: "required" });
    expect(errors({ name: "A" })).toEqual({ phone: "required" });
    expect(errors({ phone: "901234567" })).toEqual({ name: "required" });
    expect(errors({ name: "A", phone: "12345" })).toEqual({ phone: "phone" });
    expect(errors({ name: "A", phone: "call me" })).toEqual({ phone: "phone" });
    expect(errors({ name: "x".repeat(201), phone: "901234567" })).toEqual({ name: "too_long" });
    expect(errors({ name: "A", phone: "901234567", message: "x".repeat(2001) })).toEqual({ notes: "too_long" });
    expect(errors({ name: "A", phone: "901234567" })).toBe(null);
  });
});

describe("request bodies", () => {
  it("reads JSON and ordinary form posts, whatever the content type says", () => {
    expect(parseBody("application/json", '{"name":"A","phone":"901234567"}')).toEqual({ name: "A", phone: "901234567" });
    expect(parseBody("application/json; charset=utf-8", '{"имя":"А"}')).toEqual({ имя: "А" });
    expect(parseBody("application/x-www-form-urlencoded", "name=Aziza+Karimova&phone=%2B998901234567")).toEqual({ name: "Aziza Karimova", phone: "+998901234567" });
    expect(parseBody("application/x-www-form-urlencoded", "topic=a&topic=b&topic=c")).toEqual({ topic: ["a", "b", "c"] });
    expect(parseBody(null, '{"name":"A"}')).toEqual({ name: "A" });
    expect(parseBody("text/plain", "name=A&phone=1")).toEqual({ name: "A", phone: "1" });
  });

  it("refuses what is neither", () => {
    expect(parseBody("application/json", "{not json")).toBe(null);
    expect(parseBody("application/json", '["a"]')).toBe(null);
    expect(parseBody("application/json", '"text"')).toBe(null);
    expect(parseBody("application/x-www-form-urlencoded", "")).toBe(null);
    expect(parseBody(null, "")).toBe(null);
  });
});

describe("key verification", () => {
  it("a key has a prefix that may be shown and a hash that is stored; the key itself is not kept", () => {
    const { key, prefix, hash } = generateKey();
    expect(key).toMatch(/^lk_[A-Za-z0-9]{8}_[A-Za-z0-9]{32}$/);
    expect(key.startsWith(`${prefix}_`)).toBe(true);
    expect(prefix).toMatch(/^lk_[A-Za-z0-9]{8}$/);
    expect(hash).toBe(hashKey(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key.slice(-32));
    // Every key is different, and so is its hash.
    const keys = new Set(Array.from({ length: 200 }, () => generateKey().key));
    expect(keys.size).toBe(200);
    expect(hashKey(key)).not.toBe(hashKey(`${key.slice(0, -1)}${key.endsWith("a") ? "b" : "a"}`));
  });

  it("is read from the Bearer header, or from ?key= when there is no header", () => {
    const { key } = generateKey();
    const other = generateKey().key;
    expect(presentedKey(`Bearer ${key}`, null)).toBe(key);
    expect(presentedKey(`bearer   ${key}  `, null)).toBe(key);
    expect(presentedKey(null, key)).toBe(key);
    expect(presentedKey(`Bearer ${key}`, other)).toBe(key);
  });

  it("anything that is not shaped like a key is refused without asking the database", () => {
    const { key } = generateKey();
    for (const bad of [null, "", "Bearer", "Bearer ", `Basic ${key}`, key, "Bearer lk_short", `Bearer ${key}x`, `Bearer ${key.replace("lk_", "pk_")}`]) {
      expect(presentedKey(bad, null), String(bad)).toBe(null);
    }
    expect(presentedKey(null, "lk_12345678_tooshort")).toBe(null);
    expect(looksLikeKey(key)).toBe(true);
    expect(looksLikeKey(`${key} or 1=1`)).toBe(false);
  });
});

describe("POST /api/v1/leads", () => {
  const { key, hash } = generateKey();
  const SOURCE: IntakeSource = { id: "source-1", name: "Landing page", fieldMap: { "field-17": "name" }, formId: "form-1", limited: false };

  function world(options: { source?: IntakeSource | null; outcome?: IntakeOutcome; fail?: boolean } = {}) {
    const calls = { lookups: [] as string[], submits: [] as Parameters<IntakeStore["submit"]>[0][], rejects: [] as Parameters<IntakeStore["reject"]>[0][], alerts: 0 };
    const outcome = options.outcome ?? "created";
    const deps = {
      findSource: async (keyHash: string) => {
        calls.lookups.push(keyHash);
        return keyHash === hash ? (options.source === undefined ? SOURCE : options.source) : null;
      },
      store: {
        submit: async (input) => {
          if (options.fail) throw new Error("connection lost");
          calls.submits.push(input);
          return { outcome, leadId: outcome === "created" || outcome === "merged" ? "lead-1" : null };
        },
        reject: async (input) => void calls.rejects.push(input),
      } satisfies IntakeStore,
      secret: "test-secret",
      onLead: () => void (calls.alerts += 1),
      now: () => new Date("2026-11-19T10:00:00Z"),
    };
    const post = (request: Partial<ApiRequest>) =>
      handleIntakeRequest({ authorization: `Bearer ${key}`, queryKey: null, contentType: "application/json", body: '{"name":"Aziza","phone":"90 123 45 67"}', ...request }, deps);
    return { calls, post };
  }

  it("201 with the lead's id and `created`, for JSON", async () => {
    const { calls, post } = world();
    expect(await post({ body: JSON.stringify({ ism: "Aziza Karimova", telefon: "90 123 45 67", kurs: "TOPIK", utm_source: "instagram", lang: "ru" }) })).toEqual({
      status: 201,
      body: { id: "lead-1", outcome: "created" },
    });
    expect(calls.submits).toEqual([
      {
        channel: "api",
        formId: "form-1",
        sourceId: "source-1",
        externalId: null,
        // No visitor address: the request comes from a website's server.
        ipHash: null,
        language: "ru",
        lead: {
          fullName: "Aziza Karimova",
          phone: "+998901234567",
          subject: "TOPIK",
          preferredTime: null,
          notes: null,
          answers: [{ id: "utmsource", type: "short_text", label: "utm_source", value: "instagram" }],
        },
      },
    ]);
    expect(calls.rejects).toEqual([]);
    expect(calls.alerts).toBe(1);
  });

  it("201 for an ordinary form post, with the key in ?key= and the source's own field map", async () => {
    const { calls, post } = world();
    expect(await post({ authorization: null, queryKey: key, contentType: "application/x-www-form-urlencoded", body: "field-17=Aziza&%D1%82%D0%B5%D0%BB%D0%B5%D1%84%D0%BE%D0%BD=901234567" })).toEqual({
      status: 201,
      body: { id: "lead-1", outcome: "created" },
    });
    expect(calls.submits[0].lead).toMatchObject({ fullName: "Aziza", phone: "+998901234567" });
  });

  it("201 with `merged` when the phone belongs to an open lead", async () => {
    const { post } = world({ outcome: "merged" });
    expect(await post({})).toEqual({ status: 201, body: { id: "lead-1", outcome: "merged" } });
  });

  it("400 with the field errors", async () => {
    const { calls, post } = world();
    expect(await post({ body: '{"name":"Aziza","phone":"12345"}' })).toEqual({ status: 400, body: { error: "invalid", fields: { phone: "phone" } } });
    expect(await post({ body: '{"comment":"hello"}' })).toEqual({ status: 400, body: { error: "invalid", fields: { name: "required", phone: "required" } } });
    expect(calls.submits).toEqual([]);
    expect(calls.rejects).toMatchObject([
      { channel: "api", sourceId: "source-1", formId: "form-1", outcome: "invalid", detail: "phone:phone" },
      { outcome: "invalid", detail: "name:required phone:required" },
    ]);
    expect(calls.alerts).toBe(0);
  });

  it("400 for a body that is neither JSON nor a form post, or is too large", async () => {
    const { calls, post } = world();
    expect(await post({ body: "{broken" })).toEqual({ status: 400, body: { error: "invalid_body" } });
    expect(await post({ body: "" })).toEqual({ status: 400, body: { error: "invalid_body" } });
    expect(await post({ body: JSON.stringify({ name: "A", phone: "901234567", note: "x".repeat(70_000) }) })).toEqual({ status: 400, body: { error: "invalid_body" } });
    expect(calls.rejects.map((row) => [row.outcome, row.detail])).toEqual([["invalid", "body"], ["invalid", "body"], ["invalid", "body"]]);
  });

  it("401 for no key, a wrong key, a malformed key and a switched-off source", async () => {
    const { calls, post } = world();
    const unauthorized = { status: 401, body: { error: "unauthorized" } };
    expect(await post({ authorization: null })).toEqual(unauthorized);
    expect(await post({ authorization: `Bearer ${generateKey().key}` })).toEqual(unauthorized);
    expect(await post({ authorization: "Bearer not-a-key" })).toEqual(unauthorized);
    expect(await post({ authorization: `Basic ${key}` })).toEqual(unauthorized);
    // The database is asked only for something shaped like a key, and only by its hash.
    expect(calls.lookups).toHaveLength(1);
    expect(calls.lookups[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(calls.submits).toEqual([]);
    expect(calls.rejects).toEqual([]);

    const off = world({ source: null });
    expect(await off.post({})).toEqual(unauthorized);
  });

  it("429 when the key is over 60 requests a minute", async () => {
    const { calls, post } = world({ source: { ...SOURCE, limited: true } });
    expect(await post({})).toEqual({ status: 429, body: { error: "rate_limited" }, headers: { "retry-after": "60" } });
    expect(calls.submits).toEqual([]);
    expect(calls.rejects).toMatchObject([{ outcome: "rate_limited", detail: "key", sourceId: "source-1" }]);
  });

  it("429 when the phone has already been sent three times today", async () => {
    const { calls, post } = world({ outcome: "rate_limited" });
    expect(await post({})).toEqual({ status: 429, body: { error: "rate_limited" }, headers: { "retry-after": "3600" } });
    expect(calls.alerts).toBe(0);
  });

  it("200 for a connection test: no phone, and a `test` field", async () => {
    const { calls, post } = world();
    const passed = { status: 200, body: { ok: true, test: true } };
    expect(await post({ body: '{"test":"test"}' })).toEqual(passed);
    expect(await post({ body: '{"Test":true,"name":"Test User"}' })).toEqual(passed);
    expect(await post({ contentType: "application/x-www-form-urlencoded", body: "test=1" })).toEqual(passed);
    expect(calls.submits).toEqual([]);
    expect(calls.rejects.map((row) => row.outcome)).toEqual(["test", "test", "test"]);
    // With a phone it is a real lead, test field or not.
    expect((await post({ body: '{"test":"1","name":"Aziza","phone":"901234567"}' })).status).toBe(201);
    // Without a test field, a missing phone is an error like any other.
    expect((await post({ body: '{"name":"Aziza"}' })).status).toBe(400);
    // A test still needs the right key.
    expect((await post({ authorization: null, body: '{"test":"1"}' })).status).toBe(401);
  });

  it("500 when the database fails, logged as an error", async () => {
    const { calls, post } = world({ fail: true });
    expect(await post({})).toEqual({ status: 500, body: { error: "server_error" } });
    expect(calls.rejects).toMatchObject([{ outcome: "error", detail: "connection lost" }]);
  });

  it("a source with no funnel sends its lead without a form", async () => {
    const { calls, post } = world({ source: { ...SOURCE, formId: null } });
    expect((await post({})).status).toBe(201);
    expect(calls.submits[0]).toMatchObject({ formId: null, sourceId: "source-1" });
  });
});
