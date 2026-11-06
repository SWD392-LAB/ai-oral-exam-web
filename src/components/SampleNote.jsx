import { USE_MOCKS } from '../api/client.js'

// The wireframes label sample data at the foot of each page; shown only while the app runs on mocks.
export function SampleNote({ children, style }) {
  if (!USE_MOCKS) return null
  return (
    <p style={{ marginTop: 'auto', paddingTop: '72px', fontSize: '13.5px', color: 'var(--ivory-3)', ...style }}>
      {children}
    </p>
  )
}
