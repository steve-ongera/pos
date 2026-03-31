export { default } from './index.jsx'
import React from 'react'
export default function Spinner({ fullscreen, size = 'md' }) {
  if (fullscreen) {
    return (
      <div className="spinner-fullscreen">
        <div className="spinner-ring" />
        <p>Loading...</p>
      </div>
    )
  }
  return <div className={`spinner-ring spinner-${size}`} />
}