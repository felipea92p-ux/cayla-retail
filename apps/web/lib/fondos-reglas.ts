import { leerMonto } from "./caja-cierre-reglas";
import { soles } from "./compras-reglas";
import type { CampoDeGuia } from "./guia-campos";
import type { CuentaElegible } from "./cuenta-sellada-reglas";
import type { Opcion } from "../components/ui/campos";
import type { RendicionDeMiFondo } from "./rendicion-reglas";

// Fondos por rendir (ADR-0362, fase 6 · actividad 1): las reglas puras de la pantalla. Leer lo que manda la base (que puede venir de una
// versión vieja o rota: nunca se cae, descarta lo ilegible), sumar las cifras de arriba, armar las opciones de los combos y decir qué
// falta en cada hoja. Lo que falta sale de lo MISMO que rechazan `entregar_fondo`, `devolver_fondo` y `anular_movimiento_fondo`
// (20261013182000): la guía no agrega reglas (ADR-0284). Sin Supabase: lo importan el servidor y las hojas.
// Actividad 2 (20261013212000): «Mi fondo» en los pagos de Compras (`leerMiFondo`, `conMiFondo`) y lo que CAYLA debe en el tablero.
// Actividad 4 (20261013231000): la tarjeta «Tu fondo» de Órdenes de compra y del Inicio (`leerResumenMiFondo`, `caraTuFondo`).
// Actividad 5 (20261013235000): la tarjeta cuenta el ciclo abierto y suma la rendición (`ResumenMiFondo.rendicion`, `rendicion-reglas.ts`).

export const RUTA_FONDOS = "/compras/fondos";
// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_FONDOS = "fn_fondos";
export const RPC_MOVIMIENTOS_FONDOS = "fn_fondos_movimientos";
export const RPC_OPCIONES_FONDOS = "fn_fondos_opciones";
export const RPC_ENTREGAR_FONDO = "entregar_fondo";
export const RPC_DEVOLVER_FONDO = "devolver_fondo";
export const RPC_ANULAR_MOVIMIENTO_FONDO = "anular_movimiento_fondo";
export const RPC_MI_FONDO = "fn_mi_fondo";
export const RPC_MI_FONDO_RESUMEN = "fn_mi_fondo_resumen";

/** El «para qué» de una entrega y la nota de una devolución: lo mismo que acepta `movimientos_dinero.referencia`. */
export const MAX_TEXTO_FONDO = 200;

export type FondoFila = {
  cuentaId: string;
  personaId: string;
  persona: string;
  sede: string | null;
  /** Lo que tiene en la mano hoy (del mismo libro que «Cuentas y dinero»). Negativo = CAYLA le debe (actividad 2). */
  saldo: number;
  entregado: number;
  devuelto: number;
  /** Lo que salió del fondo: le entregaron − devolvió − tiene. Lo llenan los pagos desde el fondo (actividad 2). */
  gastado: number;
  primeraEntrega: string | null;
  ultimaEntrega: string | null;
  ultimoMotivo: string | null;
  esMio: boolean;
};

export type TipoMovimientoFondo = "entrega_fondo" | "devolucion_fondo";

export type MovimientoFondo = {
  id: string;
  tipo: TipoMovimientoFondo;
  fecha: string;
  personaId: string;
  persona: string;
  /** La otra punta: de dónde salió la plata (entrega) o a dónde volvió (devolución). */
  cuentaId: string;
  cuenta: string;
  monto: number;
  motivo: string | null;
  estado: "vigente" | "anulado";
  motivoAnulacion: string | null;
  registradoPor: string | null;
  anuladoPor: string | null;
  creadoEn: string;
  puedeAnular: boolean;
};

export type PersonaOpcion = { id: string; nombre: string; sede: string | null };
export type TipoCuentaFondo = "banco" | "caja_fuerte" | "por_rendir";
export type CuentaOpcion = { id: string; nombre: string; tipo: TipoCuentaFondo; sede: string | null };
export type OpcionesFondos = { yo: string | null; personas: PersonaOpcion[]; cuentas: CuentaOpcion[] };

// ---------- Leer lo que manda la base ----------

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const filas = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? data.filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null) : [];

