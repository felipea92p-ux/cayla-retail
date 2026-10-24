import { soles } from "./compras-reglas";
import { TIPOS_PAPEL, type MedioPagoCompra, type TipoPapel } from "./compra-rapida-reglas";
import { campoResponsable, primerNombre, problemaDeMonto, type CuentaOpcion } from "./fondos-reglas";
import { CONCEPTOS_GASTO, MEDIOS_PLATA, nombreGasto, type ConceptoGasto, type PlataPorConfirmar } from "./mi-plata-reglas";
import { diaMes } from "./fechas-lima";
import type { CampoDeGuia } from "./guia-campos";

// Compras simple (ADR-0480, actividad 7): «Revisar compras» ▸ los papeles que llegaron a la tienda y los cierres del día. Las reglas
// puras: leer lo que manda `fn_revisar_compras` (que puede venir vieja o rota: nunca se cae, descarta lo ilegible), decir si la compra
// cuadra (la plata del papel contra lo que anotó la compradora, y lo que llegó contra lo que se mandó) y qué falta en cada hoja: lo MISMO
// que rechazan `completar_papel_compra` y `recibir_cierre_compras` (20261023143000). La guía no agrega reglas (ADR-0284).

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_REVISAR_COMPRAS = "fn_revisar_compras";
export const RPC_COMPLETAR_PAPEL = "completar_papel_compra";
export const RPC_RECIBIR_CIERRE = "recibir_cierre_compras";
export const RPC_REVISAR_GASTO = "revisar_gasto_compra";

/** Por qué faltó una prenda, como lo dijo la tienda al recibir. Compras lo ve; no lo vuelve a decidir. */
export type CausaFaltante = "no_vino" | "se_perdio" | "otra_sede" | "devuelta";
export const CAUSAS_FALTANTE: Record<CausaFaltante, string> = {
  no_vino: "no vino: está en «Nos debe» del proveedor",
  se_perdio: "se perdió: lo asume CAYLA",
  otra_sede: "llegó a otra sede",
  devuelta: "llegó dañada y se devolvió al proveedor",
};

export type LineaPapel = {
  id: string;
  nombre: string;
  cantidad: number;
  costo: number;
  subtotal: number;
  destino: string;
  mandadas: number;
  faltan: { cantidad: number; causa: CausaFaltante }[];
  sobran: number;
};

export type EnvioPapel = { id: string; numero: number; estado: "en_camino" | "abierto" | "cerrado" };

export type PapelPorCompletar = {
  id: string;
  personaId: string;
  persona: string;
  esMia: boolean;
  proveedorId: string;
  proveedor: string;
  tipo: TipoPapel;
  monto: number;
  /** Lo que la compradora le pagó al proveedor de su plata (20261023181000) y con qué; lo que falta lo paga Compras desde Por pagar. */
  pagado: number;
  medioPago: string | null;
  fotoRuta: string | null;
  fecha: string;
  /** La ronda de compras en la que se anotó (20261023183000): «RC-000003». Lo de antes de las rondas, sin ronda. */
  ronda: string | null;
  lineas: LineaPapel[];
  envios: EnvioPapel[];
  llego: boolean;
};

export type CierrePorRecibir = {
  id: string;
  personaId: string;
  persona: string;
  esMia: boolean;
  fecha: string;
  /** La ronda de compras en la que se anotó (20261023183000): «RC-000003». Lo de antes de las rondas, sin ronda. */
  ronda: string | null;
  decision: "devuelve" | "le_deben";
  monto: number;
  plataPorConfirmar: number;
  /** La tienda de quien compró (su ficha de colaborador, 20261023210000); un líder sin tienda, ninguna. */
  tienda: string | null;
  /** Lo que pasó en su ronda (20261023210000). Un cierre de antes de las rondas no lo trae. */
  cuaderno: CuadernoRonda | null;
};

/** Lo que pasó en una ronda de compras (`fn_ronda_compras_cuenta`): le dieron, compró (lo pagado de su plata), gastó. */
export type CuadernoRonda = { dieron: number; compras: number; compraste: number; gastos: number; gastaste: number; prendas: number };

/** Una ronda que sigue abierta: quién está comprando ahora, desde cuándo y cuánto lleva (diseño A, «Rondas abiertas»). */
export type RondaAbiertaRevisar = { id: string; texto: string; personaId: string; persona: string; tienda: string | null; abiertaEn: string; cuenta: CuadernoRonda };

