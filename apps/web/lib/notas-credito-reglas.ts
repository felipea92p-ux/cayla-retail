import { diasEntreFechas } from "./fechas-lima";
import { soles } from "./compras-reglas";
import { MARGEN_NOTA, reparteNota, type ReparteNota } from "./recepciones-reglas";

/* ====================================================================
   Notas de crédito de compra — las reglas, sin base ni navegador
   (2026-09-19, spike `docs/maquetas/notas-credito-spike-2026-09/`)

   Qué resuelve el módulo: cuando en una recepción se cierra un faltante, el proveedor le debe a CAYLA
   una nota de crédito. Hasta hoy ese reclamo no vivía en ninguna pantalla —se registraba de pasada
   dentro de Recepción— y nadie sabía a quién le faltaba llamar. Acá está la parte que se puede probar
   sin base: la antigüedad de un reclamo, qué le pasa al dinero, y qué queda vivo de cada nota.

   Nada de lo de acá hace I/O: se importa desde el servidor (`lib/notas-credito.ts`) y desde los
   componentes cliente. Las fechas llegan como texto `aaaa-mm-dd` y «hoy» SIEMPRE se recibe como
   parámetro (`hoyLima()` del llamador), nunca se lee el reloj acá.

   Lo que NO se reescribe acá, a propósito: el reparto de una nota entre «baja la deuda» y «queda a
   favor» ya vive en `recepciones-reglas.ts` (`reparteNota`) y su tope (`MARGEN_NOTA`) también. Este
   archivo los USA; una tercera copia de esa regla es justo lo que el spike pidió no hacer.
   ==================================================================== */

// ---------------------------------------------------------------------------
// Lo que devuelve la base: una fila del tablero
// ---------------------------------------------------------------------------

/** `'pendiente'` = un faltante cerrado que todavía espera su nota; `'nota'` = una nota ya registrada. */
export type ClaseFila = "nota" | "pendiente";

/**
 * Una fila tal como la entrega `notas_credito_tablero()`. En `'pendiente'`, `id` es el id del CIERRE
 * (no hay nota todavía) y el monto que importa es `montoEsperado`.
 */
export type FilaTablero = {
  clase: ClaseFila;
  id: string;
  compraId: string;
  documento: string;
  proveedorId: string;
  proveedorNombre: string;
  serieNumero: string | null;
  /** Nota: la fecha de la nota. Pendiente: cuándo se cerró el faltante. */
  fecha: string;
  /** Nota: lo que acredita. Pendiente: lo que debería acreditar (= `montoEsperado`). */
  monto: number;
  /** Cuánto de la nota bajó la deuda de SU comprobante. */
  aplicado: number;
  /** Lo que la nota dejó a favor del proveedor al nacer (`monto − aplicado`). */
  aFavor: number;
  igv: number;
  motivo: string | null;
  nota: string | null;
  cierreId: string | null;
  compraTotal: number;
  compraSaldo: number;
  compraFechaEmision: string;
  compraEstado: string;
  unidadesCerradas: number;
  montoEsperado: number;
  cerradoEn: string | null;
  creadoEn: string;
  /**
   * Lo dice la base, no la pantalla: el comprobante está al 100 % (recibido + cerrado = facturado) y la
   * nota por faltante YA se puede registrar. En una nota registrada siempre es `true`.
   */
  resuelto: boolean;
};

/** Un movimiento del libro `proveedor_creditos` (lo devuelve `fn_proveedor_creditos`). */
export type MovimientoFavor = {
  id: string;
  /** `fn_proveedor_creditos` se pide POR proveedor y no lo devuelve: lo pone quien la llama. */
  proveedorId: string;
  tipo: "nota_credito" | "aplicacion" | "reembolso";
  monto: number;
  fecha: string;
  documento: string | null;
  notaSerieNumero: string | null;
  metodo: string | null;
  referencia: string | null;
  nota: string | null;
};

// ---------------------------------------------------------------------------
// Urgencia del reclamo
// ---------------------------------------------------------------------------

/**
 * A partir de cuántos días sin nota un reclamo es URGENTE (D4 del spike, decidido: una constante y no un
 * plazo por proveedor). Está acá y no en la pantalla para poder cambiarlo en un solo lugar el día que la
 * experiencia con los proveedores diga otro número.
 */
export const DIAS_URGENCIA_RECLAMO = 14;
/** Desde cuándo un reclamo deja de ser «reciente» y empieza a llamar la atención. */
export const DIAS_AVISO_RECLAMO = 7;

export type TramoUrgencia = "urgente" | "medio" | "reciente";

export function tramoUrgencia(dias: number): TramoUrgencia {
  if (dias > DIAS_URGENCIA_RECLAMO) return "urgente";
  if (dias > DIAS_AVISO_RECLAMO) return "medio";
  return "reciente";
}

/** Días desde que se cerró el faltante (o se registró la nota) hasta hoy. Nunca negativo. */
export function edadEnDias(fecha: string, hoy: string): number {
  return Math.max(0, diasEntreFechas(fecha, hoy));
}

