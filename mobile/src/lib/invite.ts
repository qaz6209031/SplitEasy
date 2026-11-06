// Invite links. Sharing a group sends a web link (the invite page on the project's GitHub Pages site),
// since chat apps only make https links tappable. The page opens the app on spliteasy://?invite=<code>,
// which lands here and opens the Join sheet with the code filled in.
import { useEffect } from 'react';

const INVITE_PAGE = 'https://kaichin.dev/SplitEasy/join/';

/** https://kaichin.dev/SplitEasy/join/?code=K7Q2ZX */
export const inviteLink = (code: string) => `${INVITE_PAGE}?code=${encodeURIComponent(code)}`;

/**
 * The invite code in a link that opened the app, or null when it isn't an invite.
 * The invite page opens spliteasy://?invite=K7Q2ZX: a build from before invite links reads that as
 * the groups list (rather than "Unmatched Route"), so the page's own instructions take over there.
 * Also accepted: spliteasy://join/K7Q2ZX (the first invite pages) and the page's https link.
 */
export function inviteCodeIn(url: string): string | null {
  const match =
    /[?&]invite=([a-z0-9]{6})(?![a-z0-9])/i.exec(url) ??
    /(?:^|[/:])join\/?(?:\?(?:[^#]*&)?code=|\/?)([a-z0-9]{6})(?![a-z0-9])/i.exec(url);
  return match ? match[1].toUpperCase() : null;
}

/** What the invite page opens: spliteasy://?invite=K7Q2ZX */
export const inviteAppLink = (code: string) => `spliteasy://?invite=${encodeURIComponent(code)}`;

// The code waits here until someone can join: the groups list may not be showing yet (signed out,
// or still choosing a name), so it's held rather than acted on as the link arrives.
let pending: string | null = null;
const listeners = new Set<(code: string) => void>();

export function receiveInvite(code: string) {
  pending = code;
  listeners.forEach((listener) => listener(code));
}

/** Calls `onInvite` with an invite that arrived before this mounted, and with each one after. */
export function useInvites(onInvite: (code: string) => void) {
  useEffect(() => {
    const take = (code: string) => {
      if (pending !== code) return;
      pending = null;
      onInvite(code);
    };
    if (pending) take(pending);
    listeners.add(take);
    return () => {
      listeners.delete(take);
    };
  }, [onInvite]);
}
