import path from "node:path";
import type { NextConfig } from "next";

// La tienda online (ADR-0408) es una app aparte del ERP: se publica sola, con su dominio. No comparte llaves ni código con
// apps/web; habla con la base del ERP solo por las funciones `retail.tienda_*` (lib/base.ts).

// Las fotos de las prendas viven en el almacén PÚBLICO de fotos del ERP (`retail-productos-fotos`): se ven sin ninguna llave. El
// optimizador de imágenes solo acepta las de ese almacén y de ese origen (`TIENDA_FOTOS_ORIGEN`, la dirección del proyecto donde vive,
// que no es un secreto): sin una lista cerrada, `/_next/image?url=…` serviría de proxy a cualquier dirección. Sin la variable, las
// fotos se muestran tal cual (`lib/catalogo.ts`, `fotoOptimizable`).
function origenDeFotos(): URL | null {
  try {
    return process.env.TIENDA_FOTOS_ORIGEN ? new URL(process.env.TIENDA_FOTOS_ORIGEN) : null;
  } catch {
    return null;
  }
}
const origen = origenDeFotos();

const nextConfig: NextConfig = {
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
