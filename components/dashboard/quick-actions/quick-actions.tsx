'use client';

import Link from 'next/link';
import {
  Factory,
  ShoppingCart,
  ShoppingBag,
} from 'lucide-react';
import type { TraderRole } from '@/lib/sidebar-config';

interface QuickAction {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'primary' | 'outline';
}

function getQuickActions(role: TraderRole): QuickAction[] {
  if (role === 'manufacturer') {
    return [
      { label: 'Production Entry', href: '/dashboard/production', icon: Factory, variant: 'primary' },
      { label: 'Sell to Buyer', href: '/dashboard/sell', icon: ShoppingCart, variant: 'outline' },
    ];
  }
  if (role === 'wholesaler') {
    return [
      { label: 'Sell to Buyer', href: '/dashboard/sell', icon: ShoppingCart, variant: 'primary' },
    ];
  }
  // retailer
  return [
    { label: 'Record Sale', href: '/dashboard/record-sale', icon: ShoppingBag, variant: 'primary' },
  ];
}

interface QuickActionsProps {
  role: TraderRole;
  disabled?: boolean;
}

export function QuickActions({ role, disabled = false }: QuickActionsProps) {
  const actions = getQuickActions(role);

  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((action) => {
        const isPrimary = action.variant === 'primary';
        const baseClass =
          'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
        const primaryClass =
          'bg-foreground text-background hover:bg-foreground/90 focus:ring-foreground disabled:opacity-50';
        const outlineClass =
          'border border-border bg-background text-foreground hover:bg-muted focus:ring-foreground disabled:opacity-50';

        if (disabled) {
          return (
            <button
              key={action.href}
              disabled
              className={`${baseClass} ${isPrimary ? primaryClass : outlineClass} opacity-50 cursor-not-allowed`}
            >
              <action.icon className="h-4 w-4" />
              {action.label}
            </button>
          );
        }

        return (
          <Link
            key={action.href}
            href={action.href}
            className={`${baseClass} ${isPrimary ? primaryClass : outlineClass}`}
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </Link>
        );
      })}
    </div>
  );
}
