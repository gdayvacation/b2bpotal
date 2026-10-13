export type AgentCompanyProfile = {
  companyName: string
  companyPhone: string
  companyEmail: string
  logoDataUrl: string
}

const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_LOGO_BYTES = 5 * 1024 * 1024
const LOGO_PX = 256
const MAX_DATA_URL = 160_000

export function companyInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function agentVoucherName(
  agent: { name?: string; companyName?: string } | undefined,
  fallback = '',
) {
  const company = agent?.companyName?.trim()
  if (company) return company
  const name = agent?.name?.trim()
  if (name) return name
  return fallback.trim()
}

export function normalizeAgentCompany(
  input: AgentCompanyProfile,
): { ok: true; value: AgentCompanyProfile } | { ok: false; error: string } {
  const companyName = input.companyName.trim().replace(/\s+/g, ' ')
  const companyPhone = input.companyPhone.trim()
  const companyEmail = input.companyEmail.trim().toLowerCase()
  const logoDataUrl = input.logoDataUrl.trim()

  if (!companyName) return { ok: false, error: 'Enter the company name for the voucher.' }
  if (companyName.length > 120) {
    return { ok: false, error: 'Company name must be 120 characters or fewer.' }
  }
  if (companyPhone.length > 40 || /[^0-9+().\s-]/.test(companyPhone)) {
    return { ok: false, error: 'Phone can only use numbers, spaces, and + - ( ).' }
  }
  if (
    companyEmail &&
    (companyEmail.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail))
  ) {
    return { ok: false, error: 'Enter a valid email, or leave it blank.' }
  }
  if (
    logoDataUrl &&
    (logoDataUrl.length > MAX_DATA_URL ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logoDataUrl))
  ) {
    return { ok: false, error: 'Logo must be a PNG, JPG, or WebP. Try uploading it again.' }
  }

  return {
    ok: true,
    value: { companyName, companyPhone, companyEmail, logoDataUrl },
  }
}

/** Crop to a square and shrink to 256×256 so the stored logo stays small. */
export function prepareCompanyLogo(file: File): Promise<string> {
  if (!LOGO_TYPES.has(file.type)) {
    return Promise.reject(new Error('Use a PNG, JPG, or WebP file.'))
  }
  if (file.size > MAX_LOGO_BYTES) {
    return Promise.reject(new Error('That file is over 5 MB. Choose a smaller logo.'))
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      if (image.width < 1 || image.height < 1) {
        reject(new Error('Could not read that image.'))
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = LOGO_PX
      canvas.height = LOGO_PX
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not resize that logo.'))
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, LOGO_PX, LOGO_PX)
      const scale = Math.max(LOGO_PX / image.width, LOGO_PX / image.height)
      const width = image.width * scale
      const height = image.height * scale
      ctx.drawImage(image, (LOGO_PX - width) / 2, (LOGO_PX - height) / 2, width, height)
      let quality = 0.86
      let dataUrl = canvas.toDataURL('image/jpeg', quality)
      while (dataUrl.length > MAX_DATA_URL && quality > 0.5) {
        quality -= 0.08
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }
      if (dataUrl.length > MAX_DATA_URL) {
        reject(new Error('That logo is still too detailed after resizing. Try a simpler image.'))
        return
      }
      resolve(dataUrl)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image.'))
    }
    image.src = url
  })
}
