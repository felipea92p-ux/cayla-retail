import { TIPOS_PAPEL, type TipoPapel } from "./papel-de-compra";
import type { MovimientoFondo } from "./fondos-reglas";
import { leerCuaderno, type CuadernoRonda } from "./revisar-compras-reglas";
import { diasEntreFechas, diaLima, diaMes } from "./fechas-lima";

// Compras reestructurado (ADR-0704, maqueta docs/maquetas/compras-reestructura-2026-11/, Felipe 2026-11-26). Las reglas puras de las dos
// lecturas nuevas: `fn_compradores` (quién está comprando con plata de CAYLA y en qué la gastó) y `fn_todas_las_compras` (un solo libro:
// lo de «Mis compras» desde que sale en un envío, con su comprobante cuando ya se revisó, y lo que registró la oficina). Leer lo que
// mandan —que puede venir viejo o roto: nunca se cae, descarta lo ilegible— y decir en una frase lo que pide atención en cada ronda.
// Sin Supabase.

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_COMPRADORES = "fn_compradores";
export const RPC_COMPRADORES_SIN_RONDA = "fn_compradores_sin_ronda";
export const RPC_TODAS_LAS_COMPRAS = "fn_todas_las_compras";
export const RPC_CERRAR_RONDA_SIN_MOVIMIENTO = "cerrar_ronda_sin_movimiento";

/** A los cuántos días sin compras una ronda abierta avisa «Cerrar su ronda» (Felipe 2026-11-26: avisa, nadie la cierra sola). */
export const DIAS_RONDA_OLVIDADA = 14;

export type EstadoEnvioCompra = "en_camino" | "abierto" | "cerrado";
export type EnvioDeCompra = { id: string; numero: string; estado: EstadoEnvioCompra; destino: string; salioEn: string };

export type ComprobanteDeCompra = { id: string; documento: string; saldo: number; estadoPago: string };

/** Una compra, venga de «Mis compras» (`origen: "compra"`) o de la oficina (`"comprobante"`): las dos pantallas la leen igual. */
export type CompraDelLibro = {
  id: string;
  origen: "compra" | "comprobante";
  personaId: string | null;
  persona: string | null;
  rondaId: string | null;
  ronda: string | null;
  fecha: string;
  creadoEn: string;
  proveedorId: string;
  proveedor: string;
  proveedorRuc: string | null;
  tipo: TipoPapel | "factura" | "boleta" | "nota_venta" | string;
  monto: number;
  pagado: number;
  medioPago: string | null;
  /** Compras ya pasó su papel a los libros (o es un comprobante de la oficina). */
  revisada: boolean;
  prendas: number;
  comprobante: ComprobanteDeCompra | null;
  envios: EnvioDeCompra[];
};

export type CierreDeRonda = { decision: "devuelve" | "le_deben" | "se_queda" | string; monto: number; resuelto: boolean };

export type RondaDeCompras = {
  id: string;
  texto: string | null;
  personaId: string;
  persona: string;
  abiertaEn: string;
  cerradaEn: string | null;
  cierre: CierreDeRonda | null;
  cuenta: CuadernoRonda;
  /**
   * Lo que tiene hoy en la mano, de su fondo (`fn_mi_plata_tiene`, 20261126223000): la misma cifra que la persona ve en «Mis compras».
   * Solo con la ronda abierta; `null` en una cerrada (ya hizo su cuenta) o si la base todavía no lo manda.
   */
  tiene: number | null;
  ultimaCompraEn: string | null;
  compras: CompraDelLibro[];
};

/** Quien tiene plata de CAYLA en la mano y todavía no abrió su ronda (`fn_compradores_sin_ronda`). */
export type CompradorSinRonda = { personaId: string; persona: string; tiene: number; ultimaEntrega: string | null };

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const objeto = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const ESTADOS_ENVIO: readonly EstadoEnvioCompra[] = ["en_camino", "abierto", "cerrado"];

function leerEnvio(x: unknown): EnvioDeCompra | null {
  const o = objeto(x);
  const id = texto(o?.id);
  const estado = o?.estado;
  if (!o || !id || !ESTADOS_ENVIO.includes(estado as EstadoEnvioCompra)) return null;
  return { id, numero: texto(o.numero) ?? "", estado: estado as EstadoEnvioCompra, destino: texto(o.destino) ?? "", salioEn: texto(o.salio_en) ?? "" };
}