export type ProveedorOpcion = { id: string; nombre: string; ruc: string | null };

/** Un gasto que no es ropa («Gasté en otra cosa»), esperando que Compras lo pase a los gastos del viaje. */
export type GastoPorRevisar = {
  id: string;
  personaId: string;
  persona: string;
  esMia: boolean;
  concepto: ConceptoGasto;
  nota: string | null;
  monto: number;
  fotoRuta: string | null;
  fecha: string;
  /** La ronda de compras en la que se anotó (20261023183000): «RC-000003». Lo de antes de las rondas, sin ronda. */
  ronda: string | null;
  /** Sin ninguna compra de quien gastó, la base no lo deja pasar: un gasto del viaje va siempre a una compra (decisión 75). */
  tieneCompra: boolean;
};

export type RevisarCompras = {
  papeles: PapelPorCompletar[];
  gastos: GastoPorRevisar[];
  cierres: CierrePorRecibir[];
  proveedores: ProveedorOpcion[];
  rondasAbiertas: RondaAbiertaRevisar[];
};

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const objeto = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const esTipo = (v: unknown): v is TipoPapel => typeof v === "string" && v in TIPOS_PAPEL;
const esCausa = (v: unknown): v is CausaFaltante => typeof v === "string" && v in CAUSAS_FALTANTE;
const esConcepto = (v: unknown): v is ConceptoGasto => typeof v === "string" && v in CONCEPTOS_GASTO;
const ESTADOS_ENVIO = ["en_camino", "abierto", "cerrado"] as const;

function leerLinea(x: unknown): LineaPapel | null {
  const o = objeto(x);
  const id = texto(o?.id);
  const cantidad = numero(o?.cantidad);
  const costo = numero(o?.costo);
  if (!o || !id || cantidad == null || costo == null) return null;
  return {
    id,
    nombre: texto(o.nombre) ?? "Prenda",
    cantidad,
    costo,
    subtotal: numero(o.subtotal) ?? cantidad * costo,
    destino: texto(o.destino) ?? "la tienda",
    mandadas: numero(o.mandadas) ?? 0,
    faltan: lista(o.faltan).flatMap((f) => {
      const fo = objeto(f);
      const n = numero(fo?.cantidad);
      return fo && n != null && n > 0 && esCausa(fo.causa) ? [{ cantidad: n, causa: fo.causa }] : [];
    }),
    sobran: numero(o.sobran) ?? 0,
  };
}

function leerPapel(x: unknown): PapelPorCompletar | null {
  const o = objeto(x);
  const id = texto(o?.id);
  const monto = numero(o?.monto);
  if (!o || !id || monto == null || !esTipo(o.tipo) || !texto(o.proveedor_id)) return null;
  return {
    id,
    personaId: texto(o.persona_id) ?? "",
    persona: texto(o.persona) ?? "Alguien de Compras",
    esMia: o.es_mia === true,
    proveedorId: texto(o.proveedor_id)!,
    proveedor: texto(o.proveedor) ?? "Proveedor",
    tipo: o.tipo,
    monto,
    pagado: numero(o.pagado) ?? monto,
    medioPago: texto(o.medio_pago),
    fotoRuta: texto(o.foto_ruta),
    fecha: texto(o.fecha) ?? "",
    ronda: texto(o.ronda),
    lineas: lista(o.lineas).map(leerLinea).filter((l): l is LineaPapel => l !== null),
    envios: lista(o.envios).flatMap((e) => {
      const eo = objeto(e);
      const eid = texto(eo?.id);
      const n = numero(eo?.numero);
      const estado = ESTADOS_ENVIO.find((s) => s === eo?.estado);
      return eid && n != null && estado ? [{ id: eid, numero: n, estado }] : [];
    }),
    llego: o.llego === true,
  };
}

// Con qué le pagó, como se dice en la tienda: «con Yape», «en efectivo», «con transferencia».
const MEDIO_EN_FRASE: Record<MedioPagoCompra, string> = { yape: "con Yape", efectivo: "en efectivo", transferencia: "con transferencia" };

/** El bloque «Pagó» del detalle (diseño A, 2026-10-23): qué pagó la compradora, qué le toca a Compras y qué parte del papel ya está pagada. */
export type PagoPapel = { titulo: string; detalle: string; fraccion: number };

