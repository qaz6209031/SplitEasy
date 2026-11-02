---
name: Tabmates
description: Split trip costs, settle once. Every member is a postage stamp; every finished payment is cancelled with a postmark.
colors:
  card-white: "#FFFFFF"
  card-white-dark: "#0E0F12"
  surface: "#F4F5F7"
  surface-dark: "#18191D"
  fill: "#ECEDF0"
  fill-dark: "#25272C"
  rule: "#E6E7EB"
  rule-dark: "#27292E"
  strong-rule: "#C9CBD1"
  strong-rule-dark: "#3A3D44"
  ink: "#16181D"
  ink-dark: "#F1F2F4"
  ink-2: "#5E626C"
  ink-2-dark: "#A3A7B0"
  ink-3: "#8E929B"
  ink-3-dark: "#70747D"
  on-ink: "#FFFFFF"
  on-ink-dark: "#0E0F12"
  pos: "#14824F"
  pos-dark: "#4CC38A"
  neg: "#B4372A"
  neg-dark: "#F0806F"
  warn: "#9A6200"
  warn-dark: "#E7B34A"
  warn-tint: "#FFF5DC"
  warn-tint-dark: "#272012"
  danger: "#C8302F"
  danger-dark: "#FF6B66"
  danger-tint: "#FDEDEC"
  danger-tint-dark: "#2A1415"
  cancel-blue: "#34408A"
  cancel-blue-dark: "#9DA8F2"
  stamp-ultramarine: "#2B4BD8"
  stamp-ochre: "#9C6B00"
  stamp-teal: "#0F7A89"
  stamp-rose: "#B8306A"
  stamp-violet: "#7A3FC4"
  stamp-umber: "#8A5A2B"
  scrim: "rgba(0,0,0,0.4)"
typography:
  display:
    fontFamily: "Archivo ExtraBold (Archivo_800ExtraBold)"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: "40px"
    letterSpacing: "-0.8px"
  title:
    fontFamily: "SF Pro (system font, no fontFamily set)"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: "28px"
    letterSpacing: "-0.3px"
  section:
    fontFamily: "SF Pro (system font, no fontFamily set)"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "25px"
    letterSpacing: "-0.2px"
  headline:
    fontFamily: "SF Pro (system font, no fontFamily set)"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "22px"
  body:
    fontFamily: "SF Pro (system font, no fontFamily set)"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "22px"
  callout:
    fontFamily: "SF Pro (system font, no fontFamily set)"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "21px"
  subhead:
    fontFamily: "SF Pro (system font, no fontFamily set)"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "20px"
  footnote:
    fontFamily: "SF Pro (system font, no fontFamily set)"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  amount-hero:
    fontFamily: "Archivo Narrow Bold (ArchivoNarrow_700Bold)"
    fontSize: "56px"
    fontWeight: 700
    lineHeight: "62px"
    letterSpacing: "-1px"
    fontFeature: "tnum"
  amount:
    fontFamily: "Archivo Narrow SemiBold (ArchivoNarrow_600SemiBold)"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: "24px"
    fontFeature: "tnum"
  amount-sm:
    fontFamily: "Archivo Narrow SemiBold (ArchivoNarrow_600SemiBold)"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "20px"
    fontFeature: "tnum"
rounded:
  field: "10px"
  group: "12px"
  button: "14px"
  sheet: "16px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  s: "12px"
  m: "16px"
  l: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.headline}"
    rounded: "{rounded.button}"
    padding: "0 20px"
    height: "52px"
  button-primary-disabled:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-3}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0 20px"
    height: "52px"
  button-small:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#FFFFFF"
    rounded: "{rounded.button}"
    height: "52px"
  text-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
    height: "48px"
  list-row:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "10px 16px"
    height: "52px"
  list-row-pressed:
    backgroundColor: "{colors.fill}"
  inset-group:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.group}"
  segmented-control:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-2}"
    rounded: "9px"
    padding: "2px"
  segmented-control-selected:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "7px"
    height: "32px"
  dialog:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "22px 20px 18px"
    width: "300px"
  stamp-md:
    textColor: "#FFFFFF"
    width: "30px"
    height: "36px"
---

# Design System: Tabmates

## Overview

**Creative North Star: "The Postmark"**