/** Las filas de `fn_fondos`. Una fila sin persona o sin cuenta no se puede mostrar: se descarta. */
export function leerFondos(data: unknown): FondoFila[] {
  return filas(data).flatMap((f) => {
    const cuentaId = texto(f.cuenta_id);
    const personaId = texto(f.persona_id);
    if (!cuentaId || !personaId) return [];
    return [
      {
        cuentaId,
        personaId,
        persona: texto(f.persona_nombre) ?? "Sin nombre",
        sede: texto(f.sede_nombre),
        saldo: numero(f.saldo) ?? 0,
        entregado: numero(f.entregado) ?? 0,
        devuelto: numero(f.devuelto) ?? 0,
        gastado: numero(f.gastado) ?? 0,
        primeraEntrega: texto(f.primera_entrega),
        ultimaEntrega: texto(f.ultima_entrega),
        ultimoMotivo: texto(f.ultimo_motivo),
        esMio: f.es_mio === true,
      },
    ];
  });
}

/** Las filas de `fn_fondos_movimientos`. Un tipo que la pantalla no conoce no se muestra (no se adivina qué fue). */
export function leerMovimientosFondos(data: unknown): MovimientoFondo[] {
  return filas(data).flatMap((f) => {
    const id = texto(f.id);
    const tipo = f.tipo === "entrega_fondo" || f.tipo === "devolucion_fondo" ? f.tipo : null;
    const fecha = texto(f.fecha);
    const monto = numero(f.monto);
    if (!id || !tipo || !fecha || monto == null) return [];
    return [
      {
        id,
        tipo,
        fecha,
        personaId: texto(f.persona_id) ?? "",
        persona: texto(f.persona_nombre) ?? "Sin nombre",
        cuentaId: texto(f.cuenta_id) ?? "",
        cuenta: texto(f.cuenta_nombre) ?? "—",
        monto,
        motivo: texto(f.motivo),
        estado: f.estado === "anulado" ? "anulado" : "vigente",
        motivoAnulacion: texto(f.motivo_anulacion),
        registradoPor: texto(f.registrado_por_nombre),
        anuladoPor: texto(f.anulado_por_nombre),
        creadoEn: texto(f.creado_en) ?? fecha,
        puedeAnular: f.puede_anular === true && f.estado !== "anulado",
      },
    ];
  });
}

/** Lo que manda `fn_fondos_opciones`: quién soy, a quién se le puede entregar y desde qué cuentas. */
export function leerOpcionesFondos(data: unknown): OpcionesFondos {
  const o = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const personas = filas(o.personas).flatMap((p) => {
    const id = texto(p.id);
    return id ? [{ id, nombre: texto(p.nombre) ?? "Sin nombre", sede: texto(p.sede) }] : [];
  });
  const cuentas = filas(o.cuentas).flatMap((c): CuentaOpcion[] => {
    const id = texto(c.id);
    const tipo: TipoCuentaFondo | null = c.tipo === "banco" || c.tipo === "caja_fuerte" || c.tipo === "por_rendir" ? c.tipo : null;
    return id && tipo ? [{ id, nombre: texto(c.nombre) ?? "Cuenta", tipo, sede: texto(c.sede) }] : [];
  });
  return { yo: texto(o.yo), personas, cuentas };
}

// ---------- «Mi fondo» en los pagos de Compras (actividad 2) ----------

/** El fondo de quien mira (`fn_mi_fondo`): su cuenta y lo que tiene en la mano (en negativo, lo que CAYLA le debe). */
export type MiFondo = { cuentaId: string; nombre: string; saldo: number };

/** La fila de `fn_mi_fondo`, o nada si no tiene fondo, si es una terminal o si la base no la mandó entera. */
export function leerMiFondo(data: unknown): MiFondo | null {
  const f = filas(data)[0];
  const cuentaId = f ? texto(f.cuenta_id) : null;
  if (!f || !cuentaId) return null;
  return { cuentaId, nombre: texto(f.nombre) ?? "Mi fondo", saldo: numero(f.saldo) ?? 0 };
}

/**
 * «Mi fondo» como una cuenta más del combo «Sale de» (el grupo «Tu fondo por rendir», primero). Se propone para el efectivo solo si
 * tiene plata: con el fondo vacío o en negativo, el efectivo sigue proponiendo la caja de siempre y el fondo queda a un toque.
 */
