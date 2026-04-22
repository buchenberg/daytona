/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { loadStripe, Stripe } from '@stripe/stripe-js'

let stripePromise: Promise<Stripe | null> | null = null

export function initStripe(publishableKey: string) {
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey)
  }
}

export function useStripe() {
  return {
    createRadarSession: async (): Promise<string> => {
      if (!stripePromise) {
        throw new Error('Stripe not initialized')
      }
      const stripe = await stripePromise
      if (!stripe) {
        throw new Error('Failed to load Stripe. Please disable any ad blockers and try again.')
      }
      const result = await stripe.createRadarSession()
      if (result.error) {
        throw new Error(result.error.message || 'Failed to create radar session')
      }
      return result.radarSession.id
    },
  }
}
