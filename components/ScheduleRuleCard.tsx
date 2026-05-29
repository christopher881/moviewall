"use client";

import { Collection, Display, Poster, Schedule } from "@/types";

const DAYS = [
  { v: "mon", l: "Mon" },
  { v: "tue", l: "Tue" },
  { v: "wed", l: "Wed" },
  { v: "thu", l: "Thu" },
  { v: "fri", l: "Fri" },
  { v: "sat", l: "Sat" },
  { v: "sun", l: "Sun" }
];

export function describeSchedule(s: Schedule): string {
  const parts: string[] = [];
  if (s.schedule_type === "weekly" && s.day_of_week) {
    const days = s.day_of_week.split(",").filter(Boolean);
    const labels = days.map((d) => DAYS.find((x) => x.v === d.trim())?.l ?? d).join(", ");
    if (labels) parts.push(labels);
  }
  if (s.schedule_type === "date_range" && (s.start_date || s.end_date)) {
    parts.push(`${s.start_date ?? "—"} → ${s.end_date ?? "—"}`);
  }
  if (s.start_time || s.end_time) {
    parts.push(`${s.start_time ?? "—"} – ${s.end_time ?? "—"}`);
  }
  if (!parts.length) parts.push("Always");
  return parts.join(" · ");
}

export default function ScheduleRuleCard({
  schedule,
  display,
  collection,
  poster,
  onEdit,
  onDelete,
  onToggle
}: {
  schedule: Schedule;
  display?: Display | null;
  collection?: Collection | null;
  poster?: Poster | null;
  onEdit?: (s: Schedule) => void;
  onDelete?: (s: Schedule) => void;
  onToggle?: (s: Schedule) => void;
}) {
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{schedule.name}</h3>
          <p className="text-xs text-zinc-400 truncate">{describeSchedule(schedule)}</p>
        </div>
        {schedule.active ? (
          <span className="badge-active">On</span>
        ) : (
          <span className="badge-inactive">Off</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Field label="Display" value={display?.name ?? "—"} />
        <Field
          label={collection ? "Collection" : "Poster"}
          value={collection?.name ?? poster?.title ?? "—"}
        />
      </div>

      <div className="flex flex-wrap gap-1 pt-1">
        {onToggle && (
          <button onClick={() => onToggle(schedule)} className="btn-ghost text-xs px-2 py-1">
            {schedule.active ? "Disable" : "Enable"}
          </button>
        )}
        {onEdit && (
          <button onClick={() => onEdit(schedule)} className="btn-ghost text-xs px-2 py-1">
            Edit
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(schedule)}
            className="btn-ghost text-xs px-2 py-1 text-red-400 ml-auto"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-sm truncate">{value}</p>
    </div>
  );
}

export const DAY_OPTIONS = DAYS;
