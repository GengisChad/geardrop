import { Loader } from "@/components/ui/loader";

/**
 * Search is the one route where a streaming boundary is safe: it never calls
 * `notFound()`, so the early 200 header is correct. See the note in ui/loader.tsx.
 */
export default function Loading() {
  return <Loader label="Cerco nel catalogo…" />;
}
