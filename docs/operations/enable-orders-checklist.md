# Mandatory order-enablement checklist

`site_settings.accept_orders` must remain false until an owner has recorded and reviewed every item below. Full Admin espone l'azione owner-only `set_order_acceptance()`, ma il database la rifiuta finché la checklist live non è completa e la conferma testuale non è esatta.

- [ ] Exactly two initial owners were bootstrapped and non-staff Auth users have no staff row.
- [ ] Production URL, email/password confirmation, redirects, SMTP, secrets, and key separation were reviewed.
- [ ] Every sellable SKU has verified real stock loaded through the transactional inventory function.
- [ ] Zero-stock products resolve to `esaurito` unless a reviewed explicit override exists.
- [ ] Every `preorder` override has a positive reviewed allocation; every `incoming` product remains non-purchasable.
- [ ] Active shipping methods and thresholds were verified.
- [ ] Coupon dates, limits, locking, and concurrent last-redemption behavior were verified.
- [ ] Anonymous catalogue RLS and customer/staff order isolation tests pass.
- [ ] Guest and authenticated checkout smoke tests pass while using database-authoritative totals.
- [ ] Overselling, idempotency, partial-order rollback, cancellation, and restock concurrency tests pass.
- [ ] Supabase security and performance advisors have no unresolved high-severity findings introduced by this work.
- [ ] Backup and recovery readiness was confirmed.
- [ ] The admin UI displays the persistent “Ordini disabilitati” banner before activation.

Abilitare gli ordini resta un'operazione owner separata dal rollout applicativo. Completare la documentazione da sola non deve mai cambiare `accept_orders`.
