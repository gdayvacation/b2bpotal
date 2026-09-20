import type { Agent, Availability, Booking, PickupZone } from '@/lib/types'
import { bookingCodeStem } from '@/lib/format'

export const AGENTS: Agent[] = [
  { slug: 'abc-travel', name: 'ABC Travel India', country: 'India', status: 'Active' },
  { slug: 'golden-triangle', name: 'Golden Triangle Travel', country: 'India', status: 'Active' },
  { slug: 'mumbai-holidays', name: 'Mumbai Holidays', country: 'India', status: 'Active' },
  { slug: 'delhi-travel', name: 'Delhi Travel Group', country: 'India', status: 'Active' },
]

export const INITIAL_ZONES: PickupZone[] = [
  { name: 'Patong', time: '07:30', pending: false },
  { name: 'Kata', time: '07:45', pending: false },
  { name: 'Karon', time: '08:00', pending: false },
  { name: 'Other', time: 'Awaiting pickup time', pending: true },
]

/** Realistic day board: mostly couples / singles, a few small groups. */
const SEP17_PP_GUESTS: Array<{
  guest: string
  agent: (typeof AGENTS)[number]
  adults: number
  children?: number
  infants?: number
  zone: PickupZone['name']
  hotel: string
  pending?: boolean
}> = [
  { guest: 'John Smith', agent: AGENTS[0], adults: 2, zone: 'Patong', hotel: 'ABC Hotel' },
  { guest: 'Sanjay Patel', agent: AGENTS[2], adults: 1, zone: 'Karon', hotel: 'Centara Grand' },
  { guest: 'Neha Gupta', agent: AGENTS[3], adults: 2, children: 1, zone: 'Kata', hotel: 'Kata Palm Resort' },
  { guest: 'Arjun Reddy', agent: AGENTS[1], adults: 2, zone: 'Patong', hotel: 'Holiday Inn Resort' },
  { guest: 'Lisa Wong', agent: AGENTS[0], adults: 1, zone: 'Other', hotel: 'The Nai Harn', pending: true },
  { guest: 'Vikram Shah', agent: AGENTS[2], adults: 2, zone: 'Karon', hotel: 'Beyond Resort Karon' },
  { guest: 'Emma Clarke', agent: AGENTS[1], adults: 2, zone: 'Patong', hotel: 'Impiana Patong' },
  { guest: 'Hiro Tanaka', agent: AGENTS[0], adults: 1, zone: 'Kata', hotel: 'Boathouse' },
  { guest: 'Maria Santos', agent: AGENTS[3], adults: 2, zone: 'Karon', hotel: 'Centara Grand' },
  { guest: 'Omar Hassan', agent: AGENTS[2], adults: 1, children: 1, zone: 'Patong', hotel: 'Novotel Phuket' },
  { guest: 'Chen Wei', agent: AGENTS[1], adults: 2, zone: 'Kata', hotel: 'Kata Palm Resort' },
  { guest: 'Anna Kowalski', agent: AGENTS[0], adults: 1, zone: 'Karon', hotel: 'Beyond Resort Karon' },
  { guest: 'Diego Alvarez', agent: AGENTS[3], adults: 2, infants: 1, zone: 'Patong', hotel: 'ABC Hotel' },
  { guest: 'Priya Iyer', agent: AGENTS[2], adults: 2, zone: 'Other', hotel: 'Laguna Phuket', pending: true },
  { guest: 'Tom Hughes', agent: AGENTS[1], adults: 1, zone: 'Patong', hotel: 'Holiday Inn Resort' },
  { guest: 'Sofia Ricci', agent: AGENTS[0], adults: 2, zone: 'Kata', hotel: 'Boathouse' },
  { guest: 'James Park', agent: AGENTS[3], adults: 2, children: 1, zone: 'Karon', hotel: 'Centara Grand' },
  { guest: 'Fatima Noor', agent: AGENTS[2], adults: 1, zone: 'Patong', hotel: 'Impiana Patong' },
  { guest: 'Lucas Meyer', agent: AGENTS[1], adults: 2, zone: 'Kata', hotel: 'Kata Palm Resort' },
  { guest: 'Yuki Sato', agent: AGENTS[0], adults: 1, zone: 'Karon', hotel: 'Beyond Resort Karon' },
  { guest: 'Nora Lindqvist', agent: AGENTS[3], adults: 2, zone: 'Patong', hotel: 'Novotel Phuket' },
  { guest: 'Raj Malhotra', agent: AGENTS[2], adults: 2, zone: 'Other', hotel: 'The Nai Harn', pending: true },
  { guest: 'Chloe Dubois', agent: AGENTS[1], adults: 1, children: 1, zone: 'Kata', hotel: 'Boathouse' },
  { guest: 'Ben Carter', agent: AGENTS[0], adults: 2, zone: 'Patong', hotel: 'ABC Hotel' },
  { guest: 'Aisha Khan', agent: AGENTS[3], adults: 1, zone: 'Karon', hotel: 'Centara Grand' },
  { guest: 'Marco Rossi', agent: AGENTS[2], adults: 2, zone: 'Patong', hotel: 'Holiday Inn Resort' },
  { guest: 'Helen Cho', agent: AGENTS[1], adults: 2, zone: 'Kata', hotel: 'Kata Palm Resort' },
  { guest: 'Ibrahim Ali', agent: AGENTS[0], adults: 1, zone: 'Karon', hotel: 'Beyond Resort Karon' },
  { guest: 'Grace Kim', agent: AGENTS[3], adults: 8, children: 4, zone: 'Patong', hotel: 'Impiana Patong' },
  { guest: 'Peter Novak', agent: AGENTS[2], adults: 2, zone: 'Kata', hotel: 'Boathouse' },
]

