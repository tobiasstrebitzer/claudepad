// Resolve a `?share=<id>&r=<registry>` deep link (handed out by a registry's
// `/s/:id` redirect): fetch the opaque blob from the registry named in the link
// and return its `cp-blob-…` text, ready to decrypt locally. This works even
// when the recipient hasn't connected that registry - the link is self-describing,
// and the registry only ever serves opaque ciphertext (decryption stays local).

import { isAllowedRegistryUrl, RegistryClient } from '@claudepad/registry-client'

/** Fetch a share blob by id from a specific registry, or null if unreachable. */
export async function fetchSharedBlob(registryUrl: string, id: string): Promise<string | null> {
  if (!isAllowedRegistryUrl(registryUrl)) return null
  try {
    const client = await RegistryClient.connect(registryUrl)
    const bytes = await client.get(id)
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}
