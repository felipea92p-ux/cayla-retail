import { leerMontoPlata, MONTO_ILEGIBLE } from "./monto-plata-reglas";
import { soles } from "./compras-reglas";
import { igvDeFactura } from "./gastos-reglas";
import type { CampoDeGuia } from "./guia-campos";
import type { NoDeducible } from "./no-deducible-reglas";

// Gastos del viaje (ADR-0362, fase 6 · actividad 3; respuestas de Felipe del 2026-10-13): las reglas puras de la hoja «Gasto del viaje»
// y de «Traerla costó». Lo que falta en la hoja es lo MISMO que rechaza `registrar_gasto_viaje` (20261013222000): la guía no agrega
// reglas (ADR-0284). El reparto entre órdenes es el MISMO que hace la base (se muestra antes de guardar). Sin Supabase: lo importan el
// servidor y la hoja.

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_REGISTRAR_GASTO_VIAJE = "registrar_gasto_viaje";
export const RPC_GASTOS_VIAJE_DE_ORDEN = "fn_gastos_viaje_de_orden";
export const RPC_ORDENES_PARA_GASTO = "fn_gastos_viaje_ordenes";

/** La nota del gasto (va en su descripción): lo mismo que acepta la base. */
export const MAX_NOTA_GASTO_VIAJE = 200;
export const MAX_SERIE_GASTO_VIAJE = 40;

export type TipoGastoViaje = "mercaderia" | "viaje";
export type ConceptoGastoViaje = "flete" | "agencia" | "cargador" | "embalaje" | "pasaje" | "hotel" | "comida" | "taxi" | "otro";
export type PapelGastoViaje = "boleta" | "factura" | "ticket" | "planilla_movilidad";
export type MedioGastoViaje = "efectivo" | "yape" | "plin" | "transferencia";

/** «Para traer la mercadería» va a la línea de fletes (609); «Del viaje», a gastos de operación (631). */
export const TIPOS_GASTO_VIAJE: readonly { valor: TipoGastoViaje; texto: string }[] = [
  { valor: "mercaderia", texto: "Para traer la mercadería" },
  { valor: "viaje", texto: "Del viaje" },
];

export const CONCEPTOS_DE: Record<TipoGastoViaje, readonly { valor: ConceptoGastoViaje; texto: string }[]> = {
  mercaderia: [
    { valor: "flete", texto: "Flete" },
    { valor: "agencia", texto: "Agencia" },
    { valor: "cargador", texto: "Cargador" },
    { valor: "embalaje", texto: "Embalaje" },
    { valor: "otro", texto: "Otro" },
  ],
  viaje: [
    { valor: "pasaje", texto: "Pasaje" },
    { valor: "hotel", texto: "Hotel" },
    { valor: "comida", texto: "Comida" },
    { valor: "taxi", texto: "Taxi" },
    { valor: "otro", texto: "Otro" },
  ],
};

export const TEXTO_CONCEPTO: Record<ConceptoGastoViaje, string> = {
  flete: "Flete",
  agencia: "Agencia",
  cargador: "Cargador",
  embalaje: "Embalaje",
  pasaje: "Pasaje",
  hotel: "Hotel",
  comida: "Comida",
  taxi: "Taxi",
  otro: "Otro",
};

export const TEXTO_PAPEL: Record<PapelGastoViaje, string> = {
  boleta: "Boleta",
  factura: "Factura",
  ticket: "Ticket o boleto",
  planilla_movilidad: "Sin comprobante",
};

/** Decisión 55: sin comprobante (planilla de movilidad) solo taxi y cargador. */
export const sinComprobantePermitido = (concepto: ConceptoGastoViaje | "") => concepto === "taxi" || concepto === "cargador";

/** Los papeles que se pueden elegir con ese concepto: «Sin comprobante» solo con taxi o cargador. */
export function papelesPara(concepto: ConceptoGastoViaje | ""): readonly PapelGastoViaje[] {
  return sinComprobantePermitido(concepto) ? ["boleta", "factura", "ticket", "planilla_movilidad"] : ["boleta", "factura", "ticket"];
}

/** Con qué se pagó. La tarjeta de crédito de CAYLA no entra aquí: un gasto con tarjeta va por Finanzas ▸ Gastos. */
export const MEDIOS_GASTO_VIAJE: readonly { valor: MedioGastoViaje; texto: string }[] = [
  { valor: "efectivo", texto: "Efectivo" },
  { valor: "yape", texto: "Yape" },
  { valor: "plin", texto: "Plin" },
  { valor: "transferencia", texto: "Transferencia" },
];

// ---------- Leer lo que manda la base ----------

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const filas = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? data.filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null) : [];

/** Una orden que se puede elegir en la hoja (`fn_gastos_viaje_ordenes`). */
export type OrdenParaGasto = { id: string; numero: string; proveedor: string; destino: string | null; total: number; fechaEmision: string | null };

