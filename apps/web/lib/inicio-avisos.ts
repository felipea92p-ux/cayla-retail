// Reglas puras de «Te toca», los accesos rápidos y «Equipo de hoy» del Inicio (spike
// docs/maquetas/inicio-movil-roles-2026-09/, decisiones de Felipe del 2026-09-26). Sin Supabase ni React: se prueban
// en `inicio-avisos.test.ts` y las importan tanto la página (servidor) como la hoja «Ajustar» (cliente).
//
// Cada aviso nace de UNA lectura que ya existe en `lib/` (la misma que usa su pantalla), así que el número del Inicio
// y el de la pantalla no pueden discrepar. Un aviso solo existe si quien mira ve su módulo (ADR-0161): por eso cada
// uno lleva a su pantalla sin riesgo de caer en «Sin acceso».
//
// Lo URGENTE no se puede ocultar: es el canal que no se apaga (Square, Zebra; investigación en el README del spike).

import type { ClaveModulo } from "./modulos";
import { DIAS_PARA_VENCER } from "./por-regularizar-reglas";
import { HORAS_REINTENTO_AUTOMATICO } from "./transmision-reglas";

export type NivelAviso = "urgente" | "toca" | "info" | "aldia" | "sinleer";

export type ClaveAviso =
  | "sunat"
  | "aperturas"
  | "apartados"
  | "devoluciones"
  | "pedidos"
  | "traslados"
  | "conteo"
  | "regularizar"
  | "porPagar";

export type Aviso = {
  clave: ClaveAviso;
  grupo: "Ventas y posventa" | "Inventario" | "Compras";
  titulo: string;
  detalle: string;
  /** null = no se pudo leer. Nunca se dibuja como 0: una cola que no se lee no está «al día». */
  cantidad: number | null;
  nivel: NivelAviso;
  href: string;
  /** false = siempre visible (candado en «Ajustar»): tiene plazo legal o es plata que no cuadra. */
  ocultable: boolean;
  /** Cuándo se vuelve urgente y sale aunque se haya ocultado. Solo para avisos ocultables. */
  urgenteSi?: string;
};

/** Apartados abiertos que vencen pronto, ya reducidos a lo que el aviso necesita. */
export type ResumenApartados = { vencidos: number; hoy: number; manana: number; primeraClienta: string | null };

/** Lo que cada lectura trajo. `undefined` = esta cola no es para quien mira (no ve el módulo); `null` = no se pudo leer. */
export type FuentesAvisos = {
  comprobantesAtascados?: number | null;
  aperturas?: number | null;
  apartados?: ResumenApartados | null;
  devoluciones?: number | null;
  pedidos?: number | null;
  traslados?: number | null;
  /** true = hay un conteo abierto en la sede. */
  conteoAbierto?: boolean | null;
  prendasVencidas?: number | null;
  /** Deuda con proveedores: lo vencido y lo que vence en los próximos 7 días. */
  porPagar?: { vencidas: number; montoVencido: number; semana: number; montoSemana: number } | null;
};

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const SIN_LEER = "No se pudo leer. Lo demás de esta pantalla sí está al día.";

/** El nivel de una cola según su cantidad: sin leer, al día, o el nivel que le toca cuando hay algo. */
function nivelDe(cantidad: number | null, siHay: NivelAviso): NivelAviso {
  if (cantidad === null) return "sinleer";
  return cantidad > 0 ? siHay : "aldia";
}