function leerComprobante(x: unknown): ComprobanteDeCompra | null {
  const o = objeto(x);
  const id = texto(o?.id);
  if (!o || !id) return null;
  return { id, documento: texto(o.documento) ?? "", saldo: numero(o.saldo) ?? 0, estadoPago: texto(o.estado_pago) ?? "" };
}

export function leerCompra(x: unknown): CompraDelLibro | null {
  const o = objeto(x);
  const id = texto(o?.id);
  const fecha = texto(o?.fecha);
  const monto = numero(o?.monto);
  const origen = o?.origen === "comprobante" ? "comprobante" : o?.origen === "compra" ? "compra" : null;
  if (!o || !id || !fecha || monto === null || !origen) return null;
  return {
    id,
    origen,
    personaId: texto(o.persona_id),
    persona: texto(o.persona),
    rondaId: texto(o.ronda_id),
    ronda: texto(o.ronda),
    fecha,
    creadoEn: texto(o.creado_en) ?? fecha,
    proveedorId: texto(o.proveedor_id) ?? "",
    proveedor: texto(o.proveedor) ?? "Proveedor sin nombre",
    proveedorRuc: texto(o.proveedor_ruc),
    tipo: texto(o.tipo) ?? "sin_comprobante",
    monto,
    pagado: numero(o.pagado) ?? 0,
    medioPago: texto(o.medio_pago),
    revisada: o.revisada === true,
    prendas: Math.max(0, Math.trunc(numero(o.prendas) ?? 0)),
    comprobante: leerComprobante(o.comprobante),
    envios: lista(o.envios).map(leerEnvio).filter((e): e is EnvioDeCompra => e !== null),
  };
}

function leerRonda(x: unknown): RondaDeCompras | null {
  const o = objeto(x);
  const id = texto(o?.id);
  const personaId = texto(o?.persona_id);
  const abiertaEn = texto(o?.abierta_en);
  const cuenta = leerCuaderno(o?.cuenta);
  if (!o || !id || !personaId || !abiertaEn || !cuenta) return null;
  const c = objeto(o.cierre);
  return {
    id,
    texto: texto(o.texto),
    personaId,
    persona: texto(o.persona) ?? "Sin nombre",
    abiertaEn,
    cerradaEn: texto(o.cerrada_en),
    cierre: c ? { decision: texto(c.decision) ?? "", monto: numero(c.monto) ?? 0, resuelto: c.resuelto === true } : null,
    cuenta,
    tiene: texto(o.cerrada_en) ? null : numero(o.tiene),
    ultimaCompraEn: texto(o.ultima_compra_en),
    compras: lista(o.compras).map(leerCompra).filter((v): v is CompraDelLibro => v !== null),
  };
}

/** `null` si la respuesta no es una lista (función vieja o rota): la pantalla dice que no pudo leer, nunca «nadie compra». */
export function leerCompradores(data: unknown): RondaDeCompras[] | null {
  if (!Array.isArray(data)) return null;
  return data.map(leerRonda).filter((r): r is RondaDeCompras => r !== null);
}

/** `null` si la respuesta no es una lista: la pantalla no dibuja el grupo, nunca inventa «nadie más tiene plata». Sin plata a favor, no entra. */
export function leerCompradoresSinRonda(data: unknown): CompradorSinRonda[] | null {
  if (!Array.isArray(data)) return null;
  return data
    .map((x): CompradorSinRonda | null => {
      const o = objeto(x);
      const personaId = texto(o?.persona_id);
      const tiene = numero(o?.tiene);
      if (!o || !personaId || tiene === null || tiene <= 0.005) return null;
      return { personaId, persona: texto(o.persona) ?? "Sin nombre", tiene, ultimaEntrega: texto(o.ultima_entrega) };
    })
    .filter((p): p is CompradorSinRonda => p !== null);
}

export function leerTodasLasCompras(data: unknown): CompraDelLibro[] | null {
  if (!Array.isArray(data)) return null;
  return data.map(leerCompra).filter((c): c is CompraDelLibro => c !== null);
}

// ---------- la cuenta de una ronda, en palabras de tienda ----------

/** Lo que salió de su plata: lo pagado en compras más los gastos (pasajes, bolsas). */
export const gastoDeRonda = (c: CuadernoRonda): number => c.compraste + c.gastaste;
const centimos = (n: number): number => Math.round(n * 100) / 100 || 0; // `|| 0`: nunca «-0»
type CuentaDeRonda = Pick<RondaDeCompras, "cuenta" | "tiene">;
/**
 * Lo que le queda en la mano. Con la ronda abierta es lo que dice su fondo (`tiene`): ahí entra toda la plata, también la que la oficina le
 * entregó sin que ella la anotara y la que traía de antes. Sin ese dato (ronda cerrada, base de antes), lo anotado en la ronda menos lo que
 * salió. Negativo = pagó más de lo que tenía.
 */
