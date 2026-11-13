import { requirePersonaActualV2, veEstadosFinancierosDeTodoDe, veModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDeLosEstados } from "@/lib/estados-financieros-reglas";
import { leerArchivoContador, motivoArchivoContador, nombreArchivoContador } from "@/lib/contador-reglas";
import { armarArchivoContador } from "@/lib/contador";

// GET /finanzas/reportes/descargar?archivo=<cuál>&mes=aaaa-mm — UN archivo para el contador (ADR-0585, actividad 8): el menú
// «Descargar para el contador» de Estados financieros pide uno por opción, para no bajar lo que no hace falta. Es de CAYLA entera
// (la sede de la barra no lo cambia). Una ruta no hereda el candado del layout: se repite aquí (el módulo), y lo de CAYLA entera
// exige además verla toda (una terminal, no). La base vuelve a exigirlo en cada función. Sin `mes`, el mes en curso (Lima).
export async function GET(request: Request) {
  const persona = await requirePersonaActualV2();
  if (!veModulo(persona, "reportes_financieros")) {
    return Response.json({ error: "Descargar los estados financieros necesita el módulo «Resumen y estados financieros» en tu rol." }, { status: 403 });
  }
  const url = new URL(request.url);
  const archivo = leerArchivoContador(url.searchParams.get("archivo"));
  if (!archivo) return Response.json({ error: "Ese archivo no existe." }, { status: 400 });
  const motivo = motivoArchivoContador(archivo, veEstadosFinancierosDeTodoDe(persona));
  if (motivo) return Response.json({ error: motivo }, { status: 403 });

  const hoy = hoyLima();
  const mes = mesDeLosEstados(url.searchParams.get("mes") ?? undefined, hoy);
  const armado = await armarArchivoContador(archivo, mes, hoy);
  if (armado.falla !== null) return Response.json({ error: armado.falla }, { status: 502 });
  return new Response(armado.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivoContador(archivo, mes)}"`,
      "Cache-Control": "no-store",
    },
  });
}
