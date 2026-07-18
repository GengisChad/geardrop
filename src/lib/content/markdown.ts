import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em",
  "a", "br", "blockquote", "code", "pre", "hr",
];

export function renderSafeMarkdown(source: string): string {
  const rendered = marked.parse(source, { async: false, gfm: true, breaks: false }) as string;
  return sanitizeHtml(rendered, {
    allowedTags,
    allowedAttributes: { a: ["href", "title", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { a: ["http", "https", "mailto", "tel"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tagName, attributes) => {
        const external = attributes.href?.startsWith("https://") || attributes.href?.startsWith("http://");
        return {
          tagName: "a",
          attribs: external
            ? { ...attributes, target: "_blank", rel: "noopener noreferrer" }
            : attributes,
        };
      },
    },
  });
}

