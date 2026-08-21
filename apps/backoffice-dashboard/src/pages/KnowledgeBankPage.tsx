import { useState, useEffect } from 'react'
import { PageLayout, PageHeaderBase, PageTitle, PageContent } from '@dashboard/components/PageLayout'
import { DataTable, Column } from '@backoffice/components/DataTable'
import { Badge } from '@dashboard/ui/badge'
import { Button } from '@dashboard/ui/button'
import { Input } from '@dashboard/ui/input'
import { Plus, Trash2, Pencil, X } from 'lucide-react'
import { listMemories, upsertMemory, forgetMemory, type MemoryEntry } from '../features/chat/api'

const CATEGORIES = ['curated', 'finding', 'learning', 'infra', 'org']

/**
 * Superadmin-only editor for Mali's shared knowledge base. Entries are
 * injected into every user's system prompt; `curated` entries never expire.
 */
export const KnowledgeBankPage = () => {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null) // null = closed, '' = new entry
  const [formKey, setFormKey] = useState('')
  const [formValue, setFormValue] = useState('')
  const [formCategory, setFormCategory] = useState('curated')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listMemories()
      .then((res) => setMemories(res.memories))
      .catch(() => setError('Failed to load knowledge base'))
      .finally(() => setLoading(false))
  }, [])

  const startCreate = () => {
    setFormKey('')
    setFormValue('')
    setFormCategory('curated')
    setEditingKey('')
  }

  const startEdit = (m: MemoryEntry) => {
    setFormKey(m.key)
    setFormValue(m.value)
    setFormCategory(m.category)
    setEditingKey(m.key)
  }

  const handleSave = async () => {
    const key = formKey.trim()
    const value = formValue.trim()
    if (!key || !value) return
    setSaving(true)
    setError('')
    try {
      const { memory } = await upsertMemory(key, value, formCategory)
      setMemories((prev) => [memory, ...prev.filter((m) => m.key !== key)])
      setEditingKey(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save entry')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (key: string) => {
    setError('')
    try {
      await forgetMemory(key)
      setMemories((prev) => prev.filter((m) => m.key !== key))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete entry')
    }
  }

  return (
    <PageLayout>
      <PageHeaderBase>
        <PageTitle>Knowledge Bank</PageTitle>
        {editingKey === null && (
          <Button onClick={startCreate} className="ml-auto">
            <Plus className="mr-2 h-4 w-4" />
            Add entry
          </Button>
        )}
      </PageHeaderBase>
      <PageContent size="full">
        <p className="mb-4 text-sm text-muted-foreground">
          Shared context injected into every Mali conversation. Entries marked <code>curated</code> never expire; other
          categories are pruned after 30 days of inactivity.
        </p>

        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        {editingKey !== null && (
          <div className="mb-6 rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{editingKey === '' ? 'New entry' : `Edit ${editingKey}`}</span>
              <Button variant="ghost" size="sm" onClick={() => setEditingKey(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Input
              value={formKey}
              onChange={(e) => setFormKey(e.target.value)}
              disabled={editingKey !== ''}
              placeholder="key_in_snake_case"
            />
            <textarea
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder="The insight or fact Mali should know…"
              rows={4}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-y"
            />
            <div className="flex items-center justify-between">
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="rounded-md border bg-transparent px-2 py-2 text-sm outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Button onClick={handleSave} disabled={saving || !formKey.trim() || !formValue.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        <DataTable columns={columns(startEdit, handleDelete)} data={memories} loading={loading} rowKey={(m) => m.id} />
      </PageContent>
    </PageLayout>
  )
}

const columns = (onEdit: (m: MemoryEntry) => void, onDelete: (key: string) => void): Column<MemoryEntry>[] => [
  {
    key: 'key',
    title: 'Key',
    width: '220px',
    render: (m) => <span className="font-medium text-sm break-all">{m.key}</span>,
  },
  {
    key: 'value',
    title: 'Value',
    render: (m) => <span className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{m.value}</span>,
  },
  {
    key: 'category',
    title: 'Category',
    width: '110px',
    render: (m) => <Badge className="font-normal">{m.category}</Badge>,
  },
  {
    key: 'createdBy',
    title: 'By',
    width: '160px',
    render: (m) => <span className="text-sm truncate">{m.createdBy}</span>,
  },
  {
    key: 'updatedAt',
    title: 'Updated',
    width: '110px',
    render: (m) => <span className="text-sm">{new Date(m.updatedAt).toISOString().slice(0, 10)}</span>,
  },
  {
    key: 'actions',
    title: 'Actions',
    width: '140px',
    render: (m) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onEdit(m)}>
          <Pencil className="mr-1 h-3 w-3" />
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDelete(m.key)}>
          <Trash2 className="mr-1 h-3 w-3" />
          Delete
        </Button>
      </div>
    ),
  },
]
