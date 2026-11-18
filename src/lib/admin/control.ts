/**
 * "Controllo" and "Clienti" (owner, 2026-11-18): how fast orders leave, what went wrong on the
 * way, and who buys. Everything is read from the orders themselves: a missed email, a stuck
 * order or a refund left half-way leave their mark on the order row even when the error itself
 * only reached the server log.
 */

export type ControlOrder = {
  readonly id: number;
  readonly orderNumber: string;
  readonly email: string;
  readonly name: string | null;
  readonly status: "pending" | "confirmed" | "processing" | "shipped" | "completed" | "cancelled";
  readonly paymentStatus: "pending" | "authorized" | "paid" | "failed" | "refunded";
  readonly totalCents: number;
  readonly refundedCents: number;
  readonly createdAt: string;
  readonly shippedAt: string | null;
  readonly deliveredAt: string | null;
  readonly ownerNotifiedAt: string | null;
  readonly shippingNotifiedAt: string | null;
  readonly deliveryNotifiedAt: string | null;
  readonly refundPreparedAt: string | null;
  readonly refundAmountCents: number | null;
  readonly trackingCode: string | null;
  /** "InPost" closes itself when the parcel is collected; other carriers stay "shipped" until marked by hand. */
  readonly trackingCarrier: string | null;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const paidLike = (order: ControlOrder) => order.paymentStatus === "paid" || order.paymentStatus === "refunded";

export type FulfilmentKpis = {
  readonly paidOrders: number;
  readonly shippedOrders: number;
  /** Hours from the order to the parcel leaving, median over the orders shipped in the window. */
  readonly medianHoursToShip: number | null;
  /** Share (0-1) of shipped orders that left within 48 hours. */
  readonly shippedWithin48h: number | null;
  /** Days from leaving to delivery, median over the orders delivered in the window. */
  readonly medianDaysToDeliver: number | null;
  readonly waiting: number;
  readonly oldestWaitingHours: number | null;
};

/** The last `days` days of orders: how many, how fast they leave, how fast they arrive. */
export function fulfilmentKpis(orders: readonly ControlOrder[], now: Date, days = 30): FulfilmentKpis {
  const since = now.getTime() - days * DAY;
  const recent = orders.filter((order) => paidLike(order) && Date.parse(order.createdAt) >= since && order.status !== "cancelled");
  const shipped = recent.filter((order) => order.shippedAt);
  const toShip = shipped.map((order) => (Date.parse(order.shippedAt!) - Date.parse(order.createdAt)) / HOUR);
  const delivered = recent.filter((order) => order.shippedAt && order.deliveredAt);
  const toDeliver = delivered.map((order) => (Date.parse(order.deliveredAt!) - Date.parse(order.shippedAt!)) / DAY);
  const waiting = orders.filter((order) => order.paymentStatus === "paid" && (order.status === "confirmed" || order.status === "processing"));
  const oldest = waiting.reduce<number | null>((max, order) => {
    const hours = (now.getTime() - Date.parse(order.createdAt)) / HOUR;
    return max === null || hours > max ? hours : max;
  }, null);
  return {
    paidOrders: recent.length,
    shippedOrders: shipped.length,
    medianHoursToShip: median(toShip),
    shippedWithin48h: toShip.length ? toShip.filter((hours) => hours <= 48).length / toShip.length : null,
    medianDaysToDeliver: median(toDeliver),
    waiting: waiting.length,
    oldestWaitingHours: oldest,
  };
}

export type Anomaly = {
  readonly kind: "owner-email" | "shipping-email" | "delivery-email" | "stuck" | "in-transit" | "refund" | "payment";
  readonly orderId: number;
  readonly orderNumber: string;
  readonly message: string;
  readonly since: string;
};

/** Emails are checked on recent orders only: the oldest ones predate the "sent" stamps. */
export const EMAIL_CHECK_DAYS = 30;

/** What did not go as it should, oldest first within each kind. */
export function orderAnomalies(orders: readonly ControlOrder[], now: Date): readonly Anomaly[] {
  const age = (iso: string) => now.getTime() - Date.parse(iso);
  const anomalies: Anomaly[] = [];
  for (const order of orders) {
    const base = { orderId: order.id, orderNumber: order.orderNumber };
    const recent = age(order.createdAt) <= EMAIL_CHECK_DAYS * DAY;
    if (recent && order.paymentStatus === "paid" && !order.ownerNotifiedAt && age(order.createdAt) > HOUR) {
      anomalies.push({ ...base, kind: "owner-email", since: order.createdAt, message: "Pagato, ma l'email del nuovo ordine non ti è arrivata." });
    }
    if (recent && (order.status === "shipped" || order.status === "completed") && order.shippedAt && !order.shippingNotifiedAt) {
      anomalies.push({ ...base, kind: "shipping-email", since: order.shippedAt, message: "Spedito, ma il cliente non ha ricevuto l'email con il tracking." });
    }
    if (recent && order.status === "completed" && order.deliveredAt && !order.deliveryNotifiedAt) {
      anomalies.push({ ...base, kind: "delivery-email", since: order.deliveredAt, message: "Consegnato, ma l'email di consegna non è partita." });
    }
    if (order.paymentStatus === "paid" && (order.status === "confirmed" || order.status === "processing") && age(order.createdAt) > 3 * DAY) {
      anomalies.push({ ...base, kind: "stuck", since: order.createdAt, message: "Pagato da più di 3 giorni e non ancora spedito." });
    }
    // Only InPost parcels close themselves on collection (daily tracking cron); a Poste parcel stays
    // "shipped" until marked by hand, so a long one says nothing about the parcel.
    if (order.status === "shipped" && order.trackingCarrier === "InPost" && order.shippedAt && age(order.shippedAt) > 10 * DAY) {
      anomalies.push({ ...base, kind: "in-transit", since: order.shippedAt, message: "InPost: in viaggio da più di 10 giorni e mai ritirato. Controlla il tracking." });
    }
    if (order.refundPreparedAt && order.refundAmountCents !== null && order.refundedCents < order.refundAmountCents) {
      anomalies.push({ ...base, kind: "refund", since: order.refundPreparedAt, message: "Rimborso preparato ma non ancora arrivato da Stripe." });
    }
    if (order.paymentStatus === "authorized" && age(order.createdAt) > DAY) {
      anomalies.push({ ...base, kind: "payment", since: order.createdAt, message: "Pagamento autorizzato ma mai incassato." });
    }
  }
  const rank: Record<Anomaly["kind"], number> = { "owner-email": 0, stuck: 1, "shipping-email": 2, refund: 3, payment: 4, "in-transit": 5, "delivery-email": 6 };
  return anomalies.sort((a, b) => rank[a.kind] - rank[b.kind] || a.since.localeCompare(b.since));
}

export type Customer = {
  readonly email: string;
  readonly name: string | null;
  readonly orders: number;
  readonly spentCents: number;
  readonly firstOrderAt: string;
  readonly lastOrderAt: string;
  readonly lastOrderId: number;
};

/** One row per buyer (by email, any case): paid orders, what they spent net of refunds, when. */
export function customersFrom(orders: readonly ControlOrder[]): readonly Customer[] {
  const byEmail = new Map<string, Customer>();
  for (const order of orders) {
    if (!paidLike(order)) continue;
    const email = order.email.trim().toLowerCase();
    if (!email) continue;
    const current = byEmail.get(email);
    const later = !current || order.createdAt > current.lastOrderAt;
    byEmail.set(email, {
      email,
      name: later ? (order.name ?? current?.name ?? null) : (current.name ?? order.name),
      orders: (current?.orders ?? 0) + 1,
      spentCents: (current?.spentCents ?? 0) + order.totalCents - order.refundedCents,
      firstOrderAt: !current || order.createdAt < current.firstOrderAt ? order.createdAt : current.firstOrderAt,
      lastOrderAt: later ? order.createdAt : current.lastOrderAt,
      lastOrderId: later ? order.id : current.lastOrderId,
    });
  }
  return [...byEmail.values()].sort((a, b) => b.spentCents - a.spentCents || b.lastOrderAt.localeCompare(a.lastOrderAt));
}