export function cuentaDeMiFondo(f: MiFondo): CuentaElegible {
  return {
    id: f.cuentaId,
    nombre: "Mi fondo",
    tipo: "fondo",
    ubicacionId: null,
    ubicacionNombre: null,
    cajaAbierta: false,
    propuestaPara: f.saldo > 0.005 ? ["efectivo"] : [],
    saldo: f.saldo,
  };
}

/** Las cuentas de un pago de Compras con «Mi fondo» delante (si la persona tiene uno). */
export function conMiFondo(cuentas: readonly CuentaElegible[], fondo: MiFondo | null): CuentaElegible[] {
  return fondo ? [cuentaDeMiFondo(fondo), ...cuentas.filter((c) => c.id !== fondo.cuentaId)] : [...cuentas];
}

// ---------- «Tu fondo» (actividad 4, 20261013231000) ----------

/** La fila de `fn_mi_fondo_resumen`: todo sale del mismo libro que el saldo, así que el desglose cuadra con él. Desde la rendición
 *  (actividad 5), los montos son del ciclo abierto —lo que todavía no está en una rendición vigente— y `rendicion` dice lo que se trajo
 *  de la anterior, la rendición por aprobar y la deuda (`fn_mi_fondo_rendicion`; null si la base no la tiene todavía). */
export type ResumenMiFondo = {
  cuentaId: string;
  /** Lo que tiene en la mano. Negativo = CAYLA le debe (pagó de su bolsillo, decisión 32). */
  saldo: number;
  entregado: number;
  devuelto: number;
  /** Lo que pagó a proveedores desde el fondo. */
  pagado: number;
  /** Lo que salió como gasto (los del viaje). */
  gastos: number;
  /** Lo que falta para cuadrar si algún día otra cosa mueve el fondo: hoy siempre 0. */
  otros: number;
  /** La primera entrega vigente: desde cuándo tiene plata. */
  desde: string | null;
  /** El «para qué» de la última entrega. */
  paraQue: string | null;
  ultimaEntrega: string | null;
  rendicion: RendicionDeMiFondo | null;
};

/** La fila de `fn_mi_fondo_resumen`, o nada si no tiene fondo, si es una terminal o si la base no la mandó entera. */
export function leerResumenMiFondo(data: unknown): ResumenMiFondo | null {
  const f = filas(data)[0];
  const cuentaId = f ? texto(f.cuenta_id) : null;
  if (!f || !cuentaId) return null;
  return {
    cuentaId,
    saldo: numero(f.saldo) ?? 0,
    entregado: numero(f.entregado) ?? 0,
    devuelto: numero(f.devuelto) ?? 0,
    pagado: numero(f.pagado) ?? 0,
    gastos: numero(f.gastos) ?? 0,
    otros: numero(f.otros) ?? 0,
    desde: texto(f.desde),
    paraQue: texto(f.para_que),
    ultimaEntrega: texto(f.ultima_entrega),
    rendicion: null,
  };
}

const CENTAVO = 0.005;

/** Si la tarjeta sale: con un fondo que tiene o tuvo plata en este ciclo, una rendición por aprobar o una deuda. Un fondo cuya única
 *  entrega se anuló, o rendido y en cero sin nada nuevo, no dice nada. */
export function mostrarTuFondo(r: ResumenMiFondo | null): r is ResumenMiFondo {
  if (r === null) return false;
  const x = r.rendicion;
  return (
    Math.abs(r.saldo) > CENTAVO ||
    r.entregado > CENTAVO ||
    (x !== null && (x.items > 0 || x.abierta !== null || x.deuda > CENTAVO))
  );
}

/** Lo que dice la tarjeta «Tu fondo» (la misma en Órdenes de compra y en el Inicio). Medida en la fila de cuatro cifras de Órdenes
 *  de compra (225 px por tarjeta con el menú abierto en 1280): el nombre es siempre «Tu fondo» y la deuda se dice en el contexto; un
 *  nombre o una unidad más largos bajaban de renglón y estiraban la fila entera. */
