"use client";

import { useEffect, useRef, useState } from "react";
import { Display, Poster } from "@/types";

type Props = {
  poster: Poster | null;
  display: Display;
};

/**
 * Renders the current poster full-screen. Two stacked image layers
 * crossfade or slide between transitions; "none" swaps instantly.
 */
export default function FullScreenPosterDisplay({ poster, display }: Props) {
  const [layers, setLayers] = useState<[Poster | null, Poster | null]>([poster, null]);
  const [active, setActive] = useState<0 | 1>(0);
  const lastIdRef = useRef<string | null>(poster?.id ?? null);

  useEffect(() => {
    const newId = poster?.id ?? null;
    if (newId === lastIdRef.current) return;
    lastIdRef.current = newId;

    // Load the new poster into the inactive layer, then flip.
    const next: 0 | 1 = active === 0 ? 1 : 0;
    setLayers((prev) => {
      const arr: [Poster | null, Poster | null] = [...prev] as [Poster | null, Poster | null];
      arr[next] = poster;
      return arr;
    });

    // For "none" transition, swap synchronously.
    if (display.transition_style === "none") {
      setActive(next);
      return;
    }

    // Wait a frame so the new image starts decoding, then flip layer.
    const id = requestAnimationFrame(() => {
      setTimeout(() => setActive(next), 30);
    });
    return () => cancelAnimationFrame(id);
  }, [poster, active, display.transition_style]);

  const blurMode = display.fit_mode === "blur";
  const fitClass = blurMode || display.fit_mode === "contain" ? "object-contain" : "object-cover";
  const transition = display.transition_style;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {[0, 1].map((idx) => {
        const p = layers[idx as 0 | 1];
        const isActive = idx === active;
        const base =
          "absolute inset-0 w-full h-full transition-all duration-700 ease-in-out";
        let style = "";
        if (transition === "fade") {
          style = isActive ? "opacity-100" : "opacity-0";
        } else if (transition === "slide") {
          style = isActive
            ? "opacity-100 translate-x-0"
            : "opacity-0 -translate-x-8";
        } else {
          style = isActive ? "opacity-100" : "opacity-0";
        }
        return (
          <div key={idx} className={`${base} ${style}`} aria-hidden={!isActive}>
            {p ? (
              <>
                {blurMode && (
                  // Ambient blurred background: same image, dimmed + heavily blurred,
                  // scaled past the edges so blur clipping isn't visible.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl brightness-50"
                    draggable={false}
                  />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.image_url}
                  alt=""
                  className={`absolute inset-0 w-full h-full ${fitClass}`}
                  draggable={false}
                />
              </>
            ) : null}
          </div>
        );
      })}

      {display.show_overlay && poster && (
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-white pointer-events-none">
          <p className="text-2xl sm:text-4xl font-semibold tracking-tight drop-shadow-lg">
            {poster.title}
          </p>
          <p className="text-sm sm:text-lg text-zinc-200 mt-1 sm:mt-2 flex gap-3">
            {poster.year && <span>{poster.year}</span>}
            {poster.rating && <span>· {poster.rating}</span>}
            {poster.runtime && <span>· {poster.runtime}</span>}
            {poster.genre && <span>· {poster.genre}</span>}
          </p>
        </div>
      )}
    </div>
  );
}