export const quedaDeRonda = (r: CuentaDeRonda): number => centimos(r.tiene ?? r.cuenta.dieron - gastoDeRonda(r.cuenta));
/**
 * Lo que tuvo para comprar. Se despeja de lo que le queda, como en «Mis compras» (`resumenRonda`): le queda más lo que gastó, así la cuenta
 * siempre cierra. Sumar solo lo anotado en la ronda dejaba en S/ 0 a quien recibió su plata por «Entregar plata» (Felipe 2026-11-26).
 */
export const dieronDeRonda = (r: CuentaDeRonda): number => (r.tiene === null ? r.cuenta.dieron : centimos(r.tiene + gastoDeRonda(r.cuenta)));
/** Sin plata en la mano, ni a favor ni en contra. Sin el dato, no se sabe y no estorba. */
const sinPlataEnLaMano = (r: Pick<RondaDeCompras, "tiene">): boolean => Math.abs(r.tiene ?? 0) <= 0.005;
export const porRevisarDeRonda = (r: Pick<RondaDeCompras, "compras">): number => r.compras.filter((c) => !c.revisada).length;

/**
 * Compras puede cerrar la ronda de otra persona solo si no tiene nada adentro (`cerrar_ronda_sin_movimiento`, 20261126152000): ni plata
 * anotada, ni compras, ni gastos. Es lo que la pantalla ofrece; la base además mira que la persona no tenga plata en la mano.
 */
export const puedeCerrarseDesdeCompras = (r: Pick<RondaDeCompras, "cerradaEn" | "compras" | "cuenta" | "tiene">): boolean =>
  r.cerradaEn === null && r.compras.length === 0 && r.cuenta.dieron === 0 && r.cuenta.gastos === 0 && r.cuenta.compras === 0 && sinPlataEnLaMano(r);

// ---------- la tabla de Compradores: quién tiene plata (Felipe 2026-11-26: «información precisa, que realmente sirva») ----------

/** Lo que falta pagarle al proveedor por una compra: el saldo de su comprobante si ya se revisó; si no, lo anotado menos lo pagado. */
export const faltaPagarDeCompra = (c: Pick<CompraDelLibro, "monto" | "pagado" | "comprobante">): number =>
  centimos(Math.max(0, c.comprobante ? c.comprobante.saldo : c.monto - c.pagado));

/** Cuánto de su plata ya usó, redondeado HACIA ABAJO (nunca dice que usó más de lo que usó). `null` si no hay plata contra qué medir. */
export const pctUsado = (dieron: number, gasto: number): number | null =>
  dieron > 0.005 && gasto > 0.005 ? Math.min(100, Math.max(0, Math.floor((gasto / dieron) * 100))) : null;

/** Una persona en la tabla de Compradores: con su ronda abierta, o con plata en la mano y sin ronda. */
export type FilaComprador = {
  personaId: string;
  persona: string;
  sinRonda: boolean;
  dieron: number;
  gasto: number;
  queda: number;
  usado: number | null;
  compras: number;
  prendas: number;
  porRevisar: number;
  faltaPagar: number;
  /** Días desde que abrió su ronda; `null` sin ronda. */
  diasAbierta: number | null;
  /** Días sin comprar, solo si ya pasó el aviso de ronda olvidada; si no, `null`. */
  quieta: number | null;
  /** Compras puede cerrarle la ronda (no tiene nada adentro ni plata en la mano). */
  cerrable: boolean;
  ultimaEntrega: string | null;
  /** Cuándo cerró su última ronda, si está en la lista solo por lo que dejó pendiente; si no, `null`. */
  cerro: string | null;
};

/**
 * Las filas de la tabla: cada ronda abierta y, después, quien tiene plata sin ronda. Primero quien más plata tiene en la mano: es a quien
 * más importa mirar. Si alguien llegara por los dos lados (abrió su ronda entre una lectura y la otra), manda su ronda.
 */
