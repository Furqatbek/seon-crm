"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlignLeft,
  AtSign,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleDot,
  EyeOff,
  GripVertical,
  Hash,
  Heading,
  Image as ImageIcon,
  ListChecks,
  Lock,
  Phone,
  Plus,
  Rows3,
  ShieldCheck,
  Text,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CHOICE_TYPES, pick, type FieldType, type FormDocument, type FormField, type MapsTo } from "@/lib/forms/document";
import { useEditor } from "@/lib/forms/editor-store";
import { ADDABLE_TYPES, MAPS_TO_BY_TYPE, answersNothing, isLocked, missingIn, missingLanguages, moveField, newField, newOption } from "@/lib/forms/fields";
import { cn } from "@/lib/utils";

import { AssetUpload } from "./asset-upload";
import { LanguageTabs, LocalizedField, useTabLanguage } from "./localized";

export const TYPE_ICON: Record<FieldType, LucideIcon> = {
  short_text: Type,
  long_text: AlignLeft,
  phone: Phone,
  email: AtSign,
  number: Hash,
  date: CalendarDays,
  radio: CircleDot,
  dropdown: Rows3,
  multiple_choice: ListChecks,
  consent: ShieldCheck,
  hidden: EyeOff,
  heading: Heading,
  paragraph: Text,
  image: ImageIcon,
};

const patchField = (id: string, patch: Partial<FormField>) => (document: FormDocument): FormDocument => ({
  ...document,
  fields: document.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
});

