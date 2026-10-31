"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import * as Sentry from "@sentry/react";

import AuthSectionOne from "@/components/ui/auth-section-1";

export default function AuthClient() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestOtp = async () => {
    if (!email.trim()) {
      setError("Enter your email address");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), flow: mode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || "Failed to send OTP");
      }

      setOtpSent(true);
      setNotice(
        mode === "signup"
          ? `Account created. We sent a 6-digit code to ${email}.`
          : `We sent a 6-digit code to ${email}.`,
      );

      if (data?.dev_otp) {
        setOtp(String(data.dev_otp));
      }
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) {
      setError("Enter the OTP sent to your email");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: otp.trim(), flow: mode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || "Invalid OTP");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = async () => {
    setError(null);

    try {
      const res = await fetch("/api/auth/google", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data?.url) {
        throw new Error(data?.detail || "Google sign-in is not configured");
      }

      window.location.href = data.url;
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    }
  };

  const changeMode = (next: "login" | "signup") => {
    setMode(next);
    setOtpSent(false);
    setOtp("");
    setError(null);
    setNotice(null);
  };

  return (
    <div className="text-black dark:text-white">
      <AuthSectionOne
      mode={mode}
      email={email}
      onEmailChange={setEmail}
      onEmailSubmit={requestOtp}
      otp={otp}
      onOtpChange={setOtp}
      onOtpSubmit={verifyOtp}
      onGoogleClick={googleLogin}
      onModeChange={changeMode}
      otpSent={otpSent}
      error={error}
      notice={notice}
      loading={loading}
    />
    </div>
  );
}
