import { requirePersonaActual } from "@/lib/persona";
import { inferirMapeo } from "@/lib/importacion/inferir-mapeo";
import { aplicarMapeo, camposFaltantes, type PlanDeMapeo } from "@/lib/importacion/mapeo";

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
// código — instantáneo y gratis. Es la misma razón por la que el plan se guarda:
// reimportar el mismo archivo no vuelve a pagar.

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "La lectura automática de columnas todavía no está activada: falta ANTHROPIC_API_KEY. " +
          "Las columnas se pueden asignar a mano mientras tanto.",
      },
      { status: 503 }
    );
  }

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
    const crudo = e instanceof Error ? e.message : String(e);
    if (crudo.includes("credit balance")) {
      return Response.json(
        { error: "La cuenta de Anthropic se quedó sin saldo. Las columnas se pueden asignar a mano." },
        { status: 402 }
      );
    }
    return Response.json({ error: `No se pudo leer las columnas: ${crudo}` }, { status: 502 });
  }
}