Every member of a group is a postage stamp, and every finished payment is cancelled with a postmark. The app is a white card (near-black in dark mode) on which ink-black type and controls do all the work; the only colour comes from two places: the stamps that identify people, and the blue-violet postmark ink that marks something done. The story the system tells is the life of a group: stamps gather, balances show their length, payments get cancelled one by one, until the group itself is postmarked "Settled".

The world refuses the category default of a grey list with one accent colour and the dark-fintech look (near-black, single neon accent, tracked mono labels, everything boxed in cards). Hierarchy comes from scale, not boxes: one large ink amount per screen, compact rows on the page ground with inset hairlines, one right-hand money column. It is a native iOS app first: native-shaped navigation bar, segmented control, page sheets, SF Pro with Dynamic Type, every colour a light/dark pair that follows the system appearance.

**Key Characteristics:**
- Ink is the interactive colour; there is no accent tint.
- Stamp colour is identity only, assigned per person.
- No card containers: plain lists with inset hairlines; inset grouped lists only in Settings.
- One large Archivo Narrow amount per screen; all money in tabular figures on a single right column.
- The postmark is the system's only celebratory device, and it lands with a press-down.

## Colors

A white card and ink, with colour reserved for identity (stamps) and state (gain, loss, warning, danger, cancellation).

Every colour in `theme.ts` is a `DynamicColorIOS` light/dark pair; the `-dark` tokens above are the dark halves of the same token, not separate roles. Where a plain string is required (SVG fills), resolve the pair with `useResolve()` rather than hard-coding the light value.

### Primary
- **Letterpress Ink** (`ink`): body text, titles, the primary button fill, checkbox fill, focused field border, text-selection colour, nav bar actions. It is the one interactive colour.

### Secondary
- **Postmark Blue** (`cancel-blue`): cancellation ink only. The Postmark component, the "Settled" status word. Never a button, link or decoration.

### Tertiary: the stamp set
- **Ultramarine, Ochre, Teal, Rose, Violet, Umber** (`stamp-*`): each holds 4.5:1 against a white initial. A person's stamp colour appears on their stamp avatar and their balance bar and nowhere else. Colours are assigned by `assignStampColors`: the member id hashes to a colour so a person keeps the same stamp across groups, and on a clash within one group the later joiner takes the next free colour. Stamp colours are deliberately not appearance pairs: a printed stamp is the same colour in light and dark.

### State
- **Gain Green** (`pos`) and **Debt Red** (`neg`): signed amounts ("you're owed", "+$43.20" / "you owe", "−$43.20").
- **Settling Amber** (`warn`, with `warn-tint` ground): the "Settling up" dot and the settling notice.
- **Danger Red** (`danger`, with `danger-tint` ground): destructive buttons, field errors, the error note, swipe-to-delete.

### Neutral
- **Card White** (`card-white`): the page ground of every screen, the sticky bottom bar, dialogs.
- **Grouped Grey** (`surface`): text fields, inset grouped lists, sheets.
- **Track Grey** (`fill`): segmented-control track, pressed rows, disabled buttons.
- **Hairline** (`rule`) and **Strong Hairline** (`strong-rule`): list separators and section rules use `strong-rule` at hairline width; checkbox outlines and the balance-bar axis use it too.
- **Ink 2** (`ink-2`): secondary text, captions, day labels, field labels, paid rows faded back. **Ink 3** (`ink-3`): placeholders, disabled text, glyphs that sit behind content.

### Named Rules
**The Ink Is The Accent Rule.** Every control is ink on white or white on ink. No coloured buttons, no tinted links; if something needs to be tapped, it is ink.

**The Stamp Is Identity Rule.** A stamp colour belongs to one person in a group. It may fill their stamp and their balance bar; it never decorates a button, header, chart or background.

## Typography

**Display Font:** Archivo ExtraBold (Archivo SemiBold for medium display)
**Body Font:** SF Pro, the system font (no `fontFamily` set)
**Money Font:** Archivo Narrow SemiBold / Bold, tabular figures

**Character:** SF Pro carries every word of UI so it follows Dynamic Type and falls through to the system CJK faces when Chinese localization lands. Archivo Narrow gives money its own condensed, printed voice; Archivo ExtraBold is reserved for display moments and the postmark's lettering.

