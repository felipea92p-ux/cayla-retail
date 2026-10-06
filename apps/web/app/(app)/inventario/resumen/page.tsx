import { redirect } from "next/navigation";
import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getDatosAnalisis } from "@/lib/analisis-datos";
import { leerVista } from "@/lib/analisis-reglas";
import type { AccesoAnalisis } from "@/lib/analisis-tipos";
import { AnalisisPantalla } from "@/components/analisis/AnalisisPantalla";

// Análisis v4 (ADR-0356, Felipe 2026-10-06; reemplaza Desempeño y Comparar de ADR-0138/ADR-0277): cuatro preguntas de la
// tienda —¿qué hago hoy?, ¿qué se acaba?, ¿qué no se vende?, ¿qué pido?— respondidas con gráficos, cada prenda con su acción.
// La ruta sigue siendo `/inventario/resumen` (renombrarla rompería enlaces y marcadores por nada).
//
// La tienda es SIEMPRE la del selector de sede del ERP (`persona.ubicacionId`). La encargada y el líder ven lo mismo (decisión
// 8): las tres tiendas, el dinero y el costo por prenda. Cuando la tienda no cumple las tres condiciones del motor de demanda
// (ADR-0346), Análisis no recomienda: dice «Todavía no» y qué falta.
export default async function AnalisisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const persona = await exigirModulo("analisis");
  if (!puede(persona, "analizar")) redirect("/inventario"); // lo ve pero su rol está limitado: sin las lecturas del módulo

  const params = await searchParams;
  const ubicacionActiva = (await getUbicaciones()).find((u) => u.id === persona.ubicacionId);
  if (!ubicacionActiva) redirect("/inventario");

  // A dónde llevan sus botones: cada uno solo si el rol ve esa pantalla (ADR-0161, ADR-0245). «Pedir a otra tienda» lo acepta
  // la base con Traslados o con Análisis (`pedir_a_otra_sede`, ADR-0242 D-7). Etiquetas de precio no exige módulo.
  const acceso: AccesoAnalisis = {
    existencias: veModulo(persona, "existencias"),
    traslados: veModulo(persona, "traslados"),
    pedir: veModulo(persona, "traslados") || veModulo(persona, "analisis"),
    compras: veModulo(persona, "facturas_compra") && puede(persona, "verDineroCompras"),
    produccion: veModulo(persona, "produccion"),
    etiquetas: true,
    movimientos: veModulo(persona, "movimientos"),
    regularizar: veModulo(persona, "existencias"),
    cuadrar: veModulo(persona, "existencias"),
    conteo: veModulo(persona, "conteos"),
    frescura: veModulo(persona, "frescura"),
  };

  const datos = await getDatosAnalisis(ubicacionActiva);
  return <AnalisisPantalla datos={datos} acceso={acceso} vistaInicial={leerVista(params.vista)} />;
}
