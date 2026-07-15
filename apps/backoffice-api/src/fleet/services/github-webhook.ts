import { createHmac, timingSafeEqual } from 'crypto'

/** Verifies a GitHub X-Hub-Signature-256 header over the raw request body. */
export function verifyGithubSignature(secret: string, payload: Buffer, signatureHeader: string | undefined): boolean {
  if (!secret || !signatureHeader?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(payload).digest()
  const received = Buffer.from(signatureHeader.slice('sha256='.length), 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}
