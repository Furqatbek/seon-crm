"use client";

import { EXAM_IMAGE_MAX_BYTES, EXAM_IMAGE_TYPES, audioExtension } from "@/lib/domain/exams";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Sends an exam's audio or picture straight from the browser to the private
 * exam-media bucket, as the signed-in user: a 10 MB recording is too large to
 * pass through a server action, and the bucket's own rules decide who may
 * write. Files go under the exam's folder. Returns the path, or null when the
 * file is not one the exam takes or the upload failed.
 */
export async function uploadExamMedia(examId: string, file: File, kind: "audio" | "image"): Promise<string | null> {
  const extension = kind === "audio" ? audioExtension(file) : file.size > 0 && file.size <= EXAM_IMAGE_MAX_BYTES ? (EXAM_IMAGE_TYPES[file.type] ?? null) : null;
  const supabase = getBrowserClient();
  if (!extension || !supabase) return null;
  const path = `${examId}/${crypto.randomUUID()}.${extension}`;
  const contentType = kind === "audio" ? (extension === "mp3" ? "audio/mpeg" : "audio/mp4") : file.type;
  const { error } = await supabase.storage.from("exam-media").upload(path, file, { contentType });
  return error ? null : path;
}