const SEP17_JB_GUESTS: Array<{
  guest: string
  agent: (typeof AGENTS)[number]
  adults: number
  children?: number
  infants?: number
  tourLeaders?: number
  zone: PickupZone['name']
  hotel: string
  canoe: 'Included' | 'Not Included'
}> = [
  { guest: 'Priya Nair', agent: AGENTS[1], adults: 2, zone: 'Kata', hotel: 'Kata Palm Resort', canoe: 'Included' },
  { guest: 'Amit Verma', agent: AGENTS[3], adults: 1, zone: 'Patong', hotel: 'Impiana Patong', canoe: 'Not Included' },
  { guest: 'Sophie Martin', agent: AGENTS[0], adults: 2, children: 1, zone: 'Karon', hotel: 'Centara Grand', canoe: 'Included' },
  { guest: 'Ken Watanabe', agent: AGENTS[2], adults: 1, zone: 'Patong', hotel: 'Novotel Phuket', canoe: 'Included' },
  { guest: 'Lara Costa', agent: AGENTS[1], adults: 2, zone: 'Kata', hotel: 'Boathouse', canoe: 'Not Included' },
  { guest: 'Daniel Lee', agent: AGENTS[0], adults: 2, zone: 'Karon', hotel: 'Beyond Resort Karon', canoe: 'Included' },
  { guest: 'Maya Singh', agent: AGENTS[3], adults: 1, children: 1, zone: 'Patong', hotel: 'ABC Hotel', canoe: 'Included' },
  { guest: 'Oliver Brown', agent: AGENTS[2], adults: 2, tourLeaders: 1, zone: 'Kata', hotel: 'Kata Palm Resort', canoe: 'Included' },
  { guest: 'Ines Dubois', agent: AGENTS[1], adults: 1, zone: 'Karon', hotel: 'Centara Grand', canoe: 'Not Included' },
  { guest: 'Samir Patel', agent: AGENTS[0], adults: 2, zone: 'Patong', hotel: 'Holiday Inn Resort', canoe: 'Included' },
  { guest: 'Nina Volkov', agent: AGENTS[3], adults: 2, infants: 1, zone: 'Kata', hotel: 'Boathouse', canoe: 'Included' },
  { guest: 'Jack Wilson', agent: AGENTS[2], adults: 1, zone: 'Patong', hotel: 'Impiana Patong', canoe: 'Not Included' },
]

