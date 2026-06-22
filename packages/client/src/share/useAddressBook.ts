// A local address book of recent recipients (PRD-11 OQ-A / PRD-10 OQ-C) so keys
// don't have to be re-pasted each share. Stores only PUBLIC cards (name + public
// key) plus an optional local alias - no secrets - in localStorage. Never
// uploaded; this is a convenience cache, not an identity directory.

import * as React from 'react'
import { usePersistedState } from '../lib/usePersistedState'

export interface Contact {
  /** The `cp-pub-…` string, kept verbatim so picking re-fills the input exactly. */
  card: string
  /** Self-claimed name decoded from the card (display). */
  name: string
  /** Raw public key - the dedupe key and fingerprint source. */
  pub: string
  /** Optional local nickname the user sets; overrides `name` in the list. */
  alias?: string
  lastUsedMs: number
}

const KEY = 'claudepad.addressbook'
const MAX = 12

function isContacts(v: unknown): v is Contact[] {
  return (
    Array.isArray(v) &&
    v.every(
      (c) =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as Contact).pub === 'string' &&
        typeof (c as Contact).card === 'string' &&
        typeof (c as Contact).name === 'string'
    )
  )
}

export interface AddressBook {
  contacts: Contact[]
  remember: (c: { card: string; name: string; pub: string }) => void
  remove: (pub: string) => void
  setAlias: (pub: string, alias: string) => void
}

export function useAddressBook(): AddressBook {
  const [contacts, setContacts] = usePersistedState<Contact[]>(KEY, [], isContacts)

  const remember = React.useCallback<AddressBook['remember']>(
    (c) => {
      setContacts((prev) => {
        const existing = prev.find((x) => x.pub === c.pub)
        const merged: Contact = {
          card: c.card,
          name: c.name,
          pub: c.pub,
          alias: existing?.alias,
          lastUsedMs: Date.now()
        }
        return [merged, ...prev.filter((x) => x.pub !== c.pub)].slice(0, MAX)
      })
    },
    [setContacts]
  )

  const remove = React.useCallback<AddressBook['remove']>(
    (pub) => setContacts((prev) => prev.filter((x) => x.pub !== pub)),
    [setContacts]
  )

  const setAlias = React.useCallback<AddressBook['setAlias']>(
    (pub, alias) =>
      setContacts((prev) =>
        prev.map((x) => (x.pub === pub ? { ...x, alias: alias.trim() || undefined } : x))
      ),
    [setContacts]
  )

  const sorted = React.useMemo(
    () => [...contacts].sort((a, b) => b.lastUsedMs - a.lastUsedMs),
    [contacts]
  )

  return { contacts: sorted, remember, remove, setAlias }
}
