import { createClient } from "@/lib/supabase/server";
import { getSedes } from "@/lib/sedes";
import type { PersonaActual } from "@/lib/persona";
import { diaLima } from "@/lib/panel-serie";

// Bandeja de pendientes del Inicio: la cola de trabajo del día.
//
// La diferencia con las 4 cifras de arriba no es de tamaño, es de naturaleza.
// Una cifra describe un ESTADO ("vendiste S/306"); un pendiente exige una
// ACCIÓN con consecuencia si no se hace. Por eso viven en bloques distintos y
// por eso este se esconde entero cuando no hay nada: un tablero que muestra
// "0 pendientes · 0 rechazados · 0 atrasados" enseña a ignorar esa zona de la
// pantalla, y el día que aparezca un número real ya nadie lo va a mirar.
//
// Patrón "Activity Cues" de Dynamics 365 / "Reminders" de NetSuite: cada línea
// es un contador que lleva a la pantalla donde se resuelve, no un aviso que
// hay que ir a buscar a otro lado.

export type Pendiente = {
  clave: string;
  cantidad: number;
  /** Redactado con el número adentro: "2 comprobantes rechazados por SUNAT". */
  etiqueta: string;
  /** Qué exactamente, para saber si hay que soltar todo o puede esperar. */
  detalle: string;
  href: string;
  /**
   * Rojo solo cuando hay plazo legal o dinero suelto. Sin esta disciplina la
   * bandeja entera se pinta de rojo y deja de significar nada — es la misma
   * regla que ya hace cumplir `TarjetaIndicador`.
   */
  critico: boolean;
};

/**
 * Solo Líder por ahora (igual que `getPanelLider`). La Encargada necesita otra
 * lista —la suya, de su sede— y eso llega con su propio Inicio; devolver acá
 * la lista del Líder recortada por RLS habría dado un bloque a medias, que es
 * peor que ninguno.
 */
