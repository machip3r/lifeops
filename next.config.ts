import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev requests from 127.0.0.1 are a different origin than localhost.
  allowedDevOrigins: ["127.0.0.1"],
  // Do NOT put SUPABASE_SERVICE_ROLE_KEY in `env` — that inlines it into the client bundle.
  async redirects() {
    return [
      // Legacy Spanish aliases → active English routes
      {
        source: "/dashboard/policies",
        destination: "/dashboard/contracts",
        permanent: true,
      },
      {
        source: "/dashboard/policies/new",
        destination: "/dashboard/contracts",
        permanent: false,
      },
      {
        source: "/dashboard/policies/:path*",
        destination: "/dashboard/contracts/:path*",
        permanent: true,
      },
      // Parked features (fase 1) — code lives under src/parked/
      {
        source: "/dashboard/contracts/new",
        destination: "/dashboard/contracts",
        permanent: false,
      },
      {
        source: "/dashboard/projection",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/dashboard/cotizacion",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/dashboard/proyeccion",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/dashboard/change-requests",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/dashboard/change-requests/:path*",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/dashboard/collections/v0",
        destination: "/dashboard/collections",
        permanent: false,
      },
      {
        source: "/dashboard/contracts/:id/change",
        destination: "/dashboard/contracts/:id",
        permanent: false,
      },
      {
        source: "/dashboard/contracts/:id/correct-folio",
        destination: "/dashboard/contracts/:id",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
