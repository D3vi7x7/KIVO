"use client";

import {
  AppleIcon,
  GoogleIcon,
  MicrosoftIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { GrainGradient } from "@paper-design/shaders-react";
import { useState } from "react";
import type { ReactNode } from "react";

const formFields = [
  { label: "First Name", value: "Harshit", type: "text" },
  { label: "Last Name", value: "Sharma", type: "text" },
];

const termsText = (
  <>
    By creating an account, you agree to our{" "}
    <a
      href="#"
      className="font-medium text-black/45 underline underline-offset-2 dark:text-white/45"
    >
      Terms and Services
    </a>{" "}
    and{" "}
    <a
      href="#"
      className="font-medium text-black/45 underline underline-offset-2 dark:text-white/45"
    >
      Privacy Policy
    </a>
  </>
);

export interface AuthSectionOneProps {
  mode?: "login" | "signup";
  email?: string;
  onEmailChange?: (value: string) => void;
  onEmailSubmit?: () => void;
  otp?: string;
  onOtpChange?: (value: string) => void;
  onOtpSubmit?: () => void;
  onGoogleClick?: () => void;
  onModeChange?: (mode: "login" | "signup") => void;
  otpSent?: boolean;
  error?: string | null;
  notice?: string | null;
  loading?: boolean;
}

export default function AuthSectionOne({
  mode = "login",
  email = "",
  onEmailChange,
  onEmailSubmit,
  otp = "",
  onOtpChange,
  onOtpSubmit,
  onGoogleClick,
  onModeChange,
  otpSent = false,
  error = null,
  notice = null,
  loading = false,
}: AuthSectionOneProps) {
  const interactive = Boolean(onEmailSubmit);

  return (
    <section className="min-h-screen bg-white p-3 text-black antialiased [font-synthesis:none] dark:bg-[#050505] dark:text-white">
      <div className="grid min-h-[calc(100vh-1.5rem)] gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        <div className="flex min-h-[760px] items-start rounded-md border border-black/20 bg-white px-6 py-12 sm:px-10 dark:border-white/10 dark:bg-[#0a0a0a] lg:min-h-0 lg:px-14 lg:py-28 xl:px-20">
          <div className="mx-auto w-full max-w-[590px]">
            <div>
              <h1 className="whitespace-nowrap text-3xl font-medium tracking-[-0.04em] sm:text-4xl lg:text-[42px] lg:leading-[1.05] xl:text-[50px]">
                {mode === "signup" ? "Create an account" : "Welcome back"}
              </h1>
              <p className="mt-3 whitespace-nowrap text-lg leading-snug text-black/60 dark:text-white/55 sm:text-xl lg:text-2xl xl:text-3xl">
                Brainstrom in chat, build in cowork
              </p>
            </div>

            {interactive ? (
              <>
                <div className="mt-12 grid gap-5 sm:grid-cols-2">
                  <SocialButton
                    icon={<HugeiconsIcon icon={GoogleIcon} className="size-4" />}
                    label="Continue with Google"
                    onClick={onGoogleClick}
                    disabled={loading}
                  />
                  <SocialButton
                    icon={<HugeiconsIcon icon={AppleIcon} className="size-4" />}
                    label="Continue with Apple"
                    disabled={loading}
                  />
                </div>

                <div className="my-10 text-center text-xl font-medium text-black/60 dark:text-white/50">
                  or
                </div>

                {error && (
                  <p className="mb-5 rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="mb-5 rounded-[10px] border border-black/15 bg-black/[0.03] px-4 py-3 text-sm text-black/60 dark:border-white/15 dark:bg-white/5 dark:text-white/60">
                    {notice}
                  </p>
                )}

                {otpSent ? (
                  <form
                    className="space-y-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onOtpSubmit?.();
                    }}
                  >
                    <FieldBox
                      label="OTP"
                      value={otp}
                      type="text"
                      onChange={onOtpChange}
                      placeholder="Enter 6-digit code"
                      clearOnFocus={false}
                    />

                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-9 flex h-12 w-full items-center justify-center rounded-[10px] border border-black/40 bg-black text-xl font-medium text-white transition-colors hover:bg-black/85 disabled:opacity-60 dark:border-white/40 dark:bg-white dark:text-black dark:hover:bg-white/85"
                    >
                      {loading ? "Verifying..." : "Verify OTP"}
                    </button>

                    <button
                      type="button"
                      onClick={() => onModeChange?.(mode)}
                      className="w-full text-center text-sm text-black/50 underline underline-offset-2 dark:text-white/50"
                    >
                      Back
                    </button>
                  </form>
                ) : (
                  <form
                    className="space-y-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onEmailSubmit?.();
                    }}
                  >
                    <FieldBox
                      label="Email"
                      value={email}
                      type="email"
                      onChange={onEmailChange}
                      placeholder="you@example.com"
                    />

                    <div className="space-y-4 pt-2 text-sm leading-5 text-black/30 dark:text-white/35 sm:text-[15px]">
                      <CheckboxLine>{termsText}</CheckboxLine>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-9 flex h-12 w-full items-center justify-center rounded-[10px] border border-black/40 bg-black text-xl font-medium text-white transition-colors hover:bg-black/85 disabled:opacity-60 dark:border-white/40 dark:bg-white dark:text-black dark:hover:bg-white/85"
                    >
                      {loading
                        ? "Sending..."
                        : mode === "signup"
                          ? "Create account"
                          : "Continue with email"}
                    </button>
                  </form>
                )}

                <p className="mt-6 text-center text-sm text-black/50 dark:text-white/50">
                  {mode === "signup" ? (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => onModeChange?.("login")}
                        className="font-medium text-black underline underline-offset-2 dark:text-white"
                      >
                        Log in
                      </button>
                    </>
                  ) : (
                    <>
                      New to KIVO?{" "}
                      <button
                        type="button"
                        onClick={() => onModeChange?.("signup")}
                        className="font-medium text-black underline underline-offset-2 dark:text-white"
                      >
                        Create an account
                      </button>
                    </>
                  )}
                </p>
              </>
            ) : (
              <>
                <div className="mt-12 grid gap-5 sm:grid-cols-2">
                  <SocialButton icon={<HugeiconsIcon icon={GoogleIcon} className="size-4" />} label="Sign up with Google" />
                  <SocialButton icon={<HugeiconsIcon icon={AppleIcon} className="size-4" />} label="Sign up with Apple" />
                </div>

                <div className="my-10 text-center text-xl font-medium text-black/60 dark:text-white/50">
                  or
                </div>

                <form className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    {formFields.map((field) => (
                      <FieldBox
                        key={field.label}
                        label={field.label}
                        value={field.value}
                      />
                    ))}
                  </div>

                  <FieldBox
                    label="Email"
                    value="harshitlog@gmail.com"
                    type="email"
                  />
                  <FieldBox
                    label="Password"
                    value="*************"
                    type="password"
                  />

                  <div className="space-y-4 pt-2 text-sm leading-5 text-black/30 dark:text-white/35 sm:text-[15px]">
                    <CheckboxLine>
                      I don&apos;t want to receive emails about solaceui feature
                      updates
                    </CheckboxLine>
                    <CheckboxLine>{termsText}</CheckboxLine>
                  </div>

                  <button
                    type="button"
                    className="mt-9 flex h-12 w-full items-center justify-center rounded-[10px] border border-black/40 bg-black text-xl font-medium text-white transition-colors hover:bg-black/85 dark:border-white/40 dark:bg-white dark:text-black dark:hover:bg-white/85"
                  >
                    Submit
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        <div className="relative flex min-h-[720px] overflow-hidden rounded-md bg-black p-8 text-white sm:p-12 lg:min-h-0">
          <GrainGradient
            speed={1}
            scale={1}
            rotation={0}
            offsetX={0}
            offsetY={0}
            softness={0.5}
            intensity={0.5}
            noise={0.25}
            shape="corners"
            frame={2854.5}
            colors={["#FFFFFF", "#FC7819", "#FC7819", "#FFFFFF"]}
            colorBack="#00000000"
            className="absolute inset-0 bg-black"
          />

          <div className="relative z-10 flex h-full w-full flex-col justify-between">
            <h2 className="max-w-[620px] pt-0 text-5xl font-medium tracking-[-0.05em] text-white sm:text-6xl lg:pt-16 lg:text-[64px] lg:leading-[0.98] xl:text-[70px]">
              Think fast,
              <br />
              Build faster
            </h2>

            <a
              href="#"
              className="mb-0 inline-flex h-12 max-w-full items-center gap-3 rounded-[10px] border border-white/25 px-5 text-base font-medium text-white/85 backdrop-blur-sm transition-colors hover:border-white/45 hover:text-white xl:mb-32 xl:px-6 xl:text-2xl"
            >
              <HugeiconsIcon
                icon={MicrosoftIcon}
                className="size-5 shrink-0 xl:size-7"
              />
              <span className="truncate whitespace-nowrap">
                Download the windows app
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-black/25 bg-white px-3 text-sm leading-none text-black transition-colors hover:bg-black/[0.03] disabled:opacity-60 dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 xl:text-[19px]"
    >
      <span className="shrink-0">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function FieldBox({
  label,
  value,
  type = "text",
  onChange,
  placeholder,
  clearOnFocus = true,
}: {
  label: string;
  value: string;
  type?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  clearOnFocus?: boolean;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [isEditing, setIsEditing] = useState(() => Boolean(onChange && value));

  // When `onChange` is provided the parent owns the value; otherwise the
  // field keeps its own copy.
  const controlled = Boolean(onChange);
  const inputValue = controlled ? value : localValue;

  const handleFocus = () => {
    if (isEditing) {
      return;
    }

    setIsEditing(true);

    if (!clearOnFocus) {
      return;
    }

    if (controlled) {
      onChange?.("");
    } else {
      setLocalValue("");
    }
  };

  const handleChange = (next: string) => {
    setIsEditing(true);

    if (controlled) {
      onChange?.(next);
    } else {
      setLocalValue(next);
    }
  };

  return (
    <label className="flex h-14 items-center justify-between gap-4 rounded-[10px] border border-black/25 bg-white px-5 text-lg leading-none dark:border-white/15 dark:bg-white/5 xl:text-xl">
      <input
        type={type}
        value={inputValue}
        aria-label={label}
        placeholder={placeholder}
        onFocus={handleFocus}
        onChange={(event) => {
          handleChange(event.target.value);
        }}
        className="min-w-0 flex-1 truncate bg-transparent text-black/30 outline-none placeholder:text-black/30 dark:text-white/35 dark:placeholder:text-white/35"
      />
      {!isEditing && (
        <span className="shrink-0 text-black dark:text-white">{label}</span>
      )}
    </label>
  );
}

function CheckboxLine({ children }: { children: ReactNode }) {
  return (
    <label className="flex items-start gap-3">
      <span className="relative mt-1 size-3.5 shrink-0">
        <input
          type="checkbox"
          className="peer size-full appearance-none rounded-[2px] border border-black/25 bg-white checked:border-black checked:bg-black dark:border-white/30 dark:bg-white/5 dark:checked:border-white dark:checked:bg-white"
        />
        <svg
          viewBox="0 0 12 12"
          className="pointer-events-none absolute inset-0 hidden size-full p-0.5 text-white peer-checked:block dark:text-black"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 6.2 5 8.1 9 3.9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  );
}