function zoneTime(zone: string, pending?: boolean) {
  if (zone === 'No Transfer') return { pickupTime: 'No transfer', status: 'Confirmed' as const }
  if (pending || zone === 'Other') return { pickupTime: 'Awaiting pickup time', status: 'Pending Pickup Time' as const }
  const match = INITIAL_ZONES.find((item) => item.name === zone)
  return { pickupTime: match?.time ?? '07:30', status: 'Confirmed' as const }
}

type DayGuest = {
  guest: string
  agent: (typeof AGENTS)[number]
  adults: number
  children?: number
  infants?: number
  tourLeaders?: number
  zone: string
  hotel: string
  pending?: boolean
  canoe?: 'Included' | 'Not Included'
  note?: string
  cashOnTour?: string
}

function buildDayBookings(
  rows: DayGuest[],
  program: 'PP' | 'James Bond',
  date: string,
): Booking[] {
  return rows.map((row, index) => {
    const meta = zoneTime(row.zone, row.pending)
    const noHotel = row.zone === 'No Transfer'
    return {
      code: `${program === 'PP' ? 'PP' : 'JB'}TMP-${date}-${index}`,
      agentSlug: row.agent.slug,
      agentName: row.agent.name,
      agentRef: '',
      program,
      date,
      parkFee: index % 5 === 0 ? ('Not Included' as const) : ('Included' as const),
      canoe: program === 'James Bond' ? (row.canoe ?? 'Included') : null,
      adults: row.adults,
      children: row.children ?? 0,
      infants: row.infants ?? 0,
      tourLeaders: row.tourLeaders ?? 0,
      leadGuest: row.guest,
      pickupZone: row.zone,
      pickupHotel: noHotel ? '' : row.hotel,
      roomNumber: '',
      note: row.note ?? '',
      cashOnTour: row.cashOnTour ?? '',
      transferExtraCharge: '',
      pickupTime: meta.pickupTime,
      status: meta.status,
    }
  })
}

const SEP17_PP_BOOKINGS: Booking[] = SEP17_PP_GUESTS.map((row, index) => {
  const meta = zoneTime(row.zone, row.pending)
  return {
    code: `PP2609-${String(index + 1).padStart(4, '0')}`,
    agentSlug: row.agent.slug,
    agentName: row.agent.name,
    agentRef: '',
    program: 'PP' as const,
    date: '2026-09-17',
    parkFee: index % 5 === 0 ? ('Not Included' as const) : ('Included' as const),
    canoe: null,
    adults: row.adults,
    children: row.children ?? 0,
    infants: row.infants ?? 0,
    tourLeaders: 0,
    leadGuest: row.guest,
    pickupZone: row.zone,
    pickupHotel: row.hotel,
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: meta.pickupTime,
    status: meta.status,
  }
})

const SEP17_JB_BOOKINGS: Booking[] = SEP17_JB_GUESTS.map((row, index) => {
  const meta = zoneTime(row.zone)
  return {
    code: `JB2609-${String(index + 1).padStart(4, '0')}`,
    agentSlug: row.agent.slug,
    agentName: row.agent.name,
    agentRef: '',
    program: 'James Bond' as const,
    date: '2026-09-17',
    parkFee: 'Included' as const,
    canoe: row.canoe,
    adults: row.adults,
    children: row.children ?? 0,
    infants: row.infants ?? 0,
    tourLeaders: row.tourLeaders ?? 0,
    leadGuest: row.guest,
    pickupZone: row.zone,
    pickupHotel: row.hotel,
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: meta.pickupTime,
    status: meta.status,
  }
})

