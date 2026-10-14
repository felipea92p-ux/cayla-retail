import path from "node:path";
import type { NextConfig } from "next";

// La tienda online (ADR-0408) es una app aparte del ERP: se publica sola, con su dominio. No comparte llaves ni código con
// apps/web; habla con la base del ERP solo por las funciones `retail.tienda_*` (lib/base.ts).
const nextConfig: NextConfig = {
  // La raíz del monorepo, como en apps/web: sin esto Next la adivina buscando lockfiles hacia arriba y, en un worktree
  // dentro del checkout principal, toma la carpeta equivocada.
  turbopack: { root: path.join(__dirname, "..", "..") },
};

export default nextConfig;
