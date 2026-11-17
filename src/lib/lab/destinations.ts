export const LAB_DESTINATIONS = [
  { to: '/local-lab', label: 'Local lab' },
  { to: '/results', label: 'Test results' },
  { to: '/findings', label: 'Findings' },
  { to: '/train', label: 'Train' },
  { to: '/train-results', label: 'Train results' },
] as const

export function isLabPath(pathname: string): boolean {
  return (
    pathname === '/local-lab' ||
    pathname === '/findings' ||
    pathname === '/train' ||
    pathname.startsWith('/train-results') ||
    pathname.startsWith('/results')
  )
}
