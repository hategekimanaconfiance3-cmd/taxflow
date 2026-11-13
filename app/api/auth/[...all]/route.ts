import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return auth.handler(req);
}

export async function POST(req: NextRequest) {
  return auth.handler(req);
}
