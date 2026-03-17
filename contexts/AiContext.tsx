import { createContext, useContext, ReactNode } from 'react'
import { AiContextType } from '../hooks/useAiContext'
import { useAiContextState } from '../hooks/useAiContext'

const AiContext = createContext<AiContextType | null>(null)

export function AiProvider({ children }: { children: ReactNode }) {
  const value = useAiContextState()
  return <AiContext.Provider value={value}>{children}</AiContext.Provider>
}

export function useAiContext(): AiContextType {
  const ctx = useContext(AiContext)
  if (!ctx) throw new Error('useAiContext must be used inside AiProvider')
  return ctx
}
