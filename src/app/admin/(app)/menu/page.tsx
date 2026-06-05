import type { Metadata } from "next";
import { getAdminContext } from "@/lib/admin/context";
import { getMenu } from "@/lib/admin/data";
import { MenuManager } from "./MenuManager";

export const metadata: Metadata = { title: "Admin · Menu" };

export default async function MenuPage() {
  const ctx = await getAdminContext();
  const { categories, items } = await getMenu();

  return (
    <MenuManager
      categories={categories}
      items={items}
      restaurantId={ctx!.restaurantId}
    />
  );
}
