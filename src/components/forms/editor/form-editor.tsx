"use client";

import { MonitorSmartphone, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { FormUiTexts } from "@/components/forms/form-renderer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useRouter } from "@/i18n/navigation";
import { duplicateForm, publishForm, saveDraft, setFormStatus } from "@/lib/forms/actions";
import { EditorStoreContext, createEditorStore, useEditor, useEditorStore, type EditorInit } from "@/lib/forms/editor-store";

import { DesignTab } from "./design-tab";
import { FieldsTab } from "./fields-tab";
import { FormPreview } from "./form-preview";
import { HistoryDialog } from "./history-dialog";
import { SettingsTab } from "./settings-tab";
import { TopBar } from "./top-bar";
import { usePresence } from "./use-presence";

/** The draft is saved this long after the last change. */
const AUTOSAVE_MS = 1000;

type Props = {
  form: EditorInit;
  user: { id: string; name: string; role: "owner" | "manager" };
  baseUrl: string | null;
  uiTexts: Record<"uz" | "ru" | "en", FormUiTexts>;
};

/**
 * The form editor: settings on the left, the real form on the right.
 * docs/SPEC.md → "Lead forms add-on → Editor with live preview".
 */
export function FormEditor(props: Props) {
  const [store] = useState(() => createEditorStore(props.form));
  return (
    <EditorStoreContext.Provider value={store}>
      {/* The editor needs room for both halves. */}
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center lg:hidden" data-open-on-computer>
        <MonitorSmartphone className="size-8 text-text-secondary" aria-hidden />
        <SmallScreen />
      </div>
      <div className="hidden h-dvh flex-col overflow-hidden bg-bg lg:flex" data-form-editor>
        <Editor {...props} />
      </div>
    </EditorStoreContext.Provider>
  );
}

function SmallScreen() {
  const t = useTranslations("forms");
  return (
    <>
      <h1 className="text-title text-text">{t("editor.openOnComputer")}</h1>
      <p className="max-w-sm text-body text-text-secondary">{t("editor.openOnComputerHint")}</p>
      <Button asChild variant="secondary">
        <Link href="/leads/forms">{t("editor.back")}</Link>
      </Button>
    </>
  );
}

function Editor({ user, baseUrl, uiTexts }: Props) {
  const t = useTranslations("forms");
  const router = useRouter();
  const store = useEditorStore();
  const formId = useEditor((state) => state.id);
  const status = useEditor((state) => state.status);
  const others = usePresence(formId, user);
  const [publishing, setPublishing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ── Auto-save: one second after the last change; one save at a time. ──
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const save = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (running.current) await running.current;
    const state = store.getState();
    const draft = state.draft;
    if (draft === state.savedDraft) return true;
    state.setSaveState("saving");
    running.current = saveDraft({ id: state.id, ...draft })
      .then((result) => result.ok)
      .catch(() => false);
    const ok = await running.current;
    running.current = null;
    store.getState().setSaveState(ok ? "saved" : "error", draft);
    // A change made while it was saving has already set its own timer below.
    return ok;
  }, [store]);

  useEffect(() => {
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.draft === previous.draft) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
    });
    const warn = (event: BeforeUnloadEvent) => {
      if (store.getState().saveState !== "saved") event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [store, save]);

  // ── Undo and redo from the keyboard: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z (and Ctrl+Y). ──
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) store.getState().redo();
      else store.getState().undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  const publish = async () => {
    setPublishing(true);
    // What is published is the saved draft: save first.
    const saved = await save();
    const result = saved ? await publishForm({ id: formId }).catch(() => ({ ok: false as const, error: "generic" as const })) : null;
    setPublishing(false);
    if (!result) {
      toast.error(t("errors.saveFailed"));
      return;
    }
    if (!result.ok) {
      toast.error(t(`errors.${result.error}`));
      return;
    }
    store.getState().setPublished(result.data.published, result.data.version, result.data.status);
    toast.success(t("editor.published", { n: result.data.version }));
  };

  const toggleClosed = async () => {
    const next = status === "closed" ? "live" : "closed";
    const result = await setFormStatus({ id: formId, status: next }).catch(() => ({ ok: false as const, error: "generic" as const }));
    if (!result.ok) {
      toast.error(t(`errors.${result.error}`));
      return;
    }
    store.getState().setStatus(next);
    toast.success(t(next === "closed" ? "editor.closedToast" : "editor.reopenedToast"));
  };

  const duplicate = async () => {
    await save();
    const result = await duplicateForm({ id: formId }).catch(() => ({ ok: false as const, error: "generic" as const }));
    if (!result.ok) {
      toast.error(t(`errors.${result.error}`));
      return;
    }
    router.push(`/leads/forms/${result.data.id}/edit`);
  };

  return (
    <>
      <TopBar
        baseUrl={baseUrl}
        publishing={publishing}
        onPublish={publish}
        onHistory={() => setHistoryOpen(true)}
        onToggleClosed={toggleClosed}
        onDuplicate={duplicate}
      />
      {others.length > 0 ? (
        <p role="status" className="flex shrink-0 items-center gap-2 border-b border-border bg-warning-tint px-4 py-2 text-footnote text-warning" data-presence>
          <Users className="size-4 shrink-0" aria-hidden />
          {t("editor.alsoEditing", { count: others.length, names: others.join(", ") })}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[400px] shrink-0 flex-col border-r border-border" aria-label={t("editor.panel")}>
          <Tabs defaultValue="fields" className="min-h-0 flex-1 gap-0">
            <TabsList className="shrink-0 px-4">
              <TabsTrigger value="fields">{t("editor.tabs.fields")}</TabsTrigger>
              <TabsTrigger value="design">{t("editor.tabs.design")}</TabsTrigger>
              <TabsTrigger value="settings">{t("editor.tabs.settings")}</TabsTrigger>
            </TabsList>
            <TabsContent value="fields" className="min-h-0 flex-1 overflow-y-auto p-4">
              <FieldsTab canRemoveConsent={user.role === "owner"} />
            </TabsContent>
            <TabsContent value="design" className="min-h-0 flex-1 overflow-y-auto p-4">
              <DesignTab />
            </TabsContent>
            <TabsContent value="settings" className="min-h-0 flex-1 overflow-y-auto p-4">
              <SettingsTab baseUrl={baseUrl} />
            </TabsContent>
          </Tabs>
        </aside>
        <FormPreview uiTexts={uiTexts} />
      </div>

      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  );
}