/**
 * Cómo se le pagó al proveedor (20261023181000): lo que pagó la compradora y con qué, y lo que le toca a Compras. Al completar el papel,
 * lo que falta queda como deuda en Por pagar (con vencimiento a 7 días, provisional).
 */
export function pagoPapel(p: Pick<PapelPorCompletar, "monto" | "pagado" | "medioPago">): PagoPapel {
  const medio = p.medioPago && p.medioPago in MEDIO_EN_FRASE ? ` ${MEDIO_EN_FRASE[p.medioPago as MedioPagoCompra]}` : "";
  const falta = Math.round((p.monto - p.pagado) * 100) / 100;
  if (p.pagado <= 0) return { titulo: "No le pagó al proveedor", detalle: `Compras paga ${soles(p.monto)} desde Por pagar`, fraccion: 0 };
  if (falta < 0.005) return { titulo: `Pagó todo${medio}`, detalle: "Compras no paga nada", fraccion: 1 };
  return { titulo: `Pagó ${soles(p.pagado)}${medio}`, detalle: `Compras paga ${soles(falta)} desde Por pagar`, fraccion: p.monto > 0 ? p.pagado / p.monto : 0 };
}

function leerGasto(x: unknown): GastoPorRevisar | null {
  const o = objeto(x);
  const id = texto(o?.id);
  const monto = numero(o?.monto);
  if (!o || !id || monto == null || !esConcepto(o.concepto)) return null;
  return {
    id,
    personaId: texto(o.persona_id) ?? "",
    persona: texto(o.persona) ?? "Alguien de Compras",
    esMia: o.es_mia === true,
    concepto: o.concepto,
    nota: texto(o.nota),
    monto,
    fotoRuta: texto(o.foto_ruta),
    fecha: texto(o.fecha) ?? "",
    ronda: texto(o.ronda),
    tieneCompra: o.tiene_compra !== false,
  };
}

function leerCierre(x: unknown): CierrePorRecibir | null {
  const o = objeto(x);
  const id = texto(o?.id);
  const monto = numero(o?.monto);
  if (!o || !id || monto == null || (o.decision !== "devuelve" && o.decision !== "le_deben")) return null;
  return {
    id,
    personaId: texto(o.persona_id) ?? "",
    persona: texto(o.persona) ?? "Alguien de Compras",
    esMia: o.es_mia === true,
    fecha: texto(o.fecha) ?? "",
    ronda: texto(o.ronda),
    decision: o.decision,
    monto,
    plataPorConfirmar: numero(o.plata_por_confirmar) ?? 0,
    tienda: texto(o.tienda),
    cuaderno: leerCuaderno(o.cuaderno),
  };
}

function leerCuaderno(x: unknown): CuadernoRonda | null {
  const o = objeto(x);
  if (!o) return null;
  const n = (v: unknown) => numero(v) ?? 0;
  const entero = (v: unknown) => Math.max(0, Math.trunc(n(v)));
  return { dieron: n(o.dieron), compras: entero(o.compras), compraste: n(o.compraste), gastos: entero(o.gastos), gastaste: n(o.gastaste), prendas: entero(o.prendas) };
}

function leerRondaAbierta(x: unknown): RondaAbiertaRevisar | null {
  const o = objeto(x);
  const id = texto(o?.id);
  if (!o || !id) return null;
  return {
    id,
    texto: texto(o.texto) ?? "Ronda",
    personaId: texto(o.persona_id) ?? "",
    persona: texto(o.persona) ?? "Alguien de Compras",
    tienda: texto(o.tienda),
    abiertaEn: texto(o.abierta_en) ?? "",
    cuenta: leerCuaderno(o.cuenta) ?? { dieron: 0, compras: 0, compraste: 0, gastos: 0, gastaste: 0, prendas: 0 },
  };
}

/** Un renglón del cuaderno de una ronda cerrada. */
export type RenglonCuaderno = { clave: "antes" | "dieron" | "compro" | "gasto"; titulo: string; detalle: string | null; monto: number; signo: "+" | "-" };

/**
 * El cuaderno de una ronda cerrada: lo que tenía al abrirla (se despeja del final, así la cuenta siempre cierra), le dieron, compró y gastó.
 * El renglón final (devuelve o le debemos) lo dibuja la pantalla aparte, en grande. Sin cuaderno, ninguno.
 */
