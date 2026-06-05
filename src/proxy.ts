import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { SUPERADMIN_COOKIE, verifySessionToken } from "@/lib/superadmin/session";

// Next.js 16 renamed the "middleware" convention to "proxy" (same behaviour).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Super Admin: separate JWT cookie, not Supabase Auth ---
  if (pathname.startsWith("/superadmin")) {
    const session = await verifySessionToken(
      request.cookies.get(SUPERADMIN_COOKIE)?.value,
    );
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/superadmin")) {
    const session = await verifySessionToken(
      request.cookies.get(SUPERADMIN_COOKIE)?.value,
    );
    if (!session) return new NextResponse("Unauthorized", { status: 401 });
    return NextResponse.next();
  }

  // --- Kitchen (staff) + Admin (owner): Supabase Auth → common /login. ---
  if (pathname.startsWith("/kitchen") || pathname.startsWith("/admin")) {
    const { response, user } = await updateSession(request);
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // --- Everyone else: refresh the Supabase session (admin comes later) ---
  const { response } = await updateSession(request);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
