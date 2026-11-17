import {
  creatorMessage,
  resolveDisplayName,
  wallMessage,
} from './support-visibility.util';

const gift = (visibility: string) => ({
  visibility,
  guestName: 'Tomi',
  message: 'Keep creating',
});

describe('support visibility', () => {
  it('PUBLIC shows name and message on the wall and to the creator', () => {
    expect(resolveDisplayName(gift('PUBLIC'))).toBe('Tomi');
    expect(wallMessage(gift('PUBLIC'))).toBe('Keep creating');
    expect(creatorMessage(gift('PUBLIC'))).toBe('Keep creating');
  });

  it('CREATOR_ONLY hides name and message on the wall but not from the creator', () => {
    expect(resolveDisplayName(gift('CREATOR_ONLY'))).toBe('Anonymous');
    expect(wallMessage(gift('CREATOR_ONLY'))).toBeNull();
    expect(creatorMessage(gift('CREATOR_ONLY'))).toBe('Keep creating');
  });

  it('ANONYMOUS hides the message on the wall and from the creator', () => {
    expect(resolveDisplayName(gift('ANONYMOUS'))).toBe('Anonymous');
    expect(wallMessage(gift('ANONYMOUS'))).toBeNull();
    expect(creatorMessage(gift('ANONYMOUS'))).toBeNull();
  });

  it('falls back to Anonymous when a public gift has no name', () => {
    expect(resolveDisplayName({ visibility: 'PUBLIC', guestName: ' ' })).toBe(
      'Anonymous',
    );
  });
});
