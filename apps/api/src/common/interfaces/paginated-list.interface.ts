export interface PaginatedList<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
  nextToken?: string
}