/** Arma los avisos de quien mira. Solo aparecen los de las fuentes que se leyeron para él (las demás vienen `undefined`). */
export function avisosInicio(f: FuentesAvisos): Aviso[] {
  const avisos: Aviso[] = [];

  // PL-114: comprobantes que el reintento automático ya soltó. Siempre urgente: SUNAT tiene plazo.
  if (f.comprobantesAtascados !== undefined) {
    const n = f.comprobantesAtascados;
    avisos.push({
      clave: "sunat",
      grupo: "Ventas y posventa",
      titulo: "Comprobantes sin llegar a SUNAT",
      cantidad: n,
      nivel: nivelDe(n, "urgente"),
      detalle:
        n === null ? SIN_LEER : n === 0 ? "Todos llegaron o se están reintentando solos."
          : `${n} ${plural(n, "lleva", "llevan")} más de ${HORAS_REINTENTO_AUTOMATICO} horas: ya no se reintenta solo.`,
      href: "/vender/comprobantes/por-reintentar",
      ocultable: false,
    });
  }
  // ADR-0186: una apertura de caja que no cuadró con el cierre anterior. Siempre urgente: es plata que no cuadra.
  if (f.aperturas !== undefined) {
    const n = f.aperturas;
    avisos.push({
      clave: "aperturas",
      grupo: "Ventas y posventa",
      titulo: "Aperturas de caja con diferencia",
      cantidad: n,
      nivel: nivelDe(n, "urgente"),
      detalle:
        n === null ? SIN_LEER : n === 0 ? "Todas coinciden con su cierre."
          : `${n} ${plural(n, "abrió", "abrieron")} con un monto distinto del último cierre.`,
      href: "/caja/historial",
      ocultable: false,
    });
  }
  // ADR-0141: apartados que vencen. Urgente si vence hoy o ya venció (si nadie llama a la clienta, la prenda se libera).
  if (f.apartados !== undefined) {
    const a = f.apartados;
    const urgentes = a ? a.vencidos + a.hoy : 0;
    const n = a ? urgentes + a.manana : null;
    const quien = a?.primeraClienta ? ` · ${a.primeraClienta}` : "";
    avisos.push({
      clave: "apartados",
      grupo: "Ventas y posventa",
      titulo: "Apartados que vencen",
      cantidad: n,
      nivel: n === null ? "sinleer" : urgentes > 0 ? "urgente" : nivelDe(n, "toca"),
      detalle:
        a === null ? SIN_LEER
          : urgentes > 0
            ? [a.vencidos > 0 ? `${a.vencidos} ya ${plural(a.vencidos, "venció", "vencieron")}` : "", a.hoy > 0 ? `${a.hoy} ${plural(a.hoy, "vence", "vencen")} hoy` : "", a.manana > 0 ? `${a.manana} mañana` : ""].filter(Boolean).join(" · ") + quien
            : a.manana > 0 ? `${a.manana} ${plural(a.manana, "vence", "vencen")} mañana${quien}` : "Ninguno vence hoy ni mañana.",
      href: "/vender/apartados",
      ocultable: true,
      urgenteSi: "Cuando vence hoy o ya venció",
    });
  }
  if (f.devoluciones !== undefined) {
    const n = f.devoluciones;
    avisos.push({
      clave: "devoluciones",
      grupo: "Ventas y posventa",
      titulo: "Devoluciones por resolver",
      cantidad: n,
      nivel: nivelDe(n, "toca"),
      detalle: n === null ? SIN_LEER : n === 0 ? "Ninguna espera respuesta." : `${n} ${plural(n, "espera", "esperan")} que se aprueben o rechacen.`,
      href: "/devoluciones",
      ocultable: true,
    });
  }
  if (f.pedidos !== undefined) {
    const n = f.pedidos;
    avisos.push({
      clave: "pedidos",
      grupo: "Ventas y posventa",
      titulo: "Pedidos no atendidos",
      cantidad: n,
      nivel: nivelDe(n, "info"),
      detalle: n === null ? SIN_LEER : n === 0 ? "Ninguna clienta pidió algo que no había." : "Clientas que pidieron una talla o un color que no había.",
      href: "/pedidos-no-atendidos",
      ocultable: true,
    });
  }
  if (f.traslados !== undefined) {
    const n = f.traslados;
    avisos.push({
      clave: "traslados",
      grupo: "Inventario",
      titulo: "Traslados por atender",
      cantidad: n,
      nivel: nivelDe(n, "toca"),
      detalle: n === null ? SIN_LEER : n === 0 ? "Nada pendiente." : `${n} ${plural(n, "espera", "esperan")} tu confirmación.`,
      href: "/inventario/traslados",
      ocultable: true,
    });
  }
  if (f.conteoAbierto !== undefined) {
    const c = f.conteoAbierto;
    const n = c === null ? null : c ? 1 : 0;
    avisos.push({
      clave: "conteo",
      grupo: "Inventario",
      titulo: "Conteo abierto",
      cantidad: n,
      nivel: nivelDe(n, "info"),
      detalle: c === null ? SIN_LEER : c ? "Hay un conteo sin cerrar en esta sede." : "No hay conteos abiertos.",
      href: "/inventario/conteo",
      ocultable: true,
    });
  }
  // ADR-0179: prendas vendidas sin registrar que almacén no regularizó a tiempo. La cola ya cuenta solo las que pasaron
  // el plazo, así que si hay alguna es urgente.
  if (f.prendasVencidas !== undefined) {
    const n = f.prendasVencidas;
    avisos.push({
      clave: "regularizar",
      grupo: "Inventario",
      titulo: "Prendas por regularizar",
      cantidad: n,
      nivel: nivelDe(n, "urgente"),
      detalle:
        n === null ? SIN_LEER : n === 0 ? `Ninguna lleva más de ${DIAS_PARA_VENCER} días.`
          : `${n} ${plural(n, "lleva", "llevan")} más de ${DIAS_PARA_VENCER} días sin regularizar.`,
      href: "/recibir?vista=por-regularizar",
      ocultable: true,
      urgenteSi: `Cuando pasa de ${DIAS_PARA_VENCER} días`,
    });
  }
  // Por pagar: urgente lo vencido; por hacer lo que vence en 7 días.
  if (f.porPagar !== undefined) {
    const p = f.porPagar;
    const n = p === null ? null : p.vencidas > 0 ? p.vencidas : p.semana;
    avisos.push({
      clave: "porPagar",
      grupo: "Compras",
      titulo: p && p.vencidas > 0 ? "Facturas de proveedor vencidas" : "Facturas que vencen esta semana",
      cantidad: n,
      nivel: p === null ? "sinleer" : p.vencidas > 0 ? "urgente" : nivelDe(p.semana, "toca"),
      detalle:
        p === null ? SIN_LEER
          : p.vencidas > 0 ? `${soles(p.montoVencido)} ya vencido${p.semana > 0 ? ` · y ${p.semana} más vencen esta semana` : ""}.`
            : p.semana > 0 ? `${soles(p.montoSemana)} en los próximos 7 días.` : "Nada vence esta semana.",
      href: "/compras/por-pagar",
      ocultable: true,
      urgenteSi: "Cuando ya venció",
    });
  }
  return avisos;
}