export function filasDeCompradores(rondas: readonly RondaDeCompras[], sinRonda: readonly CompradorSinRonda[], hoy: string): FilaComprador[] {
  const abiertas = rondas
    .filter((r) => r.cerradaEn === null)
    .map((r): FilaComprador => {
      const dieron = dieronDeRonda(r);
      const gasto = centimos(gastoDeRonda(r.cuenta));
      const desde = diaLima(r.ultimaCompraEn ?? r.abiertaEn);
      const quieta = desde ? diasEntreFechas(desde, hoy) : 0;
      const abierta = diaLima(r.abiertaEn);
      return {
        personaId: r.personaId,
        persona: r.persona,
        sinRonda: false,
        dieron,
        gasto,
        queda: quedaDeRonda(r),
        usado: pctUsado(dieron, gasto),
        compras: r.compras.length,
        prendas: r.cuenta.prendas,
        porRevisar: porRevisarDeRonda(r),
        faltaPagar: centimos(r.compras.reduce((a, c) => a + faltaPagarDeCompra(c), 0)),
        diasAbierta: abierta ? Math.max(0, diasEntreFechas(abierta, hoy)) : null,
        quieta: quieta >= DIAS_RONDA_OLVIDADA ? quieta : null,
        cerrable: puedeCerrarseDesdeCompras(r),
        ultimaEntrega: null,
        cerro: null,
      };
    });
  const conRonda = new Set(abiertas.map((f) => f.personaId));
  const sueltas = sinRonda
    .filter((p) => !conRonda.has(p.personaId))
    .map(
      (p): FilaComprador => ({
        personaId: p.personaId,
        persona: p.persona,
        sinRonda: true,
        dieron: p.tiene,
        gasto: 0,
        queda: p.tiene,
        usado: null,
        compras: 0,
        prendas: 0,
        porRevisar: 0,
        faltaPagar: 0,
        diasAbierta: null,
        quieta: null,
        cerrable: false,
        ultimaEntrega: p.ultimaEntrega,
        cerro: null,
      }),
    );
  // Quien ya cerró su ronda pero dejó compras por revisar o por pagar: sin esto, lo pendiente se contaba arriba y no se veía de quién era.
  const yaEsta = new Set([...abiertas, ...sueltas].map((f) => f.personaId));
  const cerradas = rondas.filter((r) => r.cerradaEn !== null && !yaEsta.has(r.personaId));
  const pendientes = [...new Set(cerradas.map((r) => r.personaId))].flatMap((personaId): FilaComprador[] => {
    const suyas = cerradas.filter((r) => r.personaId === personaId);
    const porRevisar = suyas.reduce((a, r) => a + porRevisarDeRonda(r), 0);
    const faltaPagar = centimos(suyas.flatMap((r) => r.compras).reduce((a, c) => a + faltaPagarDeCompra(c), 0));
    if (porRevisar === 0 && faltaPagar <= 0.005) return [];
    const cerro = suyas.map((r) => r.cerradaEn as string).sort().at(-1) ?? null;
    return [{ personaId, persona: suyas[0].persona, sinRonda: true, dieron: 0, gasto: 0, queda: 0, usado: null, compras: 0, prendas: 0, porRevisar, faltaPagar, diasAbierta: null, quieta: null, cerrable: false, ultimaEntrega: null, cerro }];
  });
  return [...abiertas, ...sueltas, ...pendientes].sort(
    (a, b) => b.queda - a.queda || b.porRevisar - a.porRevisar || b.gasto - a.gasto || a.persona.localeCompare(b.persona, "es"),
  );
}

/** Una sola frase por persona. `avisa`: lleva días sin comprar, y va en ámbar. */
export function fraseDePersona(f: Pick<FilaComprador, "sinRonda" | "diasAbierta" | "quieta" | "cerro">): { texto: string; avisa: boolean } {
  if (f.cerro) return { texto: `Cerró su ronda el ${diaMes(f.cerro)}`, avisa: false };
  if (f.sinRonda) return { texto: "Aún no abre su ronda", avisa: false };
  if (f.quieta !== null) return { texto: `Sin comprar hace ${f.quieta} días`, avisa: true };
  const d = f.diasAbierta ?? 0;
  return { texto: d <= 0 ? "Empezó hoy" : d === 1 ? "Empezó ayer" : `Comprando hace ${d} días`, avisa: false };
}

/** Las etiquetas de una persona: solo lo que se hace AQUÍ (revisar sus papeles, pagar lo que quedó debiendo, cerrar una ronda vacía). */
export function etiquetasDePersona(f: Pick<FilaComprador, "porRevisar" | "faltaPagar" | "quieta" | "cerrable">, soles: (n: number) => string): string[] {
  const e: string[] = [];
  if (f.porRevisar > 0) e.push(`${f.porRevisar} por revisar`);
  if (f.faltaPagar > 0.005) e.push(`Falta pagar ${soles(f.faltaPagar)}`);
  if (f.quieta !== null && f.cerrable) e.push("Cerrar su ronda");
  return e;
}

