import path from "node:path";
import type { NextConfig } from "next";

// La tienda online (ADR-0408) es una app aparte del ERP: se publica sola, con su dominio. No comparte llaves ni código con
// apps/web; habla con la base del ERP solo por las funciones `retail.tienda_*` (lib/base.ts).

// Las fotos de las prendas viven en el almacén PÚBLICO de fotos del ERP (`retail-productos-fotos`): se ven sin ninguna llave. El
// optimizador de imágenes solo acepta las de ese almacén y de ese origen (`TIENDA_FOTOS_ORIGEN`, la dirección del proyecto donde vive,
// que no es un secreto): sin una lista cerrada, `/_next/image?url=…` serviría de proxy a cualquier dirección. Sin la variable, las
// fotos se muestran tal cual (`lib/catalogo.ts`, `fotoOptimizable`).
// En toda compilación de PRODUCCIÓN (`next build`), el almacén de CAYLA vale aunque la variable no llegue: el 2026-10-15, el primer día
// en producción, la tienda tenía la variable al funcionar pero no al compilar, así que pedía fotos optimizadas que el optimizador
// rechazaba (400) y no se veía ninguna. La lista sigue cerrada a ese único origen, que no es un secreto (es la dirección pública de
// cada foto). `NODE_ENV` y no `VERCEL_ENV`: la tienda solo lee sus variables y las de Next (lib/candados.test.ts).
const ORIGEN_DE_FOTOS_EN_PRODUCCION = "https://vovjyyiafkxteijimpuy.supabase.co";
function origenDeFotos(): URL | null {
  const texto = process.env.TIENDA_FOTOS_ORIGEN?.trim() || (process.env.NODE_ENV === "production" ? ORIGEN_DE_FOTOS_EN_PRODUCCION : "");
  try {
    return texto ? new URL(texto) : null;
  } catch {
    return null;
  }
}
const origen = origenDeFotos();

// Las cabeceras de seguridad de TODA respuesta (2026-10-15, antes de abrir la tienda a cualquiera que cree una cuenta):
// - `frame-ancestors 'none'` + `X-Frame-Options`: ninguna otra página puede meter la tienda en un marco invisible y hacer que el
//   cliente toque «Separar» o «Eliminar mi cuenta» sin verlo.
// - `nosniff`: el navegador no adivina el tipo de un archivo (un texto no se ejecuta como script).
// - `Referrer-Policy`: a otro sitio (WhatsApp, Instagram) solo viaja el dominio, nunca la dirección completa (que puede llevar el
//   número de un pedido).
// - `Permissions-Policy`: la tienda no usa cámara, micrófono, ubicación ni pagos del navegador; nadie que se cuele en ella tampoco.
// - `base-uri` y `object-src`: sin `<base>` ajeno ni plugins.
// No hay una lista de orígenes para scripts (`script-src`): Next mete scripts en línea y una lista mal hecha deja la tienda en blanco;
// queda para cuando se pruebe en el navegador con la cuenta de clientes. HSTS lo pone Vercel en todo dominio con https.
const CABECERAS_DE_SEGURIDAD = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // Sin «X-Powered-By: Next.js»: no se anuncia con qué está hecha la tienda.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: CABECERAS_DE_SEGURIDAD }];
  },
  // La raíz del monorepo, como en apps/web: sin esto Next la adivina buscando lockfiles hacia arriba y, en un worktree
  // dentro del checkout principal, toma la carpeta equivocada.
  turbopack: { root: path.join(__dirname, "..", "..") },
  images: {
    remotePatterns: origen
      ? [
          {
            protocol: origen.protocol === "http:" ? "http" : "https",
            hostname: origen.hostname,
            port: origen.port,
            pathname: "/storage/v1/object/public/retail-productos-fotos/**",
          },
        ]
      : [],
    // Una foto de prenda es un archivo nuevo por cada foto (su nombre lleva un id): lo ya optimizado no envejece (31 días).
    minimumCacheTTL: 60 * 60 * 24 * 31,
    // Pocos anchos: la tarjeta mide de ~170 px (celular, dos columnas) a ~300 px (computadora, cuatro), y el doble en retina.
    imageSizes: [256, 384],
    deviceSizes: [640, 1080],
    // Solo en `next dev`: el almacén local vive en localhost, que Next bloquea por defecto. Nunca en producción.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },
};

export default nextConfig;
