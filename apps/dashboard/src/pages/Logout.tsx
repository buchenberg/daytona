import LoadingFallback from '@/components/LoadingFallback'
import { usePostHog } from 'posthog-js/react'
import { useEffect } from 'react'
import { useAuth } from 'react-oidc-context'

const Logout = () => {
  const { signoutRedirect } = useAuth()
  const posthog = usePostHog()

  useEffect(() => {
    posthog?.reset()
    void signoutRedirect()
  }, [signoutRedirect, posthog])

  return <LoadingFallback source="logout-signout-redirect" />
}

export default Logout
