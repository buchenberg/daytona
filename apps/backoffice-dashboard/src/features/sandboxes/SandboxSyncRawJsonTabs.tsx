import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@dashboard/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dashboard/ui/tabs'
import { toast } from 'sonner'

interface SandboxSyncRawJsonTabsProps {
  db: object
  opensearch?: object | null
}

const formatJson = (value: unknown): string => JSON.stringify(value, null, 2)

const RawJsonPane = ({ label, value }: { label: string; value: unknown }) => {
  const [copied, setCopied] = useState(false)
  const json = value === null || value === undefined ? 'null (document not found in OpenSearch)' : formatJson(value)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      toast.success(`Copied ${label} JSON to clipboard`)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1.5">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted/40 p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
        {json}
      </pre>
    </div>
  )
}

export const SandboxSyncRawJsonTabs = ({ db, opensearch }: SandboxSyncRawJsonTabsProps) => {
  return (
    <Tabs defaultValue="db" className="w-full">
      <TabsList>
        <TabsTrigger value="db">Database</TabsTrigger>
        <TabsTrigger value="opensearch">OpenSearch</TabsTrigger>
      </TabsList>
      <TabsContent value="db" className="mt-3">
        <RawJsonPane label="Database row" value={db} />
      </TabsContent>
      <TabsContent value="opensearch" className="mt-3">
        <RawJsonPane label="OpenSearch _source" value={opensearch} />
      </TabsContent>
    </Tabs>
  )
}
