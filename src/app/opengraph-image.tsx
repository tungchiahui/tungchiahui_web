import { ImageResponse } from 'next/og'
import messages from '../../messages/en-us.json'

export const alt = messages.Web.metadataDescription
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#080f21',
        color: '#f4f7ff',
        padding: '72px',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          color: '#7db6ff',
          fontSize: 28,
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 48,
            height: 48,
            border: '2px solid #7db6ff',
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
          }}
        >
          T
        </div>
        {messages.Web.footerLabNotes}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', fontSize: 92, fontWeight: 700, letterSpacing: '-4px' }}>
          TungChiaHui
        </div>
        <div style={{ display: 'flex', fontSize: 34, color: '#a9b8d1' }}>
          {messages.Web.footerDescription}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 4,
          background: 'linear-gradient(90deg, #4b9dff, #33d9aa, #080f21)',
        }}
      />
    </div>,
    size,
  )
}
