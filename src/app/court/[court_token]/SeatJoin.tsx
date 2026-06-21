"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { setSeatSession } from "@/lib/customer/fcSession";

// Friend-join: a shared-table invite link is /court/<seatToken>?s=<seatSession>.
// When a friend lands on the store list with ?s=, persist that seat session so
// their store pages resolve as "joined" instead of "table in use".
export function SeatJoin({ token }: { token: string }) {
  const params = useSearchParams();
  useEffect(() => {
    const s = params.get("s");
    if (s) setSeatSession(token, s);
  }, [params, token]);
  return null;
}
