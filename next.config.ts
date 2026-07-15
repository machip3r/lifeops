import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do NOT put SUPABASE_SERVICE_ROLE_KEY in `env` — that inlines it into the client bundle.
  async redirects() {
    return [
      {
        source: "/dashboard/cotizacion",
        destination: "/dashboard/projection",
        permanent: true,
      },
      {
        source: "/dashboard/proyeccion",
        destination: "/dashboard/projection",
        permanent: true,
      },
      {
        source: "/dashboard/policies",
        destination: "/dashboard/contracts",
        permanent: true,
      },
      {
        source: "/dashboard/policies/new",
        destination: "/dashboard/contracts/new",
        permanent: true,
      },
      {
        source: "/dashboard/policies/:path*",
        destination: "/dashboard/contracts/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
