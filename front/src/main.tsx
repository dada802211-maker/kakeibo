import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Reactのルート画面をマウントします。
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
