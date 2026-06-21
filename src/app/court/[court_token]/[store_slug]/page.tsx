import { FcMenuLoader } from "./FcMenuLoader";

export default async function CourtStorePage({
  params,
}: {
  params: Promise<{ court_token: string; store_slug: string }>;
}) {
  const { court_token, store_slug } = await params;
  return <FcMenuLoader token={court_token} storeSlug={store_slug} />;
}
