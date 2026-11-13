import { CircleAlert } from "lucide-react";

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control bg-danger-tint px-3 py-2 text-footnote text-danger"
    >
      <CircleAlert className="size-4" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
