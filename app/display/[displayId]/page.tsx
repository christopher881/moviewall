import PosterSlideshow from "@/components/PosterSlideshow";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const ALLOWED = [0, 90, 180, 270] as const;
type Rotation = (typeof ALLOWED)[number];

export default async function DisplayPage({
  params,
  searchParams
}: {
  params: Promise<{ displayId: string }>;
  searchParams: Promise<{ rotate?: string }>;
}) {
  const { displayId } = await params;
  const { rotate } = await searchParams;
  const r = Number(rotate ?? 0);
  const rotation: Rotation = (ALLOWED as readonly number[]).includes(r) ? (r as Rotation) : 0;
  return <PosterSlideshow displayId={displayId} rotation={rotation} />;
}
