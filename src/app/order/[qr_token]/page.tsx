import { MenuLoader } from "./MenuLoader";

// Resolve happens on the client (MenuLoader) so it can pass the per-visit
// session token from localStorage and handle the "table in use" lock.
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ qr_token: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { qr_token } = await params;
  const { s } = await searchParams;
  return <MenuLoader token={qr_token} joinToken={typeof s === "string" ? s : undefined} />;
}
