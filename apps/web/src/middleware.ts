import { NextResponse, type NextRequest } from 'next/server';
import { giveawayOnlyRedirect, isGiveawayOnly } from '@/features/giveaway/giveaway-only';

/// Единственная задача: режим GIVEAWAY_ONLY (мини-выкладка розыгрыша).
/// Без флага middleware ничего не меняет.
export function middleware(request: NextRequest) {
  const target = giveawayOnlyRedirect(request.nextUrl.pathname, isGiveawayOnly());
  if (target === null) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  url.search = '';
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
