import { NextRequest } from 'next/server';
import { handleSimulatedProviderCallback } from '@/lib/payment-engine/callback-handler';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) { return handleSimulatedProviderCallback(request, 'mtn_mobile_money'); }
