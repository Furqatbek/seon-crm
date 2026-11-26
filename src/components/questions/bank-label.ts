import { TOPIK_SUBJECT } from "@/lib/domain/questions";

/** A bank as people call it: "TOPIK II", "Matematika · 7-sinf", "Ingliz tili". */
export function bankLabel(subject: string, level: string): string {
  if (subject === TOPIK_SUBJECT) return level === "topik2" ? "TOPIK II" : level === "topik1" ? "TOPIK I" : `${subject} · ${level}`;
  return level ? `${subject} · ${level}` : subject;
}

/** A level as people write it. */
export function levelLabel(subject: string, level: string): string {
  if (subject === TOPIK_SUBJECT) return level === "topik2" ? "TOPIK II" : level === "topik1" ? "TOPIK I" : level;
  return level;
}
