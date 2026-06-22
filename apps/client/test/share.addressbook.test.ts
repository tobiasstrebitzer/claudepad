import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAddressBook } from '../src/share/useAddressBook';

const card = (n: string) => `cp-pub-card-${n}`;

describe('useAddressBook (PRD-11 address book)', () => {
  beforeEach(() => localStorage.clear());

  it('remembers a recipient and lists it', () => {
    const { result } = renderHook(() => useAddressBook());
    act(() => result.current.remember({ card: card('a'), name: 'Ada', pub: 'PUBA' }));
    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0]).toMatchObject({ name: 'Ada', pub: 'PUBA', card: card('a') });
  });

  it('dedupes by public key and bumps it to the front (most-recent-first)', () => {
    const { result } = renderHook(() => useAddressBook());
    act(() => result.current.remember({ card: card('a'), name: 'Ada', pub: 'PUBA' }));
    act(() => result.current.remember({ card: card('b'), name: 'Bob', pub: 'PUBB' }));
    act(() => result.current.remember({ card: card('a2'), name: 'Ada', pub: 'PUBA' }));
    expect(result.current.contacts.map((c) => c.pub)).toEqual(['PUBA', 'PUBB']);
    // Re-remembering updates the stored card too.
    expect(result.current.contacts[0]!.card).toBe(card('a2'));
  });

  it('preserves a local alias across a re-remember', () => {
    const { result } = renderHook(() => useAddressBook());
    act(() => result.current.remember({ card: card('a'), name: 'Ada', pub: 'PUBA' }));
    act(() => result.current.setAlias('PUBA', 'work laptop'));
    act(() => result.current.remember({ card: card('a3'), name: 'Ada Lovelace', pub: 'PUBA' }));
    expect(result.current.contacts[0]!.alias).toBe('work laptop');
  });

  it('removes a contact', () => {
    const { result } = renderHook(() => useAddressBook());
    act(() => result.current.remember({ card: card('a'), name: 'Ada', pub: 'PUBA' }));
    act(() => result.current.remove('PUBA'));
    expect(result.current.contacts).toHaveLength(0);
  });

  it('persists across hook instances (localStorage)', () => {
    const first = renderHook(() => useAddressBook());
    act(() => first.result.current.remember({ card: card('a'), name: 'Ada', pub: 'PUBA' }));
    const second = renderHook(() => useAddressBook());
    expect(second.result.current.contacts.map((c) => c.pub)).toEqual(['PUBA']);
  });

  it('caps the list at 12 most-recent entries', () => {
    const { result } = renderHook(() => useAddressBook());
    for (let i = 0; i < 15; i++) {
      act(() => result.current.remember({ card: card(`${i}`), name: `n${i}`, pub: `PUB${i}` }));
    }
    expect(result.current.contacts).toHaveLength(12);
    // The most recent (last remembered) is at the front; the oldest fell off.
    expect(result.current.contacts[0]!.pub).toBe('PUB14');
    expect(result.current.contacts.some((c) => c.pub === 'PUB0')).toBe(false);
  });
});
