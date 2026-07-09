/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto'
import { Logger } from '@nestjs/common'
import { config } from '../../config/env'

/**
 * AES-256-CBC with PBKDF2 key derivation, OpenSSL-compatible format.
 *
 * Wire format of a stored secret:
 *   "enc:v1:" + base64( "Salted__" || salt[8] || ciphertext[*] )
 *
 * Generate the same ciphertext from a shell:
 *   echo -n 'hunter2' | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -a -A \
 *     -k "$MALI_SETTINGS_SECRET"
 *
 * Key + IV derived from: pbkdf2(secret, salt, 100000 iters, 48 bytes, sha256)
 * → first 32 bytes = AES key, last 16 bytes = IV. This is what OpenSSL does.
 */

const PREFIX = 'enc:v1:'
const OPENSSL_HEADER = Buffer.from('Salted__', 'utf8') // 8 bytes
const SALT_LEN = 8
const KEY_LEN = 32
const IV_LEN = 16
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_DIGEST = 'sha256'

const logger = new Logger('MaliSettingsCrypto')

let warned = false
function warnOnceIfDisabled() {
  if (!warned && !config.mali.settingsSecret) {
    logger.warn(
      'MALI_SETTINGS_SECRET is not set — mali settings encryption is disabled. ' +
        'Secret fields in mali_user_settings.datasource_overrides will be stored plaintext. ' +
        'Set MALI_SETTINGS_SECRET in production.',
    )
    warned = true
  }
}

export function isEncryptionEnabled(): boolean {
  return !!config.mali.settingsSecret
}

function deriveKeyAndIv(secret: string, salt: Buffer): { key: Buffer; iv: Buffer } {
  const material = pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, KEY_LEN + IV_LEN, PBKDF2_DIGEST)
  return { key: material.subarray(0, KEY_LEN), iv: material.subarray(KEY_LEN) }
}

/** Encrypt a plaintext string. Returns the "enc:v1:…" tag. No-op passthrough if encryption is disabled. */
export function encryptSecret(plaintext: string): string {
  warnOnceIfDisabled()
  if (!isEncryptionEnabled()) return plaintext
  if (plaintext.startsWith(PREFIX)) return plaintext // already encrypted — idempotent

  const salt = randomBytes(SALT_LEN)
  const { key, iv } = deriveKeyAndIv(config.mali.settingsSecret, salt)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const payload = Buffer.concat([OPENSSL_HEADER, salt, ciphertext])
  return PREFIX + payload.toString('base64')
}

/** Decrypt an "enc:v1:…" value. Plaintext passthrough if value lacks the prefix or encryption is disabled. */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored // plaintext (legacy or dev)
  if (!isEncryptionEnabled()) {
    throw new Error('mali settings value is encrypted but MALI_SETTINGS_SECRET is not set')
  }

  const payload = Buffer.from(stored.slice(PREFIX.length), 'base64')
  if (payload.length < OPENSSL_HEADER.length + SALT_LEN + 16) {
    throw new Error('mali settings ciphertext is truncated or malformed')
  }
  if (!payload.subarray(0, OPENSSL_HEADER.length).equals(OPENSSL_HEADER)) {
    throw new Error('mali settings ciphertext is missing the OpenSSL "Salted__" header')
  }

  const salt = payload.subarray(OPENSSL_HEADER.length, OPENSSL_HEADER.length + SALT_LEN)
  const ciphertext = payload.subarray(OPENSSL_HEADER.length + SALT_LEN)
  const { key, iv } = deriveKeyAndIv(config.mali.settingsSecret, salt)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}
