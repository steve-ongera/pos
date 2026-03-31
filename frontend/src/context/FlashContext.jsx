// context/FlashContext.jsx
import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

const FlashContext = createContext(null)

export function FlashProvider({ children }) {
  const [messages, setMessages] = useState([])
  const timerRefs = useRef({})

  const flash = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random()
    setMessages(prev => [...prev, { id, message, type }])
    timerRefs.current[id] = setTimeout(() => {
      setMessages(prev => prev.filter(m => m.id !== id))
      delete timerRefs.current[id]
    }, duration)
    return id
  }, [])

  const dismiss = useCallback((id) => {
    clearTimeout(timerRefs.current[id])
    delete timerRefs.current[id]
    setMessages(prev => prev.filter(m => m.id !== id))
  }, [])

  return (
    <FlashContext.Provider value={{ messages, flash, dismiss }}>
      {children}
      <FlashContainer messages={messages} dismiss={dismiss} />
    </FlashContext.Provider>
  )
}

function FlashContainer({ messages, dismiss }) {
  if (!messages.length) return null
  return (
    <div className="flash-container" role="alert" aria-live="polite">
      {messages.map(msg => (
        <div key={msg.id} className={`flash-message flash-${msg.type}`}>
          <i className={`bi ${iconMap[msg.type]}`} />
          <span>{msg.message}</span>
          <button className="flash-close" onClick={() => dismiss(msg.id)} aria-label="Dismiss">
            <i className="bi bi-x" />
          </button>
        </div>
      ))}
    </div>
  )
}

const iconMap = {
  success: 'bi-check-circle-fill',
  error: 'bi-exclamation-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill',
}

export const useFlash = () => {
  const ctx = useContext(FlashContext)
  if (!ctx) throw new Error('useFlash must be used within FlashProvider')
  return ctx
}