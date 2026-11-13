import { cn } from "@/lib/utils";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase();
}

/** Initials on the purple tint. Decorative: the name is always shown next to it. */
function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      data-slot="avatar"
      aria-hidden
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-purple-tint text-caption text-purple select-none",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export { Avatar };
