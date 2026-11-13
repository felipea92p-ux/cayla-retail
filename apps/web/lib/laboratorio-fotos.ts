import "server-only";
import { esLlaveSandbox } from "@/lib/photoroom-reglas";
import { MODELO_OPENAI_POR_DEFECTO } from "@/lib/openai-imagen-reglas";

/**
 * El laboratorio de fotos (`/laboratorio/fotos`) solo se abre fuera de producción, y cada proveedor solo con su llave en `apps/web/.env.local`.
 * Producción queda fuera aunque alguien ponga las llaves en Vercel: que una IA entre al flujo real de fotos es una decisión aparte (ADR-0442 dice
 * hoy que la foto se sube tal cual), y con la llave de sandbox de Photoroom cada imagen sale con marca de agua.
 */
export type ProveedoresLaboratorio = {
  photoroom: boolean;
  /** La llave de Photoroom es de sandbox (gratis, con marca de agua). */
  photoroomSandbox: boolean;
  openai: boolean;
  modeloOpenAI: string;
};

function llave(nombre: "PHOTOROOM_API_KEY" | "OPENAI_API_KEY"): string {
  return process.env[nombre]?.trim() ?? "";
}

export function proveedoresDelLaboratorio(): ProveedoresLaboratorio {
  const photoroom = llave("PHOTOROOM_API_KEY");
  return {
    photoroom: Boolean(photoroom),
    photoroomSandbox: photoroom ? esLlaveSandbox(photoroom) : false,
    openai: Boolean(llave("OPENAI_API_KEY")),
    modeloOpenAI: process.env.OPENAI_IMAGEN_MODELO?.trim() || MODELO_OPENAI_POR_DEFECTO,
  };
}

export function laboratorioAbierto(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const p = proveedoresDelLaboratorio();
  return p.photoroom || p.openai;
}

export function llaveDe(proveedor: "photoroom" | "openai"): string {
  return llave(proveedor === "photoroom" ? "PHOTOROOM_API_KEY" : "OPENAI_API_KEY");
}
