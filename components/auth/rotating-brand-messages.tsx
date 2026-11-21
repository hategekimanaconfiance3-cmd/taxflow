'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type BrandMessage = {
  parts: Array<{ text: string; tone?: 'accent' | 'muted' }>;
};

const TAXPAYER_MESSAGES: BrandMessage[] = [
  {
    parts: [
      { text: 'Every Tax Counts. ', tone: 'accent' },
      { text: 'Every Contribution Builds Rwanda.' },
    ],
  },
  {
    parts: [
      { text: 'Pay Taxes. ', tone: 'accent' },
      { text: 'Build Businesses. ', tone: 'muted' },
      { text: 'Grow Rwanda.' },
    ],
  },
  {
    parts: [
      { text: 'Every Contribution ', tone: 'muted' },
      { text: 'Builds Rwanda.', tone: 'accent' },
    ],
  },
];

const STAFF_MESSAGES: BrandMessage[] = [
  {
    parts: [
      { text: 'Integrity in Every Action. ', tone: 'accent' },
      { text: 'Progress in Every Decision.', tone: 'muted' },
    ],
  },
  {
    parts: [
      { text: 'Serving Businesses. ', tone: 'muted' },
      { text: 'Strengthening Rwanda.', tone: 'accent' },
    ],
  },
  {
    parts: [
      { text: 'Transparency Today. ', tone: 'muted' },
      { text: 'A Stronger Rwanda Tomorrow.', tone: 'accent' },
    ],
  },
];

const ROTATION_MS = 4500;

export function RotatingBrandMessages({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const isStaffLogin = pathname === '/admin-login';
  const messages = isStaffLogin ? STAFF_MESSAGES : TAXPAYER_MESSAGES;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const pauseFromPointer = useRef(false);
  const messageId = useId();

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || isPaused || hasInteracted) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % messages.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [hasInteracted, isPaused, messages.length, prefersReducedMotion]);

  const selectMessage = (index: number) => {
    setActiveIndex(index);
    setHasInteracted(true);
    setIsPaused(true);
  };

  const handlePointerEnter = () => {
    pauseFromPointer.current = true;
    setIsPaused(true);
  };

  const handlePointerLeave = () => {
    pauseFromPointer.current = false;
    if (!hasInteracted) setIsPaused(false);
  };

  const message = messages[activeIndex];

  return (
    <section
      aria-label={isStaffLogin ? 'TaxFlow staff mission' : 'TaxFlow taxpayer mission'}
      className={compact ? 'w-full text-center' : 'w-full max-w-2xl'}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      onFocus={() => setIsPaused(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if (!hasInteracted && !pauseFromPointer.current) setIsPaused(false);
      }}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
        {isStaffLogin ? 'TaxFlow Staff' : 'TaxFlow'}
      </p>
      <div
        key={activeIndex}
        id={messageId}
        aria-live="polite"
        className={`taxflow-brand-message min-h-[6.5rem] text-balance font-bold leading-[1.08] tracking-tight text-gray-900 ${
          compact ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl xl:text-6xl'
        }`}
      >
        {message.parts.map((part) => (
          <span
            key={part.text}
            className={
              part.tone === 'accent'
                ? 'text-[#111827]'
                : part.tone === 'muted'
                  ? 'text-[#9ca3af]'
                  : undefined
            }
          >
            {part.text}
          </span>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-center gap-2 lg:justify-start" role="tablist" aria-label={isStaffLogin ? 'Staff slogans' : 'Taxpayer slogans'}>
        {messages.map((item, index) => (
          <button
            key={item.parts.map((part) => part.text).join('')}
            type="button"
            role="tab"
            aria-selected={activeIndex === index}
            aria-label={`Show message ${index + 1}`}
            aria-controls={messageId}
            onClick={() => selectMessage(index)}
            className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 ${
              activeIndex === index ? 'w-7 bg-gray-900' : 'w-2 bg-gray-300 hover:bg-gray-500'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
