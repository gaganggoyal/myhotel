import { ActionForm } from "@/components/forms";
import { PhotoUploader } from "@/components/media";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { TEMPLATES } from "@/lib/content";
import { contrastRatio, TEMPLATE_STYLES } from "@/site/theme";
import { saveDesignAction } from "../actions";
import { loadEditor, Revision } from "../shared";

export default async function DesignEditor() {
  const { content: c, revision, photos } = await loadEditor();
  const logos = photos.filter((p) => p.kind === "logo");
  const lowContrast = contrastRatio(c.theme.primary, "#ffffff") < 3 && contrastRatio(c.theme.primary, "#111827") < 3;
  return (
    <>
      <PageHeader title="Design & language" description="All templates use the same content, so you can switch any time without retyping anything." />
      <ActionForm action={saveDesignAction}>
        <Revision value={revision} />
        <Card title="Template">
          <fieldset className="grid gap-4 md:grid-cols-3">
            <legend className="sr-only">Template</legend>
            {TEMPLATES.map((t) => {
              const s = TEMPLATE_STYLES[t];
              return (
                <label key={t} className="cursor-pointer rounded-xl border-2 border-slate-200 p-4 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50">
                  <input type="radio" name="template" value={t} defaultChecked={c.template === t} className="sr-only" />
                  <div className="mb-3 h-20 rounded-lg" style={{ background: `linear-gradient(135deg, ${s.defaults.primary}, ${s.defaults.accent})` }} />
                  <p className="font-semibold text-slate-900">{s.label}</p>
                  <p className="mt-1 text-xs text-slate-600">{s.description}</p>
                </label>
              );
            })}
          </fieldset>
        </Card>
        <Card title="Colours" description="Text on buttons switches between white and dark automatically for readability.">
          <div className="grid max-w-md grid-cols-2 gap-4">
            <Field label="Main colour" htmlFor="primary">
              <Input id="primary" name="primary" type="color" defaultValue={c.theme.primary} className="h-11 p-1" />
            </Field>
            <Field label="Accent colour" htmlFor="accent">
              <Input id="accent" name="accent" type="color" defaultValue={c.theme.accent} className="h-11 p-1" />
            </Field>
          </div>
          {lowContrast ? <p className="mt-3 text-sm text-amber-800">Your main colour is mid-tone, so button text may be hard to read. A darker or lighter shade will work better.</p> : null}
        </Card>
        <Card title="Language and logo">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Website language" htmlFor="locale" hint="Menus, buttons and forms are translated. Write your own text in the same language.">
              <Select id="locale" name="locale" defaultValue={c.locale}>
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </Select>
            </Field>
            <Field label="Logo" htmlFor="logoMediaId" hint="Optional. Without a logo, your name is shown in the template’s font.">
              <Select id="logoMediaId" name="logoMediaId" defaultValue={c.logoMediaId ?? ""}>
                <option value="">No logo</option>
                {logos.map((l, i) => (
                  <option key={l.id} value={l.id}>
                    Logo {i + 1} ({l.width}×{l.height})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      </ActionForm>
      <div className="mt-4">
        <PhotoUploader kind="logo" label="Upload a logo" />
      </div>
    </>
  );
}
