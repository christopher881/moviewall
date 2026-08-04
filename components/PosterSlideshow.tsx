"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Collection,
  CollectionPosterWithPoster,
  Display,
  DisplayPlaylistCache,
  Poster,
  Schedule
} from "@/types";
import { isWithinSleepWindow } from "@/lib/utils";
import FullScreenPosterDisplay from "./FullScreenPosterDisplay";

const CACHE_PREFIX = "moviewall:display:";

function readCache(displayId: string): DisplayPlaylistCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + displayId);
    return raw ? (JSON.parse(raw) as DisplayPlaylistCache) : null;
  } catch {
    return null;
  }
}
function writeCache(displayId: string, value: DisplayPlaylistCache) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_PREFIX + displayId, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

function dayKey(d: Date): string {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getDay()];
}
function withinTimeWindow(s: Schedule, now: Date): boolean {
  const toMins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  if (!s.start_time && !s.end_time) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = s.start_time ? toMins(s.start_time) : 0;
  const end = s.end_time ? toMins(s.end_time) : 24 * 60;
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
}
function scheduleMatches(s: Schedule, now: Date): boolean {
  if (!s.active) return false;
  if (s.schedule_type === "weekly") {
    if (s.day_of_week) {
      const days = s.day_of_week.split(",").map((x) => x.trim()).filter(Boolean);
      if (days.length && !days.includes(dayKey(now))) return false;
    }
    return withinTimeWindow(s, now);
  }
  if (s.schedule_type === "date_range") {
    const today = now.toISOString().slice(0, 10);
    if (s.start_date && today < s.start_date) return false;
    if (s.end_date && today > s.end_date) return false;
    return withinTimeWindow(s, now);
  }
  if (s.schedule_type === "daily_time") {
    return withinTimeWindow(s, now);
  }
  return false;
}

type Rotation = 0 | 90 | 180 | 270;

