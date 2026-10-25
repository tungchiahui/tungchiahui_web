export {}

const messages: Readonly<Record<string, string>> = JSON.parse(
  document.body.dataset.messages ?? '{}',
) as Record<string, string>
const input = document.querySelector<HTMLInputElement>('#files')
const start = document.querySelector<HTMLButtonElement>('#convert')
const results = document.querySelector<HTMLDivElement>('#results')
start?.addEventListener('click', async () => {
  if (!input?.files || !results) return
  start.disabled = true
  for (const file of input.files) {
    const row = document.createElement('p')
    row.textContent = `${file.name} · ${messages.studioWorking}`
    results.append(row)
    try {
      const response = await fetch('/convert', {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-music-file': encodeURIComponent(file.name),
          'x-music-studio': document.body.dataset.token ?? '',
        },
        body: file,
      })
      if (!response.ok) throw new Error('conversion_failed')
      const name = decodeURIComponent(response.headers.get('x-music-file') ?? 'audio.mp3')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.textContent = `${messages.studioDone} · ${name}`
      row.replaceChildren(link)
      link.click()
      link.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(url), 60_000), {
        once: true,
      })
    } catch {
      row.textContent = `${file.name} · ${messages.studioFailed}`
    }
  }
  start.disabled = false
})
