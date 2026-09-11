import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { inferirMapeo } from "@/lib/importacion/inferir-mapeo";
import { aplicarMapeo, camposFaltantes, planPorCabeceras, type PlanDeMapeo } from "@/lib/importacion/mapeo";
import { permitirLlamada, traducirErrorIA } from "@/lib/ia/cliente";
import { claveTexto } from "@/lib/taxonomia/anclar";

// POST /api/importacion/mapear
//   { filas, filaCabecera }        → PROPONE un plan con la IA
//   { filas, filaCabecera, plan }  → APLICA un plan ya corregido, sin IA
//
// CONTRATO
//   PROMETE: no escribir nada en la base, nunca. Este paso solo produce y
//            aplica un plan; guardar viene después y es otra decisión.
//   ASUME:   sesión válida y rol de Líder.
//
// POR QUÉ EL MISMO ENDPOINT HACE LAS DOS COSAS: cuando la persona corrige una
// columna en pantalla hay que volver a calcular la vista previa, y eso NO debe
// gastar otra llamada al modelo. Con `plan` en el cuerpo, el camino es puro
// código — instantáneo y gratis. Es la misma razón por la que el plan se guarda
// en `importaciones.plan` (0056) con las cabeceras del archivo: reimportar un
// archivo con las MISMAS cabeceras reutiliza ese plan y no vuelve a pagar. (La
// primera versión lo prometía en este comentario y no lo hacía — revisión del
// 2026-09-11.)

/** Cabeceras comparables: sin mayúsculas, acentos ni espacios dobles. */
function firmaCabeceras(cabeceras: string[]): string {
  return cabeceras.map(claveTexto).join("\u0001");
}

/**
 * El plan de la última importación aplicada con estas mismas cabeceras, si la
 * hay. Se miran las últimas 20: un cliente reimporta el archivo de siempre,
 * no uno de hace un año.
 */
async function planGuardado(cabeceras: string[]): Promise<{ plan: PlanDeMapeo; fecha: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("importaciones")
    .select("plan, created_at")
    .eq("estado", "aplicada")
    .order("created_at", { ascending: false })
    .limit(20);
  const firma = firmaCabeceras(cabeceras);
  for (const fila of data ?? []) {
    const plan = fila.plan as (PlanDeMapeo & { cabeceras?: string[] }) | null;
    if (Array.isArray(plan?.cabeceras) && firmaCabeceras(plan.cabeceras) === firma) {
      const { cabeceras: _c, ...sinCabeceras } = plan;
      void _c;
      return { plan: sinCabeceras, fecha: fila.created_at };
    }
  }
  return null;
}

export async function POST(request: Request) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede importar un catálogo." }, { status: 403 });
  }

  const cuerpo = (await request.json().catch(() => null)) as {
    filas?: string[][];
    filaCabecera?: number;
    plan?: PlanDeMapeo;
  } | null;

  const filas = cuerpo?.filas;
  const filaCabecera = cuerpo?.filaCabecera ?? 0;
  if (!Array.isArray(filas) || filas.length === 0) {
    return Response.json({ error: "No llegaron las filas del archivo." }, { status: 400 });
  }

  // Camino sin IA: ya hay plan, solo hay que aplicarlo.
  if (cuerpo?.plan) {
    const variantes = aplicarMapeo(filas, cuerpo.plan, filaCabecera);
    return Response.json({
      plan: cuerpo.plan,
      variantes: variantes.slice(0, 50),
      total: variantes.length,
      faltan: camposFaltantes(cuerpo.plan),
    });
  }

  // Sin clave no hay modelo, pero sí hay pantalla: se devuelve el plan por
  // nombre de columna y la persona lo termina con los desplegables. Antes era
  // un 503 que prometía "se pueden asignar a mano" sin dar cómo.
  if (!process.env.ANTHROPIC_API_KEY) {
    const plan = planPorCabeceras(filas[filaCabecera] ?? []);
    const variantes = aplicarMapeo(filas, plan, filaCabecera);
    return Response.json({
      plan,
      variantes: variantes.slice(0, 50),
      total: variantes.length,
      faltan: camposFaltantes(plan),
      aviso: "Falta ANTHROPIC_API_KEY: las columnas se asignaron por su nombre, sin el modelo. Revisa cada una.",
    });
  }

  // Antes de pagar: ¿ya se importó un archivo con estas cabeceras?
  const previo = await planGuardado(filas[filaCabecera] ?? []);
  if (previo) {
    const variantes = aplicarMapeo(filas, previo.plan, filaCabecera);
    const fecha = new Date(previo.fecha).toLocaleDateString("es-PE", { day: "numeric", month: "long" });
    return Response.json({
      plan: { ...previo.plan, notas: `Mismas columnas que la importación del ${fecha}: se reutilizó ese plan, sin consultar al modelo.` },
      variantes: variantes.slice(0, 50),
      total: variantes.length,
      faltan: camposFaltantes(previo.plan),
    });
  }

  const freno = permitirLlamada(persona.id);
  if (!freno.ok) return Response.json({ error: freno.mensaje }, { status: 429 });

  try {
    const { plan, uso } = await inferirMapeo(filas, filaCabecera);
    const variantes = aplicarMapeo(filas, plan, filaCabecera);
    return Response.json({
      plan,
      variantes: variantes.slice(0, 50),
      total: variantes.length,
      faltan: camposFaltantes(plan),
      // El costo real viaja a la pantalla en vez de quedarse en un log: así se
      // contrasta con lo estimado en vez de creerlo.
      uso,
    });
  } catch (e) {
    const { mensaje, status } = traducirErrorIA(
      e,
      "La lectura automática de columnas",
      "Mientras tanto se pueden asignar a mano."
    );
    return Response.json({ error: mensaje }, { status });
  }
}
