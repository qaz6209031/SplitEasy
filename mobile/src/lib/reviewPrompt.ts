// Asks for an App Store rating at a good moment: right after a group is settled up. Apple decides
// whether the sheet actually shows (at most three times a year), and we only ask once per install.
import * as StoreReview from 'expo-store-review';

const ASKED_KEY = 'tabmates.reviewRequested';
/** Lets the Settled postmark finish stamping before the system sheet covers it. */
const DELAY_MS = 1800;

export function requestReviewAfterSettling(): void {
  setTimeout(async () => {
    try {
      if (localStorage.getItem(ASKED_KEY)) return;
      if (!(await StoreReview.hasAction())) return;
      localStorage.setItem(ASKED_KEY, new Date().toISOString());
      await StoreReview.requestReview();
    } catch {
      // A rating prompt is never worth an error.
    }
  }, DELAY_MS);
}
