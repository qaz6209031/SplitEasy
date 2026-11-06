import { inviteCodeIn, inviteLink } from '../invite';

describe('invite links', () => {
  it('builds the invite page link', () => {
    expect(inviteLink('L995MK')).toBe('https://kaichin.dev/SplitEasy/join/?code=L995MK');
  });

  it('reads the code from every form a link can arrive in', () => {
    expect(inviteCodeIn('spliteasy://join/L995MK')).toBe('L995MK');
    expect(inviteCodeIn('spliteasy:///join/L995MK')).toBe('L995MK');
    expect(inviteCodeIn('/join/l995mk')).toBe('L995MK');
    expect(inviteCodeIn('spliteasy://join?code=L995MK')).toBe('L995MK');
    expect(inviteCodeIn(inviteLink('L995MK'))).toBe('L995MK');
    expect(inviteCodeIn('https://kaichin.dev/SplitEasy/join/?ref=x&code=L995MK')).toBe('L995MK');
  });

  it('leaves other links alone', () => {
    expect(inviteCodeIn('spliteasy://auth-callback?code=abcdef123456')).toBeNull();
    expect(inviteCodeIn('/group/f29a214c-d80b-4294-a1b0-e808597bd597?name=Roommates')).toBeNull();
    expect(inviteCodeIn('/new-group?mode=join')).toBeNull();
    expect(inviteCodeIn('spliteasy://join/L995MK7')).toBeNull();
    expect(inviteCodeIn('spliteasy://join/')).toBeNull();
  });
});
