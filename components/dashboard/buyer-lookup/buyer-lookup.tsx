'use client';

import { useState, useTransition } from 'react';
import { lookupBuyer } from '@/lib/actions/transaction.action';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, CheckCircle, XCircle } from 'lucide-react';
import { z } from 'zod';

// TIN must be exactly 9 digits
const tinSchema = z.string().regex(/^\d{9}$/, 'TIN must be exactly 9 digits');

export interface BuyerInfo {
  id: string;
  name: string;
  businessName: string | null;
  tinNumber: string | null;
  role: string;
  businessType: string;
  clearanceStatus: string;
  isActive: boolean;
  compliancePct: number;
  isEligible: boolean;
  reason: string;
  error?: string;
}

interface BuyerLookupProps {
  onBuyerFound: (buyer: BuyerInfo) => void;
  onBuyerCleared: () => void;
}

export function BuyerLookup({ onBuyerFound, onBuyerCleared }: BuyerLookupProps) {
  const [isPending, startTransition] = useTransition();
  const [tin, setTin] = useState('');
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [error, setError] = useState('');

  function handleVerify() {
    // Validate TIN format first
    const validation = tinSchema.safeParse(tin.trim());
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      return;
    }

    startTransition(async () => {
      try {
        setError('');
        const result = await lookupBuyer(tin.trim());

        // Check if the result contains an error
        if ('error' in result && result.error) {
          setError(result.error);
          setBuyer(null);
          onBuyerCleared();
          return;
        }

        setBuyer(result as BuyerInfo);
        onBuyerFound(result as BuyerInfo);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to lookup buyer');
        setBuyer(null);
        onBuyerCleared();
      }
    });
  }

  function clearBuyerResult() {
    setBuyer(null);
    setError('');
    onBuyerCleared();
  }

  return (
    <div className="space-y-3">
      {/* TIN input + verify */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="Enter Buyer TIN"
            value={tin}
            onChange={(e) => {
              // Only allow digits
              const value = e.target.value.replace(/\D/g, '');
              // Limit to 9 digits
              if (value.length <= 9) {
                setTin(value);
                if (buyer) clearBuyerResult();
              }
            }}
            maxLength={9}
            inputMode="numeric"
            pattern="\d*"
            className="font-mono"
          />
        </div>
        <Button variant="outline" onClick={handleVerify} disabled={isPending || !tin.trim()} className="gap-2">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Verify
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2 border border-red-200">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Buyer info display */}
      {buyer && (
        <div className={`rounded-lg border p-3 space-y-3 ${buyer.isEligible ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/60'}`}>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${buyer.isEligible ? 'text-emerald-800' : 'text-red-800'}`}>
              {buyer.isEligible ? 'Buyer Verified & Eligible' : 'Buyer Not Eligible'}
            </span>
            {buyer.isEligible ? (
              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200 gap-1">
                <CheckCircle className="h-3 w-3" />
                Eligible
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200 gap-1">
                <XCircle className="h-3 w-3" />
                Not Eligible
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3 xl:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground">Business name</p>
              <p className="font-medium">{buyer.businessName ?? buyer.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">TIN</p>
              <p className="font-mono font-medium">{buyer.tinNumber ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Category</p>
              <Badge variant="outline" className="text-xs capitalize">
                {buyer.businessType.replaceAll('_', ' ')}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Account status</p>
              <Badge variant="outline" className={`text-xs capitalize ${buyer.isActive ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-700'}`}>
                {buyer.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Clearance</p>
              <Badge variant="outline" className="text-xs capitalize">
                {buyer.clearanceStatus.replace('_', ' ')}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tax Compliance</p>
              <Badge
                variant="outline"
                className={`text-xs font-mono ${
                  buyer.compliancePct >= 95
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    : buyer.compliancePct >= 50
                      ? 'bg-amber-50 text-amber-600 border-amber-200'
                      : 'bg-red-50 text-red-600 border-red-200'
                }`}
              >
                {buyer.compliancePct}%
              </Badge>
            </div>
          </div>

          {!buyer.isEligible && buyer.reason && <p className="text-sm font-medium text-red-700">{buyer.reason}</p>}
        </div>
      )}
    </div>
  );
}
