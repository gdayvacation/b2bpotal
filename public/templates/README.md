# นำเข้าบุ๊กกิ้งจาก CSV / Excel

## ไฟล์ตัวอย่าง

- [booking-import-template.xlsx](./booking-import-template.xlsx)
- [booking-import-template.csv](./booking-import-template.csv)

แถว 1 (ไม่บังคับ): วันที่ทัวร์แบบ banner เช่น `5/10/2026`  
แถว 2: หัวคอลัมน์ — **Date**, **Program** (PP หรือ James Bond), Agent, Voucher, Name, Hotel, ADL, CHD, …  
แถวถัดไป: หนึ่งแถว = หนึ่งบุ๊ก (หลายแถว = หลายบุ๊ก)

## ในแอป Admin

1. **Seed bookings** → แท็บ **CSV / Excel**
2. **Read file** — อ่านในเครื่อง (ไม่ใช้ AI)

## ตั้งค่า AI (Chat / รูป เท่านั้น)

ใน `.env.local`:

```bash
GEMINI_API_KEY=…   # จาก https://aistudio.google.com/apikey (รูปแบบเก่า AIza… หรือใหม่ AQ.…)
# GEMINI_BOOKING_VISION_MODEL=gemini-3.8-flash   # ไม่บังคับ (default ล่าสุด)
# ทางเลือก: gemini-3.6-flash, gemini-2.0-flash, gemini-flash-latest
```

- ใช้ **Google AI Studio API key** (`AIza…` หรือ **`AQ.…` แบบใหม่**) — **ไม่ใช่** Service Account JSON
- หลังแก้ `.env.local` ให้ **restart** `pnpm dev`
- ทางเลือก: `OPENAI_API_KEY` ใช้ได้เฉพาะ **Chat / photo** (ไม่ใช่ Read with AI ของ Excel)
