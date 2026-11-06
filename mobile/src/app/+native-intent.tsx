// Every link that opens the app passes through here first. An invite link is held for the groups
// list, which opens the Join sheet over whatever is showing once someone is signed in; every other
// link goes through as is.
import { inviteCodeIn, receiveInvite } from '@/lib/invite';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  const code = inviteCodeIn(path);
  if (!code) return path;
  receiveInvite(code);
  // Launched by the link: start on the groups list. Already open: stay put (null navigates nowhere).
  return initial ? '/' : null;
}
