import { useEffect } from 'react'

export function useDocTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — MPS Billing` : 'MPS Billing'
    return () => { document.title = 'MPS Billing' }
  }, [title])
}
