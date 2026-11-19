"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const GLYPHS = "XKZN/#=+";
const DECODE_MS = 520;

/**
 * Scan-in (owner, 2026-11-19): a block below the fold is scanned onto the page the first time it
 * arrives, once, in place of the fade that every section shared. The styles are in globals.css;
 * this arms and fires them.
 *
 * - Only what is off screen when the page opens is armed. Whatever the first screen shows stays
 *   at rest, so nothing here can delay it.
 * - With reduced motion, in screenshot mode or without script nothing is armed: the content is
 *   simply there.
 * - Each block plays once: scrolling back never replays it.
 */
export function ScanObserver() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (document.documentElement.dataset["screenshot"] === "true") return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const block = entry.target as HTMLElement;
          observer.unobserve(block);
          block.dataset["scan"] = "in";
          const title = block.querySelector<HTMLElement>("[data-scan-text]");
          if (title) decode(title);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );

    for (const block of document.querySelectorAll<HTMLElement>("[data-scan='']")) {
      if (block.getBoundingClientRect().top < window.innerHeight * 0.92) {
        block.dataset["scan"] = "done";
      } else {
        block.dataset["scan"] = "armed";
        observer.observe(block);
      }
    }
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}

/**
 * Decodes a title: every letter starts as a random glyph and they resolve from the left. Each
 * letter keeps the width of the real one and words stay whole, so the line never moves; when it
 * is done the plain text is put back.
 */
function decode(node: HTMLElement) {
  const text = node.textContent ?? "";
  if (!text.trim()) return;

  const cells: { readonly element: HTMLElement; readonly character: string }[] = [];
  const fragment = document.createDocumentFragment();
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      fragment.append(part);
      continue;
    }
    const word = document.createElement("span");
    word.style.cssText = "display:inline-block;white-space:nowrap";
    for (const character of part) {
      const cell = document.createElement("span");
      cell.textContent = character;
      cell.style.cssText = "display:inline-block;text-align:center";
      word.append(cell);
      cells.push({ element: cell, character });
    }
    fragment.append(word);
  }
  node.replaceChildren(fragment);
  const widths = cells.map((cell) => cell.element.getBoundingClientRect().width);
  cells.forEach((cell, index) => {
    cell.element.style.width = `${widths[index]}px`;
  });

  const start = performance.now();
  let last = 0;
  const frame = (now: number) => {
    const progress = Math.min(1, (now - start) / DECODE_MS);
    if (progress === 1) {
      node.textContent = text;
      return;
    }
    if (now - last > 42) {
      last = now;
      const solved = Math.floor(progress * cells.length);
      cells.forEach((cell, index) => {
        cell.element.textContent = index < solved ? cell.character : (GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "X");
      });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
