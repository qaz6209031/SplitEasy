# App Store listing draft

- **Name:** Tabmates: Group Trip Expenses
- **Subtitle** (≤30): `Split trip costs, settle once` (29)
- **Category:** Finance (secondary: Travel)
- **Age rating:** 4+ (no objectionable content; no unrestricted web access)
- **Keywords** (≤100): `split,bill,expense,roommate,trip,group,travel,owe,settle,iou,share,cost,dinner,friends,tab` (90). Don't use competitor names like Splitwise: that risks rejection under 2.3.7

## Promotional text (≤170)
Track shared costs during the trip, then settle up once at the end with the fewest payments.

## Description
Tabmates makes sharing costs with friends, roommates and travel buddies simple.

👥 **Groups**
Create a group for a trip, a house or a dinner and invite friends with a 6-character code.

💸 **Quick expenses**
Add who paid and who shared it; Tabmates splits it equally to the cent. Edit or delete anything later.

🔁 **Settle up once, at the end**
When you're done, tap Settle Up. Expenses lock, and Tabmates simplifies everyone's debts into the smallest number of payments. Mark each as paid and the group shows Settled.

🔒 **Private by design**
Sign in with Apple or Google. No ads, no tracking. Delete your account any time from Settings.

Amounts are in US dollars.

## Screenshots
`screenshots/` holds 6.9" iPhone shots (1320×2868, iPhone 18 Pro Max simulator, dark appearance). `screenshots/6.3-inch/` holds the same shots scaled to 1206×2622, which App Store Connect asks for first.

`screenshots/listing/` (and `listing/6.3-inch/`) holds the images actually uploaded to the store: the same shots inside the illustrated frames (headline, phone, characters). They were made by compositing the raw shots into the live listing images, keeping the characters in front. Upload them in order:
1. `01-groups.png`: groups with balances; the settled group's stamps are cancelled
2. `02-expenses.png`: a trip's expenses
3. `03-add-expense.png`: adding an expense on the calculator keypad (12.5 + 5.5 = $18.00), split equally
4. `04-balances.png`: who owes whom
5. `05-settle-up.png`: settling up with the fewest payments
6. `06-settled.png`: all settled up, with the Settled postmark

### iPad and iPhone Duo (reference, not for upload)
Raw simulator shots from testing the adaptive layout (dev account data, dark appearance, no frames). They show what the screens look like; store images still need the illustrated frames.

- `ipad-13-inch/`: iPad Pro 13-inch (M5), 2064×2752 portrait and 2752×2064 landscape, which is the 13" iPad size App Store Connect asks for. From 800pt wide the groups list and the open group sit side by side; the group's content is capped at 720pt.
- `iphone-duo/`: iPhone Duo folded (cover display, 1398×2034) and open (inner display, 2853×2007 wide, plus rotated "tall"). Open shows the same two panes.

Retaken 2026-11-03 from `main` at 8806680 (aligned group tabs and Add Expense button, Rate Tabmates in Settings). `01-sign-in-portrait.png` is from the earlier round; the sign-in screen hasn't changed since. The Settings shots show 1.0.1 (2) because they come from a local debug build.
