import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import en from "../../../../../../../../messages/en.json";
import ru from "../../../../../../../../messages/ru.json";
import uz from "../../../../../../../../messages/uz.json";
import { FormEditor } from "@/components/forms/editor/form-editor";
import { initLocale } from "@/i18n/params";
import type { Locale } from "@/i18n/routing";
import { getSignedInUser } from "@/lib/auth";
import { getEditableForm } from "@/lib/forms/queries";
import { formsBaseUrl } from "@/lib/forms/url";

// The form editor fills the whole window, so it sits outside the app's shell.
// docs/SPEC.md → "Lead forms add-on → Editor with live preview".

// The preview shows a visitor's error words in the form's languages, whatever
// language the editor itself is in.
const UI_TEXTS = { uz: uz.publicForm, ru: ru.publicForm, en: en.publicForm };

type Params = { params: Promise<{ locale: string; id: string }> };

async function Editor({ params }: Params) {
  const { id } = await params;
  const locale: Locale = await initLocale(params);
  const user = await getSignedInUser();
  if (!user) redirect(`/auth/sign-out?locale=${locale}`);
  // Forms belong to the owner and managers.
  if (user.role === "teacher") notFound();
  const form = await getEditableForm(id);
  if (!form) notFound();

  return (
    <FormEditor
      form={{
        id: form.id,
        slug: form.slug,
        status: form.status,
        draft: { name: form.name, subject: form.subject, sourceTag: form.sourceTag, document: form.draft },
        published: form.published,
        version: form.version,
        assets: form.assets,
      }}
      user={{ id: user.id, name: user.fullName, role: user.role }}
      baseUrl={formsBaseUrl(process.env.FORMS_HOST)}
      uiTexts={UI_TEXTS}
    />
  );
}

// The id is only known at request time, so the whole page streams in.
export default function FormEditorPage(props: Params) {
  return (
    <Suspense fallback={null}>
      <Editor {...props} />
    </Suspense>
  );
}
