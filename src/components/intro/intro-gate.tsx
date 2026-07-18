"use client";

import { useCallback, useEffect, useState } from "react";
import { SiteIntro } from "@/components/intro/site-intro";

const INTRO_STORAGE_KEY = "geardrop_intro_seen_v1";

type GateState = {
  persistSeen: boolean;
  visible: boolean;
};

export function IntroGate() {
  const [state, setState] = useState<GateState>({ persistSeen: true, visible: false });

  useEffect(() => {
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    const reveal = (persistSeen: boolean) => {
      revealTimer = setTimeout(() => setState({ persistSeen, visible: true }), 0);
    };
    const replayInDevelopment =
      process.env.NODE_ENV === "development" &&
      new URLSearchParams(window.location.search).get("replayIntro") === "1";
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    if (reducedMotion) {
      if (!replayInDevelopment) {
        try {
          window.localStorage.setItem(INTRO_STORAGE_KEY, "true");
        } catch {
          // Storage can be unavailable in private or policy-restricted contexts.
        }
      }
      return;
    }

    if (replayInDevelopment) {
      reveal(false);
    } else {
      try {
        if (window.localStorage.getItem(INTRO_STORAGE_KEY) === null) reveal(true);
      } catch {
        // Fail open: never put an unavailable browser API between a visitor and the site.
      }
    }

    return () => {
      if (revealTimer !== null) clearTimeout(revealTimer);
    };
  }, []);

  const markSeen = useCallback(() => {
    if (!state.persistSeen) return;
    try {
      window.localStorage.setItem(INTRO_STORAGE_KEY, "true");
    } catch {
      // Dismissal must remain reliable even when persistence is unavailable.
    }
  }, [state.persistSeen]);

  const removeIntro = useCallback(() => {
    setState((current) => ({ ...current, visible: false }));
  }, []);

  if (!state.visible) return null;

  return <SiteIntro onSeen={markSeen} onExited={removeIntro} />;
}
