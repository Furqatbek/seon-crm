// Where public forms live, and the snippet for putting one on another website.
// docs/SPEC.md → "Lead forms add-on → Form builder → Form settings".

/** "https://forms.yourcentre.uz", or null until FORMS_HOST is set. */
export function formsBaseUrl(host: string | undefined | null): string | null {
  const name = host?.trim().toLowerCase();
  if (!name) return null;
  const local = /^(localhost|127\.0\.0\.1|[a-z0-9.-]+\.localhost)(:\d+)?$/.test(name);
  return `${local ? "http" : "https"}://${name}`;
}

/** What the embedded page tells the page around it: its height, so the frame fits. */
export const EMBED_MESSAGE = "lead-form-height";

/** An iframe that resizes itself to the form inside it. */
export function embedSnippet(baseUrl: string, slug: string, title: string): string {
  const id = `lead-form-${slug}`;
  const safeTitle = title.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return [
    `<iframe id="${id}" src="${baseUrl}/${slug}?embed=1" title="${safeTitle}" style="width:100%;border:0" height="720" loading="lazy"></iframe>`,
    `<script>window.addEventListener("message",function(e){if(e.origin==="${baseUrl}"&&e.data&&e.data.type==="${EMBED_MESSAGE}"&&e.data.slug==="${slug}"){document.getElementById("${id}").style.height=e.data.height+"px"}});</script>`,
  ].join("\n");
}

export const RESERVED_SLUGS = ["api", "admin", "form", "forms", "auth", "tv", "uz", "ru", "en", "ko", "static", "public", "assets"];

export type SlugProblem = "format" | "reserved";

/** Lowercase Latin letters, digits and hyphens, 2–60 long, and not a reserved word. */
export function slugProblem(slug: string): SlugProblem | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 60) return "format";
  return RESERVED_SLUGS.includes(slug) ? "reserved" : null;
}

/** A name typed by a person → something that can be an address. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ʻʼ'’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
