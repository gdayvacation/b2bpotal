/**
 * Canonical hotel catalog (deduped from partner history).
 * zoneName null = admin must assign (Patong / Kata / Karon only for now).
 */
export type HotelSeed = {
  name: string
  zoneName: 'Patong' | 'Kata' | 'Karon' | null
}

export const HOTEL_CATALOG: HotelSeed[] = [
  // Patong
  { name: 'Amari Phuket', zoneName: 'Patong' },
  { name: 'Andakira Hotel Phuket', zoneName: 'Patong' },
  { name: 'Andaman Beach Hotel Phuket', zoneName: 'Patong' },
  { name: 'Andaman Embrace Patong', zoneName: 'Patong' },
  { name: 'Andamantra Resort and Villa Phuket', zoneName: 'Patong' },
  { name: 'Ashlee Plaza Patong Hotel & Spa', zoneName: 'Patong' },
  { name: 'Aspery Hotel Phuket', zoneName: 'Patong' },
  { name: 'Baan Yuree Resort', zoneName: 'Patong' },
  { name: 'Beachcomber Phuket', zoneName: 'Patong' },
  { name: 'Bel Aire Patong, Phuket', zoneName: 'Patong' },
  { name: 'Best Western Patong Beach', zoneName: 'Patong' },
  { name: 'Citrus Patong Hotel By Compass Hospitality', zoneName: 'Patong' },
  { name: 'Deevana Plaza Phuket', zoneName: 'Patong' },
  { name: 'Elite Suites Patong, Phuket', zoneName: 'Patong' },
  { name: "Fishermen's Harbour", zoneName: 'Patong' },
  { name: 'Four Points by Sheraton', zoneName: 'Patong' },
  { name: 'Grand Mercure Phuket', zoneName: 'Patong' },
  { name: 'Grand Orchid Inn Hotel', zoneName: 'Patong' },
  { name: 'Holiday Inn Express Phuket', zoneName: 'Patong' },
  { name: 'M Social Phuket', zoneName: 'Patong' },
  { name: 'Malabar Pool Villa Phuket', zoneName: 'Patong' },
  { name: 'Mercure Phuket Patong Journeyhub', zoneName: 'Patong' },
  { name: 'Nipa Resort Phuket', zoneName: 'Patong' },
  { name: 'Patong Bay Hill', zoneName: 'Patong' },
  { name: 'Patong Bay Residence', zoneName: 'Patong' },
  { name: 'Patong Lodge Hotel', zoneName: 'Patong' },
  { name: 'Patong Resort', zoneName: 'Patong' },
  { name: 'Sunshine Patong', zoneName: 'Patong' },
  { name: 'The AIM Patong Hotel', zoneName: 'Patong' },
  { name: 'Zenseana Phuket Hotel', zoneName: 'Patong' },
  { name: 'Zostel Phuket Hostel', zoneName: 'Patong' },
  // Kata
  { name: 'Mandarava Resort & Spa Phuket', zoneName: 'Kata' },
  // Karon
  { name: 'Chanalai Hillside Resort', zoneName: 'Karon' },
  { name: 'Peach Hill Hotel & Resort', zoneName: 'Karon' },
  { name: 'Princess Seaview Resort and Spa', zoneName: 'Karon' },
  { name: 'Thavorn Palm Beach Resort Phuket', zoneName: 'Karon' },
  { name: 'Utopia Karon', zoneName: 'Karon' },
  // Unassigned
  { name: 'La Vista', zoneName: null },
  { name: 'Marriott Merlin Beach', zoneName: null },
  { name: 'Radisson Resort and Suites Phuket', zoneName: null },
]
