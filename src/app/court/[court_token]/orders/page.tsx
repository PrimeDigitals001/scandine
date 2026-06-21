import { FcCourtOrders } from "./FcCourtOrders";

export default async function CourtOrdersPage({
  params,
}: {
  params: Promise<{ court_token: string }>;
}) {
  const { court_token } = await params;
  return <FcCourtOrders token={court_token} />;
}