export type FiltroCompradores = "" | "revisar" | "pagar";

const sinTildes = (t: string): string => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** La lista según el filtro y lo buscado (por nombre, sin tildes ni mayúsculas). */
export function filtrarCompradores(filas: readonly FilaComprador[], filtro: FiltroCompradores, busqueda: string): FilaComprador[] {
  const q = sinTildes(busqueda.trim());
  return filas.filter((f) => (filtro === "revisar" ? f.porRevisar > 0 : filtro === "pagar" ? f.faltaPagar > 0.005 : true) && (q === "" || sinTildes(f.persona).includes(q)));
}

/** Con más personas que esto, aparece el buscador. */
export const PERSONAS_PARA_BUSCAR = 8;
/** Hasta este número, quien no tiene plata ni pendientes se muestra igual; con más, se pliega tras «Ver N más». */
export const SIN_NADA_A_LA_VISTA = 3;

/**
 * La lista a escala (Felipe 2026-11-26: «siempre piensa en la escalabilidad»): arriba quien tiene plata o pide algo; quien no tiene plata ni
 * pendientes queda plegado si son más de tres. Filtrando o buscando no se pliega nada: lo que se pidió ver, se ve.
 */
export function repartoDeLista(filas: readonly FilaComprador[], sinPlegar: boolean): { arriba: FilaComprador[]; plegadas: FilaComprador[] } {
  const vive = (f: FilaComprador) => Math.abs(f.queda) > 0.005 || f.porRevisar > 0 || f.faltaPagar > 0.005 || (f.quieta !== null && f.cerrable);
  const sinNada = filas.filter((f) => !vive(f));
  if (sinPlegar || sinNada.length <= SIN_NADA_A_LA_VISTA) return { arriba: [...filas], plegadas: [] };
  return { arriba: filas.filter(vive), plegadas: sinNada };
}

/** Lo que hay «en la calle»: la plata que la gente tiene en la mano, y cuántas personas la tienen. */
export function enLaCalle(filas: readonly FilaComprador[]): { total: number; personas: number } {
  const conPlata = filas.filter((f) => f.queda > 0.005);
  return { total: centimos(conPlata.reduce((a, f) => a + f.queda, 0)), personas: conPlata.length };
}

// ---------- el estado de cuenta de una persona: lo que entra y lo que sale, por fechas ----------

export type LineaDeCuenta = {
  id: string;
  fecha: string;
  clase: "compra" | "entrega" | "devolucion" | "pago_deuda";
  titulo: string;
  detalle: string | null;
  monto: number;
  /** «+» entra a su mano, «−» sale; «» no mueve su saldo (lo anulado, el pago de una deuda). */
  signo: "+" | "−" | "";
  /** Lo que pide esa línea («Por revisar», «Falta pagar S/ 315.00»), si pide algo. */
  pendiente: string | null;
  anulada: boolean;
  /** El movimiento de fondo detrás de la línea, para poder anularlo. */
  movimiento: MovimientoFondo | null;
};

const TITULO_MOVIMIENTO: Record<MovimientoFondo["tipo"], string> = { entrega_fondo: "Le diste", devolucion_fondo: "Devolvió", pago_deuda_fondo: "Pagó su deuda" };
const CLASE_MOVIMIENTO: Record<MovimientoFondo["tipo"], LineaDeCuenta["clase"]> = { entrega_fondo: "entrega", devolucion_fondo: "devolucion", pago_deuda_fondo: "pago_deuda" };

/**
 * Las líneas del estado de cuenta entre dos fechas, lo más nuevo primero: cada compra de sus rondas (lo que PAGÓ: lo que quedó debiendo va en
 * su etiqueta) y cada movimiento de su fondo. Ya no se parte por ronda. Los otros gastos de una ronda (pasajes, bolsas) no vienen uno por uno:
 * están en el total «Gastó» del resumen, no aquí.
 */
