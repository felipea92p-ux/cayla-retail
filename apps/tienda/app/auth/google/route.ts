import { NextResponse, type NextRequest } from "next/server";
import { conAviso, hrefConVolver, PARAMETRO_VOLVER, rutaParaVolver } from "@/lib/entrada";
import { terminarConGoogle } from "@/lib/google-servidor";
import { INICIO_CON_CUENTA } from "@/lib/sesion";

// A donde vuelve Google (ADR-0438): el proyecto de clientes redirige aquí con `?code=…` (y el `?volver=` que mandó la página). Se canjea
// el código por la sesión (`terminarConGoogle`) y la persona sigue a donde estaba (la bolsa, una prenda) o al Inicio. Si algo falla,
// vuelve a «Entrar» con el motivo en `?google=` (el formulario lo dice con palabras). Solo GET: es una navegación del navegador.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const volver = rutaParaVolver(url.searchParams.get(PARAMETRO_VOLVER));
  const hacia = (ruta: string) => NextResponse.redirect(new URL(ruta, request.url));
  const fallo = (motivo: string) => hacia(`${hrefConVolver("/entrar", volver)}${volver ? "&" : "?"}google=${motivo}`);

  const codigo = url.searchParams.get("code");
  if (!codigo || codigo.length > 400) return fallo("cancelado");
  const r = await terminarConGoogle(codigo);
  switch (r.estado) {
    case "ok":
      return hacia(r.nueva ? conAviso(volver ?? INICIO_CON_CUENTA, "cuenta-lista") : (volver ?? INICIO_CON_CUENTA));
    case "sin_codigo":
      return fallo("cancelado");
    case "correo_de_otra_persona":
      return fallo("correo-de-otra-persona");
    case "correo_repetido":
      return fallo("correo-repetido");
    default:
      return fallo("no-disponible");
  }
}