/** «Hoy» · «Ayer» · «Hace 12 días» — como lo dice el spike. */
export function hace(dias: number): string {
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return `Hace ${dias} días`;
}

// ---------------------------------------------------------------------------
// «Aplicada» se DEDUCE: FIFO por proveedor
// ---------------------------------------------------------------------------

/**
 * Cuánto queda vivo (sin usar) del saldo a favor que dejó cada nota.
 *
 * El problema: el libro `proveedor_creditos` no guarda de CUÁL nota salió cada uso (D3 del spike,
 * decidido: deducirlo en vez de tocar las funciones que mueven dinero). Lo que sí se sabe es exacto:
 * cuánto dejó a favor cada nota (`aFavor`) y cuánto saldo le queda hoy al proveedor
 * (`fn_saldo_favor_proveedor`). La diferencia es lo consumido, y se imputa a las notas MÁS ANTIGUAS
 * primero (orden de llegada, FIFO).
 *
 * Consecuencia honesta: con varias notas y usos mezclados, la nota que la pantalla marca «Aplicada»
 * puede no ser la que de verdad se usó. El total por proveedor siempre es exacto; la etiqueta es una
 * aproximación, y por eso el detalle dice «se asume del saldo más antiguo».
 */
export function repartoFifo(
  notas: { id: string; proveedorId: string; fecha: string; aFavor: number }[],
  saldoPorProveedor: Record<string, number>,
): Record<string, number> {
  const vivo: Record<string, number> = {};
  const porProveedor = new Map<string, typeof notas>();
  for (const n of notas) {
    const lista = porProveedor.get(n.proveedorId) ?? [];
    lista.push(n);
    porProveedor.set(n.proveedorId, lista);
  }
  for (const [proveedorId, lista] of porProveedor) {
    const ordenadas = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
    const aportado = centavos(ordenadas.reduce((a, n) => a + Math.max(0, n.aFavor), 0));
    const saldo = Math.max(0, saldoPorProveedor[proveedorId] ?? 0);
    // Lo consumido nunca puede ser negativo: si el saldo dice más de lo que las notas aportaron, es que
    // hay crédito de otro origen y ninguna nota está usada.
    let consumido = Math.max(0, centavos(aportado - saldo));
    for (const n of ordenadas) {
      const suyo = Math.max(0, n.aFavor);
      const usa = Math.min(suyo, consumido);
      vivo[n.id] = centavos(suyo - usa);
      consumido = centavos(consumido - usa);
    }
  }
  return vivo;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// El estado que se ve
// ---------------------------------------------------------------------------

export type EstadoNota = "por_reclamar" | "emitida" | "aplicada";

/** Una fila del tablero ya interpretada: lo que la pantalla necesita para dibujarla y ordenarla. */
export type FilaVista = FilaTablero & {
  estado: EstadoNota;
  edadDias: number;
  tramo: TramoUrgencia;
  /** Cuánto del saldo a favor de esta nota sigue sin usar (FIFO). 0 en las pendientes. */
  vivo: number;
  /** Lo que el proveedor devolvió en efectivo/transferencia contra ESTA nota, si se puede saber. */
  devuelto: { monto: number; fecha: string; metodo: string | null; referencia: string | null } | null;
  /** El comprobante todavía tiene unidades sin recibir ni cerrar: la nota por faltante aún no se puede registrar. */
  bloqueada: boolean;
  /** El texto por el que busca el buscador del tablero, además de proveedor y documento. */
  textoBuscable: string;
};

/**
 * Interpreta las filas crudas: estado, antigüedad, cuánto queda vivo y qué se devolvió.
 *
 * `saldoPorProveedor` viene de `fn_saldo_favor_proveedor` (es la verdad) y `movimientos` de
 * `fn_proveedor_creditos`: de ahí sale el «Devuelta», cuando el reembolso quedó atado a la nota.
 */
export function armarFilas(
  filas: FilaTablero[],
  p: { hoy: string; saldoPorProveedor: Record<string, number>; movimientos: MovimientoFavor[] },
): FilaVista[] {
  const notas = filas.filter((f) => f.clase === "nota");
  const vivoPorNota = repartoFifo(
    notas.map((n) => ({ id: n.id, proveedorId: n.proveedorId, fecha: n.fecha, aFavor: n.aFavor })),
    p.saldoPorProveedor,
  );
  // Un reembolso que nació junto con su nota (destino «reembolso») queda atado a ella en el libro: eso es
  // lo que permite decir «Devuelta» sin inventar. Los que no llevan serie no se le adjudican a ninguna.
  const devoluciones = new Map<string, MovimientoFavor>();
  for (const m of p.movimientos) {
    if (m.tipo === "reembolso" && m.notaSerieNumero) devoluciones.set(m.notaSerieNumero, m);
  }

  return filas.map((f) => {
    const vivo = f.clase === "nota" ? (vivoPorNota[f.id] ?? 0) : 0;
    const dev = f.clase === "nota" && f.serieNumero ? (devoluciones.get(f.serieNumero) ?? null) : null;
    // El reloj de los 14 días arranca cuando se CERRÓ el faltante (`cerrado_en`), no cuando se emitió
    // el comprobante: es el día en que el proveedor quedó debiendo la nota.
    const edadDias = edadEnDias(f.clase === "pendiente" ? (f.cerradoEn?.slice(0, 10) ?? f.fecha) : f.fecha, p.hoy);
    // Quién decide si la nota por faltante ya se puede registrar es la BASE (`resuelto`), no la pantalla:
    // es la misma condición que `fn_insertar_nota_credito_compra` vuelve a exigir al escribir.
    const bloqueada = f.clase === "pendiente" && !f.resuelto;
    return {
      ...f,
      estado: f.clase === "pendiente" ? "por_reclamar" : vivo > 0.004 ? "emitida" : "aplicada",
      edadDias,
      tramo: tramoUrgencia(edadDias),
      vivo,
      devuelto: dev ? { monto: dev.monto, fecha: dev.fecha, metodo: dev.metodo, referencia: dev.referencia } : null,
      bloqueada,
      textoBuscable: [f.serieNumero, f.nota, f.motivo].filter(Boolean).join(" "),
    };
  });
}

/** El chip de estado, ya resuelto: una nota cuyo sobrante volvió a CAYLA dice «Devuelta», no «Aplicada». */
export function chipEstado(f: FilaVista): { tono: "ambar" | "verde" | "neutro"; texto: string } {
  if (f.estado === "por_reclamar") return f.bloqueada ? { tono: "neutro", texto: "Falta cerrar" } : { tono: "ambar", texto: "Por reclamar" };
  if (f.estado === "emitida") return { tono: "verde", texto: "Emitida" };
  return f.devuelto ? { tono: "verde", texto: "Devuelta" } : { tono: "neutro", texto: "Aplicada" };
}

/** La línea chica bajo el monto: adónde fue el dinero de esa fila. */
export function destinoTexto(f: FilaVista, dinero: (n: number) => string = soles): string {
  if (f.clase === "pendiente") return "esperado";
  if (f.estado === "emitida") return `A favor ${dinero(f.vivo)}`;
  if (f.devuelto) return `Devuelto el ${f.devuelto.fecha.slice(8, 10)}/${f.devuelto.fecha.slice(5, 7)}`;
  return "bajó la deuda";
}

// ---------------------------------------------------------------------------
// Pestañas, bandas, búsqueda y agrupación
// ---------------------------------------------------------------------------

export type Pestana = "por_reclamar" | "emitida" | "aplicada" | "todas";
export type Banda = "urgente" | "medio" | "reciente" | "emitidas" | "aplicadas";

export const ETIQUETA_BANDA: Record<Banda, string> = {
  urgente: `Más de ${DIAS_URGENCIA_RECLAMO} días sin nota`,
  medio: `De ${DIAS_AVISO_RECLAMO + 1} a ${DIAS_URGENCIA_RECLAMO} días`,
  reciente: "Reclamos recientes",
  emitidas: "Emitidas · con saldo a favor sin usar",
  aplicadas: "Aplicadas",
};

const ORDEN_BANDA: Banda[] = ["urgente", "medio", "reciente", "emitidas", "aplicadas"];

export function bandaDe(f: FilaVista): Banda {
  if (f.estado === "por_reclamar") return f.tramo;
  return f.estado === "emitida" ? "emitidas" : "aplicadas";
}

/** Sin tildes ni mayúsculas: como se busca en todo el repo. */
function base(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function filtrarTablero(filas: FilaVista[], p: { pestana: Pestana; banda: Banda | null; busqueda: string }): FilaVista[] {
  const q = base(p.busqueda.trim());
  return filas.filter((f) => {
    if (p.pestana !== "todas" && f.estado !== p.pestana) return false;
    if (p.banda && bandaDe(f) !== p.banda) return false;
    if (!q) return true;
    return base(f.proveedorNombre).includes(q) || base(f.documento).includes(q) || base(f.textoBuscable).includes(q);
  });
}

const ORDEN_ESTADO: Record<EstadoNota, number> = { por_reclamar: 0, emitida: 1, aplicada: 2 };

/** Lo que pide acción primero; dentro de «por reclamar», lo más viejo arriba. */
export function ordenarFilas(a: FilaVista, b: FilaVista): number {
  return (
    ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
    (a.estado === "por_reclamar" ? b.edadDias - a.edadDias : b.fecha.localeCompare(a.fecha)) ||
    a.id.localeCompare(b.id)
  );
}

export type GrupoTablero = { clave: string; titulo: string; tono: "rojo" | "ambar" | "verde" | "neutro"; total: string; filas: FilaVista[] };

const TONO_BANDA: Record<Banda, GrupoTablero["tono"]> = { urgente: "rojo", medio: "ambar", reciente: "neutro", emitidas: "verde", aplicadas: "neutro" };

const cuenta = (n: number, sing: string, plu: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? sing : plu}`;

/** Agrupa por urgencia (bandas) o por proveedor. El proveedor con más por reclamar va primero. */
export function agruparTablero(filas: FilaVista[], modo: "urgencia" | "proveedor", dinero: (n: number) => string = soles): GrupoTablero[] {
  const suma = (fs: FilaVista[]) => centavos(fs.reduce((a, f) => a + f.monto, 0));
  if (modo === "proveedor") {
    const mapa = new Map<string, FilaVista[]>();
    for (const f of filas) mapa.set(f.proveedorId, [...(mapa.get(f.proveedorId) ?? []), f]);
    return [...mapa.entries()]
      .map(([proveedorId, fs]) => {
        const ordenadas = [...fs].sort(ordenarFilas);
        const pend = ordenadas.filter((f) => f.estado === "por_reclamar");
        return {
          clave: `prov:${proveedorId}`,
          titulo: fs[0].proveedorNombre,
          tono: "neutro" as const,
          total: pend.length ? `${dinero(suma(pend))} por reclamar · ${cuenta(ordenadas.length, "nota", "notas")}` : cuenta(ordenadas.length, "nota", "notas"),
          filas: ordenadas,
          orden: -suma(pend),
        };
      })
      .sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo))
      .map((g): GrupoTablero => ({ clave: g.clave, titulo: g.titulo, tono: g.tono, total: g.total, filas: g.filas }));
  }
  const mapa = new Map<Banda, FilaVista[]>();
  for (const f of filas) {
    const b = bandaDe(f);
    mapa.set(b, [...(mapa.get(b) ?? []), f]);
  }
  return ORDEN_BANDA.filter((b) => mapa.has(b)).map((b) => {
    const fs = [...(mapa.get(b) ?? [])].sort(ordenarFilas);
    return { clave: `banda:${b}`, titulo: ETIQUETA_BANDA[b], tono: TONO_BANDA[b], total: `${cuenta(fs.length, "nota", "notas")} · ${dinero(suma(fs))}`, filas: fs };
  });
}

// ---------------------------------------------------------------------------
// Las cifras de arriba
// ---------------------------------------------------------------------------

export type CifrasTablero = {
  porReclamar: { monto: number; cantidad: number; masVieja: number; tramos: Record<TramoUrgencia, number> };
  emitidasMes: { monto: number; cantidad: number; bajaronDeuda: number; devueltos: number; aFavor: number };
  saldoFavorTotal: number;
  aplicadoMes: { total: number; bajoDeuda: number; devuelto: number };
};

/** `mes` es `aaaa-mm` (el mes de hoy en Lima). */
export function cifrasTablero(filas: FilaVista[], p: { mes: string; saldoPorProveedor: Record<string, number>; movimientos: MovimientoFavor[] }): CifrasTablero {
  const pend = filas.filter((f) => f.estado === "por_reclamar");
  const tramos: Record<TramoUrgencia, number> = { urgente: 0, medio: 0, reciente: 0 };
  for (const f of pend) tramos[f.tramo] += 1;

  const delMes = filas.filter((f) => f.clase === "nota" && f.fecha.slice(0, 7) === p.mes);
  const devueltosMes = centavos(delMes.reduce((a, f) => a + (f.devuelto && f.devuelto.fecha.slice(0, 7) === p.mes ? f.devuelto.monto : 0), 0));
  const emitido = centavos(delMes.reduce((a, f) => a + f.monto, 0));
  const bajaron = centavos(delMes.reduce((a, f) => a + f.aplicado, 0));

  // «Aplicado este mes» = lo que las notas del mes bajaron de deuda + lo que se usó o devolvió del libro
  // este mes. Es la plata que la nota de crédito le ahorró de verdad a CAYLA.
  const usos = centavos(
    p.movimientos.filter((m) => m.tipo !== "nota_credito" && m.fecha.slice(0, 7) === p.mes).reduce((a, m) => a + m.monto, 0),
  );
  const devueltoLibro = centavos(p.movimientos.filter((m) => m.tipo === "reembolso" && m.fecha.slice(0, 7) === p.mes).reduce((a, m) => a + m.monto, 0));

  return {
    porReclamar: {
      monto: centavos(pend.reduce((a, f) => a + f.monto, 0)),
      cantidad: pend.length,
      masVieja: pend.reduce((m, f) => Math.max(m, f.edadDias), 0),
      tramos,
    },
    emitidasMes: { monto: emitido, cantidad: delMes.length, bajaronDeuda: bajaron, devueltos: devueltosMes, aFavor: centavos(emitido - bajaron - devueltosMes) },
    saldoFavorTotal: centavos(Object.values(p.saldoPorProveedor).reduce((a, s) => a + Math.max(0, s), 0)),
    aplicadoMes: { total: centavos(bajaron + usos), bajoDeuda: bajaron, devuelto: devueltoLibro },
  };
}

// ---------------------------------------------------------------------------
// Qué pasa con el dinero de una nota
// ---------------------------------------------------------------------------

/** Lo único que la pantalla puede elegir: el sobrante vuelve ahora, o queda a favor. */
export type DestinoDinero = "a_favor" | "reembolso";

export type RepartoDestino = { baja: number; devuelve: number; aFavor: number; deudaDespues: number };

/**
 * Las TRES partes que el modal muestra siempre: cuánto baja la deuda, cuánto se devuelve ahora y cuánto
 * queda a favor. Lo primero que hace una nota es bajar lo que aún se le debe al proveedor por esa
 * factura (eso lo decide `reparteNota`, la misma regla de Recepción y de la base); el destino solo
 * decide qué pasa con el SOBRANTE.
 */
export function repartoDestino(monto: number, saldo: number, destino: DestinoDinero): RepartoDestino {
  const r: ReparteNota = reparteNota(monto, saldo);
  const devuelve = destino === "reembolso" ? r.aFavor : 0;
  return { baja: r.baja, devuelve, aFavor: centavos(r.aFavor - devuelve), deudaDespues: r.deudaDespues };
}

/** La frase de arriba del bloque «Qué pasa con el dinero», en palabras de quien no es contador. */
export function textoDestino(
  r: RepartoDestino,
  p: { documento: string; proveedor: string; saldo: number; destino: DestinoDinero; pasado?: boolean; dinero?: (n: number) => string },
): string {
  const d = p.dinero ?? soles;
  const sobra = centavos(r.devuelve + r.aFavor);
  if (sobra <= 0.004) return `La nota baja lo que se debe de ${p.documento} de ${d(p.saldo)} a ${d(r.deudaDespues)}. No sobra dinero.`;
  const primero = r.baja > 0 ? `La nota primero baja lo que se debe de ${p.documento} de ${d(p.saldo)} a ${d(0)}. ` : `${p.documento} ya estaba pagado, así que todo el monto es dinero de más. `;
  if (p.destino === "reembolso") {
    return primero + (p.pasado ? `Los ${d(sobra)} que sobraban ya volvieron a CAYLA.` : `Los ${d(sobra)} que sobran te los devuelve ${p.proveedor} ahora: se registra el reembolso junto con la nota.`);
  }
  return primero + (p.pasado ? `Los ${d(sobra)} que sobraron quedaron a tu favor con ${p.proveedor}, para otra compra.` : `Los ${d(sobra)} que sobran quedan a tu favor con ${p.proveedor}, para otra compra.`);
}

// ---------------------------------------------------------------------------
// Registrar una nota: validación (espejo de lo que exige la base)
// ---------------------------------------------------------------------------

export type MotivoNota = "faltante" | "devolucion" | "descuento" | "otro";

export type FacturaParaNota = {
  id: string;
  documento: string;
  proveedorId: string;
  proveedorNombre: string;
  fechaEmision: string;
  fechaVencimiento: string | null;
  total: number;
  pagado: number;
  saldo: number;
  estado: string;
  /** Ya tiene al menos una nota registrada. */
  tieneNota: boolean;
  /** Suma de las notas ya emitidas contra ella. */
  notasMonto: number;
};

export type BorradorNota = {
  compraId: string | null;
  motivo: MotivoNota;
  serieNumero: string;
  fecha: string;
  /** Lo tipeado; `null` = sigue la sugerencia del faltante. */
  montoTxt: string | null;
  destino: DestinoDinero;
  reembolsoMetodo: string;
  reembolsoFecha: string;
  reembolsoReferencia: string;
};

export type ErroresNota = Partial<Record<"factura" | "motivo" | "serie" | "fecha" | "monto" | "reembolsoFecha", string>>;

export type ValidacionNota = {
  errores: ErroresNota;
  /** El monto ya parseado; `NaN` si no es un número usable. */
  monto: number;
  /** Lo máximo que la base aceptará. */
  tope: number;
  /** Lo que la nota por faltante debería acreditar (0 si no aplica). */
  sugerido: number;
  /** El texto que debe mostrarse en el campo cuando nadie lo tocó. */
  montoMostrado: string;
  /** Explicación larga del monto que no cuadra, con el número exacto para el botón «Usar S/ …». */
  explicacionMonto: string | null;
  topeSugerido: number | null;
  reparto: RepartoDestino | null;
  /** El destino EFECTIVO: si no sobra nada, no hay destino que elegir. */
  destino: DestinoDinero | null;
  /** Hay sobrante y por lo tanto las dos fichas de destino se pueden elegir. */
  haySobrante: boolean;
};

/** Mismo criterio que `parseMonto` de Por pagar, pero exigiendo > 0 y 2 decimales exactos (lo que pide la base). */
export function parseMontoNota(texto: string): number {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return Number.NaN;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n <= 0) return Number.NaN;
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return Number.NaN;
  return centavos(n);
}

/**
 * Todo lo que el formulario necesita saber, en una función. Es el espejo en TypeScript de las reglas de
 * `fn_insertar_nota_credito_compra`: una nota por faltante por comprobante, tope = lo cerrado a su costo
 * con IGV + `MARGEN_NOTA`, la suma de notas nunca pasa del total, la fecha no es futura ni anterior a la
 * emisión, y la serie no se repite en el mismo comprobante. Acá se anticipa para decir POR QUÉ todavía
 * no, en vez de dejar que el error llegue después de llenar el formulario.
 */
export function validarNota(p: {
  borrador: BorradorNota;
  factura: FacturaParaNota | null;
  /** La fila pendiente de esa factura, si existe (de ahí sale el monto sugerido del faltante). */
  pendiente: { montoEsperado: number; unidadesCerradas: number; bloqueada: boolean; cierreId: string | null } | null;
  /** Ya hay una nota por faltante registrada contra esa factura. */
  yaTieneNotaFaltante: boolean;
  /** Las series ya usadas en ese comprobante. */
  seriesUsadas: string[];
  hoy: string;
  dinero?: (n: number) => string;
}): ValidacionNota {
  const d = p.dinero ?? soles;
  const b = p.borrador;
  const vacio: ValidacionNota = {
    errores: { factura: "Elige la factura de origen." },
    monto: Number.NaN,
    tope: 0,
    sugerido: 0,
    montoMostrado: "",
    explicacionMonto: null,
    topeSugerido: null,
    reparto: null,
    destino: null,
    haySobrante: false,
  };
  if (!p.factura) return vacio;

  const c = p.factura;
  const esFaltante = b.motivo === "faltante";
  const disponible = !!p.pendiente && !p.pendiente.bloqueada && !p.yaTieneNotaFaltante;
  const sugerido = disponible ? (p.pendiente?.montoEsperado ?? 0) : 0;
  const montoMostrado = b.montoTxt ?? (esFaltante && sugerido > 0 ? sugerido.toFixed(2) : "");
  const monto = parseMontoNota(montoMostrado);
  const tope = esFaltante ? centavos(sugerido + MARGEN_NOTA) : centavos(c.total - c.notasMonto);

  const errores: ErroresNota = {};
  const serie = b.serieNumero.trim().toUpperCase();
  if (!serie) errores.serie = "Escribe la serie y el número de la nota, por ejemplo FC01-000018.";
  else if (p.seriesUsadas.some((s) => s.toUpperCase() === serie)) errores.serie = `La nota ${serie} ya está registrada en ${c.documento}.`;

  if (!b.fecha) errores.fecha = "Elige la fecha de la nota.";
  else if (b.fecha < c.fechaEmision) errores.fecha = `La nota no puede ser anterior al comprobante (emitido el ${c.fechaEmision.slice(8, 10)}/${c.fechaEmision.slice(5, 7)}).`;
  else if (b.fecha > p.hoy) errores.fecha = "La fecha de la nota no puede ser futura.";

  let explicacionMonto: string | null = null;
  let topeSugerido: number | null = null;
  if (montoMostrado.trim() === "") errores.monto = "Escribe el monto de la nota.";
  else if (Number.isNaN(monto)) {
    errores.monto = "El monto tiene que ser mayor a cero y con hasta 2 decimales.";
    explicacionMonto = "El monto tiene que ser mayor a cero y con hasta dos decimales.";
  } else if (monto > tope + 1e-6) {
    errores.monto = esFaltante ? `No puede pasar de ${d(tope)}.` : `Como máximo ${d(tope)}.`;
    explicacionMonto = esFaltante
      ? `La nota por faltante no puede pasar de ${d(sugerido)}: es lo que se cerró sin llegar, a su costo con IGV (se admite ${d(MARGEN_NOTA)} de margen por redondeo). Tú escribiste ${d(monto)}.`
      : `Las notas de ${c.documento} sumarían ${d(centavos(c.notasMonto + monto))}, más que el comprobante (${d(c.total)}). Como máximo ${d(tope)}.`;
    topeSugerido = esFaltante ? sugerido : tope;
  }

  if (esFaltante && !disponible) errores.motivo = "La nota por faltante todavía no se puede registrar en este comprobante.";

  const reparto = Number.isNaN(monto) || explicacionMonto ? null : repartoDestino(monto, c.saldo, b.destino);
  const haySobrante = !!reparto && centavos(reparto.devuelve + reparto.aFavor) > 0.004;
  const destino = haySobrante ? b.destino : null;
  if (destino === "reembolso" && (!b.reembolsoFecha || b.reembolsoFecha > p.hoy)) errores.reembolsoFecha = "La fecha del reembolso no puede ser futura.";

  return { errores, monto, tope, sugerido, montoMostrado, explicacionMonto, topeSugerido, reparto, destino, haySobrante };
}

/** Por qué «Faltante» está o no disponible en ese comprobante — el texto que el modal muestra bajo el motivo. */
export function notaMotivoAyuda(p: { motivo: MotivoNota; pendiente: { bloqueada: boolean } | null; yaTieneNotaFaltante: boolean }): string {
  const disponible = !!p.pendiente && !p.pendiente.bloqueada && !p.yaTieneNotaFaltante;
  if (p.motivo === "faltante" && disponible) return "Una sola por comprobante: cubre todo lo que no llegó.";
  if (p.yaTieneNotaFaltante) return "«Faltante» no está disponible: este comprobante ya tiene su nota por faltante (es una sola por comprobante).";
  if (!p.pendiente) return "«Faltante» no está disponible: no hay unidades cerradas sin llegar en este comprobante. Devolución, descuento y otro pueden ser varias por comprobante.";
  if (p.pendiente.bloqueada) return "«Faltante» no está disponible todavía: quedan unidades sin recibir ni cerrar. Se habilita cuando el comprobante quede resuelto al 100 %.";
  return "Devolución, descuento y otro pueden ser varias por comprobante; ninguna suma pasa del total.";
}

// ---------------------------------------------------------------------------
// El recorrido de una nota: línea de tiempo y «siguiente paso»
// ---------------------------------------------------------------------------

export type PasoNota = { clave: string; titulo: string; detalle: string; fecha: string | null; estado: "hecho" | "ahora" | "pendiente" };

/**
 * Los pasos por los que pasa una nota, de izquierda a derecha. «Reclamada al proveedor» NO está: hoy no
 * hay dónde guardarlo (D2 del spike quedó para una segunda fase) y un paso que nunca se puede completar
 * sería mentir. Cuando exista `compra_nota_reclamos`, se suma acá.
 */
export function pasosDeNota(f: FilaVista, dinero: (n: number) => string = soles): PasoNota[] {
  const pasos: PasoNota[] = [];
  const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null);
  if (f.clase === "pendiente") {
    pasos.push({
      clave: "Faltante",
      titulo: f.bloqueada ? "Faltante detectado · el comprobante todavía no está resuelto" : "Faltante detectado",
      detalle: `${f.unidadesCerradas.toLocaleString("es-PE")} ${f.unidadesCerradas === 1 ? "unidad cerrada" : "unidades cerradas"} en ${f.documento}`,
      fecha: dm(f.cerradoEn?.slice(0, 10) ?? f.fecha),
      estado: f.bloqueada ? "ahora" : "hecho",
    });
    pasos.push({ clave: "Nota recibida", titulo: "Nota de crédito recibida", detalle: "Serie-número, fecha y monto de la nota", fecha: null, estado: f.bloqueada ? "pendiente" : "ahora" });
    pasos.push({ clave: "Aplicada", titulo: "Aplicada", detalle: "Baja la deuda; lo que sobre se devuelve o queda a tu favor", fecha: null, estado: "pendiente" });
    return pasos;
  }
  pasos.push({ clave: "Origen", titulo: tituloOrigen(f.motivo), detalle: f.nota ?? ETIQUETA_MOTIVO_NOTA[f.motivo ?? "otro"] ?? "", fecha: dm(f.compraFechaEmision), estado: "hecho" });
  pasos.push({ clave: "Nota recibida", titulo: `Nota ${f.serieNumero ?? ""} recibida`, detalle: `Registrada contra ${f.documento}`, fecha: dm(f.fecha), estado: "hecho" });
  if (f.aplicado > 0.004) pasos.push({ clave: "Baja deuda", titulo: `Bajó la deuda de ${f.documento}`, detalle: `− ${dinero(f.aplicado)} de lo que se debía`, fecha: dm(f.fecha), estado: "hecho" });
  if (f.devuelto) pasos.push({ clave: "Devuelto", titulo: "Dinero devuelto", detalle: `${dinero(f.devuelto.monto)}${f.devuelto.metodo ? ` · ${f.devuelto.metodo}` : ""}`, fecha: dm(f.devuelto.fecha), estado: "hecho" });
  if (f.vivo > 0.004) pasos.push({ clave: "A favor", titulo: "Con saldo a favor sin usar", detalle: `Quedan ${dinero(f.vivo)} de ${dinero(f.aFavor)} que sobraron`, fecha: null, estado: "ahora" });
  else if (f.aFavor > 0.004 && !f.devuelto) pasos.push({ clave: "Aplicada", titulo: "Aplicada", detalle: "Su saldo ya se usó en pagos", fecha: null, estado: "hecho" });
  return pasos;
}

export const ETIQUETA_MOTIVO_NOTA: Record<string, string> = {
  faltante: "Faltante",
  devolucion: "Devolución",
  descuento: "Descuento (precio)",
  otro: "Otro",
};

function tituloOrigen(motivo: string | null): string {
  if (motivo === "faltante") return "Faltante detectado";
  if (motivo === "devolucion") return "Devolución al proveedor";
  if (motivo === "descuento") return "Descuento acordado";
  return "Concepto acordado";
}

export type Sugerencia = { tono: "actuar" | "aviso" | "bien" | "espera"; texto: string };

/** Qué conviene hacer AHORA con esa fila. Es la frase del cajón: una sola, concreta y con su porqué. */
export function siguientePaso(f: FilaVista, dinero: (n: number) => string = soles): Sugerencia {
  if (f.clase === "pendiente") {
    if (f.bloqueada) {
      return { tono: "espera", texto: `Primero recibe o cierra lo que queda de ${f.documento}. La nota por faltante es una sola por comprobante y se registra cuando el comprobante queda resuelto.` };
    }
    if (f.edadDias > DIAS_URGENCIA_RECLAMO) {
      return { tono: "actuar", texto: `Van ${f.edadDias} días desde que se cerró el faltante y la nota no llega: conviene llamar a ${f.proveedorNombre} en vez de escribir otra vez.` };
    }
    return { tono: "aviso", texto: `Reclámasela a ${f.proveedorNombre}: corresponde una nota por ${dinero(f.monto)} contra ${f.documento}. Cuando llegue, regístrala y elige qué pasa con el dinero que sobre.` };
  }
  if (f.estado === "emitida") {
    return { tono: "bien", texto: `Quedan ${dinero(f.vivo)} a tu favor con ${f.proveedorNombre}. Se te ofrecen al pagar: tú decides si los usas o pides el reembolso.` };
  }
  if (f.devuelto) {
    return { tono: "bien", texto: `${f.proveedorNombre} devolvió ${dinero(f.devuelto.monto)}.${f.aplicado > 0.004 ? ` Además la nota bajó la deuda de ${f.documento} en ${dinero(f.aplicado)}.` : ""} No queda saldo a favor de esta nota.` };
  }
  return { tono: "bien", texto: `Nada pendiente: la nota bajó la deuda de ${f.documento} en ${dinero(f.aplicado)}${f.aFavor > 0.004 ? ` y su saldo a favor ya se usó en pagos` : ""}.` };
}

/**
 * El mensaje listo para copiarle al proveedor cuando la nota todavía no llega. Lleva el comprobante, las
 * unidades y el monto con su base y su IGV, porque es lo que el proveedor necesita para emitirla sin
 * volver a preguntar. El IGV sale del que la base ya calculó para el faltante (`igv` de la fila).
 */
export function mensajeParaProveedor(f: FilaVista, dinero: (n: number) => string = soles): string {
  const unidades = `${f.unidadesCerradas.toLocaleString("es-PE")} ${f.unidadesCerradas === 1 ? "unidad" : "unidades"}`;
  const igv = f.igv > 0 ? f.igv : centavos(f.monto - f.monto / 1.18);
  const neto = centavos(f.monto - igv);
  return [
    `Hola, buen día. En la recepción de ${f.documento} quedaron ${unidades} sin llegar.`,
    `Corresponde una nota de crédito por ${dinero(f.monto)} (base ${dinero(neto)} + IGV ${dinero(igv)}) contra ${f.documento}. ¿Nos la pueden emitir? Gracias. — CAYLA`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Buscador de facturas: coincide por documento, proveedor y MONTO
// ---------------------------------------------------------------------------

export type FiltroFacturas = "todas" | "con_saldo" | "pagadas";

/** Sin espacios, comas, guiones ni «S/»: así «2360» encuentra «S/ 2,360.00» y «f003771» encuentra «F003-000771». */
export function aplanar(texto: string): string {
  return base(texto).replace(/s\//g, "").replace(/[\s,.\-]/g, "");
}

export function coincideFactura(f: FacturaParaNota, q: string): boolean {
  const qq = aplanar(q);
  if (!qq) return true;
  const campos = [f.documento, f.proveedorNombre, f.total.toFixed(2), f.saldo.toFixed(2), soles(f.total), soles(f.saldo)];
  return campos.some((c) => aplanar(c).includes(qq));
}

export function filtrarFacturas(facturas: FacturaParaNota[], p: { texto: string; filtro: FiltroFacturas; proveedorId: string | null }): FacturaParaNota[] {
  return facturas.filter((f) => {
    if (p.filtro === "con_saldo" && f.saldo <= 0.004) return false;
    if (p.filtro === "pagadas" && f.saldo > 0.004) return false;
    if (p.proveedorId && f.proveedorId !== p.proveedorId) return false;
    return coincideFactura(f, p.texto);
  });
}

export type TramoTexto = { texto: string; coincide: boolean };

/**
 * Resalta la coincidencia aunque quien escribe omita guiones, comas, espacios o el «S/»: se aplana el
 * texto guardando de dónde salió cada carácter, se busca ahí y se devuelven los tramos del texto ORIGINAL.
 */
export function resaltarFlexible(texto: string, q: string): TramoTexto[] {
  const qq = aplanar(q);
  if (!qq) return [{ texto, coincide: false }];
  const indices: number[] = [];
  let plano = "";
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (/[\s,.\-]/.test(c)) continue;
    if (/s/i.test(c) && texto[i + 1] === "/") continue;
    if (c === "/" && /s/i.test(texto[i - 1] ?? "")) continue;
    indices.push(i);
    plano += base(c);
  }
  const j = plano.indexOf(qq);
  if (j < 0) return [{ texto, coincide: false }];
  const a = indices[j];
  const b = indices[j + qq.length - 1] + 1;
  return [
    { texto: texto.slice(0, a), coincide: false },
    { texto: texto.slice(a, b), coincide: true },
    { texto: texto.slice(b), coincide: false },
  ].filter((t) => t.texto !== "");
}

/** El chip de estado de una factura en el buscador. */
export function chipFactura(f: FacturaParaNota, hoy: string): { tono: "verde" | "rojo" | "neutro"; texto: string } {
  if (f.saldo <= 0.004) return { tono: "verde", texto: "Pagada" };
  if (f.fechaVencimiento && f.fechaVencimiento < hoy) return { tono: "rojo", texto: "Vencida" };
  return { tono: "neutro", texto: "Pendiente" };
}
