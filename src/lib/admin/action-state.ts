export type AdminActionResult<T> =
  | { readonly ok: true; readonly message: string; readonly data: T }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
    };
