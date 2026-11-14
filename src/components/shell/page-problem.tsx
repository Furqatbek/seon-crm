import type { LucideIcon } from "lucide-react";

/** A whole page that could not be shown: one icon, what happened, and what to do. */
export function PageProblem({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div
      data-slot="page-problem"
      className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-card border border-border px-6 py-16 text-center"
    >
      <Icon className="size-8 text-text-secondary" aria-hidden />
      <h1 className="text-title text-text">{title}</h1>
      <p className="text-body text-text-secondary">{children}</p>
      {action}
    </div>
  );
}