### Hierarchy
- **Display** (Archivo 800, 34/40, −0.8): the screen's large title ("Groups"). Sign-in enlarges it to 44/50 and name setup to 30/36.
- **Title** (SF 700, 22/28): empty states, the settled-group title.
- **Section** (SF 700, 20/25): sentence-case section headers ("Balances", "Paid").
- **Headline** (SF 600, 17/22): nav bar titles, button labels, dialog titles.
- **Body** (SF 400, 17/22): row text and fields. **Subhead** (15/20) for secondary lines; **Footnote** (13/18) for captions, day labels (600, ink 2) and status words (600).
- **Amount hero** (Archivo Narrow 700, 56/62, −1, tabular): the one large number on a screen. Scaled to 44/50 for the groups overview and 64/72 for the expense amount input.
- **Amount** (Archivo Narrow 600, 19/24, tabular) and **Amount small** (16/20): every money value in rows, aligned in one right-hand column (min width 76).

### Named Rules
**The One Big Number Rule.** Each screen has at most one amount set in amount-hero ink: your balance in the group, your overall position, or the amount being entered. Everything else ranks below it.

**The Sentence Case Rule.** Section headers, day labels and captions are sentence-case SF Pro. Uppercase appears only inside the postmark's own lettering and on the invite code, which is a code, not a label.

**The Tabular Money Rule.** All money is Archivo Narrow with tabular figures so columns of cents line up.

## Layout

A single-column iPhone layout on the page ground. Horizontal margin is 16 (`space.m`) throughout; the spacing scale is 4 / 8 / 12 / 16 / 24 / 32 / 48. Rows are at least 52 tall (64 for paid payment rows), padded 10 vertical by 16 horizontal, with 12 between a row's stamp, text and amount. Every tap target is at least 44×44; nav icon buttons are bare 44 squares.

Screens open with a native-shaped navigation bar (44 tall: left action, centred headline title capped at 56% width, right action). The group screen places a segmented control (Expenses | Balances) under it, which gains a hairline under it once content scrolls. The primary action ("Add Expense") lives in a sticky bottom bar on the card ground, separated by a hairline. Expenses are grouped by day under footnote-weight day labels that act as guide words. Balance rows pair a stamp, a fixed-width name (84), a diverging bar (right of centre for what someone gets back, left for what they owe, length proportional to the largest balance) and the signed amount in the money column. Explanatory blocks are separated by a hairline rule, not a box.

### Named Rules
**The No Boxes Rule.** Content sits on the page ground as plain lists with hairlines inset to the text column. The inset grouped list (`Group`, surface grey, 12 radius) is for settings-shaped content only, and Settings is where it lives.

## Elevation & Depth

Flat by default. Depth is conveyed by the ground (white page vs grouped grey fields) and hairlines, not by shadows. Only floating layers cast a shadow: the dialog and the update banner share one float shadow over a 40% black scrim. The selected segment of the segmented control carries the small native lift iOS gives it.

### Shadow Vocabulary
- **Float** (`shadowColor #000, opacity 0.18, radius 24, offset 0/12`): dialogs, toasts, the update banner. Floating layers only.
- **Segment lift** (`opacity 0.12, radius 4, offset 0/1`): the selected segment, matching the native control.

### Named Rules
**The Only Floaters Cast Rule.** If it does not float above the screen, it has no shadow. Rows, fields, buttons and sections are flat.

## Shapes

Soft, native corners on controls (fields 10, buttons 14, grouped lists 12, dialogs and banners 16) and fully round pills for small buttons. Hairline borders, never thick outlines, except the 1.5 ink stroke on secondary buttons, focused fields and checkboxes (24 square, radius 7). The invite code sits in a dashed strong-rule frame, the one place a dashed edge appears. The world's signature silhouettes are postal: the perforated stamp edge and the round postmark with wavy killer lines. Stamps and postmarks are set slightly askew (stamps −8° to +4°, postmarks −8° to −12°) as if applied by hand; nothing else rotates.

## Components

### Buttons
Tactile and plain: ink slabs with no ornament.
- **Shape:** gently rounded (14) at 52 tall; small buttons are 40-tall pills.
- **Primary:** ink fill, on-ink 17/600 label, optional 20 icon, 20 horizontal padding.
- **Secondary:** transparent with a 1.5 ink border and ink label ("Settle Up", "Copy as Text").
- **Danger / Danger outline:** danger fill with white label, or danger border and label.
- **Pressed / Disabled:** pressed drops to 70% opacity; disabled becomes track grey with ink 3 label; busy swaps the icon for a spinner.
- **Link button:** text-only 17 ink (600 when bold), for nav bar actions and "Reopen group"; pressed 50%, disabled 35%.

