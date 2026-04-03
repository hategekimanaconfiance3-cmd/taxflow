import { NextResponse } from 'next/server';

const BLOB_URL = 'https://rwccu0ggdjskujfo.private.blob.vercel-storage.com/bars.svg';

// Module-level singleton — fetched once per server process lifetime.
// Bypasses Next.js data cache (2MB limit) for large assets.
let cached: string | null = null;

async function getSvg(): Promise<string> {
  if (cached) return cached;

  const token = process.env.BLOB_READ_WRITE_TOKEN!;
  const res = await fetch(BLOB_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);

  cached = await res.text();
  return cached;
}

export async function GET() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return new NextResponse('Missing blob token', { status: 500 });
  }

  try {
    const svg = await getSvg();
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        // Browser caches for 1 year, immutable — won't re-request until hard refresh
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Failed to fetch asset', { status: 502 });
  }
}
