import { Fragment, type ReactNode } from "react";
import { parseBlocks, type Inline } from "@/lib/ai/markdown-lite";

function inline(parts: readonly Inline[]): ReactNode {
  return parts.map((part, index) => {
    if (part.kind === "strong") return <strong key={index}>{part.text}</strong>;
    if (part.kind === "em") return <em key={index}>{part.text}</em>;
    if (part.kind === "code") return <code key={index}>{part.text}</code>;
    return <Fragment key={index}>{part.text}</Fragment>;
  });
}

/**
 * An assistant answer with its bold, lists and short headings drawn as such (owner, 2026-11-18:
 * the asterisks showed as they were). Built from React elements only, never from HTML.
 */
export function AssistantText({ text }: { readonly text: string }) {
  return (
    <>
      {parseBlocks(text).map((block, index) => {
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