export type CaraTuFondo = {
  /** El número grande: lo que le queda o, si pagó de su bolsillo, lo que CAYLA le debe (nunca un número negativo). */
  valor: string;
  /** «te queda» junto al número; con deuda, nada (lo dice el contexto). */
  unidad: "te queda" | null;
  /** Pagó de su bolsillo: el número y el contexto van en ámbar (a medias: se salda al rendir), nunca en rojo. */
  debe: boolean;
  /** De dónde sale ese número: «Gastaste S/ 300.00 de S/ 500.00»; con deuda, «CAYLA te debe: gastaste S/ 574.40 de S/ 300.00». */
  contexto: string;
  /** Desde cuándo y para qué: «Desde el 13/10 · para «Compras Gamarra»» (en un renglón: el «para qué» admite 200 letras). Con una
   *  rendición por aprobar, eso: «Rendiste el 13/10: espera aprobación». */
  pie: string | null;
  /** Lo que la persona debe por faltantes (decisión 54), en ámbar y a la vista hasta que se salde. */
  aviso: string | null;
  /** Hay algo nuevo que rendir y ninguna rendición abierta: la tarjeta de Órdenes de compra ofrece «Rendir». */
  puedeRendir: boolean;
  rendicionAbierta: boolean;
};

/** `fecha` escribe un día (`diaMes` de `fechas-lima`) e `instante` el día de un momento en hora de Lima (cuándo se rindió): se reciben
 *  para que esta lógica no dependa del reloj ni del formato. */
export function caraTuFondo(r: ResumenMiFondo, fecha: (iso: string) => string, instante: (iso: string) => string = fecha): CaraTuFondo {
  const debe = r.saldo < -CENTAVO;
  const x = r.rendicion;
  const arrastre = x?.arrastre ?? 0;
  // Lo que tuvo para gastar en este ciclo: lo que se trajo de la rendición anterior más lo que le entregaron. Lo que salió del fondo es
  // eso − lo que devolvió − lo que tiene: cuadra siempre con el saldo, aunque «otros» no fuera 0 algún día.
  const tuvo = redondo(Math.max(arrastre + r.entregado, 0));
  const gastado = Math.max(redondo(arrastre + r.entregado - r.devuelto - r.saldo), 0);
  const devolvio = r.devuelto > CENTAVO;
  const conArrastre = Math.abs(arrastre) > CENTAVO;
  let contexto: string;
  if (gastado > CENTAVO) {
    contexto =
      tuvo > CENTAVO
        ? `Gastaste ${soles(gastado)}${devolvio ? ` y devolviste ${soles(r.devuelto)}` : ""} de ${soles(tuvo)}`
        : `Gastaste ${soles(gastado)} de tu bolsillo`;
  } else if (devolvio) {
    contexto = `Devolviste ${soles(r.devuelto)} de ${soles(tuvo)}`;
  } else if (x?.abierta && r.entregado <= CENTAVO) {
    // Mientras la rendición espera, lo que se trajo todavía no es «lo que te quedó»: quien revisa puede cambiarlo.
    contexto = "Desde que rendiste, aún no gastas nada";
  } else if (!conArrastre) {
    contexto = `Te entregaron ${soles(r.entregado)}; aún no gastas nada`;
  } else if (arrastre > 0 && r.entregado <= CENTAVO) {
    contexto = `Te quedaron ${soles(arrastre)} de tu rendición; aún no gastas nada`;
  } else if (tuvo > CENTAVO) {
    contexto = `Aún no gastas nada de ${soles(tuvo)}`;
  } else {
    contexto = "Viene de tu rendición: se te devuelve con una entrega";
  }
  if (debe) contexto = `CAYLA te debe: ${contexto.charAt(0).toLowerCase()}${contexto.slice(1)}`;
  const partes = [r.desde ? `desde el ${fecha(r.desde)}` : null, r.paraQue ? `para «${r.paraQue}»` : null].filter((p): p is string => p !== null);
  const pie = x?.abierta
    ? `Rendiste el ${instante(x.abierta.en)}: espera aprobación`
    : partes.length
      ? partes.join(" · ")
      : null;
  return {
    valor: soles(debe ? -r.saldo : Math.max(r.saldo, 0)),
    unidad: debe ? null : "te queda",
    debe,
    contexto,
    pie: pie ? pie.charAt(0).toUpperCase() + pie.slice(1) : null,
    aviso: x && x.deuda > CENTAVO ? `Debes ${soles(x.deuda)} de un faltante de tu rendición` : null,
    puedeRendir: x !== null && x.abierta === null && x.items > 0,
    rendicionAbierta: Boolean(x?.abierta),
  };
}

