"use client";

import Link from "next/link";
import { Display, Collection, Poster } from "@/types";
import { isOnline, timeAgo } from "@/lib/utils";

export default function DisplayStatusCard({
  display,
  collection,
  poster
}: {
  display: Display;
  collection?: Collection | null;
  poster?: Poster | null;
}) {
  const online = isOnline(display.last_seen) || display.is_online;

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{display.name}</h3>
          {display.location && (
            <p className="text-sm text-zinc-400">{display.location}</p>
          )}
        </div>
        <span
          className={
            online
              ? "badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "badge bg-zinc-700/30 text-zinc-400 border border-zinc-600/30"
          }
        >
          <span
            className={
              "inline-block w-1.5 h-1.5 rounded-full mr-1.5 " +
              (online ? "bg-emerald-400" : "bg-zinc-500")
            }
          />
          {online ? "Online" : "Offline"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Mode" value={display.display_mode} />
        <Field label="Rotation" value={`${display.rotation_seconds}s`} />
        <Field label="Fit" value={display.fit_mode} />
        <Field label="Last seen" value={timeAgo(display.last_seen)} />
      </div>

      <div className="border-t border-ink-700 pt-4 text-sm">
        <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
          {display.display_mode === "single" ? "Active poster" : "Active collection"}
        </p>
        <p className="text-white font-medium truncate">
          {display.display_mode === "single"
            ? poster?.title ?? "—"
            : collection?.name ?? "—"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Link href={`/displays/${display.id}`} className="btn-secondary">
          Settings
        </Link>
        <Link href={`/display/${display.id}`} target="_blank" className="btn-ghost">
          Open ↗
        </Link>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-white">{value}</p>
    </div>
  );
}
