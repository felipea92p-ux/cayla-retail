import type { MetadataRoute } from "next";

// El manifiesto de la tienda (ADR-0431): lo que el celular lee para añadirla a la pantalla de inicio como una app. Se abre en pantalla
// completa, sin la barra del navegador, y arranca en el Inicio (quien no tiene sesión llega a «Entrar» por el proxy). Los colores son
// los de la marca (el crema del tema claro: globals.css); el «maskable» deja el colibrí en la zona segura para que Android lo recorte
// en círculo, cuadrado o gota sin comérselo. Next lo sirve en /manifest.webmanifest y lo enlaza solo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CAYLA · Tienda online",
    short_name: "CAYLA",
    description: "Separa tus prendas de CAYLA y recógelas en tu tienda.",
    lang: "es",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ecebe7",
    theme_color: "#ecebe7",
    icons: [
      { src: "/cayla-app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/cayla-app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/cayla-app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
