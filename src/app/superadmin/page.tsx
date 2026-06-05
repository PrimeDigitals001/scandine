import { redirect } from "next/navigation";

export default function SuperAdminIndex() {
  // The proxy guard bounces unauthenticated users to /superadmin/login.
  redirect("/superadmin/dashboard");
}
