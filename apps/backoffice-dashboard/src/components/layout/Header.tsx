import { Sun, Moon, LogOut, Bell } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@dashboard/ui/button'
import { useTheme } from '@backoffice/contexts/ThemeContext'
import { usePendingQuotaBumps } from '../../features/quota-bumps/useQuotaBumps'

export function Header() {
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()

  const { data: pendingBumps } = usePendingQuotaBumps()
  const pendingCount = pendingBumps?.total ?? 0

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  const handleLogout = () => {
    window.location.href = '/api/v1/auth/logout'
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">Daytona Backoffice</h2>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => navigate('/notifications')}
          title={pendingCount > 0 ? `${pendingCount} pending notification(s)` : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {pendingCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}