export function renglonesCuaderno(c: Pick<CierrePorRecibir, "cuaderno" | "decision" | "monto">): RenglonCuaderno[] {
  const k = c.cuaderno;
  if (!k) return [];
  const final = c.decision === "devuelve" ? c.monto : -c.monto;
  const antes = Math.round((final - k.dieron + k.compraste + k.gastaste) * 100) / 100;
  const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
  const r: RenglonCuaderno[] = [];
  if (Math.abs(antes) >= 0.005) r.push({ clave: "antes", titulo: antes > 0 ? "Tenía al abrirla" : "Debía al abrirla", detalle: null, monto: Math.abs(antes), signo: antes > 0 ? "+" : "-" });
  r.push({ clave: "dieron", titulo: "Le dieron", detalle: null, monto: k.dieron, signo: "+" });
  r.push({ clave: "compro", titulo: "Compró", detalle: k.compras > 0 ? plural(k.compras, "compra", "compras") : null, monto: k.compraste, signo: "-" });
  r.push({ clave: "gasto", titulo: "Gastó", detalle: k.gastos > 0 ? plural(k.gastos, "gasto", "gastos") : null, monto: k.gastaste, signo: "-" });
  return r;
}

/** Bajo una ronda abierta: «3 compras · 47 prendas» (o «Todavía sin compras»). */
export function detalleRondaAbierta(c: Pick<CuadernoRonda, "compras" | "prendas">): string {
  if (c.compras === 0) return "Todavía sin compras";
  const compras = c.compras === 1 ? "1 compra" : `${c.compras} compras`;
  return c.prendas > 0 ? `${compras} · ${c.prendas === 1 ? "1 prenda" : `${c.prendas} prendas`}` : compras;
}

/** Lo que tiene por cerrar cada persona en «Quién tiene plata»: lo que devuelve o lo que le debemos al cerrar su ronda. */
export function porRecibirDe(cierres: readonly Pick<CierrePorRecibir, "personaId" | "decision" | "monto">[], personaId: string): { decision: "devuelve" | "le_deben"; monto: number } | null {
  const suyos = cierres.filter((c) => c.personaId === personaId);
  if (suyos.length === 0) return null;
  const neto = suyos.reduce((s, c) => s + (c.decision === "devuelve" ? c.monto : -c.monto), 0);
  if (Math.abs(neto) < 0.005) return null;
  return { decision: neto > 0 ? "devuelve" : "le_deben", monto: Math.round(Math.abs(neto) * 100) / 100 };
}

/** Lo que manda `fn_revisar_compras`. `null` si no es lo que se espera (la base vieja, una respuesta rota). */
export function leerRevisarCompras(data: unknown): RevisarCompras | null {
  const o = objeto(data);
  if (!o || !Array.isArray(o.papeles) || !Array.isArray(o.cierres)) return null;
  return {
    papeles: o.papeles.map(leerPapel).filter((p): p is PapelPorCompletar => p !== null),
    gastos: lista(o.gastos).map(leerGasto).filter((g): g is GastoPorRevisar => g !== null),
    cierres: o.cierres.map(leerCierre).filter((c): c is CierrePorRecibir => c !== null),
    proveedores: lista(o.proveedores).flatMap((p) => {
      const po = objeto(p);
      const pid = texto(po?.id);
      const nombre = texto(po?.nombre);
      return pid && nombre ? [{ id: pid, nombre, ruc: texto(po?.ruc) }] : [];
    }),
    rondasAbiertas: lista(o.rondas_abiertas).map(leerRondaAbierta).filter((r): r is RondaAbiertaRevisar => r !== null),
  };
}

// ---------- ¿Cuadra? ----------

/**
 * Los cuatro casos de la maqueta: la plata (lo que dice el papel contra lo que suman las prendas anotadas) y las prendas (lo que se mandó
 * contra lo que contó la tienda).
 */
export type CasoPapel = "cuadra" | "plata" | "faltan" | "nada";

export type Veredicto = {
  caso: CasoPapel;
  /** Lo que suman las prendas como las anotó la compradora. */
  anotado: number;
  /** Lo que dice el papel (o lo que corrige Compras). */
  pagado: number;
  unidades: number;
  faltan: number;
};

const CENTAVO = 0.005;

