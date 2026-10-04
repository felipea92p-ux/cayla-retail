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
import type { Permiso } from "./menu";
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
  | "porPagar"
  | "recibir"
  | "reponer"
  | "fotos"
  | "completar";

export type Aviso = {
  clave: ClaveAviso;
  grupo: "Ventas y posventa" | "Inventario" | "Compras" | "Catálogo";
  titulo: string;
  detalle: string;
  /** La frase de «Sigue ahora» (Inicio de Almacén): lo mismo que el aviso, dicho como tarea («Atiende 2 traslados»).
   *  Vacía si no hay nada que hacer o no se pudo leer. */
  ahora: string;
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
  /** Facturas de mercadería que aún le faltan a esta sede, con la primera («F001-2231 · Confecciones Andina») para el detalle. */
  porRecibir?: { facturas: number; primera: string | null } | null;
  /** Lo que hay que colgar hoy (la lista del día del motor del piso, `lib/piso-plan.ts`): prendas (modelo en un color) y sus
   *  tallas. `enPausa` = el piso de la sede no está cuadrado y la lista espera (ADR-0328, decisión 5). */
  reponer?: { prendas: number; tallas: number; enPausa: boolean } | null;
  /** Productos activos sin ninguna foto. */
  fotosQueFaltan?: number | null;
  /** Productos activos sin marca o sin proveedor (ADR-0283). */
  porCompletar?: number | null;
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
      ahora: n ? `Manda a SUNAT ${n} ${plural(n, "comprobante atascado", "comprobantes atascados")}` : "",
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
      ahora: n ? `Revisa ${n} ${plural(n, "apertura de caja con diferencia", "aperturas de caja con diferencia")}` : "",
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
      ahora: n ? `Atiende ${n} ${plural(n, "apartado que vence", "apartados que vencen")}` : "",
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
      ahora: n ? `Resuelve ${n} ${plural(n, "devolución", "devoluciones")}` : "",
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
      ahora: n ? `Mira ${n} ${plural(n, "pedido no atendido", "pedidos no atendidos")}` : "",
      detalle: n === null ? SIN_LEER : n === 0 ? "Ningún cliente pidió algo que no había." : "Clientes que pidieron una talla o un color que no había.",
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
      ahora: n ? `Atiende ${n} ${plural(n, "traslado", "traslados")}` : "",
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
      ahora: c ? "Cierra el conteo que está abierto" : "",
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
      ahora: n ? `Regulariza ${n} ${plural(n, "prenda que se vendió", "prendas que se vendieron")} sin registrar` : "",
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
      ahora: !n ? "" : p && p.vencidas > 0 ? `Paga ${n} ${plural(n, "factura vencida", "facturas vencidas")}` : `Revisa ${n} ${plural(n, "factura que vence", "facturas que vencen")} esta semana`,
      detalle:
        p === null ? SIN_LEER
          : p.vencidas > 0 ? `${soles(p.montoVencido)} ya vencido${p.semana > 0 ? ` · y ${p.semana} más vencen esta semana` : ""}.`
            : p.semana > 0 ? `${soles(p.montoSemana)} en los próximos 7 días.` : "Nada vence esta semana.",
      href: "/compras/por-pagar",
      ocultable: true,
      urgenteSi: "Cuando ya venció",
    });
  }
  // Inicio de Almacén (2026-09-30). Mercadería de compras que aún le falta a esta sede.
  if (f.porRecibir !== undefined) {
    const r = f.porRecibir;
    const n = r === null ? null : r.facturas;
    avisos.push({
      clave: "recibir",
      grupo: "Inventario",
      titulo: "Mercadería por recibir",
      cantidad: n,
      nivel: nivelDe(n, "toca"),
      ahora: n ? `Recibe ${n} ${plural(n, "factura de mercadería", "facturas de mercadería")}` : "",
      detalle:
        r === null ? SIN_LEER : r.facturas === 0 ? "No falta recibir ninguna factura."
          : `${r.primera ?? "Una factura"}${r.facturas > 1 ? ` y ${r.facturas - 1} más` : ""} ${plural(r.facturas, "espera", "esperan")} su recepción.`,
      href: "/recibir",
      ocultable: true,
    });
  }
  // La lista del día del motor del piso (ADR-0328 act. 7), contada por prendas: lo que hay que BAJAR del almacén y colgar.
  // «Cuelga», nunca «Sube»: en Existencias «Subir» es del piso al almacén, lo contrario. La clave sigue siendo «reponer» porque
  // es la que guarda la elección de «Ajustar» en la cookie de cada cuenta.
  if (f.reponer !== undefined) {
    const r = f.reponer;
    const n = r === null ? null : r.prendas;
    avisos.push({
      clave: "reponer",
      grupo: "Inventario",
      titulo: r?.enPausa ? "Cuadrar el piso" : "Por colgar",
      cantidad: n,
      nivel: nivelDe(n, "toca"),
      ahora: !n || !r ? "" : r.enPausa ? "Cuadra el piso antes de colgar" : `Cuelga ${n} ${plural(n, "prenda", "prendas")} en el piso de venta`,
      detalle:
        r === null ? SIN_LEER
          : r.prendas === 0 ? "El piso de venta está al día."
            : r.enPausa
              ? `Hasta cuadrar el piso no se sabe qué falta: ${r.tallas} ${plural(r.tallas, "talla espera", "tallas esperan")}.`
              : `${r.tallas} ${plural(r.tallas, "talla", "tallas")} sin lo que pide el piso; primero lo que se vendió ayer.`,
      href: "/inventario",
      ocultable: true,
    });
  }
  if (f.fotosQueFaltan !== undefined) {
    const n = f.fotosQueFaltan;
    avisos.push({
      clave: "fotos",
      grupo: "Catálogo",
      titulo: "Fotos que faltan",
      cantidad: n,
      nivel: nivelDe(n, "toca"),
      ahora: n ? `Toma la foto de ${n} ${plural(n, "modelo", "modelos")}` : "",
      detalle: n === null ? SIN_LEER : n === 0 ? "Todos los modelos tienen foto." : `${n} ${plural(n, "modelo sin foto", "modelos sin foto")}: sin ella no se reconoce la prenda entre sedes.`,
      href: "/productos",
      ocultable: true,
    });
  }
  if (f.porCompletar !== undefined) {
    const n = f.porCompletar;
    avisos.push({
      clave: "completar",
      grupo: "Catálogo",
      titulo: "Productos por completar",
      cantidad: n,
      nivel: nivelDe(n, "info"),
      ahora: n ? `Completa ${n} ${plural(n, "producto", "productos")} sin marca o proveedor` : "",
      detalle: n === null ? SIN_LEER : n === 0 ? "Todos tienen marca y proveedor." : `${n} ${plural(n, "producto sin marca o proveedor", "productos sin marca o proveedor")}.`,
      href: "/productos?marca=sin",
      ocultable: true,
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

export type ClaveAccesoIcono = "caja" | "apartados" | "stock" | "traslados" | "cambios" | "recibir" | "conteo" | "produccion" | "buscar" | "nuevoProducto";
export type AccesoRapido = { href: string; etiqueta: string; icono: ClaveAccesoIcono };

// `modulo`: la pantalla a la que lleva (si no lo ve, caería en «Sin acceso»). `permiso`: lo que además hace falta para que la
// acción funcione al final. «Nuevo producto» pide los dos: ver Productos no basta, el rol tiene que poder ESCRIBIR en el
// catálogo (un rol `limitado_como_hoy` lo ve pero la base rechaza el guardado, y un acceso que termina en un error es peor
// que no tenerlo).
const ACCESOS: Record<ClaveAccesoIcono, AccesoRapido & { modulo: ClaveModulo | null; permiso?: Permiso }> = {
  caja: { href: "/caja", etiqueta: "Caja", icono: "caja", modulo: "caja" },
  apartados: { href: "/vender/apartados", etiqueta: "Apartados", icono: "apartados", modulo: "apartados" },
  stock: { href: "/inventario", etiqueta: "Stock", icono: "stock", modulo: "existencias" },
  traslados: { href: "/inventario/traslados", etiqueta: "Traslados", icono: "traslados", modulo: "traslados" },
  cambios: { href: "/cambios", etiqueta: "Cambios", icono: "cambios", modulo: "cambios" },
  recibir: { href: "/recibir", etiqueta: "Recibir", icono: "recibir", modulo: "recibir" },
  conteo: { href: "/inventario/conteo", etiqueta: "Conteo", icono: "conteo", modulo: "conteos" },
  produccion: { href: "/produccion", etiqueta: "Órdenes", icono: "produccion", modulo: "produccion" },
  buscar: { href: "/buscar", etiqueta: "Buscar", icono: "buscar", modulo: null },
  nuevoProducto: { href: "/productos/nuevo", etiqueta: "Nuevo producto", icono: "nuevoProducto", modulo: "productos", permiso: "editarCatalogo" },
};

/** Qué hace la cuenta, y de ahí su lista (Felipe, 2026-09-29: «cada rol con una lista genérica de lo que va a usar»). Se lee
 *  de los MÓDULOS del rol y no de su nombre: un rol nuevo que vende recibe la lista del mostrador sin que nadie la escriba,
 *  y una terminal es lo que su rol le deja hacer (ADR-0161, ADR-0162). El orden importa: solo caben 4. */
/** La líder: «Nuevo producto» en lugar de Apartados (Felipe, 2026-09-29). Apartados sigue a un toque: el aviso «Apartados que
 *  vencen» de «Te toca» lleva ahí, y el menú de Ventas también. */
const LISTA_LIDER: ClaveAccesoIcono[] = ["caja", "nuevoProducto", "traslados", "cambios", "stock", "apartados", "buscar"];
/** Quien vende: lo que el cliente le pide en el mostrador. «Nuevo producto» ocupa el lugar de «Apartados» para quien puede cargar
 *  catálogo (Felipe, 2026-10-03; Apartados sigue a un toque: el aviso «Apartados que vencen» de «Te toca» y el menú de Ventas); quien
 *  no puede, conserva Apartados. Ver `LUGAR_DE`. */
const LISTA_MOSTRADOR: ClaveAccesoIcono[] = ["stock", "cambios", "nuevoProducto", "apartados", "caja", "traslados", "recibir", "buscar"];
/** «X ocupa el lugar de Y»: si X llegó a la lista, Y se retira (no se suman los dos). Solo en la lista del mostrador. */
const LUGAR_DE: Partial<Record<ClaveAccesoIcono, ClaveAccesoIcono>> = { nuevoProducto: "apartados" };
/** Quien no vende y está en una tienda (la terminal de almacén, un rol administrativo): la mercadería que entra y se mueve.
 *  «Conteo» va después porque se hace por temporadas, no cada día. */
const LISTA_TRASTIENDA: ClaveAccesoIcono[] = ["recibir", "traslados", "stock", "nuevoProducto", "conteo", "buscar"];
const LISTA_ALMACEN: ClaveAccesoIcono[] = ["traslados", "recibir", "conteo", "stock", "buscar"];
const LISTA_TALLER: ClaveAccesoIcono[] = ["produccion", "recibir", "stock", "buscar"];

/** Hasta 4 accesos, en el orden que más usa cada perfil, SOLO de módulos que ve (y, si la acción escribe, de permisos que
 *  tiene). «Vender» no está: tiene su lugar propio (cabecera en computadora, botón fijo en celular). «Buscar» no pide módulo:
 *  cierra la fila si queda lugar. La terminal del mostrador (ve el Punto de venta) nunca llega aquí: aterriza en `/vender`,
 *  donde «Más» ya ofrece Caja, Cambios, Devoluciones e Historial según su rol (`lib/vender-accesos.ts`).
 *
 *  Con solo 4 lugares, meter uno saca a otro: por eso, y no por gusto, esta lista debería poder elegirse por rol (pendiente,
 *  `docs/backlog/2026-09-29-accesos-rol-terminal-3e62ba.md`). */
export function accesosRapidos(perfil: {
  esLider: boolean;
  ubicacionTipo: "tienda" | "almacen" | "taller";
  modulos: readonly ClaveModulo[];
  /** Lo que la cuenta puede hacer (`persona.permisos`). Sin él, ningún acceso que exija un permiso se muestra. */
  permisos?: readonly Permiso[];
}): AccesoRapido[] {
  const orden =
    perfil.ubicacionTipo === "taller" ? LISTA_TALLER
      : perfil.ubicacionTipo === "almacen" ? LISTA_ALMACEN
        : perfil.esLider ? LISTA_LIDER
          : perfil.modulos.includes("vender") ? LISTA_MOSTRADOR
            : LISTA_TRASTIENDA;
  const disponibles = orden.filter((k) => {
    const a = ACCESOS[k];
    return (a.modulo === null || perfil.modulos.includes(a.modulo)) && (!a.permiso || !!perfil.permisos?.includes(a.permiso));
  });
  const reemplazados = orden === LISTA_MOSTRADOR ? new Set(disponibles.map((k) => LUGAR_DE[k]).filter(Boolean)) : new Set();
  return disponibles
    .filter((k) => !reemplazados.has(k))
    .map((k) => ACCESOS[k])
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
type FilaActividad = {
  ocurrio_at: string;
  accion: string;
  descripcion: string;
  persona_id: string | null;
  persona_nombre: string | null;
  detalle: unknown;
  /** De qué tabla es el registro citado (`'ventas'` en las acciones de una venta) y su id: con eso se empareja una venta con su anulación. */
  tabla?: string | null;
  registro_id?: string | null;
};

/**
 * Junta la asistencia (quién está) con la actividad de hoy (qué hizo). La actividad llega de la más nueva a la más vieja.
 * Quien firmó algo hoy sin marcar asistencia también sale (estado null): se ve que operó, no se esconde.
 * `actividad` null = quien mira no ve la actividad (o no se pudo leer): la fila queda solo con el nombre.
 *
 * La bitácora de Actividad es inmutable: una venta anulada deja dos líneas («vendió…» y «anuló…»). Aquí no se cuenta como
 * venta ni como última acción de quien la registró; y si era de prueba (`detalle.es_prueba`, que solo trae la línea de la
 * anulación), ninguna de sus líneas aparece — es un dato archivado, igual que en Historial y Caja.
 */
export function armarEquipo(turno: FilaTurno[], actividad: FilaActividad[] | null): MiembroEquipo[] {
  const porId = new Map<string, MiembroEquipo>();
  for (const t of turno) {
    if (!t.es_de_esta_sede || t.estado_ahora === "programada") continue;
    porId.set(t.persona_id, { personaId: t.persona_id, nombre: t.nombre_corto, estado: t.estado_ahora, ventas: actividad ? 0 : null, monto: actividad ? 0 : null, ultima: null });
  }
  const anuladas = new Set<string>();
  const deLaPrueba = new Set<string>();
  for (const a of actividad ?? []) {
    if (a.tabla !== "ventas" || !a.registro_id) continue;
    if (a.accion === "venta_anulada") anuladas.add(a.registro_id);
    if ((a.detalle as { es_prueba?: unknown } | null)?.es_prueba === true) deLaPrueba.add(a.registro_id);
  }
  for (const a of actividad ?? []) {
    if (!a.persona_id) continue;
    if (a.tabla === "ventas" && a.registro_id) {
      if (deLaPrueba.has(a.registro_id)) continue;
      if (a.accion === "venta_registrada" && anuladas.has(a.registro_id)) continue;
    }
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