export function leerOrdenesParaGasto(data: unknown): OrdenParaGasto[] {
  return filas(data).flatMap((f) => {
    const id = texto(f.id);
    if (!id) return [];
    return [
      {
        id,
        numero: texto(f.numero) ?? "OC",
        proveedor: texto(f.proveedor) ?? "Sin proveedor",
        destino: texto(f.destino),
        total: numero(f.total) ?? 0,
        fechaEmision: texto(f.fecha_emision),
      },
    ];
  });
}

/** Un gasto que costó traer una orden (`fn_gastos_viaje_de_orden`): lo que le tocó a ESTA orden y el total del gasto. */
export type GastoDeOrden = {
  gastoId: string;
  fecha: string;
  tipo: TipoGastoViaje;
  concepto: ConceptoGastoViaje;
  papel: PapelGastoViaje;
  descripcion: string;
  monto: number;
  montoTotal: number;
  ordenes: number;
  cuenta: string | null;
  deFondo: boolean;
  registradoPor: string | null;
  /** Lo que la base dice no deducible de este gasto (fase 6 · actividad 6; `fn_no_deducibles`): lo pone `getGastosDeOrden`. */
  noDeducible?: NoDeducible | null;
};

const TIPOS = new Set<string>(["mercaderia", "viaje"]);
const CONCEPTOS = new Set<string>(Object.keys(TEXTO_CONCEPTO));
const PAPELES = new Set<string>(Object.keys(TEXTO_PAPEL));

export function leerGastosDeOrden(data: unknown): GastoDeOrden[] {
  return filas(data).flatMap((f): GastoDeOrden[] => {
    const gastoId = texto(f.gasto_id);
    const fecha = texto(f.fecha);
    const monto = numero(f.monto);
    if (!gastoId || !fecha || monto == null || !TIPOS.has(String(f.tipo)) || !CONCEPTOS.has(String(f.concepto)) || !PAPELES.has(String(f.papel))) return [];
    return [
      {
        gastoId,
        fecha,
        tipo: f.tipo as TipoGastoViaje,
        concepto: f.concepto as ConceptoGastoViaje,
        papel: f.papel as PapelGastoViaje,
        descripcion: texto(f.descripcion) ?? TEXTO_CONCEPTO[f.concepto as ConceptoGastoViaje],
        monto,
        montoTotal: numero(f.monto_total) ?? monto,
        ordenes: numero(f.ordenes) ?? 1,
        cuenta: texto(f.cuenta_nombre),
        deFondo: f.de_fondo === true,
        registradoPor: texto(f.registrado_por_nombre),
      },
    ];
  });
}

/** Lo que costó traer la orden: la suma de lo que le tocó de cada gasto. */
export const traerlaCosto = (gastos: readonly GastoDeOrden[]) => Math.round(gastos.reduce((a, g) => a + g.monto, 0) * 100) / 100;

// ---------- El reparto entre órdenes (el mismo que la base) ----------

/**
 * Cómo se reparte un gasto entre varias órdenes: según el total de cada una, a céntimos (hacia abajo), y lo que sobra del redondeo va
 * a la de mayor total. Sin total en ninguna, en partes iguales. Una parte que se queda en cero no se anota. El mismo orden que la base:
 * de menor a mayor total (y por número), la última se lleva el resto.
 */
export function repartirGasto(monto: number, ordenes: readonly Pick<OrdenParaGasto, "id" | "numero" | "total">[]): { id: string; monto: number }[] {
  const centimos = Math.round(monto * 100);
  if (ordenes.length === 0 || centimos <= 0) return [];
  const numeroDe = (n: string) => Number(n.replace(/\D/g, "")) || 0;
  const orden = [...ordenes].sort((a, b) => a.total - b.total || numeroDe(a.numero) - numeroDe(b.numero));
  const total = orden.reduce((a, o) => a + Math.round(o.total * 100), 0);
  let resto = centimos;
  const partes: { id: string; monto: number }[] = [];
  orden.forEach((o, i) => {
    const parte =
      i === orden.length - 1
        ? resto
        : total > 0
          ? Math.floor((centimos * Math.round(o.total * 100)) / total)
          : Math.floor(centimos / orden.length);
    if (parte > 0) {
      partes.push({ id: o.id, monto: parte / 100 });
      resto -= parte;
    }
  });
  return partes;
}

// ---------- Lo que falta (las mismas reglas que la base) ----------

export type ValoresGastoViaje = {
  tipo: TipoGastoViaje | "";
  concepto: ConceptoGastoViaje | "";
  monto: string;
  fecha: string;
  papel: PapelGastoViaje | "";
  serieNumero: string;
  ruc: string;
  nota: string;
  medio: MedioGastoViaje | "";
  /** La cuenta que va (la elegida o la propuesta): nula si no hay ninguna. */
  cuentaId: string | null;
  /** Las órdenes del gasto: al menos una (decisión 75). */
  ordenes: readonly string[];
};