export async function getPendientes(persona: PersonaActual): Promise<Pendiente[]> {
  if (persona.rol !== "lider") return [];
  const supabase = await createClient();
  const hoy = diaLima(Date.now());

  const [sedes, { data: comprobantes }, { data: producciones }, { data: ordenes }, { data: cajasAbiertas }] =
    await Promise.all([
      getSedes(),
      supabase
        .from("comprobantes")
        .select("id, tipo, serie, numero, estado, sede_id, created_at")
        .in("estado", ["pendiente", "rechazado"]),
      // Tabla chica (una fila por corrida del Taller): se filtra en JS en vez de
      // armar un `or()` de PostgREST que después nadie sabe leer.
      supabase.from("producciones").select("id, estado, fecha_entrega, inventariado_at, detalle"),
      supabase
        .from("ordenes_compra")
        .select("id, proveedor, estado, fecha_estimada, sede_destino_id")
        .in("estado", ["pendiente", "confirmada"]),
      supabase.from("cajas").select("sede_id, abierta_en").eq("estado", "abierta"),
    ]);

  const codigoPorId = new Map(sedes.map((s) => [s.id, s.codigo]));
  const codigo = (id: string | null) => (id ? codigoPorId.get(id) ?? "?" : "?");
  const lista: Pendiente[] = [];
  const agregar = (p: Pendiente) => {
    if (p.cantidad > 0) lista.push(p);
  };

  // ==================== Facturación ====================
  // Rechazado es el estado más caro del sistema: SUNAT lo devolvió y el
  // correlativo ya quedó consumido. No se arregla solo ni se reintenta solo.
  const rechazados = (comprobantes ?? []).filter((c) => c.estado === "rechazado");
  agregar({
    clave: "comprobantes-rechazados",
    cantidad: rechazados.length,
    etiqueta: `${rechazados.length} comprobante${rechazados.length === 1 ? "" : "s"} rechazado${rechazados.length === 1 ? "" : "s"} por SUNAT`,
    detalle: resumirComprobantes(rechazados, codigo),
    href: "/vender/facturacion",
    critico: true,
  });

  // Emitido y nunca transmitido. Lo de HOY no cuenta: todavía está en el flujo
  // normal. Lo de días anteriores es un olvido con plazo corriendo — las
  // boletas van por resumen diario y ese resumen tiene fecha de vencimiento.
  const sinTransmitir = (comprobantes ?? []).filter(
    (c) => c.estado === "pendiente" && diaLima(Date.parse(c.created_at)) < hoy
  );
  agregar({
    clave: "comprobantes-sin-transmitir",
    cantidad: sinTransmitir.length,
    etiqueta: `${sinTransmitir.length} comprobante${sinTransmitir.length === 1 ? "" : "s"} sin transmitir a SUNAT`,
    detalle: resumirComprobantes(sinTransmitir, codigo),
    href: "/vender/facturacion",
    critico: true,
  });

  // ==================== Caja ====================
  // Una caja que amaneció abierta es efectivo sin cuadrar de un día que ya
  // cerró: nadie contó ese dinero contra lo que el sistema esperaba.
  const cajasDeAyer = (cajasAbiertas ?? []).filter(
    (c) => c.abierta_en != null && diaLima(Date.parse(c.abierta_en)) < hoy
  );
  agregar({
    clave: "cajas-sin-cerrar",
    cantidad: cajasDeAyer.length,
    etiqueta: `${cajasDeAyer.length} caja${cajasDeAyer.length === 1 ? "" : "s"} de días anteriores sin cerrar`,
    detalle: cajasDeAyer
      .map((c) => `${codigo(c.sede_id)} desde el ${fechaCorta(c.abierta_en as string)}`)
      .join(" · "),
    href: "/vender",
    critico: true,
  });

  // ==================== Taller ====================
  // Terminado pero sin inventariar: las prendas existen físicamente y el
  // sistema no lo sabe. Todo lo que se calcula sobre stock queda mal mientras
  // dure — incluido el "reponer ya" de la tarjeta de arriba.
  const sinInventariar = (producciones ?? []).filter(
    (p) => p.estado === "terminado" && p.inventariado_at == null
  );
  agregar({
    clave: "produccion-sin-inventariar",
    cantidad: sinInventariar.length,
    etiqueta: `${sinInventariar.length} producci${sinInventariar.length === 1 ? "ón terminada" : "ones terminadas"} sin inventariar`,
    detalle: sinInventariar.map((p) => p.detalle ?? "(sin detalle)").slice(0, 3).join(" · "),
    href: "/produccion",
    critico: false,
  });

  const atrasadas = (producciones ?? []).filter(
    (p) => p.estado === "en_proceso" && p.fecha_entrega != null && diaLima(Date.parse(p.fecha_entrega)) < hoy
  );
  agregar({
    clave: "produccion-atrasada",
    cantidad: atrasadas.length,
    etiqueta: `${atrasadas.length} producci${atrasadas.length === 1 ? "ón pasada" : "ones pasadas"} de su fecha de entrega`,
    detalle: atrasadas
      .map((p) => `${p.detalle ?? "(sin detalle)"} — para el ${fechaCorta(p.fecha_entrega as string)}`)
      .slice(0, 3)
      .join(" · "),
    href: "/produccion",
    critico: false,
  });

  // ==================== Compras ====================
  // Solo se marca atrasada la que tiene `fecha_estimada` vencida. Una orden sin
  // fecha estimada no se inventa un plazo: no sabemos cuándo debía llegar, y
  // avisar de algo que quizá no está atrasado es la forma más rápida de que
  // esta bandeja pierda credibilidad.
  const ocAtrasadas = (ordenes ?? []).filter(
    (o) => o.fecha_estimada != null && diaLima(Date.parse(o.fecha_estimada)) < hoy
  );
  agregar({
    clave: "compras-atrasadas",
    cantidad: ocAtrasadas.length,
    etiqueta: `${ocAtrasadas.length} orden${ocAtrasadas.length === 1 ? "" : "es"} de compra que ya debió llegar`,
    detalle: ocAtrasadas
      .map((o) => `${o.proveedor} → ${codigo(o.sede_destino_id)} (${fechaCorta(o.fecha_estimada as string)})`)
      .slice(0, 3)
      .join(" · "),
    href: "/inventario/compras",
    critico: false,
  });

  // Lo crítico primero: el orden de la lista es el orden en que conviene
  // atacarla, no el orden en que se calculó.
  return lista.sort((a, b) => Number(b.critico) - Number(a.critico));
}

function resumirComprobantes(
  filas: { tipo: string; serie: string; numero: number; sede_id: string | null }[],
  codigo: (id: string | null) => string
): string {
  return filas
    .slice(0, 3)
    .map((c) => `${codigo(c.sede_id)} ${c.serie}-${String(c.numero).padStart(6, "0")}`)
    .join(" · ");
}

function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}
