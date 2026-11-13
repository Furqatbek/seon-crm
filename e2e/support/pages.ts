import { withDb } from "./db";

const uid = (kind: number, n: number) => `${String(kind).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Every page of the app, for the checks that visit them all. Ids are from supabase/seed.sql. */
export async function appPages(): Promise<Array<{ name: string; path: string }>> {
  const paymentId = await withDb(async (db) => (await db.query("select id from payments order by receipt_no limit 1")).rows[0].id as string);
  const student = uid(4, 1);
  return [
    { name: "leads board", path: "/leads" },
    { name: "leads list", path: "/leads?view=list" },
    { name: "students", path: "/students" },
    { name: "student overview", path: `/students/${student}` },
    { name: "student ledger", path: `/students/${student}?tab=ledger` },
    { name: "student attendance", path: `/students/${student}?tab=attendance` },
    { name: "student messages", path: `/students/${student}?tab=messages` },
    { name: "groups", path: "/groups" },
    { name: "group", path: `/groups/${uid(3, 1)}` },
    { name: "group lessons", path: `/groups/${uid(3, 1)}?tab=lessons` },
    { name: "teachers", path: "/teachers" },
    { name: "teacher", path: `/teachers/${uid(2, 1)}` },
    { name: "teacher pay", path: `/teachers/${uid(2, 1)}?tab=pay` },
    { name: "finance payments", path: "/finance" },
    { name: "finance debtors", path: "/finance?tab=debtors" },
    { name: "finance charges", path: "/finance?tab=charges" },
    { name: "finance expenses", path: "/finance?tab=expenses" },
    { name: "finance salaries", path: "/finance?tab=salaries" },
    { name: "finance adjustments", path: "/finance?tab=adjustments" },
    { name: "reports", path: "/reports?period=6" },
    { name: "settings centre", path: "/settings" },
    { name: "settings users", path: "/settings?tab=users" },
    { name: "settings notifications", path: "/settings?tab=notifications" },
    { name: "settings templates", path: "/settings?tab=templates" },
    { name: "settings profile", path: "/settings?tab=profile" },
    { name: "receipt", path: `/receipts/${paymentId}` },
  ];
}

export const PUBLIC_PAGES = [
  { name: "sign in", path: "/sign-in" },
  { name: "forgot password", path: "/forgot-password" },
];
