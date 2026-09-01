import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { validateProductionStartup } from "./src/instrumentation-node";

// Next loads this config before binding the production HTTP listener. Keep
// build-time fixture compilation independent, but fail a live process before
// it can announce readiness with missing Waffo or durable-DB configuration.
const nextConfig = (phase: string): NextConfig => {
  if (phase !== PHASE_PRODUCTION_BUILD) validateProductionStartup();
  return { reactStrictMode: true, devIndicators: false };
};

export default nextConfig;