/** Busy boards for van → boat testing, including No Transfer guests. */
const SEP18_PP: DayGuest[] = [
  { guest: 'Rahul Mehta', agent: AGENTS[2], adults: 2, children: 1, zone: 'Karon', hotel: 'Centara Grand' },
  { guest: 'Ananya Sharma', agent: AGENTS[3], adults: 2, zone: 'Patong', hotel: 'Holiday Inn Resort' },
  { guest: 'Wei Lin', agent: AGENTS[0], adults: 1, zone: 'Kata', hotel: 'Boathouse' },
  { guest: 'Carla Mendes', agent: AGENTS[1], adults: 2, zone: 'Patong', hotel: 'Impiana Patong' },
  { guest: 'Jon Park', agent: AGENTS[2], adults: 2, infants: 1, zone: 'Karon', hotel: 'Beyond Resort Karon' },
  { guest: 'Self Drive Party', agent: AGENTS[0], adults: 3, zone: 'No Transfer', hotel: '', note: 'Own car — meet at pier' },
  { guest: 'Hotel Guest Walk-in', agent: AGENTS[3], adults: 2, zone: 'No Transfer', hotel: '', cashOnTour: '1,800 THB' },
  { guest: 'Priya Desai', agent: AGENTS[1], adults: 1, children: 1, zone: 'Kata', hotel: 'Kata Palm Resort' },
  { guest: 'Tom Bradley', agent: AGENTS[2], adults: 2, zone: 'Patong', hotel: 'Novotel Phuket' },
  { guest: 'Yuki Mori', agent: AGENTS[0], adults: 1, zone: 'Other', hotel: 'The Nai Harn', pending: true },
  { guest: 'Sara Ali', agent: AGENTS[3], adults: 2, zone: 'Karon', hotel: 'Centara Grand' },
  { guest: 'Group Boat Meet', agent: AGENTS[1], adults: 4, zone: 'No Transfer', hotel: '', note: 'Already at pier 08:00' },
]

const SEP18_JB: DayGuest[] = [
  { guest: 'Michael Tan', agent: AGENTS[1], adults: 2, zone: 'Kata', hotel: 'The Shore Residences', canoe: 'Included' },
  { guest: 'Elena Rossi', agent: AGENTS[0], adults: 2, children: 1, zone: 'Patong', hotel: 'ABC Hotel', canoe: 'Included' },
  { guest: 'No Transfer Duo', agent: AGENTS[2], adults: 2, zone: 'No Transfer', hotel: '', canoe: 'Not Included', note: 'Taxi themselves' },
  { guest: 'Hans Mueller', agent: AGENTS[3], adults: 1, zone: 'Karon', hotel: 'Centara Grand', canoe: 'Included' },
  { guest: 'Amy Chen', agent: AGENTS[0], adults: 2, zone: 'Patong', hotel: 'Impiana Patong', canoe: 'Included' },
  { guest: 'Pier Meetup', agent: AGENTS[1], adults: 3, tourLeaders: 1, zone: 'No Transfer', hotel: '', canoe: 'Included' },
  { guest: 'Raj Kapoor', agent: AGENTS[2], adults: 2, zone: 'Kata', hotel: 'Boathouse', canoe: 'Not Included' },
  { guest: 'Lisa Brown', agent: AGENTS[3], adults: 1, zone: 'Karon', hotel: 'Beyond Resort Karon', canoe: 'Included' },
]

const SEP19_PP: DayGuest[] = [
  { guest: 'David Chen', agent: AGENTS[0], adults: 2, zone: 'Patong', hotel: 'Holiday Inn Resort' },
  { guest: 'Nina Patel', agent: AGENTS[2], adults: 2, children: 2, zone: 'Kata', hotel: 'Kata Palm Resort' },
  { guest: 'Self Arrange A', agent: AGENTS[1], adults: 2, zone: 'No Transfer', hotel: '', note: 'Friend picking up' },
  { guest: 'Omar Farid', agent: AGENTS[3], adults: 1, zone: 'Karon', hotel: 'Centara Grand' },
  { guest: 'Grace Lee', agent: AGENTS[0], adults: 2, zone: 'Patong', hotel: 'Novotel Phuket' },
  { guest: 'Bruno Silva', agent: AGENTS[2], adults: 2, zone: 'Kata', hotel: 'Boathouse' },
  { guest: 'Self Arrange B', agent: AGENTS[3], adults: 1, children: 1, zone: 'No Transfer', hotel: '', cashOnTour: '900 THB' },
  { guest: 'Hana Suzuki', agent: AGENTS[1], adults: 2, zone: 'Karon', hotel: 'Beyond Resort Karon' },
  { guest: 'Paul Wright', agent: AGENTS[0], adults: 2, infants: 1, zone: 'Patong', hotel: 'Impiana Patong' },
  { guest: 'Mei Wong', agent: AGENTS[2], adults: 1, zone: 'Other', hotel: 'Laguna Phuket', pending: true },
  { guest: 'Ibrahim Hassan', agent: AGENTS[3], adults: 2, zone: 'Kata', hotel: 'Kata Palm Resort' },
  { guest: 'Walk-in Family', agent: AGENTS[1], adults: 3, children: 1, zone: 'No Transfer', hotel: '' },
]

