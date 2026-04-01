/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useState, useEffect, type FC } from 'react'
import { Settings, Save, X, Eye, EyeOff } from 'lucide-react'
import { getSettings, updateSettings } from './api'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

export const SettingsPanel: FC<SettingsPanelProps> = ({ open, onClose }) => {
  const [daytonaApiKey, setDaytonaApiKey] = useState('')
  const [githubRepoUrl, setGithubRepoUrl] = useState('')
  const [githubPat, setGithubPat] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [showPat, setShowPat] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    if (open) {
      setLoading(true)
      getSettings()
        .then((s) => {
          setDaytonaApiKey(s.daytonaApiKey || '')
          setGithubRepoUrl(s.githubRepoUrl || '')
          setGithubPat(s.githubPat || '')
        })
        .finally(() => setLoading(false))
    }
  }, [open])

  const handleSave = async () => {
    setSaving(true)
    setStatus('idle')
    try {
      const payload: Record<string, string> = { githubRepoUrl }
      if (daytonaApiKey && daytonaApiKey !== '********') payload.daytonaApiKey = daytonaApiKey
      if (githubPat && githubPat !== '********') payload.githubPat = githubPat
      await updateSettings(payload)
      setStatus('success')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border rounded-xl shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="font-semibold text-sm">Mali Settings</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Daytona API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={daytonaApiKey}
                  onChange={(e) => setDaytonaApiKey(e.target.value)}
                  placeholder="dtn_..."
                  className="w-full rounded-md border bg-transparent px-3 py-2 pr-9 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <FieldStatus configured={!!daytonaApiKey} />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">GitHub Repository URL</label>
              <input
                type="text"
                value={githubRepoUrl}
                onChange={(e) => setGithubRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <FieldStatus configured={!!githubRepoUrl} />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                GitHub Personal Access Token
              </label>
              <div className="relative">
                <input
                  type={showPat ? 'text' : 'password'}
                  value={githubPat}
                  onChange={(e) => setGithubPat(e.target.value)}
                  placeholder="github_pat_..."
                  className="w-full rounded-md border bg-transparent px-3 py-2 pr-9 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPat(!showPat)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPat ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <FieldStatus configured={!!githubPat} />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 w-full rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>

            {status === 'success' && <p className="text-xs text-green-600 text-center">Settings saved successfully</p>}
            {status === 'error' && <p className="text-xs text-destructive text-center">Failed to save settings</p>}
          </div>
        )}
      </div>
    </div>
  )
}

const FieldStatus: FC<{ configured: boolean }> = ({ configured }) => (
  <div className="flex items-center gap-1 mt-1">
    <div className={`h-1.5 w-1.5 rounded-full ${configured ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
    <span className="text-[10px] text-muted-foreground">{configured ? 'Configured' : 'Not set'}</span>
  </div>
)
