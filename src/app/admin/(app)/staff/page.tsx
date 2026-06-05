import type { Metadata } from "next";
import { getAdminContext } from "@/lib/admin/context";
import { getStaff } from "@/lib/admin/data";
import { StaffManager } from "./StaffManager";

export const metadata: Metadata = { title: "Admin · Staff" };

export default async function StaffPage() {
  const ctx = await getAdminContext();
  const staff = await getStaff(ctx!.restaurantId);
  return <StaffManager staff={staff} />;
}
