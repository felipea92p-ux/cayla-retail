import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getSububicaciones } from "@/lib/sububicaciones";
import { getUbicaciones } from "@/lib/ubicaciones";
import { textoCsv } from "@/lib/exportar-csv";
import {
  ENCABEZADOS_CSV_MOVIMIENTOS,
  filaCsvMovimiento,
  filtrosDesdeParams,
  hoyEnLima,
  listarMovimientos,
  nombreArchivoMovimientos,
  type CursorMovimientos,
  type ParamsMovimientos,
} from "@/lib/movimientos-v2";

// Exportar Movimientos a Excel (ADR-0234, decisión D3 de Felipe): el módulo promete «Consultar y exportar» en Roles y
// accesos. Una descarga directa con TODO lo filtrado —no solo la página que se ve—, con los mismos filtros de la URL y la
// sede de la cabecera: el mismo camino que Exportar de Historial (ADR-0230), para que exportar sea igual en todo el ERP.
//
// Un `route.ts` no pasa por el `layout.tsx` que exige el módulo: se pregunta acá. La base vuelve a comprobar que la cuenta
// opere la sede (`fn_puede_operar_ubicacion`).
//
// Números: TRU hizo 127 movimientos en sus primeros 5 días; 90 días así son ~2.300 filas. El tope de 10.000 son ~50
// llamadas de 200 (1–3 s) y ~1,5 MB. Si hay más, el nombre del archivo lo dice.
const TOPE_EXPORTAR = 10_000;

export async function GET(req: Request) {
  const persona = await requirePersonaActualV2();
  if (!veModulo(persona, "movimientos")) return new Response("Tu rol no incluye Movimientos.", { status: 403 });

  const params = Object.fromEntries(new URL(req.url).searchParams.entries()) as ParamsMovimientos;
  const [ubicaciones, sububicaciones] = await Promise.all([getUbicaciones(), getSububicaciones(persona.ubicacionId)]);
  const filtros = filtrosDesdeParams(params, { sububicaciones });

  const filas: (string | number)[][] = [];
  let cursor: CursorMovimientos | null = null;
  do {
    const pagina = await listarMovimientos(persona.ubicacionId, filtros, { cursor, limite: 200 });
    for (const m of pagina.filas) filas.push(filaCsvMovimiento(m));
    cursor = pagina.siguiente;
  } while (cursor && filas.length < TOPE_EXPORTAR);

  const sede = ubicaciones.find((u) => u.id === persona.ubicacionId)?.nombre ?? persona.ubicacionEtiqueta;
  const recortado = cursor !== null || filas.length > TOPE_EXPORTAR;
  return new Response(textoCsv(ENCABEZADOS_CSV_MOVIMIENTOS, filas.slice(0, TOPE_EXPORTAR)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivoMovimientos(sede, hoyEnLima(), recortado)}"`,
      "Cache-Control": "no-store",
    },
  });
}
