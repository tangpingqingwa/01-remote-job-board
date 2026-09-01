import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Remote Jobs",
    short_name: "Remote Jobs",
    description: "A transparent rolling seven-day remote jobs hiring wall.",
    start_url: "/",
    display: "standalone",
    background_color: "#ece6d4",
    theme_color: "#1f5c45",
    icons: [{ src: "/brand-mark.png", sizes: "512x512", type: "image/png" }],
  };
}
