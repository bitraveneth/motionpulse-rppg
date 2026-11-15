import { useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { LocalLab } from './LocalLab'
import { isLocalLabEnabled } from '../lib/lab/enabled'

/** Keeps the dataset reader mounted when the lab page is not on screen. */
export function PersistentLab() {
  const { pathname } = useLocation()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setSlot(pathname === '/local-lab' ? document.getElementById('lab-slot') : null)
  }, [pathname])
  if (!isLocalLabEnabled()) return null
  return <LocalLab slot={slot} />
}
