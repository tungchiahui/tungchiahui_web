export type LyricLine = Readonly<{ key: string; text: string; time: number }>

export function parseLyrics(value: string): LyricLine[] {
  const timePattern = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  const parsed: LyricLine[] = []
  value.split(/\r?\n/).forEach((line, lineIndex) => {
    const matches = [...line.matchAll(timePattern)]
    const text = line
      .replace(timePattern, '')
      .replace(/\[(?:ar|ti|al|by|offset):[^\]]*\]/gi, '')
      .trim()
    if (!matches.length || !text) return
    matches.forEach((match, matchIndex) => {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = match[3] ? Number(match[3].padEnd(3, '0').slice(0, 3)) / 1000 : 0
      parsed.push({
        key: `${lineIndex}-${matchIndex}`,
        text,
        time: minutes * 60 + seconds + fraction,
      })
    })
  })
  return parsed.sort((a, b) => a.time - b.time)
}

export function currentLyricIndex(lines: readonly LyricLine[], currentTime: number): number {
  if (!lines.length) return -1
  const now = currentTime + 0.18
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (line && now >= line.time) return index
  }
  return 0
}
