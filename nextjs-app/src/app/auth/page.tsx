import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";
import AuthClient from "./auth-client";

export const instant = false;

export default async function AuthPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return <AuthClient />;
}