const SEP19_JB: DayGuest[] = [
  { guest: 'Sophie Bennett', agent: AGENTS[0], adults: 2, zone: 'Patong', hotel: 'Holiday Inn Resort', canoe: 'Included' },
  { guest: 'Ravi Desai', agent: AGENTS[2], adults: 2, zone: 'Kata', hotel: 'Sawasdee Village', canoe: 'Included' },
  { guest: 'No Van Needed', agent: AGENTS[1], adults: 2, zone: 'No Transfer', hotel: '', canoe: 'Included' },
  { guest: 'Clara Jung', agent: AGENTS[3], adults: 1, children: 1, zone: 'Karon', hotel: 'Centara Grand', canoe: 'Not Included' },
  { guest: 'Alex Kim', agent: AGENTS[0], adults: 2, zone: 'Patong', hotel: 'ABC Hotel', canoe: 'Included' },
  { guest: 'Pier Only', agent: AGENTS[2], adults: 4, zone: 'No Transfer', hotel: '', canoe: 'Included', note: 'Join boat directly' },
  { guest: 'Nadia Costa', agent: AGENTS[1], adults: 2, zone: 'Kata', hotel: 'Boathouse', canoe: 'Included' },
  { guest: 'Ethan Brooks', agent: AGENTS[3], adults: 1, zone: 'Karon', hotel: 'Beyond Resort Karon', canoe: 'Not Included' },
]

const SEP20_PP: DayGuest[] = [
  { guest: 'Anita Rao', agent: AGENTS[1], adults: 2, zone: 'Patong', hotel: 'Indigo Pearl' },
  { guest: 'Liam Wright', agent: AGENTS[0], adults: 2, children: 1, zone: 'Karon', hotel: 'Movenpick Resort' },
  { guest: 'Own Transport 1', agent: AGENTS[2], adults: 2, zone: 'No Transfer', hotel: '' },
  { guest: 'Sora Nakamura', agent: AGENTS[3], adults: 1, zone: 'Kata', hotel: 'Kata Palm Resort' },
  { guest: 'Mia Andersson', agent: AGENTS[0], adults: 2, zone: 'Patong', hotel: 'Holiday Inn Resort' },
  { guest: 'Diego Ruiz', agent: AGENTS[1], adults: 2, zone: 'Karon', hotel: 'Centara Grand' },
  { guest: 'Own Transport 2', agent: AGENTS[3], adults: 3, zone: 'No Transfer', hotel: '', note: 'Rental scooter' },
  { guest: 'Fatima Zahra', agent: AGENTS[2], adults: 1, children: 1, zone: 'Kata', hotel: 'Boathouse' },
  { guest: 'Chris Evans', agent: AGENTS[0], adults: 2, zone: 'Patong', hotel: 'Impiana Patong' },
  { guest: 'Pending Other', agent: AGENTS[1], adults: 2, zone: 'Other', hotel: 'Trisara Phuket', pending: true },
  { guest: 'Olivia Green', agent: AGENTS[2], adults: 2, infants: 1, zone: 'Karon', hotel: 'Beyond Resort Karon' },
  { guest: 'Own Transport 3', agent: AGENTS[3], adults: 2, tourLeaders: 1, zone: 'No Transfer', hotel: '', cashOnTour: '2,400 THB' },
]

