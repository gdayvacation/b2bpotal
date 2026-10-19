/** Passport nationalities for marina check-in. Labels stay stable for saved guests. */
const NATIONALITY_ENTRIES = [
  { label: 'Afghan', aliases: ['Afghanistan'] },
  { label: 'Albanian', aliases: ['Albania'] },
  { label: 'Algerian', aliases: ['Algeria'] },
  { label: 'American', aliases: ['United States', 'USA', 'America'] },
  { label: 'Andorran', aliases: ['Andorra'] },
  { label: 'Angolan', aliases: ['Angola'] },
  { label: 'Antiguan', aliases: ['Antigua and Barbuda', 'Antigua', 'Barbuda'] },
  { label: 'Argentine', aliases: ['Argentina', 'Argentinian'] },
  { label: 'Armenian', aliases: ['Armenia'] },
  { label: 'Australian', aliases: ['Australia'] },
  { label: 'Austrian', aliases: ['Austria'] },
  { label: 'Azerbaijani', aliases: ['Azerbaijan'] },
  { label: 'Bahamian', aliases: ['Bahamas', 'The Bahamas'] },
  { label: 'Bahraini', aliases: ['Bahrain'] },
  { label: 'Bangladeshi', aliases: ['Bangladesh'] },
  { label: 'Barbadian', aliases: ['Barbados'] },
  { label: 'Belarusian', aliases: ['Belarus'] },
  { label: 'Belgian', aliases: ['Belgium'] },
  { label: 'Belizean', aliases: ['Belize'] },
  { label: 'Beninese', aliases: ['Benin'] },
  { label: 'Bhutanese', aliases: ['Bhutan'] },
  { label: 'Bissau-Guinean', aliases: ['Guinea-Bissau', 'Guinea Bissau'] },
  { label: 'Bolivian', aliases: ['Bolivia'] },
  { label: 'Bosnian', aliases: ['Bosnia and Herzegovina', 'Bosnia', 'Herzegovina'] },
  { label: 'Botswanan', aliases: ['Botswana', 'Motswana'] },
  { label: 'Brazilian', aliases: ['Brazil'] },
  { label: 'British', aliases: ['United Kingdom', 'UK', 'Britain', 'Great Britain', 'England', 'Scotland', 'Wales'] },
  { label: 'Bruneian', aliases: ['Brunei'] },
  { label: 'Bulgarian', aliases: ['Bulgaria'] },
  { label: 'Burkinabe', aliases: ['Burkina Faso'] },
  { label: 'Burmese', aliases: ['Myanmar', 'Burma'] },
  { label: 'Burundian', aliases: ['Burundi'] },
  { label: 'Cambodian', aliases: ['Cambodia'] },
  { label: 'Cameroonian', aliases: ['Cameroon'] },
  { label: 'Canadian', aliases: ['Canada'] },
  { label: 'Cape Verdean', aliases: ['Cabo Verde', 'Cape Verde'] },
  { label: 'Central African', aliases: ['Central African Republic'] },
  { label: 'Chadian', aliases: ['Chad'] },
  { label: 'Chilean', aliases: ['Chile'] },
  { label: 'Chinese', aliases: ['China', 'PRC'] },
  { label: 'Colombian', aliases: ['Colombia'] },
  { label: 'Comorian', aliases: ['Comoros'] },
  { label: 'Congolese', aliases: ['Republic of the Congo', 'Congo-Brazzaville'] },
  { label: 'Congolese (DRC)', aliases: ['DR Congo', 'DRC', 'Democratic Republic of the Congo', 'Congo-Kinshasa'] },
  { label: 'Costa Rican', aliases: ['Costa Rica'] },
  { label: 'Croatian', aliases: ['Croatia'] },
  { label: 'Cuban', aliases: ['Cuba'] },
  { label: 'Cypriot', aliases: ['Cyprus'] },
  { label: 'Czech', aliases: ['Czechia', 'Czech Republic'] },
  { label: 'Danish', aliases: ['Denmark'] },
  { label: 'Djiboutian', aliases: ['Djibouti'] },
  { label: 'Dominican', aliases: ['Dominican Republic'] },
  { label: 'Dominican (Dominica)', aliases: ['Dominica'] },
  { label: 'Dutch', aliases: ['Netherlands', 'Holland'] },
  { label: 'Ecuadorian', aliases: ['Ecuador'] },
  { label: 'Egyptian', aliases: ['Egypt'] },
  { label: 'Emirati', aliases: ['United Arab Emirates', 'UAE', 'Emirates'] },
  { label: 'Equatorial Guinean', aliases: ['Equatorial Guinea'] },
  { label: 'Eritrean', aliases: ['Eritrea'] },
  { label: 'Estonian', aliases: ['Estonia'] },
  { label: 'Ethiopian', aliases: ['Ethiopia'] },
  { label: 'Fijian', aliases: ['Fiji'] },
  { label: 'Filipino', aliases: ['Philippines'] },
  { label: 'Finnish', aliases: ['Finland'] },
  { label: 'French', aliases: ['France'] },
  { label: 'Gabonese', aliases: ['Gabon'] },
  { label: 'Gambian', aliases: ['Gambia', 'The Gambia'] },
  { label: 'Georgian', aliases: ['Georgia'] },
  { label: 'German', aliases: ['Germany'] },
  { label: 'Ghanaian', aliases: ['Ghana'] },
  { label: 'Greek', aliases: ['Greece'] },
  { label: 'Grenadian', aliases: ['Grenada'] },
  { label: 'Guatemalan', aliases: ['Guatemala'] },
  { label: 'Guinean', aliases: ['Guinea'] },
  { label: 'Guyanese', aliases: ['Guyana'] },
  { label: 'Haitian', aliases: ['Haiti'] },
  { label: 'Honduran', aliases: ['Honduras'] },
  { label: 'Hong Kong', aliases: ['Hong Kong SAR', 'Hongkonger'] },
  { label: 'Hungarian', aliases: ['Hungary'] },
  { label: 'I-Kiribati', aliases: ['Kiribati'] },
  { label: 'Icelandic', aliases: ['Iceland'] },
  { label: 'Indian', aliases: ['India'] },
  { label: 'Indonesian', aliases: ['Indonesia'] },
  { label: 'Iranian', aliases: ['Iran'] },
  { label: 'Iraqi', aliases: ['Iraq'] },
  { label: 'Irish', aliases: ['Ireland'] },
  { label: 'Israeli', aliases: ['Israel'] },
  { label: 'Italian', aliases: ['Italy'] },
  { label: 'Ivorian', aliases: ["Cote d'Ivoire", 'Ivory Coast', 'Côte d’Ivoire'] },
  { label: 'Jamaican', aliases: ['Jamaica'] },
  { label: 'Japanese', aliases: ['Japan'] },
  { label: 'Jordanian', aliases: ['Jordan'] },
  { label: 'Kazakh', aliases: ['Kazakhstan', 'Kazakhstani'] },
  { label: 'Kenyan', aliases: ['Kenya'] },
  { label: 'Kittitian', aliases: ['Saint Kitts and Nevis', 'St Kitts', 'Nevis'] },
  { label: 'Korean', aliases: ['South Korea', 'South Korean', 'Republic of Korea', 'Korea'] },
  { label: 'Kosovar', aliases: ['Kosovo', 'Kosovan'] },
  { label: 'Kuwaiti', aliases: ['Kuwait'] },
  { label: 'Kyrgyz', aliases: ['Kyrgyzstan', 'Kyrgyzstani'] },
  { label: 'Lao', aliases: ['Laos', 'Laotian'] },
  { label: 'Latvian', aliases: ['Latvia'] },
  { label: 'Lebanese', aliases: ['Lebanon'] },
  { label: 'Liberian', aliases: ['Liberia'] },
  { label: 'Libyan', aliases: ['Libya'] },
  { label: 'Liechtensteiner', aliases: ['Liechtenstein'] },
  { label: 'Lithuanian', aliases: ['Lithuania'] },
  { label: 'Luxembourgish', aliases: ['Luxembourg'] },
  { label: 'Macanese', aliases: ['Macau', 'Macao'] },
  { label: 'Macedonian', aliases: ['North Macedonia', 'Macedonia'] },
  { label: 'Malagasy', aliases: ['Madagascar'] },
  { label: 'Malawian', aliases: ['Malawi'] },
  { label: 'Malaysian', aliases: ['Malaysia'] },
  { label: 'Maldivian', aliases: ['Maldives'] },
  { label: 'Malian', aliases: ['Mali'] },
  { label: 'Maltese', aliases: ['Malta'] },
  { label: 'Marshallese', aliases: ['Marshall Islands'] },
  { label: 'Mauritanian', aliases: ['Mauritania'] },
  { label: 'Mauritian', aliases: ['Mauritius', 'Maurice'] },
  { label: 'Mexican', aliases: ['Mexico'] },
  { label: 'Micronesian', aliases: ['Micronesia'] },
  { label: 'Moldovan', aliases: ['Moldova'] },
  { label: 'Monegasque', aliases: ['Monaco'] },
  { label: 'Mongolian', aliases: ['Mongolia'] },
  { label: 'Montenegrin', aliases: ['Montenegro'] },
  { label: 'Moroccan', aliases: ['Morocco'] },
  { label: 'Mosotho', aliases: ['Lesotho', 'Basotho'] },
  { label: 'Mozambican', aliases: ['Mozambique'] },
  { label: 'Namibian', aliases: ['Namibia'] },
  { label: 'Nauruan', aliases: ['Nauru'] },
  { label: 'Nepalese', aliases: ['Nepal', 'Nepali'] },
  { label: 'New Zealander', aliases: ['New Zealand'] },
  { label: 'Nicaraguan', aliases: ['Nicaragua'] },
  { label: 'Nigerien', aliases: ['Niger'] },
  { label: 'Nigerian', aliases: ['Nigeria'] },
  { label: 'Ni-Vanuatu', aliases: ['Vanuatu'] },
  { label: 'North Korean', aliases: ['North Korea', 'DPRK'] },
  { label: 'Norwegian', aliases: ['Norway'] },
  { label: 'Omani', aliases: ['Oman'] },
  { label: 'Pakistani', aliases: ['Pakistan'] },
  { label: 'Palauan', aliases: ['Palau'] },
  { label: 'Palestinian', aliases: ['Palestine'] },
  { label: 'Panamanian', aliases: ['Panama'] },
  { label: 'Papua New Guinean', aliases: ['Papua New Guinea'] },
  { label: 'Paraguayan', aliases: ['Paraguay'] },
  { label: 'Peruvian', aliases: ['Peru'] },
  { label: 'Polish', aliases: ['Poland'] },
  { label: 'Portuguese', aliases: ['Portugal'] },
  { label: 'Qatari', aliases: ['Qatar'] },
  { label: 'Romanian', aliases: ['Romania'] },
  { label: 'Russian', aliases: ['Russia'] },
  { label: 'Rwandan', aliases: ['Rwanda'] },
  { label: 'Saint Lucian', aliases: ['Saint Lucia', 'St Lucia'] },
  { label: 'Salvadoran', aliases: ['El Salvador'] },
  { label: 'Sammarinese', aliases: ['San Marino'] },
  { label: 'Samoan', aliases: ['Samoa'] },
  { label: 'Sao Tomean', aliases: ['Sao Tome and Principe', 'São Tomé and Príncipe'] },
  { label: 'Saudi', aliases: ['Saudi Arabia', 'Saudi Arabian'] },
  { label: 'Senegalese', aliases: ['Senegal'] },
  { label: 'Serbian', aliases: ['Serbia'] },
  { label: 'Seychellois', aliases: ['Seychelles'] },
  { label: 'Sierra Leonean', aliases: ['Sierra Leone'] },
  { label: 'Singaporean', aliases: ['Singapore'] },
  { label: 'Slovak', aliases: ['Slovakia'] },
  { label: 'Slovenian', aliases: ['Slovenia'] },
  { label: 'Solomon Islander', aliases: ['Solomon Islands'] },
  { label: 'Somali', aliases: ['Somalia'] },
  { label: 'South African', aliases: ['South Africa'] },
  { label: 'South Sudanese', aliases: ['South Sudan'] },
  { label: 'Spanish', aliases: ['Spain'] },
  { label: 'Sri Lankan', aliases: ['Sri Lanka'] },
  { label: 'Sudanese', aliases: ['Sudan'] },
  { label: 'Surinamese', aliases: ['Suriname'] },
  { label: 'Swazi', aliases: ['Eswatini', 'Swaziland'] },
  { label: 'Swedish', aliases: ['Sweden'] },
  { label: 'Swiss', aliases: ['Switzerland'] },
  { label: 'Syrian', aliases: ['Syria'] },
  { label: 'Taiwanese', aliases: ['Taiwan'] },
  { label: 'Tajik', aliases: ['Tajikistan', 'Tajikistani'] },
  { label: 'Tanzanian', aliases: ['Tanzania'] },
  { label: 'Thai', aliases: ['Thailand'] },
  { label: 'Timorese', aliases: ['Timor-Leste', 'East Timor', 'Timor'] },
  { label: 'Togolese', aliases: ['Togo'] },
  { label: 'Tongan', aliases: ['Tonga'] },
  { label: 'Trinidadian', aliases: ['Trinidad and Tobago', 'Trinidad', 'Tobago'] },
  { label: 'Tunisian', aliases: ['Tunisia'] },
  { label: 'Turkish', aliases: ['Turkey', 'Turkiye', 'Türkiye'] },
  { label: 'Turkmen', aliases: ['Turkmenistan'] },
  { label: 'Tuvaluan', aliases: ['Tuvalu'] },
  { label: 'Ugandan', aliases: ['Uganda'] },
  { label: 'Ukrainian', aliases: ['Ukraine'] },
  { label: 'Uruguayan', aliases: ['Uruguay'] },
  { label: 'Uzbek', aliases: ['Uzbekistan', 'Uzbekistani'] },
  { label: 'Vatican', aliases: ['Holy See'] },
  { label: 'Venezuelan', aliases: ['Venezuela'] },
  { label: 'Vietnamese', aliases: ['Vietnam'] },
  { label: 'Vincentian', aliases: ['Saint Vincent and the Grenadines', 'St Vincent'] },
  { label: 'Yemeni', aliases: ['Yemen'] },
  { label: 'Zambian', aliases: ['Zambia'] },
  { label: 'Zimbabwean', aliases: ['Zimbabwe'] },
] as const

