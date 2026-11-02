---
version: 1
slug: "mobile-src-app"
primary_target: "mobile/src/app"
related_targets: []
---

# Tabmates app (all screens)

Scope: the whole iOS app (sign-in, name setup, groups, group detail with Expenses/Balances, expense form, new-group sheet, settings, dialogs, update banner). Visitor mode: Operate.

Audience and job: equal members of a trip/house/dinner group logging a cost right after paying, and at the end settling with the fewest payments. Constraints: native iOS navigation and controls, 44pt targets, light and dark appearance, CJK-tolerant layouts (Chinese UI planned), no invented claims. User's fail conditions: looks like a stock iOS template, looks like Splitwise, looks like a bank/accounting app.

## Direction contract

THESIS: Every member is a postage stamp and every finished payment is cancelled with a postmark. Refuses the category default of a grey list with one accent colour and the dark-fintech look (near-black, single neon accent, tracked mono labels, everything boxed in cards).

OWN-WORLD: White card ground (near-black in dark mode), ink-black type and controls, no accent tint: ink is the interactive colour. Colour lives in stamps only: each member owns one stamp colour (ultramarine, ochre, teal, rose, violet, umber) used for their perforated stamp avatar and their balance bar, never on buttons or decoration. Postmark ink blue for cancellations. SF Pro for UI text; Archivo Narrow for money; Archivo ExtraBold for display.

STORY: Members see at a glance who paid, who is out by how much (bar length), and what is left; at the end they mark payments paid and watch each one get postmarked until the group itself is cancelled "Settled".

FIRST VIEWPORT: Group screen: native-style nav (‹ Groups / name / Invite), segmented Expenses|Balances. Balances: one large personal amount, state line, member rows (stamp, name, diverging bar, signed amount on one right column), payments with postmarks. Expenses: day-grouped compact rows led by the payer's stamp. Primary action Add Expense bottom, ink fill.

FORM: Postcards and postage stamps, candidate 7 of 7 on the grounded list. Raises: scale ranks not boxes (no card containers); stamp colour is identity only; balances have length; compact rows; one right-hand money column; day headers as guide words. seed:c6c0d985b9047352

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