export function veredictoPapel(p: Pick<PapelPorCompletar, "monto" | "lineas">, monto: number = p.monto): Veredicto {
  const anotado = Math.round(p.lineas.reduce((a, l) => a + l.subtotal, 0) * 100) / 100;
  const unidades = p.lineas.reduce((a, l) => a + l.cantidad, 0);
  const faltan = p.lineas.reduce((a, l) => a + l.faltan.reduce((b, f) => b + f.cantidad, 0), 0);
  const plataCuadra = Math.abs(monto - anotado) < CENTAVO;
  const caso: CasoPapel = plataCuadra ? (faltan > 0 ? "faltan" : "cuadra") : faltan > 0 ? "nada" : "plata";
  return { caso, anotado, pagado: monto, unidades, faltan };
}

/** Si la plata no cuadra, manda el papel (Felipe 2026-10-23): el comprobante queda por lo que dice, y una factura con su IGV. */
export function notaNoCuadra(tipo: TipoPapel): string {
  return `Queda por lo del papel${tipo === "factura" ? ", con su IGV" : ""}`;
}

/** Arriba del detalle, en versalitas: el papel y su ronda («Boleta · RC-000012»). */
export function sobrePapel(p: Pick<PapelPorCompletar, "tipo" | "ronda">): string {
  return [TIPOS_PAPEL[p.tipo].nombre, p.ronda].filter(Boolean).join(" · ");
}

/** Bajo el proveedor: quién, cuándo y cuántas prendas («Marisol Rojas · 23/10 · 12 prendas»). */
export function subtituloPapel(p: Pick<PapelPorCompletar, "persona" | "fecha" | "lineas">): string {
  const prendas = p.lineas.reduce((a, l) => a + l.cantidad, 0);
  return [p.persona, p.fecha ? diaMes(p.fecha) : null, prendas === 1 ? "1 prenda" : `${prendas} prendas`].filter(Boolean).join(" · ");
}

/** A qué tienda iban las prendas, sin repetir: «Tienda Lima», «Tienda Lima · Tienda AQP». */
export function destinosDePapel(p: Pick<PapelPorCompletar, "lineas">): string {
  return [...new Set(p.lineas.map((l) => l.destino))].join(" · ");
}

/** Dónde está una compra que todavía no se completa: falta mandarla, va en camino o la tienda la está contando. */
export function textoLlegada(p: Pick<PapelPorCompletar, "llego" | "lineas" | "envios">): string {
  if (p.llego) return "Llegó a la tienda";
  if (p.lineas.some((l) => l.mandadas < l.cantidad)) return "Falta mandarla a la tienda";
  if (p.envios.some((e) => e.estado === "abierto")) return "La tienda la está contando";
  return "En camino a la tienda";
}

/** Qué dijo la tienda de lo que faltó en una línea: «2 no vino: está en «Nos debe» del proveedor». */
export function textoFaltan(l: Pick<LineaPapel, "faltan">): string | null {
  if (l.faltan.length === 0) return null;
  return l.faltan.map((f) => `${f.cantidad} ${CAUSAS_FALTANTE[f.causa]}`).join(" · ");
}

// ---------- Completar el papel: lo que falta (lo mismo que rechaza la base) ----------

/** ¿Este papel pide serie y número? Factura y boleta, sí; nota de venta, solo el número y si lo tiene; sin papel, nada. */
export function pideSerie(tipo: TipoPapel): boolean {
  return tipo === "factura" || tipo === "boleta";
}

export function problemaSerie(serie: string): string | null {
  const s = serie.trim().toUpperCase();
  if (!s) return "Copia la serie como está en el papel.";
  return /^[A-Z0-9]{1,8}$/.test(s) ? null : "La serie lleva letras y números, hasta 8 (F001, B002…).";
}

export function problemaNumero(numeroPapel: string, tipo: TipoPapel): string | null {
  const n = numeroPapel.trim();
  if (tipo === "nota_venta") return !n || /^[0-9A-Za-z-]{1,20}$/.test(n) ? null : "El número lleva letras, números o guiones, hasta 20.";
  if (!n) return "Copia el número como está en el papel.";
  return /^[0-9]{1,12}$/.test(n) ? null : "El número lleva solo números, hasta 12.";
}

/** La serie de ejemplo sigue al papel: «F001» en una factura, «B001» en una boleta (ADR-0290). */
export function ejemploSerie(tipo: TipoPapel): string {
  return tipo === "factura" ? "Ej. F001" : "Ej. B001";
}

type Responsable = { esPersona: boolean; listo: boolean; motivo: string | null };