const SEP20_JB: DayGuest[] = [
  { guest: 'Karan Malhotra', agent: AGENTS[2], adults: 2, children: 1, zone: 'Patong', hotel: 'Novotel Phuket', canoe: 'Included' },
  { guest: 'Isabelle Moreau', agent: AGENTS[0], adults: 2, zone: 'Kata', hotel: 'Kata Palm Resort', canoe: 'Included' },
  { guest: 'Self Drive JB', agent: AGENTS[1], adults: 2, zone: 'No Transfer', hotel: '', canoe: 'Not Included' },
  { guest: 'Noah Clark', agent: AGENTS[3], adults: 1, zone: 'Karon', hotel: 'Centara Grand', canoe: 'Included' },
  { guest: 'Ava Patel', agent: AGENTS[2], adults: 2, zone: 'Patong', hotel: 'ABC Hotel', canoe: 'Included' },
  { guest: 'Meet At Pier JB', agent: AGENTS[0], adults: 3, zone: 'No Transfer', hotel: '', canoe: 'Included', note: 'Guide already there' },
  { guest: 'Leo Schmidt', agent: AGENTS[1], adults: 2, zone: 'Kata', hotel: 'Boathouse', canoe: 'Not Included' },
  { guest: 'Zoe Nguyen', agent: AGENTS[3], adults: 1, children: 1, zone: 'Karon', hotel: 'Beyond Resort Karon', canoe: 'Included' },
]

const SEP18_20_BOOKINGS: Booking[] = [
  ...buildDayBookings(SEP18_PP, 'PP', '2026-09-18'),
  ...buildDayBookings(SEP18_JB, 'James Bond', '2026-09-18'),
  ...buildDayBookings(SEP19_PP, 'PP', '2026-09-19'),
  ...buildDayBookings(SEP19_JB, 'James Bond', '2026-09-19'),
  ...buildDayBookings(SEP20_PP, 'PP', '2026-09-20'),
  ...buildDayBookings(SEP20_JB, 'James Bond', '2026-09-20'),
]

