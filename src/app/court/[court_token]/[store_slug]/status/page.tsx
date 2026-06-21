import { FcStatusScreen } from "./FcStatusScreen";

export default async function CourtStatusPage({
  params,
}: {
  params: Promise<{ court_token: string; store_slug: string }>;
}) {
  const { court_token, store_slug } = await params;
  return <FcStatusScreen token={court_token} storeSlug={store_slug} />;
}
