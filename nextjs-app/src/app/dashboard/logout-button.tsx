"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    setLoading(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/auth");
      router.refresh();
    }
  };

  return (
    <Button variant="outline" onClick={logout} disabled={loading}>
      {loading ? "Logging out..." : "Log out"}
    </Button>
  );
}
