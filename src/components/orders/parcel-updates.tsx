import { MapPin } from "lucide-react";
import { parcelJourney } from "@/lib/orders/customer-order-status";
import type { TrackingEvent } from "@/lib/shipping/inpost";

// The server renders in UTC and a buyer may be anywhere: times are read in Italy, as InPost's are.
const WHEN = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

/**
 * Where an InPost parcel is, in InPost's own words: the latest event with its place and time, and
 * every step of the journey one tap away. Shared by the account page and the public lookup, so it
 * holds no server code. Null events mean InPost was not asked or did not answer: nothing to say.
 */
export function ParcelUpdates({ events }: { readonly events: readonly TrackingEvent[] | null }) {
  if (!events) return null;
  const journey = parcelJourney(events);
  const latest = journey[0];

  if (!latest) {
    return (
      <p className="mt-2 text-[0.6875rem] text-grey-600">
        InPost non ha ancora registrato movimenti: li vedi qui appena il pacco entra nella sua rete.
      </p>
    );
  }

  return (
    <>
      <p className="mt-2 text-small" data-testid="parcel-latest">
        <span className={latest.readyForPickup ? "font-bold text-lime" : "font-bold text-graphite"}>{latest.label}</span>
        {latest.place ? (
          <span className="mt-0.5 flex items-start gap-1 text-[0.6875rem] text-grey-600">
            <MapPin className="mt-px size-3 shrink-0" aria-hidden="true" />
            {latest.place}
          </span>
        ) : null}
        <time dateTime={latest.at} className="block text-[0.6875rem] text-grey-600">
          {WHEN.format(new Date(latest.at))}
        </time>
      </p>

      {journey.length > 1 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[0.6875rem] font-bold text-violet-soft">
            Tutti i passaggi ({journey.length})
          </summary>
          <ol className="mt-2 flex flex-col gap-2 border-l border-white/10 pl-3" data-testid="parcel-journey">
            {journey.map((update) => (
              <li key={`${update.code}-${update.at}`} className="text-[0.6875rem] text-grey-600">
                <span className="font-bold text-graphite">{update.label}</span>
                {update.place ? ` · ${update.place}` : ""}
                <time dateTime={update.at} className="block">
                  {WHEN.format(new Date(update.at))}
                </time>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </>
  );
}