/** Fields: the form's own texts first, then one card per field, dragged to reorder. */
export function FieldsTab({ canRemoveConsent }: { canRemoveConsent: boolean }) {
  const t = useTranslations("forms");
  const document = useEditor((state) => state.draft.document);
  const change = useEditor((state) => state.change);
  const openField = useEditor((state) => state.openField);
  const setOpenField = useEditor((state) => state.setOpenField);
  const [adding, setAdding] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    change((doc) => {
      const from = doc.fields.findIndex((field) => field.id === active.id);
      const to = doc.fields.findIndex((field) => field.id === over.id);
      return { ...doc, fields: moveField(doc.fields, from, to) };
    });
  };
  const add = (type: FieldType) => {
    const field = newField(type, document);
    change((doc) => {
      // A new field goes above the consent box, which stays last.
      const consentAt = doc.fields.findIndex((item) => item.type === "consent");
      const fields = [...doc.fields];
      fields.splice(type === "consent" || consentAt === -1 ? fields.length : consentAt, 0, field);
      return { ...doc, fields };
    });
    setOpenField(field.id);
    setAdding(false);
  };
  const hasConsent = document.fields.some((field) => field.type === "consent");

  return (
    <div className="flex flex-col gap-3">
      <TextsCard />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={document.fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2" aria-label={t("fields.list")}>
            {document.fields.map((field) => (
              <FieldCard
                key={field.id}
                field={field}
                open={openField === field.id}
                onToggle={() => setOpenField(openField === field.id ? null : field.id)}
                canDelete={!isLocked(field) && (field.type !== "consent" || canRemoveConsent)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <Button variant="secondary" onClick={() => setAdding(true)} className="self-start">
        <Plus aria-hidden />
        {t("fields.add")}
      </Button>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("fields.addTitle")}</DialogTitle>
            <DialogDescription>{t("fields.addHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ADDABLE_TYPES.filter((type) => type !== "consent" || !hasConsent).map((type) => {
              const Icon = TYPE_ICON[type];
              return (
                <button
                  key={type}
                  type="button"
                  data-field-type={type}
                  onClick={() => add(type)}
                  className="flex flex-col items-start gap-2 rounded-card border border-border p-3 text-left outline-none motion-fast hover:border-border-strong hover:bg-bg-subtle focus-visible:ring-3 focus-visible:ring-focus-ring"
                >
                  <Icon className="size-5 text-text-secondary" aria-hidden />
                  <span className="text-body font-medium text-text">{t(`types.${type}`)}</span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The form's heading and button: not a field, so it does not move. */
function TextsCard() {
  const t = useTranslations("forms");
  const document = useEditor((state) => state.draft.document);
  const change = useEditor((state) => state.change);
  const language = useEditor((state) => state.previewLanguage);
  const [open, setOpen] = useState(false);
  const texts = document.texts;
  const missing = missingIn([texts.title, texts.button], document.languages);
  const set = (key: "title" | "subtitle" | "button") => (value: FormDocument["texts"]["title"]) =>
    change((doc) => ({ ...doc, texts: { ...doc.texts, [key]: value } }), `texts.${key}`);

  return (
    <div className="rounded-card border border-border bg-bg" data-card="texts">
      <CardHeader
        icon={Heading}
        title={t("fields.textsCard")}
        subtitle={pick(texts.title, language, document.default_language)}
        open={open}
        onToggle={() => setOpen(!open)}
        missing={missing.length > 0}
      />
      {open ? (
        <div className="border-t border-border p-3">
          <LanguageTabs languages={document.languages} missing={missing} initial={language}>
            <LocalizedField label={t("fields.title")} value={texts.title} onChange={set("title")} />
            <LocalizedField label={t("fields.subtitle")} value={texts.subtitle} onChange={set("subtitle")} multiline />
            <LocalizedField label={t("fields.button")} value={texts.button} onChange={set("button")} />
          </LanguageTabs>
        </div>
      ) : null}
    </div>
  );
}

function CardHeader({
  icon: Icon,
  title,
  subtitle,
  open,
  onToggle,
  missing,
  before,
  after,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  missing: boolean;
  before?: React.ReactNode;
  after?: React.ReactNode;
}) {
  const t = useTranslations("forms");
  return (
    <div className="flex items-center gap-1 p-1.5">
      {before}
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control px-1.5 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-focus-ring"
      >
        <Icon className="size-4 shrink-0 text-text-secondary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-text">{title}</span>
          {subtitle ? <span className="block truncate text-footnote text-text-secondary">{subtitle}</span> : null}
        </span>
        {missing ? (
          <span className="size-2 shrink-0 rounded-full bg-warning" title={t("editor.missingTranslation")}>
            <span className="sr-only">{t("editor.missingTranslation")}</span>
          </span>
        ) : null}
        <ChevronDown className={cn("size-4 shrink-0 text-text-secondary motion-fast", open && "rotate-180")} aria-hidden />
      </button>
      {after}
    </div>
  );
}

function FieldCard({ field, open, onToggle, canDelete }: { field: FormField; open: boolean; onToggle: () => void; canDelete: boolean }) {
  const t = useTranslations("forms");
  const document = useEditor((state) => state.draft.document);
  const change = useEditor((state) => state.change);
  const language = useEditor((state) => state.previewLanguage);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const missing = missingLanguages(field, document);
  const typeName = t(`types.${field.type}`);
  const label =
    field.type === "consent" ? pick(document.texts.consent_text, language, document.default_language) : pick(field.label, language, document.default_language);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-field={field.id}
      data-field-kind={field.type}
      className={cn("rounded-card border border-border bg-bg", isDragging && "relative z-10 shadow-float")}
    >
      <CardHeader
        icon={TYPE_ICON[field.type]}
        title={label || typeName}
        subtitle={label ? typeName : undefined}
        open={open}
        onToggle={onToggle}
        missing={missing.length > 0}
        before={
          <button
            type="button"
            aria-label={t("fields.drag", { name: label || typeName })}
            className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-control text-text-tertiary outline-none hover:text-text focus-visible:ring-3 focus-visible:ring-focus-ring active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        }
        after={
          canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("fields.delete", { name: label || typeName })}
              onClick={() => change((doc) => ({ ...doc, fields: doc.fields.filter((item) => item.id !== field.id) }))}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center text-text-tertiary" title={t(isLocked(field) ? "fields.locked" : "fields.consentOwner")}>
              <Lock className="size-4" aria-hidden />
              <span className="sr-only">{t(isLocked(field) ? "fields.locked" : "fields.consentOwner")}</span>
            </span>
          )
        }
      />
      {open ? <FieldBody field={field} missing={missing} /> : null}
    </li>
  );
}

function FieldBody({ field, missing }: { field: FormField; missing: ReturnType<typeof missingLanguages> }) {
  const t = useTranslations("forms");
  const document = useEditor((state) => state.draft.document);
  const change = useEditor((state) => state.change);
  const language = useEditor((state) => state.previewLanguage);
  const formId = useEditor((state) => state.id);
  const assets = useEditor((state) => state.assets);
  const id = useId();
  const patch = (next: Partial<FormField>, key?: string) => change(patchField(field.id, next), key ? `${field.id}.${key}` : undefined);
  const locked = isLocked(field);
  const display = answersNothing(field.type);
  const choice = CHOICE_TYPES.includes(field.type);
  const mapsTo = MAPS_TO_BY_TYPE[field.type];
  const hasPlaceholder = ["short_text", "long_text", "phone", "email", "number"].includes(field.type);

  return (
    <div className="flex flex-col gap-4 border-t border-border p-3">
      {field.type === "hidden" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>{t("fields.hiddenName")}</Label>
            <Input
              id={`${id}-name`}
              value={field.label[document.default_language] ?? ""}
              onChange={(event) => patch({ label: Object.fromEntries(document.languages.map((code) => [code, event.target.value])) }, "label")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-value`}>{t("fields.hiddenValue")}</Label>
            <Input id={`${id}-value`} value={field.value} maxLength={500} onChange={(event) => patch({ value: event.target.value }, "value")} />
            <p className="text-footnote text-text-secondary">{t("fields.hiddenHint")}</p>
          </div>
        </>
      ) : field.type === "image" ? (
        <AssetUpload
          formId={formId}
          kind="image"
          label={t("fields.image")}
          asset={field.value ? assets[field.value] : undefined}
          onChange={(assetId) => patch({ value: assetId ?? "" })}
        />
      ) : (
        <LanguageTabs languages={document.languages} missing={missing} initial={language}>
          {field.type === "consent" ? (
            <LocalizedField
              label={t("fields.consentText")}
              value={document.texts.consent_text}
              multiline
              onChange={(value) => change((doc) => ({ ...doc, texts: { ...doc.texts, consent_text: value } }), "texts.consent_text")}
            />
          ) : (
            <LocalizedField
              label={t(field.type === "paragraph" ? "fields.text" : "fields.label")}
              value={field.label}
              multiline={field.type === "paragraph"}
              onChange={(value) => patch({ label: value }, "label")}
            />
          )}
          {hasPlaceholder ? <LocalizedField label={t("fields.placeholder")} value={field.placeholder} onChange={(value) => patch({ placeholder: value }, "placeholder")} /> : null}
          {!display && field.type !== "consent" ? <LocalizedField label={t("fields.help")} value={field.help} onChange={(value) => patch({ help: value }, "help")} /> : null}
          {choice ? <OptionsEditor field={field} /> : null}
        </LanguageTabs>
      )}

      {field.type === "consent" ? <p className="text-footnote text-text-secondary">{t("fields.consentHint")}</p> : null}

      {field.type === "radio" || field.type === "dropdown" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-text-secondary">{t("fields.shownAs")}</span>
          <SegmentedControl
            aria-label={t("fields.shownAs")}
            fullWidth
            value={field.type}
            onValueChange={(type) => patch({ type })}
            options={[
              { value: "radio", label: t("fields.asButtons") },
              { value: "dropdown", label: t("fields.asDropdown") },
            ]}
          />
        </div>
      ) : null}

      {!display && field.type !== "hidden" ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${id}-required`}>{t("fields.required")}</Label>
          <Switch
            id={`${id}-required`}
            checked={field.required || locked}
            disabled={locked}
            onCheckedChange={(required) => patch({ required })}
          />
        </div>
      ) : null}

      {!display && field.type !== "hidden" && field.type !== "consent" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-text-secondary">{t("fields.width")}</span>
          <SegmentedControl
            aria-label={t("fields.width")}
            fullWidth
            value={field.width}
            onValueChange={(width) => patch({ width })}
            options={[
              { value: "full", label: t("fields.widthFull") },
              { value: "half", label: t("fields.widthHalf") },
            ]}
          />
        </div>
      ) : null}

      {mapsTo.length > 1 && !locked ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-maps`}>{t("fields.mapsTo")}</Label>
          <Select value={field.maps_to} onValueChange={(value) => patch({ maps_to: value as MapsTo })}>
            <SelectTrigger id={`${id}-maps`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mapsTo.map((target) => (
                <SelectItem key={target} value={target}>
                  {t(`mapsTo.${target}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

/** The options of a choice field, each labelled in the language of the tabs around it. */
function OptionsEditor({ field }: { field: FormField }) {
  const t = useTranslations("forms");
  const language = useTabLanguage();
  const languages = useEditor((state) => state.draft.document.languages);
  const change = useEditor((state) => state.change);
  const setOptions = (options: FormField["options"], key?: string) => change(patchField(field.id, { options }), key ? `${field.id}.${key}` : undefined);

  return (
    <fieldset className="flex flex-col gap-2" data-options>
      <legend className="mb-1.5 text-footnote font-medium text-text-secondary">{t("fields.options")}</legend>
      {field.options.map((option, index) => (
        <div key={option.id} className="flex items-center gap-1">
          <CheckSquare className="size-4 shrink-0 text-text-tertiary" aria-hidden />
          <Input
            aria-label={t("fields.optionN", { n: index + 1 })}
            lang={language}
            data-language={language}
            value={option.label[language] ?? ""}
            onChange={(event) =>
              setOptions(
                field.options.map((item) => (item.id === option.id ? { ...item, label: { ...item.label, [language]: event.target.value } } : item)),
                `option.${option.id}.${language}`,
              )
            }
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("fields.removeOption", { n: index + 1 })}
            disabled={field.options.length <= 1}
            onClick={() => setOptions(field.options.filter((item) => item.id !== option.id))}
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <Button variant="ghost" className="self-start" onClick={() => setOptions([...field.options, newOption(field.options, languages)])}>
        <Plus aria-hidden />
        {t("fields.addOption")}
      </Button>
    </fieldset>
  );
}
