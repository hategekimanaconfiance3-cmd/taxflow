import Image from 'next/image';
import { SystemStatus } from '@/components/auth/system-status';
import { RotatingBrandMessages } from '@/components/auth/rotating-brand-messages';

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

        {/* Rotating mission messages */}
        <div className="relative z-10 flex flex-1 items-center px-8 pb-56 sm:px-10">
          <RotatingBrandMessages />
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
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-x-hidden bg-gray-50 px-4 py-8 sm:px-6 lg:w-1/2 lg:px-8 lg:py-0">
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

        <div className="z-10 mb-8 w-full max-w-md lg:hidden">
          <RotatingBrandMessages compact />
        </div>

        {/* Auth Form Container */}
        <div className="z-10 w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