/** Los campos de «Completar el papel», en el orden de la hoja. El número de una nota de venta es opcional: no cuenta como «falta». */
export function camposCompletar(
  v: { serie: string; numero: string; cambiaMonto: boolean; monto: string },
  tipo: TipoPapel,
  r: Responsable,
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  if (pideSerie(tipo)) {
    const s = problemaSerie(v.serie);
    const n = problemaNumero(v.numero, tipo);
    campos.push({ id: "serie", nombre: "Serie", requerido: true, hecho: s === null, pendiente: s ?? "" });
    campos.push({ id: "numero", nombre: "Número", requerido: true, hecho: n === null, pendiente: n ?? "" });
  } else if (tipo === "nota_venta") {
    const n = problemaNumero(v.numero, tipo);
    campos.push({ id: "numero", nombre: "Número", requerido: n !== null, hecho: n === null && v.numero.trim() !== "", pendiente: n ?? "" });
  }
  if (v.cambiaMonto) {
    const m = problemaDeMonto(v.monto);
    campos.push({ id: "monto", nombre: "Lo que dice el papel", requerido: true, hecho: m === null, pendiente: m ?? "" });
  }
  return [...campos, ...campoResponsable({ ...r, quien: "Quién completa" })];
}

/** El botón del detalle (diseño A, Felipe 2026-10-23): una palabra. Que pasa a los libros lo dice el aviso al guardar. */
export function fraseCompletar(): string {
  return "Completar";
}

// ---------- Los cierres del día ----------

/** El botón del cierre: «Recibir S/ 200.00» o «Pagarle S/ 50.00 a Marisol». */
export function botonCierre(c: Pick<CierrePorRecibir, "decision" | "persona">, monto: number | null): string {
  const cuanto = monto != null && monto > 0 ? ` ${soles(monto)}` : "";
  return c.decision === "devuelve" ? `Recibir${cuanto}` : `Pagarle${cuanto} a ${primerNombre(c.persona)}`;
}

/** Los campos de la hoja del cierre: a dónde vuelve (o de dónde sale) la plata y cuánto. */
export function camposCierre(v: { cuentaId: string; monto: string }, decision: CierrePorRecibir["decision"], cuentas: readonly CuentaOpcion[], r: Responsable): CampoDeGuia[] {
  const m = problemaDeMonto(v.monto);
  return [
    {
      id: "cuenta",
      nombre: decision === "devuelve" ? "A dónde vuelve" : "De dónde sale",
      requerido: true,
      hecho: cuentas.some((c) => c.id === v.cuentaId),
      pendiente: decision === "devuelve" ? "Elige a dónde vuelve la plata." : "Elige de qué cuenta sale la plata.",
    },
    { id: "monto", nombre: "Cuánto", requerido: true, hecho: m === null, pendiente: m ?? "" },
    ...campoResponsable({ ...r, quien: decision === "devuelve" ? "Quién recibe" : "Quién paga" }),
  ];
}

// ---------- Los gastos que no son ropa ----------

/** Qué papel le dieron por un gasto, como lo pide un gasto del viaje. Sin papel, una planilla de movilidad. */
export type PapelGasto = "boleta" | "factura" | "ticket" | "planilla_movilidad";
export const PAPELES_GASTO: Record<PapelGasto, { nombre: string; ayuda: string }> = {
  boleta: { nombre: "Boleta", ayuda: "Con número" },
  factura: { nombre: "Factura", ayuda: "Con RUC: separa el IGV" },
  ticket: { nombre: "Ticket", ayuda: "De una máquina" },
  planilla_movilidad: { nombre: "Sin papel", ayuda: "Va en la planilla de movilidad" },
};

/** Sin papel solo se acepta el taxi y el cargador (decisión 55 de ADR-0362): lo demás necesita su boleta, factura o ticket. */
export function papelesParaGasto(concepto: ConceptoGasto): PapelGasto[] {
  const conPapel: PapelGasto[] = ["boleta", "factura", "ticket"];
  return concepto === "taxi" || concepto === "cargador" ? [...conPapel, "planilla_movilidad"] : conPapel;
}

/** El papel que llega elegido: sin foto, un taxi o un cargador van en la planilla; lo demás lo elige quien revisa mirando la foto. */
export function papelSugerido(g: Pick<GastoPorRevisar, "concepto" | "fotoRuta">): PapelGasto | null {
  return !g.fotoRuta && papelesParaGasto(g.concepto).includes("planilla_movilidad") ? "planilla_movilidad" : null;
}

