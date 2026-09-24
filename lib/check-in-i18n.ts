export type CheckInLang = 'en' | 'hi'

export const CHECK_IN_LANG_STORAGE_KEY = 'gday-check-in-lang'

const COPY = {
  en: {
    loading: 'Loading check-in…',
    back: 'Back',
    language: 'Language',
    english: 'English',
    hindi: 'हिन्दी',
    fillEnglishOnly:
      'Please fill names, nationality, and passport in English only — as written on the passport.',
    marinaCheckIn: 'Marina check-in',
    scanQr: 'Scan your booking QR',
    checkInUnavailable: 'Check-in unavailable',
    welcomeBody:
      'Check-in is linked to your booking so we can confirm any park fee or cash due before tickets are issued.',
    welcomeAskStaff:
      'Please ask marina staff to show the QR code for your booking, then scan it with your phone.',
    invalidQr: 'This check-in QR is not valid. Please ask marina staff for a new code.',
    cancelledBooking: 'This booking is cancelled. Please ask marina staff for help.',
    noShowBooking: 'This booking was marked no-show. Please ask marina staff for help.',
    programMismatch: 'Program does not match this booking. Please start again.',
    whichProgram: 'Which program today?',
    whichProgramSub: 'Choose the tour you are joining.',
    phiPhi: 'Phi Phi',
    phiPhiSub: 'Phi Phi Islands',
    jamesBond: 'James Bond',
    jamesBondSub: 'Phang Nga Bay',
    findBooking: 'Find your booking',
    searchPlaceholder: 'Search name, hotel, or voucher…',
    vanPlate: 'Van plate',
    hotel: 'Hotel',
    searchResults: 'Search results',
    noSearchMatch: 'No bookings match that name, hotel, or voucher today.',
    selectVan: 'Select van plate',
    noVans: 'No vans assigned yet for this program. Try hotel search, or ask staff.',
    selectHotel: 'Select hotel',
    noBookingsToday: 'No bookings found for this program today.',
    guestLeader: 'Guest / leader name',
    noVanHotel: 'No bookings on this van or hotel. Try the other filter.',
    whoCheckingIn: 'Who is checking in?',
    seatsLeft: '{remaining} of {total} seat{plural} left to check in',
    paymentDueTitle: 'Payment due before tickets',
    payAmount: 'Please pay {amount} THB at the marina desk.',
    payCash: 'Please see marina staff about cash on tour before boarding.',
    alreadyCheckedIn: 'This booking is already fully checked in.',
    viewStatus: 'View check-in status',
    howManyTitle: 'How many people you want to check in for?',
    howManySub:
      'Anyone with this QR can check in 1 person or several friends. All names stay on this same booking. Others can scan later for the rest.',
    guestCountLabel: 'Number of guests',
    continueWith: 'Continue with {count} guest{plural}',
    allRemaining: 'Check in for whole group',
    groupDetails: 'Group details',
    yourDetails: 'Your details',
    groupDetailsSub:
      'Enter information for each of the {count} guests checking in. All fields are required.',
    yourDetailsSub: 'Enter the guest checking in now. All fields are required.',
    passportOnlyTitle: 'Use correct information for insurance to be covered.',
    passportOnlyBody:
      'Name, birthday, nationality, and passport number must match your passport exactly. Wrong information means travel insurance may not cover you.',
    guestOf: 'Guest {n} of {total}',
    firstName: 'First name',
    lastName: 'Last name',
    firstNameRequired: 'First name is required.',
    lastNameRequired: 'Last name is required.',
    nameEnglishOnly: 'Use English letters only, as on the passport.',
    passportNumber: 'Passport number',
    passportPlaceholder: 'Exactly as on passport',
    passportRequired: 'Passport number is required.',
    passportEnglishOnly: 'Use English letters and numbers only.',
    nationality: 'Nationality',
    nationalityPlaceholder: 'Type to search — e.g. Indian, Thai',
    nationalityRequired: 'Required — type and select a nationality from the list.',
    nationalityNoMatch: 'No match — keep typing, then pick from the list.',
    birthday: 'Birthday',
    year: 'Year',
    month: 'Month',
    date: 'Date',
    birthdayRequired: 'Birthday is required — pick Year, Month, and Date.',
    completeFields: 'Please complete every required field before continuing.',
    allFieldsRequired: 'All fields are required. Please fill in every guest completely.',
    next: 'Next',
    confirmTitle: 'Confirm booking',
    confirmSub: 'Please check these details match your voucher.',
    program: 'Program',
    dateLabel: 'Date',
    leaderName: 'Leader / booking name',
    bookingCode: 'Booking code',
    hotelName: 'Hotel name',
    totalPax: 'Total Pax in Booking',
    nationalPark: 'National park',
    canoe: 'Canoe',
    parkFeeCollect: 'Park fee to collect',
    cashOnTour: 'Cash on tour',
    none: 'None',
    totalCollect: 'Total to collect',
    checkingInGuests: 'Checking in {count} guest{plural}{group}',
    wholeGroupNote: ' (whole group)',
    birthdayShort: 'Birthday',
    passportShort: 'Passport',
    nameDiffers: "First guest name differs from booking leader — that's OK for group members.",
    paymentAfter: 'Payment is due on this booking. After check-in, please contact staff to pay.',
    noCash: 'No cash on tour to collect — you can finish check-in.',
    confirmFinish: 'Confirm & finish check-in',
    paymentNeeded: 'Checked in — payment needed',
    payPark: 'Your booking does not include the National Park fee. Please see marina staff to complete payment.',
    payStaff: 'Please see marina staff to complete your payment.',
    checkInAnother: 'Check in another guest',
    parkNoteTitle: 'National Park Fee Note',
    parkNote1:
      'Entry to Phi Phi Island, Maya Bay, and the other islands on this trip is not free for foreigners. A mandatory fee of 400 THB per adult and 200 THB per child applies for foreign visitors, paid in cash when visiting Maya Bay.',
    parkNote2:
      'This is not optional. Failure to pay this fee will result in forfeiture of your trip, with no refunds.',
    parkNote3:
      'Please confirm with your booking agent whether your package includes the National Park fee. Thank you.',
    management: 'Management',
    successTitle: 'Check-in successful',
    successBody: "You're all set — no cash on tour to pay. Have a great day on the water!",
    guests: 'Guests',
    guest: 'Guest',
    yourBoat: 'Your boat',
    boat: 'Boat',
    boatUnassigned: 'Boat not assigned yet — please ask marina staff.',
    sequence: 'Ticket sequence',
    sequenceShowStaff: 'Show this number to staff before they give you the boat ticket.',
    sequencePending: 'Sequence will appear when check-in is complete.',
    guestsCount: '{count} guest{plural}',
    checkedIn: 'Checked in',
  },
  hi: {
    loading: 'चेक-इन लोड हो रहा है…',
    back: 'वापस',
    language: 'भाषा',
    english: 'English',
    hindi: 'हिन्दी',
    fillEnglishOnly:
      'नाम, राष्ट्रीयता और पासपोर्ट केवल अंग्रेज़ी में भरें — जैसे पासपोर्ट पर लिखा है।',
    marinaCheckIn: 'मरीना चेक-इन',
    scanQr: 'अपना बुकिंग QR स्कैन करें',
    checkInUnavailable: 'चेक-इन उपलब्ध नहीं है',
    welcomeBody:
      'चेक-इन आपकी बुकिंग से जुड़ा है ताकि टिकट से पहले पार्क शुल्क या कैश की पुष्टि हो सके।',
    welcomeAskStaff:
      'कृपया मरीना स्टाफ से अपनी बुकिंग का QR दिखाएँ, फिर अपने फ़ोन से स्कैन करें।',
    invalidQr: 'यह चेक-इन QR मान्य नहीं है। कृपया स्टाफ से नया कोड माँगें।',
    cancelledBooking: 'यह बुकिंग रद्द है। कृपया मरीना स्टाफ से मदद लें।',
    noShowBooking: 'यह बुकिंग नो-शो चिह्नित है। कृपया मरीना स्टाफ से मदद लें।',
    programMismatch: 'प्रोग्राम इस बुकिंग से मेल नहीं खाता। कृपया फिर से शुरू करें।',
    whichProgram: 'आज कौन सा प्रोग्राम है?',
    whichProgramSub: 'जिस टूर में आप जा रहे हैं उसे चुनें।',
    phiPhi: 'Phi Phi',
    phiPhiSub: 'Phi Phi Islands',
    jamesBond: 'James Bond',
    jamesBondSub: 'Phang Nga Bay',
    findBooking: 'अपनी बुकिंग खोजें',
    searchPlaceholder: 'Search name, hotel, or voucher…',
    vanPlate: 'वैन प्लेट',
    hotel: 'होटल',
    searchResults: 'खोज परिणाम',
    noSearchMatch: 'आज उस नाम, होटल या वाउचर से कोई बुकिंग नहीं मिली।',
    selectVan: 'वैन प्लेट चुनें',
    noVans: 'इस प्रोग्राम के लिए अभी वैन नहीं लगी। होटल खोजें, या स्टाफ से पूछें।',
    selectHotel: 'होटल चुनें',
    noBookingsToday: 'आज इस प्रोग्राम की कोई बुकिंग नहीं मिली।',
    guestLeader: 'अतिथि / लीडर नाम',
    noVanHotel: 'इस वैन या होटल पर कोई बुकिंग नहीं। दूसरा फ़िल्टर आज़माएँ।',
    whoCheckingIn: 'कौन चेक-इन कर रहा है?',
    seatsLeft: '{total} में से {remaining} सीट{plural} चेक-इन के लिए बची हैं',
    paymentDueTitle: 'टिकट से पहले भुगतान आवश्यक',
    payAmount: 'कृपया मरीना डेस्क पर {amount} THB का भुगतान करें।',
    payCash: 'बोर्डिंग से पहले कैश ऑन टूर के लिए मरीना स्टाफ से मिलें।',
    alreadyCheckedIn: 'इस बुकिंग का चेक-इन पहले ही पूरा हो चुका है।',
    viewStatus: 'चेक-इन स्थिति देखें',
    howManyTitle: 'आप कितने लोगों का चेक-इन करना चाहते हैं?',
    howManySub:
      'इस QR से कोई भी 1 व्यक्ति या कई दोस्तों का चेक-इन कर सकता है। सभी नाम इसी बुकिंग में रहेंगे। बाकी लोग बाद में स्कैन कर सकते हैं।',
    guestCountLabel: 'अतिथियों की संख्या',
    continueWith: '{count} अतिथि{plural} के साथ आगे बढ़ें',
    allRemaining: 'पूरे समूह का चेक-इन करें',
    groupDetails: 'समूह की जानकारी',
    yourDetails: 'आपकी जानकारी',
    groupDetailsSub:
      'चेक-इन कर रहे {count} अतिथियों की जानकारी भरें। सभी फ़ील्ड ज़रूरी हैं।',
    yourDetailsSub: 'अभी चेक-इन कर रहे अतिथि की जानकारी भरें। सभी फ़ील्ड ज़रूरी हैं।',
    passportOnlyTitle: 'बीमा कवर के लिए सही जानकारी लिखें।',
    passportOnlyBody:
      'नाम, जन्म तिथि, राष्ट्रीयता और पासपोर्ट नंबर पासपोर्ट से बिलकुल मिलने चाहिए। गलत जानकारी पर यात्रा बीमा कवर नहीं हो सकता।',
    guestOf: 'अतिथि {n} / {total}',
    firstName: 'First name / पहला नाम',
    lastName: 'Last name / अंतिम नाम',
    firstNameRequired: 'पहला नाम ज़रूरी है।',
    lastNameRequired: 'अंतिम नाम ज़रूरी है।',
    nameEnglishOnly: 'केवल अंग्रेज़ी अक्षर — जैसे पासपोर्ट पर।',
    passportNumber: 'Passport number / पासपोर्ट नंबर',
    passportPlaceholder: 'Exactly as on passport',
    passportRequired: 'पासपोर्ट नंबर ज़रूरी है।',
    passportEnglishOnly: 'केवल अंग्रेज़ी अक्षर और संख्या।',
    nationality: 'Nationality / राष्ट्रीयता',
    nationalityPlaceholder: 'Type to search — e.g. Indian, Thai',
    nationalityRequired: 'सूची से राष्ट्रीयता चुनें (अंग्रेज़ी में टाइप करें)।',
    nationalityNoMatch: 'कोई मेल नहीं — अंग्रेज़ी में लिखें और सूची से चुनें।',
    birthday: 'Birthday / जन्म तिथि',
    year: 'Year',
    month: 'Month',
    date: 'Date',
    birthdayRequired: 'जन्म तिथि ज़रूरी है — Year, Month और Date चुनें।',
    completeFields: 'आगे बढ़ने से पहले हर ज़रूरी फ़ील्ड भरें।',
    allFieldsRequired: 'सभी फ़ील्ड ज़रूरी हैं। हर अतिथि की जानकारी पूरी भरें।',
    next: 'आगे',
    confirmTitle: 'बुकिंग की पुष्टि करें',
    confirmSub: 'कृपया जाँचें कि ये विवरण आपके वाउचर से मिलते हैं।',
    program: 'प्रोग्राम',
    dateLabel: 'तारीख',
    leaderName: 'लीडर / बुकिंग नाम',
    bookingCode: 'बुकिंग कोड',
    hotelName: 'होटल का नाम',
    totalPax: 'बुकिंग में कुल यात्री',
    nationalPark: 'नेशनल पार्क',
    canoe: 'कैनो',
    parkFeeCollect: 'पार्क शुल्क',
    cashOnTour: 'कैश ऑन टूर',
    none: 'कोई नहीं',
    totalCollect: 'कुल भुगतान',
    checkingInGuests: '{count} अतिथि{plural} चेक-इन{group}',
    wholeGroupNote: ' (पूरा समूह)',
    birthdayShort: 'जन्म तिथि',
    passportShort: 'पासपोर्ट',
    nameDiffers: 'पहले अतिथि का नाम बुकिंग लीडर से अलग है — समूह के सदस्यों के लिए यह ठीक है।',
    paymentAfter: 'इस बुकिंग पर भुगतान बाकी है। चेक-इन के बाद स्टाफ से भुगतान करें।',
    noCash: 'कैश ऑन टूर नहीं है — चेक-इन पूरा कर सकते हैं।',
    confirmFinish: 'पुष्टि करें और चेक-इन पूरा करें',
    paymentNeeded: 'चेक-इन हो गया — भुगतान बाकी है',
    payPark:
      'आपकी बुकिंग में नेशनल पार्क शुल्क शामिल नहीं है। भुगतान के लिए मरीना स्टाफ से मिलें।',
    payStaff: 'भुगतान पूरा करने के लिए कृपया मरीना स्टाफ से मिलें।',
    checkInAnother: 'दूसरे अतिथि का चेक-इन करें',
    parkNoteTitle: 'नेशनल पार्क शुल्क नोट',
    parkNote1:
      'इस यात्रा में Phi Phi Island, Maya Bay और अन्य द्वीप विदेशी यात्रियों के लिए मुफ़्त नहीं हैं। वयस्क पर 400 THB और बच्चे पर 200 THB अनिवार्य शुल्क है, Maya Bay पर नकद भुगतान।',
    parkNote2:
      'यह वैकल्पिक नहीं है। शुल्क न देने पर यात्रा रद्द हो जाएगी और रिफंड नहीं मिलेगा।',
    parkNote3:
      'कृपया अपने बुकिंग एजेंट से पुष्टि करें कि पैकेज में नेशनल पार्क शुल्क शामिल है या नहीं। धन्यवाद।',
    management: 'प्रबंधन',
    successTitle: 'चेक-इन सफल',
    successBody: 'सब तैयार है — कैश ऑन टूर नहीं है। समुद्र पर अच्छा दिन बिताएँ!',
    guests: 'अतिथि',
    guest: 'अतिथि',
    yourBoat: 'आपकी नाव',
    boat: 'नाव',
    boatUnassigned: 'नाव अभी नहीं लगी — कृपया मरीना स्टाफ से पूछें।',
    sequence: 'टिकट क्रम',
    sequenceShowStaff: 'बोट टिकट देने से पहले यह नंबर स्टाफ को दिखाएँ।',
    sequencePending: 'चेक-इन पूरा होने पर क्रम संख्या दिखेगी।',
    guestsCount: '{count} अतिथि{plural}',
    checkedIn: 'चेक-इन हो गया',
  },
} as const

export type CheckInCopyKey = keyof typeof COPY.en

export function normalizeCheckInLang(value: string | null | undefined): CheckInLang {
  return value === 'hi' ? 'hi' : 'en'
}

export function checkInText(
  lang: CheckInLang,
  key: CheckInCopyKey,
  vars?: Record<string, string | number>,
): string {
  let text: string = COPY[lang][key] ?? COPY.en[key]
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

export function englishPlural(count: number) {
  return count === 1 ? '' : 's'
}

const LATIN_NAME = /[^A-Za-z .'-]/g
const LATIN_PASSPORT = /[^A-Za-z0-9 -]/g
const NAME_OK = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*[.]?$/
const PASSPORT_OK = /^[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*$/

export function sanitizeEnglishName(value: string) {
  return value.replace(LATIN_NAME, '')
}

export function sanitizeEnglishPassport(value: string) {
  return value.replace(LATIN_PASSPORT, '')
}

export function isEnglishName(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 && NAME_OK.test(trimmed)
}

export function isEnglishPassport(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 && PASSPORT_OK.test(trimmed)
}
