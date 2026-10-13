import Image from 'next/image';
import { SystemStatus } from '@/components/auth/system-status';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      {/* ── Left Side ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex w-1/2 flex-col relative overflow-hidden bg-white">
        {/* Logo */}
        <div className="flex items-center gap-2 font-bold text-xl py-5 px-10 shrink-0 z-10 relative">
          <Image src="/taxflow.png" alt="TaxFlow Logo" width={32} height={32} />
          <span>TaxFlow</span>
        </div>

        {/* Hero Text */}
        <div className="flex-1 flex items-center px-10 pb-56 z-10 relative">
          <h1 className="text-4xl xl:text-5xl font-bold leading-snug tracking-tight text-gray-900 whitespace-nowrap">
            Transparency <span className="text-gray-400">Today</span>,
            <br />
            <span className="ml-14 xl:ml-16">
              <span className="text-gray-400">Prosperity</span>{' '}
              <span className="border-b-4 border-black pb-1">Tomorrow.</span>
            </span>
          </h1>
        </div>

        {/* Public illustration asset */}
        <div className="absolute bottom-0 left-0 right-0 h-[45%] z-0 pointer-events-none">
          <Image
            src="/bars.svg"
            alt="Finance Illustration"
            priority
            fill
            unoptimized
            className="object-contain object-bottom"
          />
        </div>
      </div>

      {/* ── Right Side ────────────────────────────────────────────── */}
      <div className="relative flex w-full flex-col items-center justify-center bg-gray-50 lg:w-1/2">
        {/* Background Pattern */}
        <div className="absolute inset-0 z-0 opacity-40">
          <Image
            src="/dots.png"
            alt="Background Pattern"
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            loading="eager"
            className="object-cover"
          />
        </div>

        {/* System Status — top-left of the right panel */}
        <div className="absolute top-2.5 left-4 z-10">
          <SystemStatus status="active" />
        </div>

        {/* Auth Form Container */}
        <div className="z-10 w-full max-w-md px-8">{children}</div>
      </div>
    </div>
  );
}
