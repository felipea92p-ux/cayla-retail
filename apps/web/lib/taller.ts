import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { PersonaActual } from "@/lib/persona";
import { diaLima } from "@/lib/panel-serie";

// Inicio de quien trabaja EN el Taller.
//
// Hasta hoy no existía: la persona del Taller caía en el Inicio de la Encargada,
// que le ofrece "Vender", "Bajar a tienda" y el estado de la caja — tres cosas
// que no le tocan. Y por el bug del código de sede (ver `PersonaActual.sedeTipo`)
// en producción ni siquiera veía el enlace a Producción.
//
// Su pregunta no es "¿cómo vamos?" ni "¿qué se vendió?", es "¿qué tengo en la
// mesa y qué se me está pasando de fecha".

export type OrdenTaller = {
  id: string;
  detalle: string;
  cantidad: number;
  esMuestra: boolean;
  /** ISO de la fecha comprometida, o null si la orden no tiene fecha. */
  fechaEntrega: string | null;
  /** Días de retraso; 0 o negativo = todavía en plazo. */
  diasDeRetraso: number | null;
};

export type PanelTaller = {
  enProceso: OrdenTaller[];
  unidadesEnProceso: number;
  /** Terminadas que nunca entraron al inventario: las prendas existen y el sistema no lo sabe. */
  sinInventariar: OrdenTaller[];
};

export async function getPanelTaller(persona: PersonaActual): Promise<PanelTaller | null> {
  if (persona.sedeTipo !== "fabrica") return null;
  const supabase = await createClient();

  // Es la cola de trabajo del Taller. Si falla y la pantalla dibuja "nada pendiente",
  // el equipo se va a casa con órdenes abiertas.
  const res = await supabase
    .from("producciones")
    .select("id, detalle, cantidad, es_muestra, estado, fecha_entrega, inventariado_at")
    .eq("unidad_id", persona.sedeId)
    .order("fecha_entrega", { ascending: true, nullsFirst: false });

  const data = exigir(res, "las órdenes del taller");

  const hoy = diaLima(Date.now());
  const aOrden = (p: {
    id: string;
    detalle: string | null;
    cantidad: number;
    es_muestra: boolean;
    fecha_entrega: string | null;
  }): OrdenTaller => ({
    id: p.id,
    detalle: p.detalle ?? "(sin detalle)",
    cantidad: p.cantidad,
    esMuestra: p.es_muestra,
    fechaEntrega: p.fecha_entrega,
    diasDeRetraso: p.fecha_entrega ? hoy - diaLima(Date.parse(p.fecha_entrega)) : null,
  });

  const filas = data ?? [];
  const enProceso = filas.filter((p) => p.estado === "en_proceso").map(aOrden);

  return {
    enProceso,
    unidadesEnProceso: enProceso.reduce((a, o) => a + o.cantidad, 0),
    // `inventariado_at` es lo que evita el doble conteo de stock; que esté en
    // null con la orden ya terminada significa que nadie cerró el círculo.
    sinInventariar: filas
      .filter((p) => p.estado === "terminado" && p.inventariado_at == null)
      .map(aOrden),
  };
}
