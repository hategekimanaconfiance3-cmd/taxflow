import Image from "next/image";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen w-full">

            {/* ── Left Side ─────────────────────────────────────────────── */}
            <div className="hidden lg:flex w-1/2 flex-col relative overflow-hidden bg-white">

                {/* Logo */}
                <div className="flex items-center gap-2 font-bold text-xl p-10 shrink-0 z-10 relative">
                    <Image src="/taxflow.png" alt="TaxFlow Logo" width={32} height={32} />
                    <span>TaxFlow</span>
                </div>

                {/* Hero Text — sits in the upper-middle, clear above the illustration */}
                <div className="flex-1 flex items-center px-10 pb-64 z-10 relative">
                    <h1 className="text-5xl font-bold leading-tight tracking-tight text-gray-900">
                        Transparency <span className="text-gray-400">Today</span>,
                        <br />
                        <span className="relative inline-block ml-16">
                            <span className="relative z-10 text-gray-400">Prosperity</span>{" "}
                            <span className="relative z-10 border-b-4 border-black pb-1">
                                Tomorrow.
                            </span>
                        </span>
                    </h1>
                </div>

                {/* Illustration — anchored to bottom, clipped within this column */}
                <div className="absolute bottom-0 left-0 right-0 h-[260px] z-0 pointer-events-none">
                    <Image
                        src="/bars.png"
                        alt="Transparency Graph"
                        fill
                        className="object-contain object-left-bottom"
                        priority
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
                        className="object-cover"
                    />
                </div>

                {/* System Active Badge */}
                <div className="absolute top-8 right-8 z-10">
                    <div className="flex items-center gap-2 rounded-full bg-white px-4 py-1.5 shadow-sm border border-gray-100">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                        <span className="text-sm font-medium text-gray-600">
                            System active
                        </span>
                    </div>
                </div>

                {/* Auth Form Container */}
                <div className="z-10 w-full max-w-md px-8">{children}</div>
            </div>

        </div>
    );
}
