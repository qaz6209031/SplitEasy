# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users
Groups of friends, roommates and travel companions who share costs. Every member is an equal participant: anyone can create a group, invite others, add or edit expenses and start Settle Up. There is no designated organizer or treasurer role, so no screen should assume one person runs the group.

Typical situations: a trip (the canonical case in store copy and screenshots), a shared house, a dinner. Members are often on their phones mid-activity, entering an expense right after paying.

## Product Purpose
Track shared costs while something is happening, then settle everyone up with the fewest payments. Success is a group that ends at "Settled" with nobody doing arithmetic or chasing each other for odd amounts.

## Positioning
Lightweight, free and ad-free. No ads, no tracking, no paywall, no upsell. Tabmates competes by being the simple, honest option, not by feature count. New capability has to justify itself against that.

## Operating Context
- **Group lifecycle:** active → settling → settled. Settle Up locks expenses (enforced in Postgres) and shows simplified debts; each payment is marked paid; the last one marks the group settled. Reopen returns it to active.
- **Joining:** members join with a 6-character invite code (Invite button, or + → Join with Code).
- **Sign-in:** Apple or Google only. Email sign-up is blocked except Debug-only dev accounts.
- **Updates:** over-the-air via EAS Update; a "new version is ready, Restart" banner appears when one is downloaded.
- **Account deletion:** Settings → Delete Account; the user's past expenses remain in groups as "Deleted user" so balances still add up.

## Capabilities and Constraints
- **Splitting:** equally, by exact amounts, by percentages or by shares. All money is integer cents; the preview always matches what is saved.
- **Debt simplification:** greedy largest-debtor/largest-creditor matching, at most N−1 payments.
- **Platform:** iOS only on the App Store, iPhone only (no tablet). The Expo codebase is cross-platform, but an Android release is not currently planned.
- **Currency:** USD only today. **Multi-currency is planned** (foreign trips need it); exchange-rate handling is undecided.
- **Language:** English UI today. **Localization is planned**, starting with Chinese; which variants and how is undecided.
- **Stack:** Expo SDK 57, Expo Router, TypeScript; Supabase backend (RLS, RPCs, one Edge Function).
- **Terminology:** Group, Expense, Balances, Settle Up, Mark as Paid, Settled, Reopen group, Invite code, "you are owed" / "you owe", "get back" / "owes".

## Brand Commitments
- **Name:** Tabmates (formerly SplitEasy; the bundle ID, URL scheme and Supabase project still use `spliteasy`).
- **App Store:** subtitle "Split trip costs, settle once"; category Finance, secondary Travel. Never mention competitor names such as Splitwise in store copy (App Review 2.3.7).
- **Privacy promise:** no ads, no tracking, account deletion any time. This is a product commitment, not just a policy page.
- **Voice (inferred from existing copy, not explicitly confirmed):** plain, short, direct sentences that explain what will happen, e.g. "Done adding expenses? Settle Up locks the group and shows the fewest payments needed for everyone to pay each other back."

## Evidence on Hand
- App Store screenshots: `docs/app-store/screenshots/` (6.9") and `docs/app-store/screenshots/6.3-inch/`, using demo data (Tokyo Trip, Roommates, Ski Weekend; Alice, Bob).
- Listing, privacy label and review notes drafts: `docs/app-store/`.
- Public pages: privacy policy and support at https://kaichin.dev/SplitEasy/.
- **Absent:** no user counts, testimonials, reviews, ratings or press. Do not fabricate any.
- **Stale:** the store listing and README still say expenses are "split equally"; the app now supports four split methods.

## Product Principles
1. **Every member is equal.** Any action one person can take, every member can take; no hidden admin role.
2. **Money is exact.** Cents add up, previews match saved values, and the app explains where leftover cents go rather than hiding them.
3. **Lightweight beats complete.** Free, no ads, no tracking. Prefer fewer, clearer features over parity with bigger competitors.
4. **Say what will happen before it happens.** Locking, settling, reopening and deleting are explained in plain words at the moment of action.
5. **Built to go global.** Multi-currency and Chinese localization are coming; new work should not hard-code USD formatting or English-length strings.

## Accessibility & Inclusion
- Every tap target is at least 44×44 pt (existing commitment in `mobile/src/components/theme.ts`).
- With localization planned, layouts must tolerate CJK text and longer or shorter strings without truncating amounts or names.