export function problemaDeTipo(v: ValoresGastoViaje): string | null {
  return v.tipo ? null : "Di si es para traer la mercadería o del viaje.";
}
export function problemaDeConcepto(v: ValoresGastoViaje): string | null {
  if (!v.tipo) return "Primero di para qué fue.";
  return v.concepto && CONCEPTOS_DE[v.tipo].some((c) => c.valor === v.concepto) ? null : "Elige qué se pagó.";
}
export function problemaDeMontoGasto(textoMonto: string): string | null {
  const m = leerMontoPlata(textoMonto);
  if (m == null) return textoMonto.trim() ? MONTO_ILEGIBLE : "Escribe cuánto costó.";
  if (m <= 0) return "El monto tiene que ser mayor que cero.";
  return null;
}
export function problemaDeFecha(fecha: string, hoy: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "Di cuándo se pagó.";
  return fecha > hoy ? "La fecha del gasto no puede ser futura." : null;
}
export function problemaDePapel(v: ValoresGastoViaje): string | null {
  if (!v.papel) return "Di qué papel te dieron.";
  if (v.papel === "planilla_movilidad" && !sinComprobantePermitido(v.concepto)) {
    return "Sin comprobante solo se acepta taxi o cargador: lo demás necesita su boleta, factura o ticket.";
  }
  return null;
}
export function problemaDeNota(v: ValoresGastoViaje): string | null {
  const t = v.nota.trim();
  if (v.concepto === "otro" && t === "") return "Con «Otro», escribe qué se pagó.";
  if (t.length > MAX_NOTA_GASTO_VIAJE) return `Es muy larga (máximo ${MAX_NOTA_GASTO_VIAJE} letras).`;
  return null;
}
export function problemaDeSerie(v: ValoresGastoViaje): string | null {
  return v.serieNumero.trim().length > MAX_SERIE_GASTO_VIAJE ? `Es muy largo (máximo ${MAX_SERIE_GASTO_VIAJE} letras).` : null;
}
export function problemaDeRuc(v: ValoresGastoViaje): string | null {
  const r = v.ruc.trim();
  return r === "" || /^\d{11}$/.test(r) ? null : "El RUC tiene 11 números.";
}
/** Decisión 75 (Felipe 2026-10-14): un gasto del viaje va siempre al menos a una orden. La base lo frena igual (20261014170000). */
export function problemaDeOrdenes(v: Pick<ValoresGastoViaje, "ordenes">): string | null {
  return v.ordenes.length > 0 ? null : "Elige la orden de este gasto.";
}

type Responsable = { esPersona: boolean; listo: boolean; motivo: string | null };

/**
 * Los campos de la hoja, en su orden. La serie, el RUC y la nota (salvo con «Otro») son opcionales: no cuentan como «falta». La orden
 * sí: al menos una (decisión 75). Con una FACTURA, el RUC es «sugerido» (fase 6 · actividad 8): sin él su IGV no se descuenta, pero no
 * frena el registro.
 */
export function camposGastoViaje(v: ValoresGastoViaje, hoy: string, r: Responsable): CampoDeGuia[] {
  const tipo = problemaDeTipo(v);
  const concepto = problemaDeConcepto(v);
  const monto = problemaDeMontoGasto(v.monto);
  const fecha = problemaDeFecha(v.fecha, hoy);
  const papel = problemaDePapel(v);
  const nota = problemaDeNota(v);
  const serie = problemaDeSerie(v);
  const ruc = problemaDeRuc(v);
  const ordenes = problemaDeOrdenes(v);
  const conPapel = v.papel !== "" && v.papel !== "planilla_movilidad";
  return [
    { id: "tipo", nombre: "Para qué fue", requerido: true, hecho: tipo === null, pendiente: tipo ?? "" },
    { id: "concepto", nombre: "Qué se pagó", requerido: true, hecho: concepto === null, pendiente: concepto ?? "" },
    { id: "monto", nombre: "Cuánto", requerido: true, hecho: monto === null, pendiente: monto ?? "" },
    { id: "fecha", nombre: "Cuándo", requerido: true, hecho: fecha === null, pendiente: fecha ?? "" },
    { id: "papel", nombre: "Qué papel te dieron", requerido: true, hecho: papel === null, pendiente: papel ?? "" },
    ...(conPapel
      ? [
          { id: "serie", nombre: "Serie y número", requerido: serie !== null, hecho: v.serieNumero.trim() !== "" && serie === null, pendiente: serie ?? "" },
          {
            id: "ruc",
            nombre: "RUC",
            requerido: ruc !== null,
            sugerido: v.papel === "factura",
            hecho: v.ruc.trim() !== "" && ruc === null,
            pendiente: ruc ?? (v.papel === "factura" ? "Escribe el RUC: con él, su IGV se descuenta." : ""),
          },
        ]
      : []),
    { id: "ordenes", nombre: "De qué orden", requerido: true, hecho: ordenes === null, pendiente: ordenes ?? "" },
    {
      id: "nota",
      nombre: v.concepto === "otro" ? "Qué se pagó" : "Nota",
      requerido: nota !== null,
      hecho: v.nota.trim() !== "" && nota === null,
      pendiente: nota ?? "",
    },
    { id: "cuenta", nombre: "De dónde salió", requerido: true, hecho: Boolean(v.medio) && v.cuentaId !== null, pendiente: v.medio ? "Elige de dónde salió la plata." : "Di cómo se pagó." },
    ...(r.esPersona ? [] : [{ id: "responsable", nombre: "Quién lo registra", requerido: true, hecho: r.listo, pendiente: r.motivo ?? "Elige quién lo registra." }]),
  ];
}