### Inputs / Fields
- **Style:** grouped-grey fill, no visible border at rest, 10 radius, 48 tall, 17 text, footnote label above in ink 2.
- **Focus:** a 1.5 ink border. **Error:** a 1.5 danger border; form errors use the error note (danger tint, 10 radius, danger title over ink message).
- **Amount input:** the expense screen's amount is the screen's one big number (Archivo Narrow 700, 64/72) with a muted Archivo Narrow dollar sign.

### Lists and rows
- **Plain list:** rows on the page ground, strong-rule hairlines inset to the text column. Pressed rows fill with track grey.
- **Inset grouped list:** Settings only.
- **Section header:** sentence-case Section type with an optional footnote detail on the same baseline.

### Navigation
- **Nav bar:** native-shaped, 44 tall, headline title, link-button or 44 icon-button actions in ink.
- **Segmented control:** track-grey track (radius 9, padding 2), white selected segment (radius 7, 32 tall) with the segment lift; labels 14/500 ink 2, selected 600 ink.

### Status
- **Status line:** "Settling up" is an amber 7-pt dot plus footnote 600 word; "Settled" is the word alone in postmark blue.
- **Balance label:** footnote caption ("you're owed" / "you owe") over a pos/neg amount, right-aligned; zero reads "all square".

### Dialog
Centred 300-wide card-white alert, 16 radius, float shadow over the scrim; headline title (18/23), subhead message, money in the message highlighted in Archivo Narrow Bold, buttons in a row with 10 gap.

### Stamp (signature)
A member's avatar: a perforated rectangle in their stamp colour, holes evenly spaced and centred on every edge, a 50% white inner frame line, and the member's initial in white Archivo ExtraBold. Sizes sm 22×26, md 30×36, lg 52×62. Dimmed to 40% when the member is excluded from a split. Stamps overlap like stamps on one envelope in runs (group list, sign-in, a paid pair), each slightly rotated; an unpaid payment shows from-stamp, arrow, to-stamp.

### Postmark (signature)
A circular date cancellation in postmark blue at 92% opacity. Two variants:
- **Full** (size 70 and up): outer ring, the group name repeated as ring text with whole repeats spaced to close the circle, inner ring, the word ("SETTLED") and the date ("2 NOV 26"), with four wavy killer lines trailing right. Used for the settled group (116) and on sign-in.
- **Compact with word** (below 70): heavier double ring, word and date, no ring text (it would be unreadable).

### Cancel lines (signature)
Two wavy machine-cancel lines in postmark blue (1.8 stroke, 92% opacity, tilted -4°) across the lower band of a run of stamps, below the initials so every stamp stays readable. They mark stamps as used where the row text already carries the status ("paid", "Settled"): on paid payment rows and on a settled group's stamp run. Never a ring over the stamps, which hides the initials.

**Motion:** when `stamped`, a postmark or cancel lands with a press-down: scale from 1.35 to 1 and fade in over 320ms on an exponential ease-out. Under Reduce Motion it crossfades in 200ms with no scale.

### Named Rules
**The Earned Postmark Rule.** A postmark appears only on something that is actually finished: a paid payment or a settled group. It is never decoration, an empty-state ornament or a badge for anything else.

## Do's and Don'ts

### Do:
- **Do** make every control ink: primary buttons ink-filled, secondary ink-outlined (1.5), links ink text.
- **Do** colour a person only through their stamp and balance bar, using `assignStampColors` so they keep the same colour across groups.
- **Do** set all money in Archivo Narrow with tabular figures, in one right-hand column, and give each screen at most one amount-hero number.
- **Do** leave UI text on the system font (no `fontFamily`) so Dynamic Type and CJK fallback work.
- **Do** define new colours as `DynamicColorIOS` light/dark pairs in `theme.ts`, and resolve them with `useResolve()` for SVG.
- **Do** use cancel lines when the row text already says "paid"; use the full postmark when the mark is the message.
- **Do** keep tap targets at least 44×44.

### Don't:
- **Don't** use tracked uppercase mono labels or eyebrows above titles; section headers are sentence case.
- **Don't** introduce an accent-coloured button or tinted link; ink is the interactive colour.
- **Don't** use gradients or glows.
- **Don't** box content in cards; use plain lists with inset hairlines, and keep inset grouped lists to Settings.
- **Don't** put shadows on anything that does not float.
- **Don't** use a stamp colour, or postmark blue, as decoration.
