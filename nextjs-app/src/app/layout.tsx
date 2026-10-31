import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import * as Sentry from "@sentry/nextjs";

import { TooltipProvider } from "@/components/ui/tooltip";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KIVO",
  description: "Your work manager",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-transparent">
        <Sentry.ErrorBoundary fallback={({ error, resetError }) => {
          const message = error instanceof Error ? error.message : String(error);
          return (
            <div className="p-4 text-center">
              <h2 className="text-red-500">Something went wrong</h2>
              <p className="text-sm">{message}</p>
              <button
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
                onClick={resetError}
              >
                Try again
              </button>
            </div>
          );
        }}        >
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </Sentry.ErrorBoundary>
      </body>
    </html>
  );
}