// ── El filtro personal («Ajustar») ───────────────────────────────────────────────────────────────

/** Lo que la persona eligió: clave → se ve o no. Lo que no está elegido usa el valor recomendado para su rol. */
export type EleccionAvisos = Partial<Record<ClaveAviso, boolean>>;

/** Recomendado por rol: la líder ve todo lo que pide acción; lo informativo (pedidos, conteo) arranca apagado para ella
 *  porque no es suyo resolverlo. Quien no es líder ve todo lo suyo: ya le llega poco. */
export function visiblePorDefecto(clave: ClaveAviso, esLider: boolean): boolean {
  if (!esLider) return true;
  return clave !== "pedidos" && clave !== "conteo";
}

export function estaElegido(aviso: Pick<Aviso, "clave" | "ocultable">, eleccion: EleccionAvisos, esLider: boolean): boolean {
  if (!aviso.ocultable) return true;
  return eleccion[aviso.clave] ?? visiblePorDefecto(aviso.clave, esLider);
}

const ORDEN: Record<NivelAviso, number> = { urgente: 0, toca: 1, info: 2, sinleer: 3, aldia: 4 };

export type AvisosVisibles = {
  /** Lo que se dibuja, en orden: urgente → por hacer → informativo → sin leer. */
  activos: (Aviso & { forzado: boolean })[];
  /** Lo elegido que está en cero: una sola línea «Al día». */
  alDia: Aviso[];
  /** Avisos ocultos que tienen algo (no urgente): se avisa cuántos, para que ocultar no sea olvidar. */
  ocultosConAlgo: number;
};

