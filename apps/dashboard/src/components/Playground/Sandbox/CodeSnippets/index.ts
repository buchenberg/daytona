import { CodeLanguage } from '@daytona/sdk'
import { PythonSnippetGenerator } from './python'
import { CodeSnippetGenerator } from './types'
import { TypeScriptSnippetGenerator } from './typescript'

export const codeSnippetGenerators: Record<Exclude<CodeLanguage, CodeLanguage.JAVASCRIPT>, CodeSnippetGenerator> = {
  [CodeLanguage.PYTHON]: PythonSnippetGenerator,
  [CodeLanguage.TYPESCRIPT]: TypeScriptSnippetGenerator,
}

export type { CodeSnippetActionFlags, CodeSnippetGenerator, CodeSnippetParams } from './types'
