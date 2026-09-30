import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { AuthProvider } from './lib/auth'
import { ChatProvider } from './lib/chat'
import { ThemeProvider } from './lib/theme'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
})

const root = createRoot(document.getElementById('root')!)

// /student/* is the Telegram Mini App: its own tree, without the admin panel's
// cookie login (AuthProvider) or saved theme (ThemeProvider), and it loads
// Telegram's SDK first so the signed init data is available on first render.
// Matched as a path segment -- a bare prefix check would also catch the admin's /students page.
if (/^\/student(\/|$)/.test(window.location.pathname)) {
  // Loaded on demand, so admin users never download the Mini App (and vice versa).
  Promise.all([import('./student/telegram'), import('./student/StudentApp')]).then(
    async ([{ loadTelegramSdk }, { StudentApp }]) => {
      await loadTelegramSdk()
      root.render(
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <Routes>
                <Route path="/student/*" element={<StudentApp />} />
              </Routes>
            </BrowserRouter>
          </QueryClientProvider>
        </StrictMode>,
      )
    },
  )
} else {
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <AuthProvider>
              <ChatProvider>
                <App />
              </ChatProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}
