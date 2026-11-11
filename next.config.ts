import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  compress: true,
  allowedDevOrigins: ["10.10.20.11"],
  serverExternalPackages: [],
  // Dienstplan-PDF (@react-pdf/renderer, extern): pdfkit lädt seine
  // Standardschriften per require (*.cjs) und AFM-Daten zur Laufzeit; das
  // Tracing nimmt nur die .mjs-Dateien mit. Ohne diese Zeile scheitert das PDF
  // im Standalone-Image mit MODULE_NOT_FOUND (lokal mit next dev nicht sichtbar).
  outputFileTracingIncludes: {
    "/api/dienstplan/plaene/\\[jahr\\]/export/pdf": [
      "./node_modules/pdfkit/js/standard-fonts/**/*",
      "./node_modules/pdfkit/js/data/**/*",
    ],
  },
  images: {
    unoptimized: true, // No sharp dependency needed on Raspberry Pi
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
