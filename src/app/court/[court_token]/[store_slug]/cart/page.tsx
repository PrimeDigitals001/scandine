import { FcCartScreen } from "./FcCartScreen";

export default async function CourtCartPage({
  params,
}: {
  params: Promise<{ court_token: string; store_slug: string }>;
}) {
  const { court_token, store_slug } = await params;
  return <FcCartScreen token={court_token} storeSlug={store_slug} />;
}