/** A dónde lleva la tarjeta del Inicio: a donde se compra y se paga desde el fondo, si la persona ve esa pantalla. */
export function hrefTuFondo(ve: (modulo: "ordenes_compra" | "por_pagar") => boolean): string | undefined {
  if (ve("ordenes_compra")) return "/compras/ordenes";
  if (ve("por_pagar")) return "/compras/por-pagar";
  return undefined;
}

// ---------- Las cifras de arriba ----------

export type CifrasFondos = {
  /** Lo que tienen en la mano las personas con plata (un fondo en negativo no resta: es otra cosa, lo que CAYLA les debe). */
  enMano: number;
  conPlata: number;
  /** Lo que CAYLA les debe a quienes pagaron de su bolsillo (decisión 32): los fondos en negativo. */
  teDebe: number;
  conDeuda: number;
  entregado: number;
  devuelto: number;
  gastado: number;
};

const redondo = (n: number) => Math.round(n * 100) / 100;

export function cifrasDeFondos(fondos: readonly FondoFila[]): CifrasFondos {
  const suma = (f: (x: FondoFila) => number) => redondo(fondos.reduce((a, x) => a + f(x), 0));
  return {
    enMano: suma((x) => Math.max(x.saldo, 0)),
    conPlata: fondos.filter((x) => x.saldo > 0.005).length,
    teDebe: suma((x) => Math.max(-x.saldo, 0)),
    conDeuda: fondos.filter((x) => x.saldo < -0.005).length,
    entregado: suma((x) => x.entregado),
    devuelto: suma((x) => x.devuelto),
    gastado: suma((x) => x.gastado),
  };
}

// ---------- Textos ----------

export const TEXTO_MOVIMIENTO_FONDO: Record<TipoMovimientoFondo, string> = {
  entrega_fondo: "Entrega",
  devolucion_fondo: "Devolución",
};

/** «Micaela Vendedora» → «Micaela»: el botón y el aviso hablan como en la tienda. */
export const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] || nombre;

/** Lo que dice el botón de la hoja de entregar, con lo que ya se sabe: «Entregar S/ 500.00 a Micaela». */
export function fraseEntregar(monto: number | null, persona: string | null): string {
  if (monto != null && monto > 0 && persona) return `Entregar ${soles(monto)} a ${primerNombre(persona)}`;
  if (persona) return `Entregar a ${primerNombre(persona)}`;
  return "Entregar plata";
}

/** Lo que dice el botón de la hoja de devolver: «Registrar S/ 120.00 devueltos». */
export function fraseDevolver(monto: number | null): string {
  return monto != null && monto > 0 ? `Registrar ${soles(monto)} devueltos` : "Registrar lo devuelto";
}

// ---------- Opciones de los combos ----------

const GRUPO_CUENTA: Record<TipoCuentaFondo, string> = { banco: "Bancos", caja_fuerte: "Cajas fuertes", por_rendir: "Del líder" };

/** A quién se le entrega: todas las personas activas del equipo; quien entra se ve pero no se elige (nadie se entrega a sí mismo). */
export function opcionesDePersonas(o: OpcionesFondos): Opcion<string>[] {
  return o.personas.map((p) =>
    p.id === o.yo
      ? { valor: p.id, texto: `${p.nombre} (tú: que te la entregue otra persona)`, deshabilitada: true }
      : { valor: p.id, texto: p.sede ? `${p.nombre} · ${p.sede}` : p.nombre },
  );
}

/** De dónde sale (o a dónde vuelve) la plata, agrupada como en «Cuentas y dinero»: bancos, cajas fuertes y lo que tiene el líder. */
export function opcionesDeCuentas(cuentas: readonly CuentaOpcion[]): Opcion<string>[] {
  const orden: TipoCuentaFondo[] = ["banco", "caja_fuerte", "por_rendir"];
  return orden.flatMap((t) => cuentas.filter((c) => c.tipo === t).map((c) => ({ valor: c.id, texto: c.nombre, grupo: GRUPO_CUENTA[t] })));
}

// ---------- Lo que falta en cada hoja (lo mismo que rechaza la base) ----------

