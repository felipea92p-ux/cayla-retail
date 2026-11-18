import type { MetadataRoute } from "next";

// El manifiesto del ERP (ADR-0582): lo que el celular lee para instalarlo como una app. Sin él, el iPhone no entrega avisos push (solo
// los da a una app agregada a la pantalla de inicio que declara `display: standalone`) y Chrome de Android no lo trata como app propia,
// que es donde la sede elige el sonido de los avisos. Se llama «CAYLA ERP» para no confundirse con la tienda online («CAYLA»), que
// puede estar instalada en el mismo teléfono; por eso también su ícono es el rojo del ERP y no el crema de la tienda. Sin orientación
// fija: el ERP también se instala en el computador. Next lo sirve en /manifest.webmanifest (fuera de la sesión: ver `proxy.ts`).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CAYLA ERP",
    short_name: "CAYLA ERP",
    description: "Donde el estilo transforma.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f0e8", // tema-fijo: el manifiesto no lee CSS; es el crema del tema claro
    theme_color: "#f5f0e8", // tema-fijo: el manifiesto no lee CSS; es el crema del tema claro
    icons: [
      { src: "/erp-app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/erp-app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/erp-app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
