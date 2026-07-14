import { Thread } from '../../components/assistant-ui/thread'
import { ThreadList, ManageCollaboratorsContext } from '../../components/assistant-ui/thread-list'
import { SettingsPanel } from './SettingsPanel'
import { CollaboratorsView } from './CollaboratorsView'
import { SidebarTrigger } from '@dashboard/ui/sidebar'
import { Settings, BookOpen, PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import { useState, type FC } from 'react'
import { useNavigate } from 'react-router'
import { usePermissions } from '../../providers/ApiProvider'

export const ChatLayout: FC = () => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Conversation whose collaborators are being managed; shown instead of the chat.
  const [collaboratorsFor, setCollaboratorsFor] = useState<string | null>(null)
  const isSuperAdmin = usePermissions().superAdmin === true
  const navigate = useNavigate()

  return (
    <div className="flex h-full bg-background relative overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`
          fixed md:relative z-40 md:z-auto
          w-64 border-r shrink-0 flex flex-col bg-background h-full overflow-hidden
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="flex-1 min-h-0">
          <ManageCollaboratorsContext.Provider value={setCollaboratorsFor}>
            <ThreadList />
          </ManageCollaboratorsContext.Provider>
        </div>
        <div className="flex items-center gap-1 px-3 py-2 border-t">
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center justify-center rounded-md h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => navigate('/knowledge-bank')}
              className="inline-flex items-center justify-center rounded-md h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Knowledge Bank"
            >
              <BookOpen className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center h-12 px-3 border-b md:hidden">
          <SidebarTrigger className="p-2" />
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="inline-flex items-center justify-center rounded-md h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <span className="ml-2 text-sm font-semibold">Mali</span>
        </div>

        <div className="flex-1 min-h-0">
          {collaboratorsFor ? (
            <CollaboratorsView conversationId={collaboratorsFor} onClose={() => setCollaboratorsFor(null)} />
          ) : (
            <Thread />
          )}
        </div>
      </main>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
