import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Badge } from '@dashboard/ui/badge'
import { Input } from '@dashboard/ui/input'
import BackofficeApiClient from '../../api/BackofficeApiClient'

interface RunnerPickerProps {
  selected: string[]
  onChange: (names: string[]) => void
}

/** Type-ahead over fleet runner names; selected runners render as removable chips. */
export const RunnerPicker = ({ selected, onChange }: RunnerPickerProps) => {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data } = useQuery({
    queryKey: ['fleet-runners', 'picker', debouncedQuery],
    queryFn: () =>
      BackofficeApiClient.searchFleetRunners({
        filters: { search: debouncedQuery },
        pagination: { page: 1, pageSize: 8 },
        sort: { field: 'name', order: 'asc' },
      }),
    enabled: debouncedQuery.length > 0,
  })

  // Hide suggestions while the input is ahead of the debounce, or Enter/click
  // could add a runner from the previous query's results.
  const suggestions =
    query === debouncedQuery
      ? (data?.data?.runners ?? []).map((r) => r.name).filter((name) => !selected.includes(name))
      : []

  const add = (name: string) => {
    onChange([...selected, name])
    setQuery('')
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((name) => (
            <Badge key={name} variant="secondary" className="font-mono">
              {name}
              <button
                type="button"
                className="ml-1"
                onClick={() => onChange(selected.filter((n) => n !== name))}
                aria-label={`Remove ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        placeholder="Type a runner name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && suggestions.length > 0) {
            e.preventDefault()
            add(suggestions[0])
          }
        }}
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((name) => (
            <button key={name} type="button" onClick={() => add(name)}>
              <Badge variant="outline" className="cursor-pointer font-mono hover:bg-accent">
                {name}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
