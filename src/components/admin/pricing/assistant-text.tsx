import { Fragment, type ReactNode } from "react";
import { DEFAULT_LINK_POLICY, linkify, parseBlocks, type Inline, type LinkPolicy } from "@/lib/ai/markdown-lite";

function inline(parts: readonly Inline[]): ReactNode {
  return parts.map((part, index) => {
    if (part.kind === "link") return <a href={part.href} key={index} rel="noreferrer noopener" target="_blank">{part.text}</a>;
    if (part.kind === "strong") return <strong key={index}>{part.text}</strong>;
    if (part.kind === "em") return <em key={index}>{part.text}</em>;
    if (part.kind === "code") return <code key={index}>{part.text}</code>;
    return <Fragment key={index}>{part.text}</Fragment>;
  });
}

/** A card line with its preview and pull request addresses clickable, and nothing else read as markdown. */
export function LinkedText({ text, links = DEFAULT_LINK_POLICY }: { readonly text: string; readonly links?: LinkPolicy }) {
  return <>{inline(linkify(text, links))}</>;
}

/**
 * An assistant answer with its bold, lists and short headings drawn as such (owner, 2026-11-18:
 * the asterisks showed as they were), and since 2026-11-24 its links to this repository, this
 * project's previews and the shop. Built from React elements only, never from HTML.
 */
export function AssistantText({ text, links = DEFAULT_LINK_POLICY }: { readonly text: string; readonly links?: LinkPolicy }) {
  return (
    <>
      {parseBlocks(text, links).map((block, index) => {
        if (block.kind === "heading") return <p key={index}><strong>{inline(block.inline)}</strong></p>;
        if (block.kind === "list") {
          const items = block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>);
          return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}