export default function PosterSlideshow({
  displayId,
  urlRotation
}: {
  displayId: string;
  /** ?rotate= override from the URL. Wins over the saved display.rotation if present. */
  urlRotation?: Rotation;
}) {
  const [mounted, setMounted] = useState(false);
  const [display, setDisplay] = useState<Display | null>(null);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // re-evaluate sleep/schedule windows every 30s

  // Hydrate from localStorage AFTER mount so SSR and first client render match.
  useEffect(() => {
    const cached = readCache(displayId);
    if (cached) {
      setDisplay(cached.display);
      setPosters(cached.posters);
    }
    setMounted(true);
  }, [displayId]);

  // Load all data needed to compute the playlist.
  const loadAll = useCallback(async () => {
    try {
      const dRes = await supabase
        .from("displays")
        .select("*")
        .eq("id", displayId)
        .maybeSingle();
      if (dRes.error) throw dRes.error;
      const d = (dRes.data as Display) ?? null;
      if (!d) {
        setError("Display not found.");
        return;
      }
      setDisplay(d);
      setError(null);

      const sRes = await supabase
        .from("schedules")
        .select("*")
        .eq("display_id", displayId);
      if (!sRes.error) setSchedules((sRes.data ?? []) as Schedule[]);

      // Determine effective collection / single poster based on mode + schedules.
      const now = new Date();
      const activeSched =
        d.display_mode === "scheduled"
          ? (sRes.data ?? []).find((s) => scheduleMatches(s as Schedule, now)) as Schedule | undefined
          : undefined;

      const effectiveCollectionId =
        activeSched?.collection_id ?? d.active_collection_id ?? null;
      const effectivePosterId = activeSched?.poster_id ?? d.active_poster_id ?? null;

      let playlist: Poster[] = [];

      if (d.display_mode === "single" || (activeSched && activeSched.poster_id)) {
        const pid = activeSched?.poster_id ?? d.active_poster_id;
        if (pid) {
          const pRes = await supabase.from("posters").select("*").eq("id", pid).maybeSingle();
          if (pRes.data) playlist = [pRes.data as Poster];
        }
      } else if (effectiveCollectionId) {
        const linkRes = await supabase
          .from("collection_posters")
          .select("*, poster:posters(*)")
          .eq("collection_id", effectiveCollectionId)
          .order("sort_order");
        if (!linkRes.error) {
          playlist = (linkRes.data as CollectionPosterWithPoster[])
            .map((cp) => cp.poster)
            .filter((p): p is Poster => !!p && p.active);
        }
      } else if (effectivePosterId) {
        const pRes = await supabase
          .from("posters")
          .select("*")
          .eq("id", effectivePosterId)
          .maybeSingle();
        if (pRes.data) playlist = [pRes.data as Poster];
      }

      setPosters(playlist);
      writeCache(displayId, { display: d, posters: playlist, savedAt: Date.now() });
      setIndex((i) => (playlist.length === 0 ? 0 : i % playlist.length));
    } catch (err) {
      // Network or auth failure: keep showing the cached playlist if we have one.
      setError((err as Error).message ?? "Connection error");
    }
  }, [displayId]);

  // Initial load + realtime subscriptions.
  useEffect(() => {
    loadAll();

    // Skip heartbeat-only updates — every minute the TV writes last_seen/is_online
    // to its own row; we shouldn't refetch the whole playlist for that.
    const HEARTBEAT_COLS = new Set(["last_seen", "is_online"]);
    const onDisplayChange = (payload: {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      const next = payload.new ?? {};
      const prev = payload.old ?? {};
      const changed = Object.keys(next).filter((k) => next[k] !== prev[k]);
      if (changed.length > 0 && changed.every((k) => HEARTBEAT_COLS.has(k))) return;
      loadAll();
    };

    const ch = supabase
      .channel(`tv-display-${displayId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "displays", filter: `id=eq.${displayId}` },
        onDisplayChange
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "collection_posters" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "collections" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "posters" }, loadAll)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedules", filter: `display_id=eq.${displayId}` },
        loadAll
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [displayId, loadAll]);

  // Periodically re-evaluate sleep/schedule windows even without DB changes.
  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      // If this is a scheduled display, also refresh playlist in case the active schedule changed.
      if (display?.display_mode === "scheduled") loadAll();
    }, 30_000);
    return () => clearInterval(t);
  }, [display?.display_mode, loadAll]);

  // Rotation timer.
  // Depend ONLY on the actual timing inputs — otherwise the 60s heartbeat updates
  // the display row, changes the object reference, and resets this interval before
  // it ever fires (which is why posters "get stuck" on the same image).
  useEffect(() => {
    if (posters.length <= 1) return;
    const seconds = Math.max(3, display?.rotation_seconds ?? 30);
    const shuffle = display?.shuffle ?? false;
    const t = setInterval(() => {
      setIndex((i) => {
        if (posters.length <= 1) return 0;
        if (shuffle) {
          // Pick a random index that isn't the current one.
          let next = Math.floor(Math.random() * posters.length);
          if (next === i) next = (next + 1) % posters.length;
          return next;
        }
        return (i + 1) % posters.length;
      });
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [display?.rotation_seconds, display?.shuffle, posters.length]);

  // Heartbeat: mark online and update last_seen every 60s.
  useEffect(() => {
    const beat = async () => {
      try {
        await supabase
          .from("displays")
          .update({ is_online: true, last_seen: new Date().toISOString() })
          .eq("id", displayId);
      } catch {
        /* offline — keep going */
      }
    };
    beat();
    const t = setInterval(beat, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [displayId]);

  // Reconnect realtime when window comes back online.
  useEffect(() => {
    const onOnline = () => loadAll();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [loadAll]);

  // URL ?rotate= wins over the saved value so you can test orientations without saving.
  const savedRotation = (display?.rotation ?? 0) as Rotation;
  const effectiveRotation: Rotation = urlRotation ?? savedRotation;
  const rotClass = `tv-rot-${effectiveRotation}`;

  // Render
  if (!mounted || !display) {
    return (
      <div className={`${rotClass} bg-black flex items-center justify-center text-zinc-500 text-sm overflow-hidden`}>
        {mounted && error ? error : "Connecting…"}
      </div>
    );
  }

  const sleeping = isWithinSleepWindow(
    display.sleep_enabled,
    display.sleep_time,
    display.wake_time,
    new Date()
  );
  // tick is read so this re-renders every 30s
  void tick;

  if (sleeping) {
    return <div className={`${rotClass} bg-black overflow-hidden`} aria-label="Sleeping" />;
  }

  if (posters.length === 0) {
    return (
      <div className={`${rotClass} bg-black flex items-center justify-center text-zinc-600 text-sm overflow-hidden`}>
        No posters to display. Set a collection or active poster in the admin.
      </div>
    );
  }

  const current = posters[index % posters.length] ?? null;
  return (
    <div className={`${rotClass} bg-black overflow-hidden`}>
      <FullScreenPosterDisplay poster={current} display={display} />
    </div>
  );
}
