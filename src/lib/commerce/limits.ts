/**
 * Cart limits shared by the browser store, the form schemas and the server actions.
 *
 * Kept in a module with no runtime dependencies so server code can import it without
 * dragging the client-only cart store along. The database has the final word:
 * `site_settings.max_quantity_per_line` is what `create_order` enforces, and this
 * constant only keeps the UI from offering something the backend will reject.
 */
export const MAX_QUANTITY_PER_LINE = 10;
