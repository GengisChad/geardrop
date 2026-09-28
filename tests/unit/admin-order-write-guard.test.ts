import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ResendModule from "@/lib/email/resend";
import type * as StripeApiModule from "@/lib/payments/stripe-api";
import { fakeSettingsClient, type SettingsRead } from "../support/site-settings-client";

const serverClientMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const stripeClientMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: serverClientMock }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000001" })),
  requireStaffRole: vi.fn(async () => undefined),
}));
vi.mock("@/lib/email/resend", async (importOriginal) => ({
  ...(await importOriginal<typeof ResendModule>()),
  sendEmail: sendEmailMock,
}));
vi.mock("@/lib/payments/stripe-api", async (importOriginal) => ({
  ...(await importOriginal<typeof StripeApiModule>()),
  createStripeClient: stripeClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const actions = await import("@/app/admin/actions/orders");

function form(fields: Readonly<Record<string, string>>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const everyAction = [
  ["transitionOrderAction", { orderId: "1", toStatus: "confirmed", note: "" }],
  ["cancelOrderAction", { orderId: "1", note: "Richiesta del cliente", confirmed: "on" }],
  ["setOrderTrackingAction", { orderId: "1", carrier: "GLS", code: "ABC123", url: "" }],
  ["addOrderNoteAction", { orderId: "1", note: "Nota interna" }],
  ["messageCustomerAction", { orderId: "1", subject: "Il tuo ordine", message: "Messaggio di prova per il cliente", confirmed: "on" }],
  ["prepareOrderRefundAction", { orderId: "1", amount: "5,00", reason: "Richiesta cliente" }],
  ["shipOrderAction", { orderId: "1", carrierId: "gls", code: "ABC123", url: "", notify: "on" }],
  [
    "refundStripeAction",
    { orderId: "1", amount: "5,00", reason: "Richiesta cliente", confirmed: "on", attempt: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607" },
  ],
  ["notifyShippedOrdersAction", {}],
] as const;

function useSettings(read: SettingsRead) {
  const fake = fakeSettingsClient(read, { rpc: rpcMock });
  serverClientMock.mockResolvedValue(fake.client);
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: null, error: null });
});

describe("admin order actions under the commerce write guard", () => {
  it.each(everyAction)("%s stops before any database, email or Stripe effect during maintenance", async (name, fields) => {
    const { from } = useSettings({ row: { maintenance_mode: true, accept_orders: true } });

    const result = await actions[name]({ ok: true, message: "" }, form(fields));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/manutenzione/i);
    expect(from).toHaveBeenCalledTimes(1);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(stripeClientMock).not.toHaveBeenCalled();
  });

  it.each(everyAction)("%s refuses when the shop switches cannot be read", async (name, fields) => {
    useSettings({ reject: new Error("AbortError: signal timed out") });

    const result = await actions[name]({ ok: true, message: "" }, form(fields));

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/verificare lo stato del negozio/i) });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(stripeClientMock).not.toHaveBeenCalled();
  });

  it("keeps order management working when only new order intake is closed", async () => {
    useSettings({ row: { maintenance_mode: false, accept_orders: false } });

    const result = await actions.transitionOrderAction({ ok: true, message: "" }, form({ orderId: "1", toStatus: "confirmed", note: "" }));

    expect(result).toEqual({ ok: true, message: "Stato ordine aggiornato." });
    expect(rpcMock).toHaveBeenCalledWith("transition_order_status", { p_order_id: 1, p_to_status: "confirmed" });
  });
});