// ---------- Textos ----------

/**
 * La línea bajo «¿Qué papel te dieron?» (fase 6 · actividad 8). Una FACTURA con el RUC de quien la dio separa su IGV y CAYLA lo descuenta
 * de sus impuestos (`registrar_gasto_viaje`, 20261014153000, con la tasa de la fecha; aquí se anticipa con la de hoy, como en Finanzas ▸
 * Gastos); sin el RUC, no. Si es de S/ 2 000 o más y no se paga por el banco, ese IGV se pierde (`igvSePierde`: el mismo aviso de lo no
 * deducible de la hoja), y esta línea no promete lo contrario.
 */
export function pistaDelPapel(v: Pick<ValoresGastoViaje, "papel" | "ruc">, monto: number | null, igvSePierde: boolean): string {
  if (v.papel === "planilla_movilidad") return "Va en la planilla de movilidad: sin boleta, solo taxi y cargador.";
  if (v.papel !== "factura") return "Sin comprobante solo se acepta taxi o cargador (planilla de movilidad).";
  if (!/^\d{11}$/.test(v.ruc.trim())) return "Con el RUC de quien te la dio, su IGV se descuenta de los impuestos.";
  if (igvSePierde) return "Es de S/ 2,000 o más y no se paga por el banco: su IGV no se descuenta.";
  return monto != null && monto > 0 ? `Su IGV (${soles(igvDeFactura(monto))}) se descuenta de los impuestos.` : "Su IGV se descuenta de los impuestos.";
}

/** Lo que dice el botón de la hoja: «Registrar gasto de S/ 60.00». */
export function fraseRegistrarGasto(monto: number | null): string {
  return monto != null && monto > 0 ? `Registrar gasto de ${soles(monto)}` : "Registrar gasto";
}

/** Cómo se lee una orden en la lista de la hoja: «OC-002788 · Textiles Andina SAC · S/ 300.00». */
export const etiquetaOrdenParaGasto = (o: OrdenParaGasto) => `${o.numero} · ${o.proveedor} · ${soles(o.total)}`;

// ---------- Las órdenes del gasto (Felipe 2026-10-14) ----------

/** Una orden que se puede sumar, como la pide el combo con buscador: «OC-002788 · Textiles Andina SAC», su total al lado, y la sede a
 *  la que va como otra palabra que la encuentra (tipear «Trujillo» trae las que van allá). */
export type OrdenParaAgregar = { valor: string; texto: string; detalle: string; claves?: string[] };

/**
 * La hoja muestra solo las órdenes elegidas (al abrirla desde una orden, esa) y las demás se suman con «+ Agregar otra orden»: así no
 * carga una lista larga que casi nunca se usa (Felipe 2026-10-14). Estas son las que se pueden sumar: las no elegidas, en el mismo
 * orden de la lista (la más reciente primero).
 */
export function ordenesParaAgregar(ordenes: readonly OrdenParaGasto[], elegidas: readonly string[]): OrdenParaAgregar[] {
  return ordenes
    .filter((o) => !elegidas.includes(o.id))
    .map((o) => ({ valor: o.id, texto: `${o.numero} · ${o.proveedor}`, detalle: soles(o.total), ...(o.destino ? { claves: [o.destino] } : {}) }));
}

/** Las órdenes elegidas, en el orden en que se eligieron (la de la hoja primero). Una que todavía no llegó de la base no se dibuja. */
export function ordenesElegidas(ordenes: readonly OrdenParaGasto[], elegidas: readonly string[]): OrdenParaGasto[] {
  return elegidas.flatMap((id) => ordenes.filter((o) => o.id === id).slice(0, 1));
}
