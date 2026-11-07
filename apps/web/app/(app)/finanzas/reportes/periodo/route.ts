import { requirePersonaActualV2, veDiarioDeTodoDe, veModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { mesesDelHilo } from "@/lib/estados-periodo";
import { getResultadoPorMes, getVentasDelMes } from "@/lib/estados-serie";
import { mesesDelCalendario } from "@/lib/igv-gestion-reglas";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { sedeDeLaUrl, SEDE_TODAS } from "@/lib/finanzas-telar-reglas";

const NO_GUARDAR_EN_COMPARTIDO = { "Cache-Control": "private, max-age=60" };

// GET /finanzas/reportes/periodo?sede=<clave> — lo que el calendario de fechas de Estados financieros pide cuando se abre (ADR-0611): cuánto se ganó cada
// mes, para sus barritas. Con `&mes=aaaa-mm`, lo vendido por día de ese mes, para sus puntitos. Solo lee y es de apoyo: sin esto el calendario funciona
// igual, por eso no va en la carga de la pantalla. Una ruta no hereda el candado del layout: se repite aquí, y quien no ve todo mira su sede (lo decide la base).
export async function GET(request: Request) {
  const persona = await requirePersonaActualV2();
  if (!veModulo(persona, "reportes_financieros")) {
    return Response.json({ error: "Ver los estados financieros necesita el módulo «Resumen y estados financieros» en tu rol." }, { status: 403 });
  }
  const url = new URL(request.url);
  const sede = veDiarioDeTodoDe(persona) ? sedeDeLaUrl({ sede: url.searchParams.get("sede") }) : (persona.ubicacionId ?? SEDE_TODAS);
  const mes = url.searchParams.get("mes");
  if (mes !== null) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return Response.json({ error: "Ese mes no existe." }, { status: 400 });
    return Response.json({ dias: await getVentasDelMes(mes, sede) }, { headers: NO_GUARDAR_EN_COMPARTIDO });
  }
  const parametros = await getParametrosFinanzas();
  const serie = await getResultadoPorMes(mesesDelHilo(hoyLima(), parametros?.inicioFinanzas ?? null), sede);
  return Response.json({ meses: mesesDelCalendario(serie.meses, serie.falla) }, { headers: NO_GUARDAR_EN_COMPARTIDO });
}
