import { Request } from 'express'
import { Permissions } from '../permissions'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    name?: string
    permissions: Permissions
  }
}