/** El ejemplo de la serie y el número sigue al papel elegido (ADR-0290): «F001-123» en factura, «B001-123» en boleta. */
export function ejemploSerieNumero(papel: PapelGasto | null): string {
  return papel === "factura" ? "Ej. F001-123" : papel === "boleta" ? "Ej. B001-123" : "Como dice el papel";
}

export function problemaRuc(ruc: string): string | null {
  const r = ruc.trim();
  return !r || /^[0-9]{11}$/.test(r) ? null : "El RUC tiene 11 números.";
}

/** Los campos de «Revisar el gasto»: el papel (obligatorio); la serie y el número y el RUC, opcionales (el RUC separa el IGV). */
export function camposRevisarGasto(
  v: { papel: PapelGasto | null; serieNumero: string; ruc: string },
  concepto: ConceptoGasto,
  r: Responsable,
): CampoDeGuia[] {
  const papelOk = v.papel !== null && papelesParaGasto(concepto).includes(v.papel);
  const conNumero = papelOk && v.papel !== "planilla_movilidad";
  const ruc = problemaRuc(v.ruc);
  return [
    { id: "papel", nombre: "Qué papel le dieron", requerido: true, hecho: papelOk, pendiente: "Elige qué papel le dieron." },
    ...(conNumero
      ? [
          { id: "serie", nombre: "Serie y número", requerido: v.serieNumero.trim().length > 40, hecho: v.serieNumero.trim() !== "" && v.serieNumero.trim().length <= 40, pendiente: "La serie y el número, hasta 40 letras." },
          { id: "ruc", nombre: "RUC", requerido: ruc !== null, sugerido: v.papel === "factura", hecho: v.ruc.trim() !== "" && ruc === null, pendiente: ruc ?? "Con el RUC de la factura se separa el IGV." },
        ]
      : []),
    ...campoResponsable({ ...r, quien: "Quién revisa" }),
  ];
}

// ---------- La bandeja de «Revisar compras» (rediseño, maqueta compras-formidable-2026-10, Felipe 2026-10-23) ----------
// Cuatro cifras arriba que filtran y, debajo, la lista de lo que espera (a la izquierda) con el detalle al lado. Lo que dice cada fila y
// cada cifra sale de aquí; qué se guarda sigue siendo lo de cada hoja de antes.

export type TipoBandeja = "plata" | "papel" | "gasto" | "cierre";
export const TIPOS_BANDEJA: readonly TipoBandeja[] = ["plata", "papel", "gasto", "cierre"];

/** Cada cifra: su nombre largo (el de la lista para el lector), el corto de la tarjeta y la cabecera de su lista (diseño A, 2026-10-23). */
export const CIFRA_BANDEJA: Record<TipoBandeja, { nombre: string; corto: string; cabecera: string }> = {
  plata: { nombre: "Plata por confirmar", corto: "Plata", cabecera: "Por confirmar" },
  papel: { nombre: "Compras por completar", corto: "Compras", cabecera: "Por completar" },
  gasto: { nombre: "Gastos por revisar", corto: "Gastos", cabecera: "Por revisar" },
  cierre: { nombre: "Rondas cerradas", corto: "Rondas", cabecera: "Por recibir" },
};

/** El total en soles de una lista de la bandeja (la plata, los papeles, los gastos o lo que devuelven o se les debe en las rondas). */
export function totalBandeja(lista: readonly { monto: number }[]): number {
  return Math.round(lista.reduce((a, x) => a + x.monto, 0) * 100) / 100;
}

/** Una fila de la bandeja: qué es, de quién y cuándo, cuánto y su estado. */
/** Cuándo y en qué ronda: «23/10 · RC-000003» (lo de antes de las rondas, solo el día). */
export function diaYRonda(fecha: string, ronda: string | null): string {
  return [fecha ? diaMes(fecha) : null, ronda].filter(Boolean).join(" · ");
}

export type FilaBandeja = { id: string; titulo: string; quien: string; cuando: string; monto: number; chip: { tono: "ambar" | "verde" | "pizarra"; texto: string } };

