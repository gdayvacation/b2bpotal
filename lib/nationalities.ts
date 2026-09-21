/** Common passport nationalities for marina check-in typeahead. */
export const NATIONALITIES = [
  'Afghan',
  'Albanian',
  'Algerian',
  'American',
  'Argentine',
  'Armenian',
  'Australian',
  'Austrian',
  'Azerbaijani',
  'Bahraini',
  'Bangladeshi',
  'Belarusian',
  'Belgian',
  'Bolivian',
  'Bosnian',
  'Brazilian',
  'British',
  'Bulgarian',
  'Burmese',
  'Cambodian',
  'Canadian',
  'Chilean',
  'Chinese',
  'Colombian',
  'Croatian',
  'Czech',
  'Danish',
  'Dutch',
  'Egyptian',
  'Emirati',
  'Estonian',
  'Filipino',
  'Finnish',
  'French',
  'Georgian',
  'German',
  'Greek',
  'Hong Kong',
  'Hungarian',
  'Icelandic',
  'Indian',
  'Indonesian',
  'Iranian',
  'Iraqi',
  'Irish',
  'Israeli',
  'Italian',
  'Japanese',
  'Jordanian',
  'Kazakh',
  'Kenyan',
  'Korean',
  'Kuwaiti',
  'Lao',
  'Latvian',
  'Lebanese',
  'Lithuanian',
  'Luxembourgish',
  'Malaysian',
  'Maltese',
  'Mexican',
  'Mongolian',
  'Moroccan',
  'Nepalese',
  'New Zealander',
  'Nigerian',
  'Norwegian',
  'Omani',
  'Pakistani',
  'Peruvian',
  'Polish',
  'Portuguese',
  'Qatari',
  'Romanian',
  'Russian',
  'Saudi',
  'Serbian',
  'Singaporean',
  'Slovak',
  'Slovenian',
  'South African',
  'Spanish',
  'Sri Lankan',
  'Swedish',
  'Swiss',
  'Taiwanese',
  'Thai',
  'Turkish',
  'Ukrainian',
  'Vietnamese',
] as const

export type Nationality = (typeof NATIONALITIES)[number]

/** Shown first in the typeahead — main guest markets. */
const PRIORITY_NATIONALITIES: readonly Nationality[] = ['Indian']

export function matchNationality(value: string): string | null {
  const query = value.trim().toLowerCase()
  if (!query) return null
  const exact = NATIONALITIES.find((item) => item.toLowerCase() === query)
  return exact ?? null
}

export function filterNationalities(query: string, limit = 10): string[] {
  const q = query.trim().toLowerCase()
  const prioritySet = new Set<string>(PRIORITY_NATIONALITIES)

  if (!q) {
    const rest = NATIONALITIES.filter((item) => !prioritySet.has(item))
    return [...PRIORITY_NATIONALITIES, ...rest].slice(0, limit)
  }

  const starts = NATIONALITIES.filter((item) => item.toLowerCase().startsWith(q))
  const contains = NATIONALITIES.filter(
    (item) => !item.toLowerCase().startsWith(q) && item.toLowerCase().includes(q),
  )
  const ranked = [...starts, ...contains]
  ranked.sort((a, b) => {
    const aPriority = prioritySet.has(a) ? 0 : 1
    const bPriority = prioritySet.has(b) ? 0 : 1
    if (aPriority !== bPriority) return aPriority - bPriority
    return 0
  })
  return ranked.slice(0, limit)
}