const RAW_INITIAL_BOOKINGS: Booking[] = [
  ...SEP17_PP_BOOKINGS,
  ...SEP17_JB_BOOKINGS,
  ...SEP18_20_BOOKINGS,
  {
    code: 'PP2608-0001',
    agentSlug: 'abc-travel',
    agentName: 'ABC Travel India',
    agentRef: '',
    program: 'PP',
    date: '2026-08-15',
    parkFee: 'Included',
    canoe: null,
    adults: 6,
    children: 2,
    infants: 0,
    tourLeaders: 1,
    leadGuest: 'Arjun Patel',
    pickupZone: 'Patong',
    pickupHotel: 'Burasari Resort',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '07:30',
    status: 'Confirmed',
  },
  {
    code: 'JB2608-0001',
    agentSlug: 'golden-triangle',
    agentName: 'Golden Triangle Travel',
    agentRef: '',
    program: 'James Bond',
    date: '2026-08-16',
    parkFee: 'Included',
    canoe: 'Included',
    adults: 4,
    children: 1,
    infants: 0,
    tourLeaders: 0,
    leadGuest: 'Sana Kapoor',
    pickupZone: 'Kata',
    pickupHotel: 'Kata Thani',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '07:45',
    status: 'Confirmed',
  },
  {
    code: 'PP2608-0002',
    agentSlug: 'mumbai-holidays',
    agentName: 'Mumbai Holidays',
    agentRef: '',
    program: 'PP',
    date: '2026-08-22',
    parkFee: 'Not Included',
    canoe: null,
    adults: 8,
    children: 3,
    infants: 1,
    tourLeaders: 1,
    leadGuest: 'Neha Joshi',
    pickupZone: 'Karon',
    pickupHotel: 'Hilton Phuket Arcadia',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '08:00',
    status: 'Confirmed',
  },
  {
    code: 'JB2608-0002',
    agentSlug: 'delhi-travel',
    agentName: 'Delhi Travel Group',
    agentRef: '',
    program: 'James Bond',
    date: '2026-08-28',
    parkFee: 'Included',
    canoe: 'Not Included',
    adults: 7,
    children: 0,
    infants: 0,
    tourLeaders: 1,
    leadGuest: 'Vikram Singh',
    pickupZone: 'Patong',
    pickupHotel: 'Amari Phuket',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '07:30',
    status: 'Confirmed',
  },
  {
    code: 'PP2609-extra-05',
    agentSlug: 'delhi-travel',
    agentName: 'Delhi Travel Group',
    agentRef: '',
    program: 'PP',
    date: '2026-09-05',
    parkFee: 'Included',
    canoe: null,
    adults: 5,
    children: 1,
    infants: 0,
    tourLeaders: 0,
    leadGuest: 'Meera Iyer',
    pickupZone: 'Kata',
    pickupHotel: "Mom Tri's Villa Royale",
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '07:45',
    status: 'Confirmed',
  },
  {
    code: 'JB2609-extra-10',
    agentSlug: 'mumbai-holidays',
    agentName: 'Mumbai Holidays',
    agentRef: '',
    program: 'James Bond',
    date: '2026-09-10',
    parkFee: 'Included',
    canoe: 'Included',
    adults: 3,
    children: 2,
    infants: 1,
    tourLeaders: 0,
    leadGuest: 'Karan Malhotra',
    pickupZone: 'Other',
    pickupHotel: 'Trisara Phuket',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: 'Awaiting pickup time',
    status: 'Pending Pickup Time',
  },
  {
    code: 'PP2609-extra-25',
    agentSlug: 'golden-triangle',
    agentName: 'Golden Triangle Travel',
    agentRef: '',
    program: 'PP',
    date: '2026-09-25',
    parkFee: 'Included',
    canoe: null,
    adults: 9,
    children: 2,
    infants: 0,
    tourLeaders: 1,
    leadGuest: 'Anita Rao',
    pickupZone: 'Patong',
    pickupHotel: 'Indigo Pearl',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '07:30',
    status: 'Confirmed',
  },
  {
    code: 'JB2609-extra-28',
    agentSlug: 'abc-travel',
    agentName: 'ABC Travel India',
    agentRef: '',
    program: 'James Bond',
    date: '2026-09-28',
    parkFee: 'Not Included',
    canoe: 'Included',
    adults: 4,
    children: 0,
    infants: 0,
    tourLeaders: 0,
    leadGuest: 'Liam Wright',
    pickupZone: 'Karon',
    pickupHotel: 'Movenpick Resort',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '08:00',
    status: 'Confirmed',
  },
  {
    code: 'PP2610-0001',
    agentSlug: 'abc-travel',
    agentName: 'ABC Travel India',
    agentRef: '',
    program: 'PP',
    date: '2026-10-03',
    parkFee: 'Included',
    canoe: null,
    adults: 11,
    children: 3,
    infants: 1,
    tourLeaders: 1,
    leadGuest: 'Sophie Bennett',
    pickupZone: 'Patong',
    pickupHotel: 'Holiday Inn Resort',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '07:30',
    status: 'Confirmed',
  },
  {
    code: 'JB2610-0001',
    agentSlug: 'mumbai-holidays',
    agentName: 'Mumbai Holidays',
    agentRef: '',
    program: 'James Bond',
    date: '2026-10-05',
    parkFee: 'Included',
    canoe: 'Included',
    adults: 6,
    children: 1,
    infants: 0,
    tourLeaders: 0,
    leadGuest: 'Ravi Desai',
    pickupZone: 'Kata',
    pickupHotel: 'Sawasdee Village',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '07:45',
    status: 'Confirmed',
  },
  {
    code: 'PP2610-0002',
    agentSlug: 'delhi-travel',
    agentName: 'Delhi Travel Group',
    agentRef: '',
    program: 'PP',
    date: '2026-10-12',
    parkFee: 'Not Included',
    canoe: null,
    adults: 7,
    children: 2,
    infants: 0,
    tourLeaders: 1,
    leadGuest: 'Ishaan Gupta',
    pickupZone: 'Karon',
    pickupHotel: 'Centara Karon',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '08:00',
    status: 'Confirmed',
  },
  {
    code: 'JB2610-0002',
    agentSlug: 'golden-triangle',
    agentName: 'Golden Triangle Travel',
    agentRef: '',
    program: 'James Bond',
    date: '2026-10-18',
    parkFee: 'Included',
    canoe: 'Not Included',
    adults: 5,
    children: 0,
    infants: 0,
    tourLeaders: 0,
    leadGuest: 'Elena Rossi',
    pickupZone: 'Patong',
    pickupHotel: 'Novotel Phuket',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '07:30',
    status: 'Confirmed',
  },
  {
    code: 'PP2610-0003',
    agentSlug: 'abc-travel',
    agentName: 'ABC Travel India',
    agentRef: '',
    program: 'PP',
    date: '2026-10-25',
    parkFee: 'Included',
    canoe: null,
    adults: 8,
    children: 1,
    infants: 1,
    tourLeaders: 0,
    leadGuest: 'Hannah Cole',
    pickupZone: 'Other',
    pickupHotel: 'The Nai Harn',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: 'Awaiting pickup time',
    status: 'Pending Pickup Time',
  },
  {
    code: 'PP2611-0001',
    agentSlug: 'mumbai-holidays',
    agentName: 'Mumbai Holidays',
    agentRef: '',
    program: 'PP',
    date: '2026-11-02',
    parkFee: 'Included',
    canoe: null,
    adults: 10,
    children: 4,
    infants: 0,
    tourLeaders: 1,
    leadGuest: 'Aisha Khan',
    pickupZone: 'Patong',
    pickupHotel: 'Baan Yin Dee',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '07:30',
    status: 'Confirmed',
  },
  {
    code: 'JB2611-0001',
    agentSlug: 'delhi-travel',
    agentName: 'Delhi Travel Group',
    agentRef: '',
    program: 'James Bond',
    date: '2026-11-08',
    parkFee: 'Included',
    canoe: 'Included',
    adults: 4,
    children: 2,
    infants: 0,
    tourLeaders: 0,
    leadGuest: 'Rohan Mehta',
    pickupZone: 'Kata',
    pickupHotel: 'Boathouse',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '07:45',
    status: 'Confirmed',
  },
  {
    code: 'PP2611-0002',
    agentSlug: 'golden-triangle',
    agentName: 'Golden Triangle Travel',
    agentRef: '',
    program: 'PP',
    date: '2026-11-15',
    parkFee: 'Not Included',
    canoe: null,
    adults: 6,
    children: 0,
    infants: 0,
    tourLeaders: 1,
    leadGuest: 'Claire Dubois',
    pickupZone: 'Karon',
    pickupHotel: 'Beyond Resort Karon',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '08:00',
    status: 'Confirmed',
  },
  {
    code: 'JB2611-0002',
    agentSlug: 'abc-travel',
    agentName: 'ABC Travel India',
    agentRef: '',
    program: 'James Bond',
    date: '2026-11-22',
    parkFee: 'Included',
    canoe: 'Included',
    adults: 8,
    children: 3,
    infants: 1,
    tourLeaders: 0,
    leadGuest: 'Tom Hughes',
    pickupZone: 'Patong',
    pickupHotel: 'Impiana Patong',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    transferExtraCharge: '',
    pickupTime: '07:30',
    status: 'Confirmed',
  },
]

