import type { MetadataRoute } from "next";
import { REGLAS_PARA_BUSCADORES } from "@/lib/mapa-del-sitio";

// GET /robots.txt (ADR-0696): todo se lee menos `/api/` y `/auth/`, y dice dónde está el mapa (`lib/mapa-del-sitio.ts`).
export default function robots(): MetadataRoute.Robots {
  return REGLAS_PARA_BUSCADORES;
}
