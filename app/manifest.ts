import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gera Atividade",
    short_name: "Gera Atividade",
    description: "Planeje · Execute · Conclua",
    start_url: "/",
    display: "standalone",
    background_color: "#0A2A66",
    theme_color: "#0A2A66",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
