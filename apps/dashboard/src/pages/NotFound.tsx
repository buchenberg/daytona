import { Button } from '@/components/ui/button'
import { routes } from '@/routes/paths'
import { Home } from 'lucide-react'
import React from 'react'
import { useNavigate } from 'react-router'

const NotFound: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-lg">
        <h1 className="text-4xl font-bold text-foreground animate-bounce">404</h1>
        <p className="text-base text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
        <Button onClick={() => navigate(routes.dashboard.path)} className="flex items-center gap-2 mx-auto">
          <Home className="w-4 h-4" />
          Go to Dashboard
        </Button>
      </div>
    </div>
  )
}

export default NotFound
