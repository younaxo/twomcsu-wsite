import { NextResponse, type NextRequest } from 'next/server';
import {
  giveawayHostRoute,
  giveawayOnlyRedirect,
  isGiveawayOnly,
} from '@/features/giveaway/giveaway-only';

/// Единственная задача: режим GIVEAWAY_ONLY (мини-выкладка розыгрыша), включая хост
/// админки (admin.giveaway.twomc.su). Без флага middleware ничего не меняет.
export function middleware(request: NextRequest) {
  const enabled = isGiveawayOnly();
  if (!enabled) return NextResponse.next();
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const hostRoute = giveawayHostRoute(request.nextUrl.pathname, host, enabled);
  if (hostRoute !== null) {
    const url = request.nextUrl.clone();
    url.pathname = hostRoute.path;
    if (hostRoute.kind === 'redirect') {
      url.search = '';
      return NextResponse.redirect(url, 307);
    }
    return NextResponse.rewrite(url);
  }
  const target = giveawayOnlyRedirect(request.nextUrl.pathname, enabled);
  if (target === null) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  url.search = '';
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
