import { requirePersonaActualV2, veFinanzasDeTodoDe, veModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { leerVer, mesDe, rangoMes } from "@/lib/gastos-reglas";
import { getContextoGastos, getPanelGastos } from "@/lib/gastos";
import { sedeDeLaUrl, SEDE_TODAS } from "@/lib/finanzas-telar-reglas";
import { pendientesDeGastos, type PendienteTelar } from "@/lib/finanzas-te-toca-reglas";

// GET /api/finanzas/te-toca?sede=… → los pendientes de Finanzas de la sede elegida, para «Te toca» de la mesa de mando (El telar).
//
// PROMETE: `{ pendientes }` solo de los submódulos que la cuenta ve; cada lectura pasa por las funciones que ya miran solo lo que
//   la cuenta puede ver (la base decide). Solo lectura. Un submódulo suma los suyos aquí con su `pendientesDe…` de
//   `finanzas-te-toca-reglas.ts`.
// POR QUÉ UNA RUTA Y NO EL LAYOUT: el layout no recibe la URL (no sabe la sede elegida) y no se vuelve a pintar al cambiarla; el
//   botón pregunta aquí al abrir la pantalla y al cambiar de sede. Un GET a /api no abre el loader global.
// SE DEGRADA: si un submódulo no se pudo leer, sus pendientes no salen y `incompleto` lo dice; si nada responde, 503.
export async function GET(request: Request) {
  const persona = await requirePersonaActualV2();
  const sede = sedeDeLaUrl({ sede: new URL(request.url).searchParams.get("sede") });
  const consulta = sede === SEDE_TODAS ? "" : `sede=${encodeURIComponent(sede)}`;
  const pendientes: PendienteTelar[] = [];
  let incompleto = false;

  if (veModulo(persona, "gastos")) {
    try {
      const { desde, hasta } = rangoMes(mesDe(hoyLima()));
      const contexto = await getContextoGastos();
      const ver = leerVer(sede, contexto.ubicaciones, veFinanzasDeTodoDe(persona), persona.ubicacionId);
      const panel = await getPanelGastos(desde, hasta, ver);
      if (panel.datos) pendientes.push(...pendientesDeGastos(panel.datos, consulta));
      else incompleto = true;
    } catch (e) {
      console.error("Te toca: no se pudieron leer los pendientes de Gastos", e);
      incompleto = true;
    }
  }

  if (incompleto && !pendientes.length) return Response.json({ error: "No pudimos leer los pendientes." }, { status: 503, headers: { "cache-control": "no-store" } });
  return Response.json({ pendientes, incompleto }, { headers: { "cache-control": "no-store" } });
}
