import { ActionButton, ActionForm } from "@/components/forms";
import { Alert, Badge, Card, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import { requireHotel } from "@/lib/auth";
import { publishChecklist } from "@/lib/content";
import { formatDateTime } from "@/lib/format";
import { getDraft, hasPhotos, listVersions } from "@/lib/hotel";
import { onlineAction, publishAction, restoreAction } from "./actions";

export default async function PublishPage() {
  const { hotel, user } = await requireHotel("manager");
  const [{ content, updatedAt }, photos, versions] = await Promise.all([getDraft(hotel.id), hasPhotos(hotel.id), listVersions(hotel.id)]);
  const check = publishChecklist(content, photos);
  const current = versions.find((v) => v.id === hotel.publishedVersionId);
  const unpublishedChanges = !current || updatedAt > current.publishedAt;

  return (
    <>
      <PageHeader
        title="Preview & publish"
        description="Edits are saved to a draft. Guests only see them after you publish, and every published version can be restored."
        actions={
          <a href="/preview" target="_blank" rel="noopener" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            Open preview ↗
          </a>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="Ready to publish?">
          {check.blocking.length ? (
            <Alert tone="bad" title="Fix these first">
              <ul className="list-disc space-y-1 pl-5">
                {check.blocking.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Alert>
          ) : (
            <Alert tone="good">Everything required is in place.</Alert>
          )}
          {check.warnings.length ? (
            <div className="mt-4">
              <Alert tone="warn" title="Recommended">
                <ul className="list-disc space-y-1 pl-5">
                  {check.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            </div>
          ) : null}
          {!user.emailVerifiedAt ? (
            <div className="mt-4">
              <Alert tone="warn">Verify your email address to publish.</Alert>
            </div>
          ) : null}
          <div className="mt-6">
            <ActionForm action={publishAction} submitLabel={current ? "Publish changes" : "Publish my website"} pendingLabel="Publishing…">
              <Field label="Note (optional)" htmlFor="note" hint="For your own history, e.g. “Monsoon prices”.">
                <Input id="note" name="note" maxLength={200} />
              </Field>
            </ActionForm>
          </div>
        </Card>
        <Card title="Status">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Website</dt>
              <dd>{hotel.siteStatus === "live" ? <Badge tone="good">Live</Badge> : hotel.siteStatus === "unpublished" ? <Badge tone="warn">Offline</Badge> : <Badge>Draft</Badge>}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Published version</dt>
              <dd className="font-semibold">{current ? `v${current.version}` : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Draft</dt>
              <dd>{unpublishedChanges ? <Badge tone="warn">Unpublished changes</Badge> : <Badge tone="good">Up to date</Badge>}</dd>
            </div>
          </dl>
          {hotel.publishedVersionId ? (
            <div className="mt-5 border-t border-slate-100 pt-4">
              {hotel.siteStatus === "live" ? (
                <ActionButton action={onlineAction} label="Take site offline" hidden={{ online: "0" }} confirm="Guests will see a maintenance page until you bring it back. Continue?" />
              ) : (
                <ActionButton action={onlineAction} label="Bring site back online" variant="primary" hidden={{ online: "1" }} />
              )}
            </div>
          ) : null}
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Version history</h2>
      {versions.length ? (
        <Table head={["Version", "Published", "Note", ""]}>
          {versions.map((v) => (
            <tr key={v.id}>
              <Td>
                v{v.version} {v.id === hotel.publishedVersionId ? <Badge tone="good">Live</Badge> : null}
              </Td>
              <Td>{formatDateTime(v.publishedAt)}</Td>
              <Td>{v.note ?? ""}</Td>
              <Td className="text-right">
                {v.id !== hotel.publishedVersionId ? <ActionButton action={restoreAction} label="Restore" hidden={{ versionId: v.id }} confirm={`Publish version ${v.version} again and replace your current draft?`} /> : null}
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <p className="text-sm text-slate-600">Nothing published yet.</p>
      )}
    </>
  );
}
