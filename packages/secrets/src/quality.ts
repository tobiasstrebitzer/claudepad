// Documented detection quality, measured on the labeled corpus in
// `test/corpus.test.ts` (PRD-06 AC-10). The test asserts the live scanner meets
// or beats these numbers, so they can't silently rot; the review UI shows them
// so users get an honest, non-buried sense of how good detection is (FR-32).

export const DETECTION_QUALITY = {
  /** Fraction of known secret shapes caught (hard gate). */
  recall: 0.95,
  /** Fraction of redacted items that are real secrets, incl. known FP blobs. */
  precision: 0.85,
  /** Number of labeled items (secrets + decoys) behind these figures. */
  corpusSize: 27,
} as const;
