import { companyInitials } from '@/lib/agent-company'
import { cn } from '@/lib/utils'

export function CompanyLogo({
  name,
  logoUrl,
  className,
  rounded = 'full',
}: {
  name: string
  logoUrl?: string
  className?: string
  rounded?: 'full' | 'sheet'
}) {
  const shape = rounded === 'full' ? 'rounded-full' : 'rounded-2xl'
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data-URL logos are stored on the agent, not a remote host
      <img
        src={logoUrl}
        alt=""
        className={cn('object-cover', shape, className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center bg-gradient-to-br from-sky-400 via-teal-500 to-cyan-700 font-semibold text-white shadow-md shadow-teal-600/25',
        shape,
        className,
      )}
      aria-hidden
    >
      {companyInitials(name)}
    </div>
  )
}
