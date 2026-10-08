# App Store Connect privacy label ("App Privacy")

**Data used to track you:** none. SplitEasy does no tracking and has no third-party advertising or analytics SDKs.

Answer **Yes, we collect data** and declare the types below. All of them are **linked to the user**, **not used for tracking**, and have the purpose **App Functionality** only.

| Category | Data type | Where it comes from in SplitEasy |
|---|---|---|
| Contact Info | **Name** | Display name from Apple, Google, or typed by the user |
| Contact Info | **Email Address** | Email from Sign in with Apple or Google (may be an Apple relay address) |
| Identifiers | **User ID** | Supabase account ID / Apple or Google subject ID |
| Financial Info | **Other Financial Info** | Expense amounts, who paid, splits, settle-up payments |
| User Content | **Other User Content** | Group names and expense descriptions |

**Don't declare:**
- Location, Contacts, Health, Browsing/Search History, Purchases (no in-app purchases).
- Usage Data and Diagnostics: there are no analytics or crash SDKs. If you add Crashlytics or similar later, declare **Crash Data** and **Performance Data**.

**Third parties:** none besides Supabase, which hosts the database and sign-in on our behalf.
