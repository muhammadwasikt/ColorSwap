import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chromatic Shift",
    short_name: "Chromatic Shift",
    description: "Color puzzle adventure",
    start_url: "/",
    display: "standalone",
    background_color: "#060814",
    theme_color: "#060814",
    orientation: "portrait",
    icons: []
  };
}
