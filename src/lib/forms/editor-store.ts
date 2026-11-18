"use client";

// The form editor's one store: the draft being edited with its undo history,
// what is saved and published, and what the preview shows.
// docs/SPEC.md → "Lead forms add-on → Editor with live preview".

import { createContext, useContext } from "react";
import { createStore, useStore, type StoreApi } from "zustand";

import type { FormDocument, FormLanguage } from "./document";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "./history";
import type { FormAsset } from "./public";

/** Everything Undo covers: the document and the settings saved with it. */
export type Draft = { name: string; subject: string; sourceTag: string; document: FormDocument };

export type FormStatus = "draft" | "live" | "closed";
export type Device = "phone" | "tablet" | "desktop";
export const DEVICE_WIDTH: Record<Device, number> = { phone: 390, tablet: 768, desktop: 1280 };
export const DEVICE_HEIGHT: Record<Device, number> = { phone: 844, tablet: 1024, desktop: 800 };

export type SaveState = "saved" | "dirty" | "saving" | "error";

export type EditorInit = {
  id: string;
  slug: string;
  status: FormStatus;
  draft: Draft;
  published: FormDocument | null;
  version: number;
  assets: Record<string, FormAsset>;
};

export type EditorState = EditorInit & {
  history: History<Draft>;
  /** The draft as the server last confirmed it. */
  savedDraft: Draft;
  saveState: SaveState;
  previewLanguage: FormLanguage;
  device: Device;
  showThanks: boolean;
  /** The field card that is open, if any. */
  openField: string | null;

  /** Change the document. `key` names what is being typed in, so a run of keystrokes is one undo step. */
  change: (recipe: (document: FormDocument) => FormDocument, key?: string) => void;
  /** Change the name, subject or source tag. */
  setMeta: (patch: Partial<Omit<Draft, "document">>, key?: string) => void;
  undo: () => void;
  redo: () => void;
  setSaveState: (state: SaveState, saved?: Draft) => void;
  setPublished: (published: FormDocument, version: number, status: FormStatus) => void;
  setStatus: (status: FormStatus) => void;
  setSlug: (slug: string) => void;
  addAsset: (id: string, asset: FormAsset) => void;
  setPreviewLanguage: (language: FormLanguage) => void;
  setDevice: (device: Device) => void;
  setShowThanks: (show: boolean) => void;
  setOpenField: (id: string | null) => void;
};

export function createEditorStore(init: EditorInit): StoreApi<EditorState> {
  return createStore<EditorState>((set, get) => {
    const push = (next: Draft, key?: string) => {
      const history = commit(get().history, next, { key });
      if (history === get().history) return;
      set({ history, draft: history.present, saveState: "dirty" });
    };
    const travel = (history: History<Draft>) => {
      if (history === get().history) return;
      const { document } = history.present;
      // Stay on a language the form still has.
      const previewLanguage = document.languages.includes(get().previewLanguage) ? get().previewLanguage : document.default_language;
      set({ history, draft: history.present, saveState: "dirty", previewLanguage });
    };

    return {
      ...init,
      history: createHistory(init.draft),
      savedDraft: init.draft,
      saveState: "saved",
      previewLanguage: init.draft.document.default_language,
      device: "desktop",
      showThanks: false,
      openField: null,

      change: (recipe, key) => {
        const draft = get().draft;
        const document = recipe(draft.document);
        if (document === draft.document) return;
        push({ ...draft, document }, key);
        if (!document.languages.includes(get().previewLanguage)) set({ previewLanguage: document.default_language });
      },
      setMeta: (patch, key) => push({ ...get().draft, ...patch }, key),
      undo: () => travel(undo(get().history)),
      redo: () => travel(redo(get().history)),
      setSaveState: (saveState, saved) => {
        // A change made while the save was on its way keeps the draft dirty.
        if (saveState === "saved" && saved) set({ savedDraft: saved, saveState: get().draft === saved ? "saved" : "dirty" });
        else set({ saveState });
      },
      setPublished: (published, version, status) => set({ published, version, status }),
      setStatus: (status) => set({ status }),
      setSlug: (slug) => set({ slug }),
      addAsset: (id, asset) => set({ assets: { ...get().assets, [id]: asset } }),
      setPreviewLanguage: (previewLanguage) => set({ previewLanguage }),
      setDevice: (device) => set({ device }),
      setShowThanks: (showThanks) => set({ showThanks }),
      setOpenField: (openField) => set({ openField }),
    };
  });
}

export const EditorStoreContext = createContext<StoreApi<EditorState> | null>(null);

export function useEditor<T>(selector: (state: EditorState) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditor needs the editor store");
  return useStore(store, selector);
}

export function useEditorStore(): StoreApi<EditorState> {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorStore needs the editor store");
  return store;
}

export const selectCanUndo = (state: EditorState) => canUndo(state.history);
export const selectCanRedo = (state: EditorState) => canRedo(state.history);
/** Whether Publish has something to publish. */
export const selectHasChanges = (state: EditorState) =>
  state.published === null || JSON.stringify(state.published) !== JSON.stringify(state.draft.document);