/** Lo que llegó a la tienda de una compra ya recibida: «35 de 35». Antes de llegar, nada. */
export function llegadaDePapel(p: Pick<PapelPorCompletar, "llego" | "lineas">): { llegaron: number; total: number; completa: boolean } | null {
  if (!p.llego) return null;
  const total = p.lineas.reduce((a, l) => a + l.cantidad, 0);
  const faltan = p.lineas.reduce((a, l) => a + l.faltan.reduce((b, f) => b + f.cantidad, 0), 0);
  return { llegaron: Math.max(0, total - faltan), total, completa: faltan === 0 };
}

/** El estado de una compra en la lista, corto para que quepa junto al monto: llegó todo, faltaron N, o dónde está. */
export function chipPapel(p: Pick<PapelPorCompletar, "llego" | "lineas" | "envios">): FilaBandeja["chip"] {
  const l = llegadaDePapel(p);
  if (!l) {
    const donde = textoLlegada(p);
    const corto = donde === "Falta mandarla a la tienda" ? "Sin mandar" : donde === "La tienda la está contando" ? "La tienda cuenta" : "En camino";
    return { tono: "pizarra", texto: corto };
  }
  const faltan = l.total - l.llegaron;
  return faltan === 0 ? { tono: "verde", texto: "Llegó todo" } : { tono: "ambar", texto: faltan === 1 ? "Faltó 1" : `Faltaron ${faltan}` };
}

export function filaPlata(f: Pick<PlataPorConfirmar, "id" | "persona" | "medio" | "monto" | "fecha" | "fotoRuta">): FilaBandeja {
  return {
    id: f.id,
    titulo: f.medio === "ya_tenia" ? "Ya tenía de antes" : `${MEDIOS_PLATA[f.medio].nombre}${f.fotoRuta ? " · con foto" : " · sin foto"}`,
    quien: f.persona,
    cuando: f.fecha ? diaMes(f.fecha) : "",
    monto: f.monto,
    chip: { tono: "ambar", texto: "Por confirmar" },
  };
}

export function filaPapel(p: Pick<PapelPorCompletar, "id" | "persona" | "proveedor" | "tipo" | "monto" | "fecha" | "ronda" | "llego" | "lineas" | "envios">): FilaBandeja {
  return {
    id: p.id,
    titulo: `${p.proveedor} · ${TIPOS_PAPEL[p.tipo].nombre}`,
    quien: p.persona,
    cuando: diaYRonda(p.fecha, p.ronda),
    monto: p.monto,
    chip: chipPapel(p),
  };
}

export function filaGasto(g: Pick<GastoPorRevisar, "id" | "persona" | "concepto" | "nota" | "monto" | "fecha" | "ronda" | "fotoRuta">): FilaBandeja {
  return {
    id: g.id,
    titulo: `${nombreGasto(g)} · ${g.fotoRuta ? "con foto" : "sin papel"}`,
    quien: g.persona,
    cuando: diaYRonda(g.fecha, g.ronda),
    monto: g.monto,
    chip: { tono: "ambar", texto: "Por revisar" },
  };
}

export function filaCierre(c: Pick<CierrePorRecibir, "id" | "persona" | "decision" | "monto" | "fecha" | "ronda">): FilaBandeja {
  return {
    id: c.id,
    titulo: c.decision === "devuelve" ? "Devuelve en caja" : "Pagó de su bolsillo",
    quien: c.persona,
    cuando: diaYRonda(c.fecha, c.ronda),
    monto: c.monto,
    chip: c.decision === "devuelve" ? { tono: "pizarra", texto: "Lo devuelve" } : { tono: "ambar", texto: "Le debemos" },
  };
}

/** La lista que se abre al entrar: la primera que tiene algo, en el orden de las cifras. Todo vacío: la de la plata. */
export function bandejaInicial(cuantos: Record<TipoBandeja, number>): TipoBandeja {
  return TIPOS_BANDEJA.find((t) => cuantos[t] > 0) ?? "plata";
}

/** El detalle que se ve: el elegido si sigue en la lista (al guardar, se va); si no, el primero. */
export function elegidoDeBandeja<T extends { id: string }>(lista: readonly T[], id: string | null): T | null {
  return lista.find((x) => x.id === id) ?? lista[0] ?? null;
}

/** Después de «Más tarde»: el que sigue en la lista (al final, el primero). */
export function siguienteDeBandeja<T extends { id: string }>(lista: readonly T[], id: string): string | null {
  if (lista.length === 0) return null;
  const i = lista.findIndex((x) => x.id === id);
  return lista[(i + 1) % lista.length].id;
}