export const NATIONALITIES = NATIONALITY_ENTRIES.map((entry) => entry.label)

export type Nationality = (typeof NATIONALITY_ENTRIES)[number]['label']

export const THAI_NATIONALITY = 'Thai'
export const THAI_PARK_FEE_THB = 40

export function isThaiNationality(value: string | null | undefined) {
  return value?.trim().toLowerCase() === 'thai'
}

export function thaiGuestCount(
  rows: Array<{ nationality?: string | null; seats?: number | null }>,
) {
  return rows.reduce((sum, row) => {
    if (!isThaiNationality(row.nationality)) return sum
    return sum + Math.max(1, Math.floor(Number(row.seats) || 1))
  }, 0)
}

export function thaiParkFeeTotal(count: number) {
  return Math.max(0, Math.floor(count)) * THAI_PARK_FEE_THB
}

/** Shown first in the typeahead — main guest markets. */
const PRIORITY_NATIONALITIES: readonly Nationality[] = ['Indian']

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ')
}

function rankText(text: string, query: string) {
  if (text === query) return 0
  if (text.startsWith(query)) return 1
  if (query.length >= 4 && text.includes(query)) return 2
  return null
}

function scoreEntry(entry: (typeof NATIONALITY_ENTRIES)[number], query: string) {
  let best = rankText(normalize(entry.label), query)
  for (const alias of entry.aliases) {
    const rank = rankText(normalize(alias), query)
    if (rank === null) continue
    if (best === null || rank < best) best = rank
  }
  return best
}

