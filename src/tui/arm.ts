import { useEffect, useState } from "react"

export function useArmed(delayMs = 60): boolean {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])
  return armed
}
