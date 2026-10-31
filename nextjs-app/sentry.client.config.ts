import * as Sentry from "@sentry/nextjs";

const sentryDsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  "https://examplePublicKey@o0.ingest.sentry.io/0";

Sentry.init({
  dsn: sentryDsn,
  tracesSampleRate: 1.0,
  debug: false,
});
