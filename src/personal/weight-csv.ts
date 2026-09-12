import { type WeightPayload, weightLossPayloadSchema } from './contracts'
import { createWeeklyRecords } from './weight-plan'

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index++
        } else {
          quoted = false
          closed = true
        }
      } else field += character
    } else if (character === ',') {
      row.push(field)
      field = ''
      closed = false
    } else if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      closed = false
    } else if (character === '\r' && text[index + 1] === '\n') {
      /* CRLF */
    } else if (character === '"' && field === '' && !closed) quoted = true
    else if (closed || character === '"') throw new Error('invalid_csv')
    else field += character
  }
  if (quoted) throw new Error('invalid_csv')
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function importWeightCsv(text: string, current: WeightPayload): WeightPayload {
  const rows = parseCsv(text.replace(/^\uFEFF/u, ''))
  const defaults = new Map(createWeeklyRecords().map((record) => [record.date, record]))
  const result = new Map(current.records.map((record) => [record.date, record]))
  const dates = new Set<string>()
  for (const [index, row] of rows.entries()) {
    if (index === 0 && !/^\d{4}-\d{2}-\d{2}$/.test(row[0] ?? '')) continue
    if (row.every((value) => value.trim() === '')) continue
    const [date, , weight, bodyFat, muscleMass, waist, note] = row
    const target = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/u.exec(row[1] ?? '')
    const baseline =
      defaults.get(date ?? '') ??
      result.get(date ?? '') ??
      (target
        ? {
            date: date ?? '',
            targetMin: Number(target[1]),
            targetMax: Number(target[2]),
            weight: '',
            bodyFat: '',
            muscleMass: '',
            waist: '',
            note: '',
          }
        : undefined)
    if (row.length !== 7 || !date || !baseline || dates.has(date))
      throw new Error('invalid_csv_record')
    dates.add(date)
    result.set(date, {
      ...baseline,
      weight: weight ?? '',
      bodyFat: bodyFat ?? '',
      muscleMass: muscleMass ?? '',
      waist: waist ?? '',
      note: (note ?? '').replace(/^'(?=\s*[=+@-])/u, ''),
    })
  }
  if (!dates.size) throw new Error('empty_csv')
  return weightLossPayloadSchema.parse({
    version: 2,
    records: [...result.values()].sort((a, b) => a.date.localeCompare(b.date)),
  })
}

export function exportWeightCsv(payload: WeightPayload) {
  const records = new Map(createWeeklyRecords().map((record) => [record.date, record]))
  for (const record of payload.records) records.set(record.date, record)
  const rows = [
    ['date', 'targetRange', 'weight', 'bodyFat', 'muscleMass', 'waist', 'note'],
    ...[...records.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((record) => {
        return [
          record.date,
          `${record.targetMin}-${record.targetMax}`,
          record.weight,
          record.bodyFat,
          record.muscleMass,
          record.waist,
          record.note,
        ]
      }),
  ]
  return `\uFEFF${rows.map((row) => row.map((value) => `"${(/^[\s]*[=+@-]/u.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`).join(',')).join('\r\n')}`
}