export function avisosVisibles(avisos: Aviso[], eleccion: EleccionAvisos, esLider: boolean): AvisosVisibles {
  const activos: AvisosVisibles["activos"] = [];
  const alDia: Aviso[] = [];
  let ocultosConAlgo = 0;
  for (const a of avisos) {
    const elegido = estaElegido(a, eleccion, esLider);
    if (a.nivel === "urgente") activos.push({ ...a, forzado: !elegido });
    else if (!elegido) {
      if (a.nivel !== "aldia") ocultosConAlgo++;
    } else if (a.nivel === "aldia") alDia.push(a);
    else activos.push({ ...a, forzado: false });
  }
  activos.sort((x, y) => ORDEN[x.nivel] - ORDEN[y.nivel]);
  return { activos, alDia, ocultosConAlgo };
}

/** En celular «Te toca» muestra `tope` y un «Ver N más», pero lo urgente nunca queda detrás de ese corte. */
export function corteCelular(activos: Pick<Aviso, "nivel">[], tope = 3): number {
  const urgentes = activos.filter((a) => a.nivel === "urgente").length;
  return Math.min(activos.length, Math.max(tope, urgentes));
}

/** Lee la cookie de «Ajustar». Cualquier cosa rara (vieja, manipulada) se ignora: vuelve lo recomendado. */
export function leerEleccion(valor: string | undefined): EleccionAvisos {
  if (!valor) return {};
  try {
    const crudo = JSON.parse(valor) as unknown;
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return {};
    const eleccion: EleccionAvisos = {};
    for (const [k, v] of Object.entries(crudo)) if (typeof v === "boolean") eleccion[k as ClaveAviso] = v;
    return eleccion;
  } catch {
    return {};
  }
}

/** Nombre de la cookie: una por cuenta en el mismo aparato (paso 1; ver README del spike: el paso 2 la sube a la base). */
export function cookieEleccion(personaId: string | null): string {
  return `cayla_inicio_${personaId ?? "terminal"}`;
}

// ── Apartados: de la lista a lo que el aviso necesita ────────────────────────────────────────────

