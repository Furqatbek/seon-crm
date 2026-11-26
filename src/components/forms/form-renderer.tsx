// Renders a form document: fields, design and texts in one language, with a
// switch to the form's other languages. Plain markup with no hooks, so the
// public page can send it as HTML without any framework script and the editor
// preview can show the same thing. docs/SPEC.md → "Lead forms add-on → Form builder".

import type { CSSProperties } from "react";

import {
  DISPLAY_TYPES,
  LANGUAGE_NAMES,
  pick,
  type FormDocument,
  type FormField,
  type FormLanguage,
  type Localized,
} from "@/lib/forms/document";
import { HONEYPOT_FIELD, TOKEN_FIELD } from "@/lib/intake/trap";
import type { AnswerError } from "@/lib/intake/validator";

/** The few words of the page that are not part of a form, in the visitor's language. */
export type FormUiTexts = {
  errors: Record<AnswerError, string>;
  summary: string;
  expired: string;
  rateLimited: string;
  failed: string;
  choose: string;
  required: string;
  language: string;
  leaveEmpty: string;
};

export type FormNotice = "expired" | "rate_limited" | "failed";

export type FormRendererState =
  | {
      kind: "form";
      /** What the visitor typed, keyed by field id, to show again after an error. */
      values?: Record<string, string | string[]>;
      errors?: Record<string, AnswerError>;
      notice?: FormNotice;
    }
  | { kind: "thanks" }
  | { kind: "closed" };

export type FormRendererProps = {
  document: FormDocument;
  language: FormLanguage;
  /** Pictures by asset id. */
  assets: Record<
    string,
    { url: string; width: number | null; height: number | null }
  >;
  ui: FormUiTexts;
  state: FormRendererState;
  /** Where the form is sent. */
  action: string;
  /** The signed timestamp for the spam trap. */
  token: string;
  /** The address of this form in another language. */
  languageHref: (language: FormLanguage) => string;
  /** CSS font families to use instead of the fonts' own names (the editor loads them through next/font). */
  fontFamilies?: Partial<Record<FormDocument["design"]["font"], string>>;
  /** Shown inside another website's frame: no full-window height, and the answer stays in the frame. */
  embed?: boolean;
};

/** The name an answer is sent under. */
export const fieldName = (id: string) => `f_${id}`;

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Dark text on a light card and the other way round, so an error is always readable.
function errorColour(card: string): string {
  const [r, g, b] = [1, 3, 5].map(
    (at) => parseInt(card.slice(at, at + 2), 16) / 255,
  );
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? "#B3261E" : "#FFB4AB";
}

const RADII = {
  square: { card: "0px", input: "0px", area: "0px" },
  rounded: { card: "18px", input: "12px", area: "12px" },
  pill: { card: "28px", input: "999px", area: "20px" },
} as const;

/** The design as CSS variables on the form's root. */
export function formDesignStyle(
  document: FormDocument,
  assets: FormRendererProps["assets"],
  fontFamilies?: FormRendererProps["fontFamilies"],
): CSSProperties {
  const { design } = document;
  const image = design.background.asset
    ? assets[design.background.asset]?.url
    : undefined;
  const shade = `rgba(0,0,0,${(design.background.overlay / 100).toFixed(2)})`;
  const radii = RADII[design.corners];
  return {
    "--lf-bg": image
      ? `linear-gradient(${shade},${shade}), url("${encodeURI(image)}") center / cover no-repeat ${design.background.color}`
      : design.background.color,
    "--lf-text": design.colors.text,
    "--lf-card": design.colors.card,
    "--lf-card-text": design.colors.card_text,
    "--lf-button": design.colors.button,
    "--lf-button-text": design.colors.button_text,
    "--lf-error": errorColour(design.colors.card),
    "--lf-font": `${fontFamilies?.[design.font] ?? `"${design.font}"`}, ${FONT_STACK}`,
    "--lf-r-card": radii.card,
    "--lf-r-input": radii.input,
    "--lf-r-area": radii.area,
  } as CSSProperties;
}

