import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    __turnstileOnLoad?: () => void
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__turnstileOnLoad&render=explicit"

let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve) => {
    window.__turnstileOnLoad = () => resolve()
    const script = document.createElement("script")
    script.src = SCRIPT_SRC
    script.async = true
    document.head.appendChild(script)
  })
  return scriptPromise
}

export interface TurnstileHandle {
  reset: () => void
}

interface TurnstileProps {
  onVerify: (token: string) => void
  onExpire?: () => void
}

/**
 * Renders a Cloudflare Turnstile widget when VITE_TURNSTILE_SITE_KEY is
 * configured. Without a site key (local dev without a Turnstile widget set
 * up), this renders nothing -- the worker's verifyTurnstile() skips
 * verification the same way when TURNSTILE_SECRET_KEY is unset.
 */
const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile({ onVerify, onExpire }, ref) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current)
    },
  }))

  useEffect(() => {
    if (!siteKey || !containerRef.current) return
    let cancelled = false
    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: onVerify,
        "expired-callback": onExpire,
      })
    })
    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey])

  if (!siteKey) return null
  return <div className="turnstile-container" ref={containerRef} />
})

export default Turnstile
