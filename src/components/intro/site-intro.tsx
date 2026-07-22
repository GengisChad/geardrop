"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/components/intro/site-intro.module.css";

const EXIT_DURATION_MS = 420;
const SAFETY_TIMEOUT_MS = 12_000;

type SiteIntroProps = {
  onExited: () => void;
  onSeen: () => void;
};

export function SiteIntro({ onExited, onSeen }: SiteIntroProps) {
  const skipButtonRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);
  const [exiting, setExiting] = useState(false);

  const finish = useCallback(
    (animate: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onSeen();

      if (!animate) {
        onExited();
        return;
      }

      setExiting(true);
      exitTimerRef.current = setTimeout(onExited, EXIT_DURATION_MS);
    },
    [onExited, onSeen],
  );

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        finish(true);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        skipButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    const safetyTimer = setTimeout(() => finish(false), SAFETY_TIMEOUT_MS);
    const playAttempt = videoRef.current?.play();
    playAttempt?.catch(() => finish(false));

    return () => {
      clearTimeout(safetyTimer);
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [finish]);

  return (
    <section
      aria-label="Intro GEAR//DROP"
      aria-modal="true"
      className={`${styles.overlay} ${exiting ? styles.exiting : ""}`}
      data-testid="site-intro"
      role="dialog"
    >
      <video
        aria-hidden="true"
        autoPlay
        className={styles.video}
        muted
        onEnded={() => finish(true)}
        onError={() => finish(false)}
        playsInline
        preload="auto"
        ref={videoRef}
        src="/video/geardrop-intro-desktop.mp4"
        tabIndex={-1}
      />
      <button
        aria-label="Salta intro e apri il sito"
        autoFocus
        className={styles.skipButton}
        onClick={() => finish(true)}
        ref={skipButtonRef}
        type="button"
      >
        SALTA INTRO
      </button>
    </section>
  );
}