/** `venceEl` es una fecha `YYYY-MM-DD` de Lima; `hoy` también (`hoyLima()`). */
export function resumirApartados(apartados: { venceEl: string; clienta: string }[], hoy: string): ResumenApartados {
  const manana = new Date(`${hoy}T12:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  const diaManana = manana.toISOString().slice(0, 10);
  let vencidos = 0, deHoy = 0, deManana = 0;
  let primeraClienta: string | null = null;
  for (const a of [...apartados].sort((x, y) => x.venceEl.localeCompare(y.venceEl))) {
    const dia = a.venceEl.slice(0, 10);
    if (dia < hoy) vencidos++;
    else if (dia === hoy) deHoy++;
    else if (dia === diaManana) deManana++;
    else continue;
    primeraClienta ??= a.clienta || null;
  }
  return { vencidos, hoy: deHoy, manana: deManana, primeraClienta };
}

// ── Accesos rápidos ──────────────────────────────────────────────────────────────────────────────

export type ClaveAccesoIcono = "caja" | "apartados" | "stock" | "traslados" | "cambios" | "recibir" | "conteo" | "produccion" | "buscar";
export type AccesoRapido = { href: string; etiqueta: string; icono: ClaveAccesoIcono };

const ACCESOS: Record<ClaveAccesoIcono, AccesoRapido & { modulo: ClaveModulo | null }> = {
  caja: { href: "/caja", etiqueta: "Caja", icono: "caja", modulo: "caja" },
  apartados: { href: "/vender/apartados", etiqueta: "Apartados", icono: "apartados", modulo: "apartados" },
  stock: { href: "/inventario", etiqueta: "Stock", icono: "stock", modulo: "existencias" },
  traslados: { href: "/inventario/traslados", etiqueta: "Traslados", icono: "traslados", modulo: "traslados" },
  cambios: { href: "/cambios", etiqueta: "Cambios", icono: "cambios", modulo: "cambios" },
  recibir: { href: "/recibir", etiqueta: "Recibir", icono: "recibir", modulo: "recibir" },
  conteo: { href: "/inventario/conteo", etiqueta: "Conteo", icono: "conteo", modulo: "conteos" },
  produccion: { href: "/produccion", etiqueta: "Órdenes", icono: "produccion", modulo: "produccion" },
  buscar: { href: "/buscar", etiqueta: "Buscar", icono: "buscar", modulo: null },
};

/** Hasta 4 accesos, en el orden que más usa cada perfil, SOLO de módulos que ve. «Vender» no está: tiene su lugar propio
 *  (cabecera en computadora, botón fijo en celular). «Buscar» no pide módulo: cierra la fila si queda lugar. */
export function accesosRapidos(perfil: { esLider: boolean; ubicacionTipo: "tienda" | "almacen" | "taller"; modulos: readonly ClaveModulo[] }): AccesoRapido[] {
  const orden: ClaveAccesoIcono[] =
    perfil.ubicacionTipo === "taller" ? ["produccion", "recibir", "stock", "buscar"]
      : perfil.ubicacionTipo === "almacen" ? ["traslados", "recibir", "conteo", "stock", "buscar"]
        : perfil.esLider ? ["caja", "apartados", "traslados", "cambios", "stock", "buscar"]
          : ["apartados", "stock", "cambios", "caja", "traslados", "recibir", "buscar"];
  return orden
    .map((k) => ACCESOS[k])
    .filter((a) => a.modulo === null || perfil.modulos.includes(a.modulo))
    .slice(0, 4)
    .map(({ href, etiqueta, icono }) => ({ href, etiqueta, icono }));
}

// ── Equipo de hoy ────────────────────────────────────────────────────────────────────────────────

export type MiembroEquipo = {
  personaId: string;
  nombre: string;
  /** 'presente' | 'en_pausa' | 'salio' | 'programada' (fn_asesoras_de_turno), o null si firmó sin marcar asistencia. */
  estado: string | null;
  /** Solo para quien ve la actividad (ADR-0207). null = no se lee para quien mira. */
  ventas: number | null;
  monto: number | null;
  ultima: { hora: string; texto: string } | null;
};

type FilaTurno = { persona_id: string; nombre_corto: string; estado_ahora: string; es_de_esta_sede: boolean };
type FilaActividad = { ocurrio_at: string; accion: string; descripcion: string; persona_id: string | null; persona_nombre: string | null; detalle: unknown };

/**
 * Junta la asistencia (quién está) con la actividad de hoy (qué hizo). La actividad llega de la más nueva a la más vieja.
 * Quien firmó algo hoy sin marcar asistencia también sale (estado null): se ve que operó, no se esconde.
 * `actividad` null = quien mira no ve la actividad (o no se pudo leer): la fila queda solo con el nombre.
 */
export function armarEquipo(turno: FilaTurno[], actividad: FilaActividad[] | null): MiembroEquipo[] {
  const porId = new Map<string, MiembroEquipo>();
  for (const t of turno) {
    if (!t.es_de_esta_sede || t.estado_ahora === "programada") continue;
    porId.set(t.persona_id, { personaId: t.persona_id, nombre: t.nombre_corto, estado: t.estado_ahora, ventas: actividad ? 0 : null, monto: actividad ? 0 : null, ultima: null });
  }
  for (const a of actividad ?? []) {
    if (!a.persona_id) continue;
    let m = porId.get(a.persona_id);
    if (!m) {
      m = { personaId: a.persona_id, nombre: primerNombre(a.persona_nombre), estado: null, ventas: 0, monto: 0, ultima: null };
      porId.set(a.persona_id, m);
    }
    m.ultima ??= { hora: a.ocurrio_at, texto: a.descripcion };
    if (a.accion === "venta_registrada") {
      const total = Number((a.detalle as { total?: unknown } | null)?.total ?? 0);
      m.ventas = (m.ventas ?? 0) + 1;
      m.monto = (m.monto ?? 0) + (Number.isFinite(total) ? total : 0);
    }
  }
  const pesoEstado = (e: string | null) => (e === "presente" ? 0 : e === "en_pausa" ? 1 : e === null ? 2 : 3);
  return [...porId.values()].sort((x, y) => pesoEstado(x.estado) - pesoEstado(y.estado) || (y.monto ?? 0) - (x.monto ?? 0) || x.nombre.localeCompare(y.nombre));
}

function primerNombre(nombre: string | null): string {
  const partes = (nombre ?? "").trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[1]![0]}.` : partes[0] || "Sin nombre";
}

export function textoEstado(estado: string | null): string {
  if (estado === "presente") return "En tienda";
  if (estado === "en_pausa") return "En pausa";
  if (estado === "salio") return "Ya salió";
  return "Sin marcar asistencia";
}