/** Assign PP2609-0001 style codes sequentially per program + month. */
function withSequentialCodes(bookings: Booking[]): Booking[] {
  const counters = new Map<string, number>()
  return bookings.map((booking) => {
    const stem = bookingCodeStem(booking.program, booking.date)
    const next = (counters.get(stem) ?? 0) + 1
    counters.set(stem, next)
    return { ...booking, code: `${stem}${String(next).padStart(4, '0')}` }
  })
}

export const INITIAL_BOOKINGS: Booking[] = withSequentialCodes(RAW_INITIAL_BOOKINGS)

export function mergeBookings(stored: Booking[], seed: Booking[]) {
  const existing = new Set(stored.map((booking) => booking.code))
  return [...stored, ...seed.filter((booking) => !existing.has(booking.code))].map((booking) => ({
    ...booking,
    agentRef: booking.agentRef ?? '',
    roomNumber: booking.roomNumber ?? '',
    note: booking.note ?? '',
    cashOnTour: booking.cashOnTour ?? '',
  }))
}

/** Empty = every day uses DEFAULT_PP_CAPACITY / DEFAULT_JB_CAPACITY until admin overrides. */
export const INITIAL_AVAILABILITY: Availability[] = []

export function getAgentBySlug(slug: string) {
  return AGENTS.find((agent) => agent.slug === slug)
}
