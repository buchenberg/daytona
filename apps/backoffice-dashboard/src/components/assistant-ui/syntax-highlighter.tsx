/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Highlight, themes } from 'prism-react-renderer'
import type { FC } from 'react'
import type { SyntaxHighlighterProps } from '@assistant-ui/react-markdown'
import { useTheme } from '../../contexts/ThemeContext'

export const SyntaxHighlighter: FC<SyntaxHighlighterProps> = ({ language, code }) => {
  const { theme } = useTheme()
  const prismTheme = theme === 'dark' ? themes.oneDark : themes.oneLight

  return (
    <Highlight theme={prismTheme} code={code} language={language}>
      {({ style, tokens, getLineProps, getTokenProps }) => (
        <pre className="overflow-x-auto rounded-md p-3 text-xs" style={{ ...style, margin: 0 }}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}