export function lineasDeCuenta(
  rondas: readonly Pick<RondaDeCompras, "compras">[],
  movimientos: readonly MovimientoFondo[],
  tramo: { desde: string; hasta: string },
  soles: (n: number) => string,
): LineaDeCuenta[] {
  const compras = rondas.flatMap((r) => r.compras).map((c): LineaDeCuenta => {
    const e = estadoDeCompra(c, soles);
    return {
      id: c.id,
      fecha: c.fecha.slice(0, 10),
      clase: "compra",
      titulo: c.proveedor,
      detalle: c.prendas > 0 ? `${c.prendas} ${c.prendas === 1 ? "prenda" : "prendas"}` : null,
      monto: centimos(c.monto - faltaPagarDeCompra(c)),
      signo: "−",
      pendiente: e.tono === "ambar" ? e.texto : null,
      anulada: false,
      movimiento: null,
    };
  });
  const plata = movimientos.map((m): LineaDeCuenta => {
    const anulada = m.estado === "anulado";
    return {
      id: m.id,
      fecha: m.fecha.slice(0, 10),
      clase: CLASE_MOVIMIENTO[m.tipo],
      titulo: TITULO_MOVIMIENTO[m.tipo],
      // Lo anulado sigue a la vista, con quién lo anuló y por qué (como en la lista de antes).
      detalle: anulada ? [m.motivo, `Anulada${m.anuladoPor ? ` por ${m.anuladoPor}` : ""}${m.motivoAnulacion ? `: ${m.motivoAnulacion}` : ""}`].filter(Boolean).join(". ") : m.motivo,
      monto: m.monto,
      signo: anulada || m.tipo === "pago_deuda_fondo" ? "" : m.tipo === "entrega_fondo" ? "+" : "−",
      pendiente: null,
      anulada,
      movimiento: m,
    };
  });
  return [...compras, ...plata]
    .filter((l) => l.fecha >= tramo.desde && l.fecha <= tramo.hasta)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || Number(a.signo === "+") - Number(b.signo === "+"));
}

export type DiaDeCuenta = { dia: string; lineas: LineaDeCuenta[]; compras: number; entro: number; salio: number };

/** Lo que entró y lo que salió en unas líneas. Lo anulado y lo que no mueve su saldo no suman. */
export function totalesDeCuenta(lineas: readonly LineaDeCuenta[]): { entro: number; salio: number } {
  return {
    entro: centimos(lineas.filter((l) => l.signo === "+").reduce((a, l) => a + l.monto, 0)),
    salio: centimos(lineas.filter((l) => l.signo === "−").reduce((a, l) => a + l.monto, 0)),
  };
}

/** Las líneas por día, cada día con su subtotal: con muchas compras se entiende el día sin leer fila por fila. */
export function diasDeCuenta(lineas: readonly LineaDeCuenta[]): DiaDeCuenta[] {
  return [...new Set(lineas.map((l) => l.fecha))].map((dia) => {
    const delDia = lineas.filter((l) => l.fecha === dia);
    return { dia, lineas: delDia, compras: delDia.filter((l) => l.clase === "compra").length, ...totalesDeCuenta(delDia) };
  });
}

/** Con más líneas que esto, solo los días más nuevos van abiertos y aparece el filtro «Pendiente». */
export const LINEAS_PARA_PLEGAR = 12;
/** Cuántos días van abiertos cuando la lista se pliega. */
export const DIAS_ABIERTOS = 2;

export const nombreDelPapel = (tipo: string): string => (tipo in TIPOS_PAPEL ? TIPOS_PAPEL[tipo as TipoPapel].nombre : tipo);

export type EstadoDeCompra = { tono: "ambar" | "verde"; texto: string };

/** El estado que dice la fila: lo que falta pagar manda; después, si Compras ya la revisó. */
export function estadoDeCompra(c: Pick<CompraDelLibro, "monto" | "pagado" | "revisada" | "comprobante">, soles: (n: number) => string): EstadoDeCompra {
  const falta = c.comprobante ? c.comprobante.saldo : c.monto - c.pagado;
  if (falta > 0.005) return { tono: "ambar", texto: `Falta pagar ${soles(falta)}` };
  return c.revisada ? { tono: "verde", texto: "Revisada" } : { tono: "ambar", texto: "Por revisar" };
}

/** Dónde está la mercadería, por su último envío: «Llegó a Tienda TRU», «Contándose en …», «En camino a …». */
export function llegadaDeCompra(c: Pick<CompraDelLibro, "envios">): string | null {
  const e = c.envios.at(-1);
  if (!e) return null;
  if (e.estado === "cerrado") return `Llegó a ${e.destino}`;
  if (e.estado === "abierto") return `Contándose en ${e.destino}`;
  return `En camino a ${e.destino}`;
}
