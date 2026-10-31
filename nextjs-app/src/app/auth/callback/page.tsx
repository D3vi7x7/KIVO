import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";

export const instant = false;

export default async function AuthCallbackPage() {
  const user = await getCurrentUser();

  redirect(user ? "/dashboard" : "/auth");
}
