"use server";

import { after } from "next/server";
import { z } from "zod";

import { getCheckinUser } from "@/lib/auth";
import { tashkentTime } from "@/lib/domain/time";
import { getChats, getNotifySettings, getProviders, getTemplates, messageLog } from "@/lib/notify/store";
import { sendVisitMessage } from "@/lib/notify/visit-messages";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { CheckinError, CheckinLesson, CheckinMatch, CheckinResult } from "./types";

// Every call runs as the signed-in kiosk, owner or manager: the database
// decides whether the code is good and what the visit is. The service role is
// used only afterwards, for the photo's link and the parent's message.

const answerSchema = z.discriminatedUnion("result", [
  z.object({ result: z.enum(["invalid", "expired", "clock", "unknown"]) }),
  z.object({
    result: z.enum(["arrived", "left"]),
    repeat: z.boolean(),
    visit_id: z.uuid(),
    at: z.string(),
    student: z.object({ id: z.uuid(), full_name: z.string(), avatar_path: z.string().nullable() }),
    lessons: z.array(z.object({ group: z.string(), start_time: z.string(), end_time: z.string(), room: z.string().nullable(), exam: z.boolean() })),
    debt: z.boolean(),
  }),
]);

const refused = (error: CheckinError): CheckinResult => ({ ok: false, error });

/** The parent's Telegram message, after the answer has gone to the screen. */
function tellParent(visit: { visitId: string; studentId: string; studentName: string; kind: "arrived" | "left"; at: Date }) {
  after(async () => {
    const admin = createAdminClient();
    if (!admin) return;
    try {
      await sendVisitMessage(
        {
          enabled: async () => {
            const { data } = await admin.from("centre_settings").select("parent_visit_alerts").single();
            return data?.parent_visit_alerts ?? false;
          },
          centreName: async () => (await getNotifySettings(admin)).centreName,
          parentChat: async (studentId) => (await getChats(admin, studentId)).parentChat,
          templates: () => getTemplates(admin),
          log: messageLog(admin, admin),
          providers: getProviders(),
        },
        visit,
      );
    } catch (error) {
      // The visit is written either way.
      console.error("visit message", error);
    }
  });
}

async function describe(answer: unknown): Promise<CheckinResult> {
  const parsed = answerSchema.safeParse(answer);
  if (!parsed.success) return refused("offline");
  const visit = parsed.data;
  if (visit.result !== "arrived" && visit.result !== "left") return refused(visit.result);

  const at = new Date(visit.at);
  let photoUrl: string | null = null;
  if (visit.student.avatar_path) {
    // The photo lives in the private avatars bucket: a link that works for a minute.
    const signed = await createAdminClient()?.storage.from("avatars").createSignedUrl(visit.student.avatar_path, 60);
    photoUrl = signed?.data?.signedUrl ?? null;
  }
  // A repeat is the same visit: its message has gone already.
  if (!visit.repeat) {
    tellParent({ visitId: visit.visit_id, studentId: visit.student.id, studentName: visit.student.full_name, kind: visit.result, at });
  }
  return {
    ok: true,
    kind: visit.result,
    repeat: visit.repeat,
    time: tashkentTime(at),
    student: { id: visit.student.id, name: visit.student.full_name, photoUrl },
    lessons: visit.lessons satisfies CheckinLesson[],
    debt: visit.debt,
  };
}

async function session() {
  const [supabase, user] = await Promise.all([createClient(), getCheckinUser()]);
  return supabase && user ? supabase : null;
}

/** A scanned code. */
export async function checkInByCode(input: unknown): Promise<CheckinResult> {
  const code = z.string().trim().min(1).max(400).safeParse(input);
  if (!code.success) return refused("invalid");
  const supabase = await session();
  if (!supabase) return refused("notAllowed");
  const { data, error } = await supabase.rpc("verify_checkin", { p_code: code.data });
  if (error) return refused(error.code === "42501" ? "notAllowed" : "offline");
  return describe(data);
}

/** Search by name, for a student without their phone. */
export async function searchForCheckin(input: unknown): Promise<CheckinMatch[]> {
  const query = z.string().trim().min(2).max(80).safeParse(input);
  if (!query.success) return [];
  const supabase = await session();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("checkin_search", { p_query: query.data });
  if (error) return [];
  return data.map((row) => ({ id: row.student_id, name: row.full_name, groups: row.groups }));
}

/** The student found by name is checked in by hand. */
export async function checkInByHand(input: unknown): Promise<CheckinResult> {
  const id = z.uuid().safeParse(input);
  if (!id.success) return refused("unknown");
  const supabase = await session();
  if (!supabase) return refused("notAllowed");
  const { data, error } = await supabase.rpc("manual_checkin", { p_student_id: id.data });
  if (error) return refused(error.code === "42501" ? "notAllowed" : "offline");
  return describe(data);
}