export function matchNationality(value: string): string | null {
  const query = normalize(value)
  if (!query) return null
  const byLabel = NATIONALITY_ENTRIES.find((entry) => normalize(entry.label) === query)
  if (byLabel) return byLabel.label
  const byAlias = NATIONALITY_ENTRIES.filter((entry) =>
    entry.aliases.some((alias) => normalize(alias) === query),
  )
  return byAlias.length === 1 ? byAlias[0].label : null
}

/** Country name when it is not already obvious from the demonym. */
export function nationalityCountry(label: string): string | null {
  const entry = NATIONALITY_ENTRIES.find((item) => item.label === label)
  const country = entry?.aliases[0]
  if (!country) return null
  const labelKey = normalize(label)
  const countryKey = normalize(country)
  if (labelKey === countryKey || labelKey.startsWith(countryKey) || countryKey.startsWith(labelKey)) {
    return null
  }
  return country
}

export function filterNationalities(query: string, limit = 24): string[] {
  const q = normalize(query)
  const prioritySet = new Set<string>(PRIORITY_NATIONALITIES)

  if (!q) {
    const rest = NATIONALITIES.filter((item) => !prioritySet.has(item))
    return [...PRIORITY_NATIONALITIES, ...rest].slice(0, limit)
  }

  const ranked = NATIONALITY_ENTRIES.flatMap((entry) => {
    const score = scoreEntry(entry, q)
    return score === null ? [] : [{ entry, score }]
  })

  ranked.sort((a, b) => {
    const aPriority = prioritySet.has(a.entry.label) ? 0 : 1
    const bPriority = prioritySet.has(b.entry.label) ? 0 : 1
    if (aPriority !== bPriority) return aPriority - bPriority
    if (a.score !== b.score) return a.score - b.score
    return a.entry.label.localeCompare(b.entry.label)
  })

  return ranked.slice(0, limit).map((item) => item.entry.label)
}