export function problemaDePersona(personaId: string, o: OpcionesFondos): string | null {
  if (!personaId) return "Elige a quién le entregas la plata.";
  if (personaId === o.yo) return "No puedes entregarte plata a ti: que lo haga otra persona con el módulo.";
  if (!o.personas.some((p) => p.id === personaId)) return "Esa persona ya no está activa en el equipo.";
  return null;
}

export function problemaDeCuenta(cuentaId: string, cuentas: readonly CuentaOpcion[], sentido: "sale" | "vuelve"): string | null {
  if (!cuentaId || !cuentas.some((c) => c.id === cuentaId)) return sentido === "sale" ? "Elige de dónde sale la plata." : "Elige a dónde vuelve la plata.";
  return null;
}

/** El monto escrito. `tope`, en la devolución: lo que la persona tiene en su fondo. */
export function problemaDeMonto(textoMonto: string, tope?: number): string | null {
  const m = leerMonto(textoMonto);
  if (m == null) return "Escribe cuánto.";
  if (m <= 0) return "El monto tiene que ser mayor que cero.";
  if (tope != null && m > tope) return `Tiene ${soles(Math.max(tope, 0))} en su fondo: no puede devolver más.`;
  return null;
}

export function problemaDeMotivo(textoMotivo: string): string | null {
  const t = textoMotivo.trim();
  if (t === "") return "Di para qué es la plata (la compra o el viaje).";
  if (t.length > MAX_TEXTO_FONDO) return `Es muy largo (máximo ${MAX_TEXTO_FONDO} letras).`;
  return null;
}

export function problemaDeNota(textoNota: string): string | null {
  return textoNota.trim().length > MAX_TEXTO_FONDO ? `Es muy larga (máximo ${MAX_TEXTO_FONDO} letras).` : null;
}

/** Quién firma desde una terminal (decisión 39): con la cuenta de una persona, nadie más que ella. */
type Responsable = { esPersona: boolean; listo: boolean; motivo: string | null; quien: string };
const campoResponsable = (r: Responsable): CampoDeGuia[] =>
  r.esPersona ? [] : [{ id: "responsable", nombre: r.quien, requerido: true, hecho: r.listo, pendiente: r.motivo ?? `Elige ${r.quien.toLowerCase()}.` }];

/** Los campos de «Entregar plata», en el orden de la hoja. */
export function camposEntregar(
  v: { personaId: string; cuentaId: string; monto: string; motivo: string },
  o: OpcionesFondos,
  r: Omit<Responsable, "quien">,
): CampoDeGuia[] {
  const persona = problemaDePersona(v.personaId, o);
  const cuenta = problemaDeCuenta(v.cuentaId, o.cuentas, "sale");
  const monto = problemaDeMonto(v.monto);
  const motivo = problemaDeMotivo(v.motivo);
  return [
    { id: "persona", nombre: "A quién", requerido: true, hecho: persona === null, pendiente: persona ?? "" },
    { id: "cuenta", nombre: "De dónde sale", requerido: true, hecho: cuenta === null, pendiente: cuenta ?? "" },
    { id: "monto", nombre: "Cuánto", requerido: true, hecho: monto === null, pendiente: monto ?? "" },
    { id: "motivo", nombre: "Para qué", requerido: true, hecho: motivo === null, pendiente: motivo ?? "" },
    ...campoResponsable({ ...r, quien: "Quién entrega" }),
  ];
}

/** Los campos de «Registrar lo devuelto». La nota es opcional: no cuenta como «falta». */
export function camposDevolver(
  v: { cuentaId: string; monto: string; nota: string },
  saldo: number,
  cuentas: readonly CuentaOpcion[],
  r: Omit<Responsable, "quien">,
): CampoDeGuia[] {
  const cuenta = problemaDeCuenta(v.cuentaId, cuentas, "vuelve");
  const monto = problemaDeMonto(v.monto, saldo);
  const nota = problemaDeNota(v.nota);
  return [
    { id: "cuenta", nombre: "A dónde vuelve", requerido: true, hecho: cuenta === null, pendiente: cuenta ?? "" },
    { id: "monto", nombre: "Cuánto devuelve", requerido: true, hecho: monto === null, pendiente: monto ?? "" },
    { id: "nota", nombre: "Nota", requerido: false, hecho: v.nota.trim() !== "" && nota === null, pendiente: nota ?? "" },
    ...campoResponsable({ ...r, quien: "Quién recibe" }),
  ];
}