export function FormRenderer({
  document,
  language,
  assets,
  ui,
  state,
  action,
  token,
  languageHref,
  fontFamilies,
  embed = false,
}: FormRendererProps) {
  const text = (value: Localized | undefined) =>
    pick(value, language, document.default_language);
  const { design, texts } = document;
  const logo = design.logo.asset ? assets[design.logo.asset] : undefined;
  const title = text(texts.title);
  const subtitle = text(texts.subtitle);

  return (
    <div className="lf-root">
      <div
        className={`lf${design.layout === "split" ? " lf-split" : ""}${embed ? " lf-embed" : ""}`}
        style={formDesignStyle(document, assets, fontFamilies)}
      >
        <div className="lf-wrap">
          <div className="lf-top">
            {document.languages.length > 1 ? (
              <nav className="lf-langs" aria-label={ui.language}>
                {document.languages.map((code) => (
                  <a
                    key={code}
                    href={languageHref(code)}
                    lang={code}
                    hrefLang={code}
                    aria-current={code === language ? "true" : undefined}
                  >
                    {LANGUAGE_NAMES[code]}
                  </a>
                ))}
              </nav>
            ) : null}
          </div>

          <header
            className={`lf-head${design.logo.position === "left" ? " lf-logo-left" : ""}`}
          >
            {logo ? (
              // A plain <img>: the public page is HTML without the framework's image loader.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="lf-logo"
                src={logo.url}
                width={logo.width ?? undefined}
                height={logo.height ?? undefined}
                alt=""
              />
            ) : null}
            <div>
              <h1 className="lf-title">{title}</h1>
              {subtitle ? <p className="lf-sub">{subtitle}</p> : null}
            </div>
          </header>

          <main className="lf-card">
            {state.kind === "closed" ? (
              <div className="lf-done" role="status">
                <p>{text(texts.closed_text)}</p>
              </div>
            ) : state.kind === "thanks" ? (
              <div className="lf-done" role="status">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m8 12.5 2.8 2.8L16 9.5" />
                </svg>
                <h2>{text(texts.thank_you_title)}</h2>
                {text(texts.thank_you_text) ? (
                  <p>{text(texts.thank_you_text)}</p>
                ) : null}
              </div>
            ) : (
              <FormBody
                document={document}
                language={language}
                assets={assets}
                ui={ui}
                state={state}
                action={action}
                token={token}
                text={text}
                embed={embed}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function FormBody({
  document,
  language,
  assets,
  ui,
  state,
  action,
  token,
  text,
  embed,
}: Pick<
  FormRendererProps,
  "document" | "language" | "assets" | "ui" | "action" | "token"
> & {
  embed: boolean;
  state: Extract<FormRendererState, { kind: "form" }>;
  text: (value: Localized | undefined) => string;
}) {
  const errors = state.errors ?? {};
  const hasErrors = Object.keys(errors).length > 0;
  const notice =
    state.notice === "expired"
      ? ui.expired
      : state.notice === "rate_limited"
        ? ui.rateLimited
        : state.notice === "failed"
          ? ui.failed
          : hasErrors
            ? ui.summary
            : null;
  const firstInvalid = document.fields.find((field) => errors[field.id])?.id;

  return (
    <form className="lf-form" method="post" action={action} noValidate>
      {notice ? (
        <p className="lf-notice" role="alert">
          {notice}
        </p>
      ) : null}
      <input type="hidden" name="lang" value={language} />
      {embed ? <input type="hidden" name="embed" value="1" /> : null}
      <input type="hidden" name={TOKEN_FIELD} value={token} />
      {/* The trap: people never see or reach this field; scripts fill it. */}
      <div className="lf-hp" aria-hidden="true">
        <label htmlFor="lf-website">{ui.leaveEmpty}</label>
        <input
          id="lf-website"
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <div className="lf-fields">
        {document.fields.map((field) => (
          <Field
            key={field.id}
            field={field}
            assets={assets}
            ui={ui}
            text={text}
            consentText={text(document.texts.consent_text)}
            value={state.values?.[field.id]}
            error={errors[field.id]}
            focus={field.id === firstInvalid}
          />
        ))}
      </div>

      <button className="lf-button" type="submit">
        {text(document.texts.button)}
      </button>
    </form>
  );
}

function Field({
  field,
  assets,
  ui,
  text,
  consentText,
  value,
  error,
  focus,
}: {
  field: FormField;
  assets: FormRendererProps["assets"];
  ui: FormUiTexts;
  text: (value: Localized | undefined) => string;
  consentText: string;
  value: string | string[] | undefined;
  error: AnswerError | undefined;
  focus: boolean;
}) {
  if (field.type === "hidden") return null;

  const half = field.width === "half" ? " lf-half" : "";
  const label = text(field.label);

  if (DISPLAY_TYPES.includes(field.type)) {
    if (field.type === "heading")
      return label ? <h2 className="lf-field lf-heading">{label}</h2> : null;
    if (field.type === "paragraph")
      return label ? <p className="lf-field lf-text">{label}</p> : null;
    const image = assets[field.value];
    return image ? (
      <div className={`lf-field${half}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="lf-img"
          src={image.url}
          width={image.width ?? undefined}
          height={image.height ?? undefined}
          alt={label}
          loading="lazy"
        />
      </div>
    ) : null;
  }

  const id = `lf-${field.id}`;
  const name = fieldName(field.id);
  const help = text(field.help);
  const placeholder = text(field.placeholder) || undefined;
  const required =
    field.required || field.maps_to === "name" || field.maps_to === "phone";
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const single = typeof value === "string" ? value : undefined;
  const many = Array.isArray(value) ? value : single ? [single] : [];
  const mark = required ? (
    <>
      {" "}
      <span className="lf-req" aria-hidden="true">
        *
      </span>
      <span className="lf-sr"> ({ui.required})</span>
    </>
  ) : null;
  const notes = (
    <>
      {help ? (
        <p className="lf-help" id={helpId}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className="lf-err" id={errorId}>
          {ui.errors[error]}
        </p>
      ) : null}
    </>
  );
  const shared = {
    id,
    name,
    className: "lf-input",
    "aria-required": required || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    autoFocus: focus || undefined,
  } as const;

  if (field.type === "consent") {
    return (
      <div className="lf-field">
        <label className="lf-opt lf-consent">
          <input
            type="checkbox"
            id={id}
            name={name}
            value="on"
            defaultChecked={single === "on"}
            aria-required={required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            autoFocus={focus || undefined}
          />
          <span>
            <LinkedText text={consentText} />
            {mark}
          </span>
        </label>
        {notes}
      </div>
    );
  }

  if (field.type === "radio" || field.type === "multiple_choice") {
    const type = field.type === "radio" ? "radio" : "checkbox";
    return (
      <fieldset
        className={`lf-field${half}`}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
      >
        <legend className="lf-label">
          {label}
          {mark}
        </legend>
        <div className="lf-opts">
          {field.options.map((option, index) => (
            <label className="lf-opt" key={option.id}>
              <input
                type={type}
                name={name}
                value={option.id}
                defaultChecked={many.includes(option.id)}
                autoFocus={(focus && index === 0) || undefined}
              />
              <span>{text(option.label)}</span>
            </label>
          ))}
        </div>
        {notes}
      </fieldset>
    );
  }

  return (
    <div className={`lf-field${half}`}>
      <label className="lf-label" htmlFor={id}>
        {label}
        {mark}
      </label>
      {field.type === "long_text" ? (
        <textarea
          {...shared}
          placeholder={placeholder}
          rows={4}
          defaultValue={single ?? ""}
        />
      ) : field.type === "dropdown" ? (
        <select {...shared} defaultValue={single ?? ""}>
          <option value="">{ui.choose}</option>
          {field.options.map((option) => (
            <option key={option.id} value={option.id}>
              {text(option.label)}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...shared}
          placeholder={placeholder}
          type={
            field.type === "phone"
              ? "tel"
              : field.type === "email"
                ? "email"
                : field.type === "date"
                  ? "date"
                  : "text"
          }
          inputMode={
            field.type === "phone"
              ? "tel"
              : field.type === "number"
                ? "decimal"
                : field.type === "email"
                  ? "email"
                  : undefined
          }
          autoComplete={
            field.maps_to === "name"
              ? "name"
              : field.type === "phone"
                ? "tel"
                : field.type === "email"
                  ? "email"
                  : "off"
          }
          defaultValue={single ?? (field.type === "phone" ? "+998 " : "")}
        />
      )}
      {notes}
    </div>
  );
}

/** Text in which [words](https://address) become a link, as in the consent text. */
function LinkedText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);
  return (
    <>
      {parts.map((part, index) => {
        const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
        return link ? (
          <a
            key={index}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
          >
            {link[1]}
          </a>
        ) : (
          part
        );
      })}
    </>
  );
}
