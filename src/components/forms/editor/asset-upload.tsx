"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadFormAsset } from "@/lib/forms/actions";
import { useEditor } from "@/lib/forms/editor-store";
import type { FormAsset } from "@/lib/forms/public";
import { ASSET_MAX_BYTES, ASSET_TYPES, type AssetKind } from "@/lib/validation/forms";

/** Upload or remove one of a form's pictures. PNG, JPG or WebP up to 5 MB. */
export function AssetUpload({
  formId,
  kind,
  label,
  asset,
  onChange,
}: {
  formId: string;
  kind: AssetKind;
  label: string;
  asset: FormAsset | undefined;
  /** The new asset's id, or null when the picture is removed. */
  onChange: (assetId: string | null) => void;
}) {
  const t = useTranslations("forms");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const addAsset = useEditor((state) => state.addAsset);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!(ASSET_TYPES as readonly string[]).includes(file.type) || file.size > ASSET_MAX_BYTES) {
      toast.error(t("errors.fileInvalid"));
      return;
    }
    setBusy(true);
    const body = new FormData();
    body.set("formId", formId);
    body.set("kind", kind);
    body.set("file", file);
    const result = await uploadFormAsset(body).catch(() => ({ ok: false as const, error: "generic" as const }));
    setBusy(false);
    if (!result.ok) {
      toast.error(t(`errors.${result.error}`));
      return;
    }
    addAsset(result.data.id, result.data.asset);
    onChange(result.data.id);
  };

  return (
    <div className="flex flex-col gap-1.5" data-upload={kind}>
      <span className="text-footnote font-medium text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        {asset ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small preview of a picture in storage
          <img src={asset.url} alt="" className="h-10 w-16 rounded-inner border border-border bg-bg-subtle object-contain" />
        ) : null}
        <input
          ref={input}
          id={id}
          type="file"
          accept={ASSET_TYPES.join(",")}
          className="sr-only"
          aria-label={label}
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
          <ImageUp aria-hidden />
          {busy ? t("design.uploading") : asset ? t("design.replace") : t("design.upload")}
        </Button>
        {asset ? (
          <Button variant="ghost" size="icon" aria-label={t("design.remove", { name: label })} onClick={() => onChange(null)}>
            <Trash2 aria-hidden />
          </Button>
        ) : null}
      </div>
      <p className="text-footnote text-text-secondary">{t("design.uploadHint")}</p>
    </div>
  );
}
