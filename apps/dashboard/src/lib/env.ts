import { parse } from 'dotenv'

export interface EnvVar {
  key: string
  value: string
}

export function parseEnvFile(src: string): EnvVar[] {
  const parsed = parse(src)
  return Object.entries(parsed).map(([key, value]) => ({ key, value }))
}
