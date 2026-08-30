import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/session';

export async function POST(request: Request) {
  await destroySession();
  // Redirect to home page after logout
  return NextResponse.redirect(new URL('/', request.url));
}