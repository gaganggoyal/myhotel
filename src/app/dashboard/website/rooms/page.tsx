import { ActionButton } from "@/components/forms";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { roomOrderAction } from "../actions";
import { loadEditor, OnboardingSteps } from "../shared";

export default async function RoomsEditor({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const { content: c, revision } = await loadEditor();
  const onboarding = (await searchParams).onboarding === "1";
  return (
    <>
      <OnboardingSteps step={2} show={onboarding} />
      <PageHeader
        title="Rooms"
        description="One entry per room type (not per room number). Prices are shown as a guide “from” price, never as a live rate."
        actions={<LinkButton href={`/dashboard/website/rooms/new${onboarding ? "?onboarding=1" : ""}`}>Add room type</LinkButton>}
      />
      {c.rooms.length ? (
        <div className="space-y-3">
          {c.rooms.map((r, i) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {r.name} {r.visible ? null : <Badge tone="warn">Hidden</Badge>}
                  </p>
                  <p className="text-sm text-slate-600">
                    Sleeps {r.maxAdults + r.maxChildren} · {r.mediaIds.length} photo{r.mediaIds.length === 1 ? "" : "s"}
                    {r.fromPrice ? ` · from ${formatINR(r.fromPrice)}/night` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LinkButton href={`/dashboard/website/rooms/${r.id}`} variant="secondary">
                    Edit
                  </LinkButton>
                  <ActionButton action={roomOrderAction} label="↑" hidden={{ id: r.id, op: "up", revision: String(revision) }} className={i === 0 ? "invisible" : ""} />
                  <ActionButton action={roomOrderAction} label="↓" hidden={{ id: r.id, op: "down", revision: String(revision) }} className={i === c.rooms.length - 1 ? "invisible" : ""} />
                  <ActionButton action={roomOrderAction} label={r.visible ? "Hide" : "Show"} hidden={{ id: r.id, op: "toggle", revision: String(revision) }} />
                  <ActionButton action={roomOrderAction} label="Delete" variant="danger" confirm={`Delete ${r.name}?`} hidden={{ id: r.id, op: "delete", revision: String(revision) }} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No rooms yet">Add each room type you sell, such as “Deluxe River View Room” or “Family Suite”.</EmptyState>
      )}
    </>
  );
}
