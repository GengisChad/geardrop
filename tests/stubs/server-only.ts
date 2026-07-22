// Stand-in for the `server-only` marker package, which exists only inside the Next.js
// bundler. Importing it under vitest would fail to resolve; the real guarantee is
// enforced at build time and asserted by tests/unit/supabase-clients.test.ts.
export {};
