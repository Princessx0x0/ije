import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { IjeCopilotKit } from "@/components/auth/IjeCopilotKit";
// Fonts are self-hosted from npm (Fontsource, OFL-1.1) and served from our own
// origin: no build-time fetch, and no visitor request to Google Fonts.
// Newsreader with its optical-size axis; Atkinson Hyperlegible Next, variable weight.
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/atkinson-hyperlegible-next/wght.css";
import "@copilotkit/react-core/v2/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ije",
  description: "Plan a calm, well reasoned trip.",
};

// Light only (tokens.json color.followSystem): keep browser UI light too.
export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      {/*
        suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
        attributes onto <body> before React hydrates. It only relaxes the check
        for <body>'s own attributes; everything inside is still checked.
      */}
      <body className="antialiased" suppressHydrationWarning>
        <AuthProvider>
          <IjeCopilotKit>{children}</IjeCopilotKit>
        </AuthProvider>
      </body>
    </html>
  );
}
