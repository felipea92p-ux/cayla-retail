import { diaCorto } from "./orden-pagina-reglas";
import { soles } from "./orden-ficha-reglas";
import { FASES, type FaseClave } from "./orden-fases-reglas";

// La lista de precios de los servicios de afuera (ADR-0400, actividad 8; «Proveedores ▸ Servicios y tarifas»): las reglas puras. Sin React ni Supabase.
//
// LA BASE MANDA: `fn_tarifas_de_servicios` y `guardar_tarifa_servicio` (migración 20261015172000). Aquí se LEE la lista y se arma lo que la persona escribe con los MISMOS topes y motivos que la base
// (`tarifa_*`); `lib/tarifas-servicios-reglas.test.ts` lee la migración y exige que coincidan.
//
// CONTRATO
//   PROMETE: que lo que se ve de una tarifa es la VIGENTE de cada servicio y fase (la más reciente que ya rige), con cuántas versiones tiene; que una tarifa se escribe con los mismos topes que la base
//            (un monto de cero a 99 999, un mínimo de una prenda en adelante, un fijo de cero a 99 999); y que lo que no se entiende (un número roto, una fase desconocida) se descarta, no se dibuja a medias.
//   ASUME:   «hoy» es el de Lima; solo el líder carga y lee la lista (la base responde NULL a los demás: la pantalla ni se ofrece).
//   NO HACE: no escribe, no sugiere una tarifa que nadie escribió, y no decide quién la lee (eso es de la base).

export const RPC_TARIFAS_DE_SERVICIOS = "fn_tarifas_de_servicios";
export const RPC_GUARDAR_TARIFA = "guardar_tarifa_servicio";

/** El tope de monto y de fijo de la base (`> 99999` se rechaza). La prueba lo compara con la migración. */
export const TARIFA_MAXIMA = 99999;

export type TarifaDeServicio = {
  proveedorId: string;
  proveedorNombre: string;
  activo: boolean;
  fase: FaseClave;
  tarifaPrenda: number;
  /** Desde cuántas prendas cobra; `null` si no pide mínimo. */
  cantidadMinima: number | null;
  /** Lo fijo por orden (el ponchado de un bordado); 0 si no cobra fijo. */
  fijoOrden: number;
  /** Desde cuándo rige (`aaaa-mm-dd`). */
  vigenteDesde: string;
  nota: string | null;
  /** Cuántas versiones de esta tarifa hay (la vigente y las anteriores). */
  versiones: number;
};

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x : null);
function numero(x: unknown): number | null {
  const n = typeof x === "string" && x.trim() !== "" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
const claves = new Set<string>(FASES.map((f) => f.clave));

/** La respuesta de `fn_tarifas_de_servicios`. `null` si no es una lista (la base responde NULL a quien no es líder, o falló): la pantalla dice «no se pudo leer», nunca «no hay tarifas». */
export function leerTarifasDeServicios(crudo: unknown): TarifaDeServicio[] | null {
  if (!Array.isArray(crudo)) return null;
  return crudo.flatMap((t): TarifaDeServicio[] => {
    if (!esObjeto(t)) return [];
    const proveedorId = texto(t.proveedor_id);
    const fase = texto(t.fase_clave);
    const tarifa = numero(t.tarifa_prenda);
    const desde = texto(t.vigente_desde);
    if (!proveedorId || !fase || !claves.has(fase) || tarifa === null || tarifa <= 0 || !desde) return [];
    const minimo = numero(t.cantidad_minima);
    return [
      {
        proveedorId,
        proveedorNombre: texto(t.proveedor_nombre) ?? "Un servicio",
        activo: t.activo !== false,
        fase: fase as FaseClave,
        tarifaPrenda: tarifa,
        cantidadMinima: minimo !== null && minimo > 0 ? Math.round(minimo) : null,
        fijoOrden: Math.max(numero(t.fijo_orden) ?? 0, 0),
        vigenteDesde: desde.slice(0, 10),
        nota: texto(t.nota),
        versiones: Math.max(Math.round(numero(t.versiones) ?? 1), 1),
      },
    ];
  });
}

const nombreDeFase = (f: FaseClave) => FASES.find((x) => x.clave === f)?.nombre ?? f;

/** «S/ 4.50 por prenda». */
export function textoTarifa(t: Pick<TarifaDeServicio, "tarifaPrenda">): string {
  return `${soles(t.tarifaPrenda)} por prenda`;
}

/** «Desde 50 prendas» o «Sin mínimo». */
export function textoMinimo(t: Pick<TarifaDeServicio, "cantidadMinima">): string {
  return t.cantidadMinima === null ? "Sin mínimo" : `Desde ${t.cantidadMinima} ${t.cantidadMinima === 1 ? "prenda" : "prendas"}`;
}

/** «+ S/ 12.50 por orden» o `null` si no cobra fijo. */
export function textoFijo(t: Pick<TarifaDeServicio, "fijoOrden">): string | null {
  return t.fijoOrden > 0 ? `+ ${soles(t.fijoOrden)} por orden` : null;
}

/** «Desde hoy», «Desde ayer» o «Desde el vie 9 oct». */
export function textoVigencia(t: Pick<TarifaDeServicio, "vigenteDesde">, hoy: string): string {
  if (t.vigenteDesde === hoy) return "Desde hoy";
  const ayer = new Date(Date.parse(`${hoy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return t.vigenteDesde === ayer ? "Desde ayer" : `Desde el ${diaCorto(t.vigenteDesde)}`;
}

/** Lo que la hoja dice de la tarifa que se reemplaza: cuánto cobra hoy, con su mínimo y su fijo, y qué pasa con ella al guardar. Una tarifa cargada HOY se corrige (la base la reescribe); una de antes queda como historia. */
export function textoDeLoQueSeReemplaza(t: TarifaDeServicio, hoy: string, renueva: boolean): string {
  const minimo = t.cantidadMinima === null ? "" : `, ${textoMinimo(t).toLocaleLowerCase("es")}`;
  const fijo = textoFijo(t) ? `, ${textoFijo(t)}` : "";
  const intro = renueva ? "Ahora cobra" : `Ya tiene una tarifa en ${nombreDeFase(t.fase)}:`;
  const cierre = t.vigenteDesde === hoy ? "Como se cargó hoy, lo que guardes la corrige." : `Rige ${textoVigencia(t, hoy).toLocaleLowerCase("es")}. La nueva rige desde hoy y esta queda guardada como historia.`;
  return `${intro} ${textoTarifa(t)}${minimo}${fijo}. ${cierre}`;
}

export type ServicioParaTarifar = { id: string; nombre: string; activo: boolean };

/** Los proveedores a los que se les pone precio: los de servicio (rubro distinto de tela y avíos) y activos. */
export function serviciosParaTarifar(proveedores: readonly { id: string; nombre: string; rubro: string; activo: boolean }[]): ServicioParaTarifar[] {
  return proveedores.filter((p) => p.activo && p.rubro !== "tela" && p.rubro !== "avios").map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export type ServicioConTarifas = { proveedorId: string; nombre: string; activo: boolean; tarifas: TarifaDeServicio[] };

/** Un servicio por fila con sus tarifas (una por fase, en el orden de la ruta). Los servicios activos sin ninguna tarifa también salen, vacíos: son los que faltan cargar. */
export function tarifasPorServicio(tarifas: readonly TarifaDeServicio[], servicios: readonly ServicioParaTarifar[]): ServicioConTarifas[] {
  // El mismo orden que `fn_tarifas_de_servicios` (la ruta nueva y la anterior); lo prueba `tarifas-servicios-reglas.test.ts` contra la migración.
  const orden = ["ploteo", "corte", "habilitado", "bordado", "estampado", "costura", "ojales_botones", "lavanderia", "limpieza_revision", "acabado", "planchado", "etiquetado_embolsado"];
  const porServicio = new Map<string, ServicioConTarifas>();
  for (const s of servicios) porServicio.set(s.id, { proveedorId: s.id, nombre: s.nombre, activo: s.activo, tarifas: [] });
  for (const t of tarifas) {
    const s = porServicio.get(t.proveedorId) ?? { proveedorId: t.proveedorId, nombre: t.proveedorNombre, activo: t.activo, tarifas: [] };
    s.tarifas.push(t);
    porServicio.set(t.proveedorId, s);
  }
  return [...porServicio.values()]
    .map((s) => ({ ...s, tarifas: [...s.tarifas].sort((a, b) => orden.indexOf(a.fase) - orden.indexOf(b.fase)) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** La tarifa vigente de un servicio en una fase (la que se reemplaza al cargar otra), o `null` si todavía no tiene. */
export function tarifaVigenteDe(tarifas: readonly TarifaDeServicio[], proveedorId: string, fase: string): TarifaDeServicio | null {
  return tarifas.find((t) => t.proveedorId === proveedorId && t.fase === fase) ?? null;
}

export type EntradaDeTarifa = { proveedorId: string; fase: string; tarifa: string; minimo: string; fijo: string; nota: string };

/** La hoja nace con la tarifa vigente (renovar es cambiar lo que cambió), o vacía si se carga una nueva. */
export function entradaDesde(t: TarifaDeServicio | null, proveedorId = "", fase = ""): EntradaDeTarifa {
  return t
    ? { proveedorId: t.proveedorId, fase: t.fase, tarifa: String(t.tarifaPrenda), minimo: t.cantidadMinima === null ? "" : String(t.cantidadMinima), fijo: t.fijoOrden > 0 ? String(t.fijoOrden) : "", nota: t.nota ?? "" }
    : { proveedorId, fase, tarifa: "", minimo: "", fijo: "", nota: "" };
}

function leerMonto(t: string): number | null {
  const limpio = t.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return Number(limpio);
}

export type ProblemaDeTarifa = { hint: "tarifa_proveedor_inexistente" | "tarifa_fase_invalida" | "tarifa_monto_invalido" | "tarifa_minimo_invalido" | "tarifa_fijo_invalido"; campo: "servicio" | "fase" | "tarifa" | "minimo" | "fijo"; texto: string };

/** Lo que la base rechazaría de lo escrito, en el orden en que la base lo mira. Vacío = la base lo aceptaría. */
export function problemasDeTarifa(e: EntradaDeTarifa): ProblemaDeTarifa[] {
  const problemas: ProblemaDeTarifa[] = [];
  if (e.proveedorId === "") problemas.push({ hint: "tarifa_proveedor_inexistente", campo: "servicio", texto: "Elige a qué servicio le pones precio." });
  if (!claves.has(e.fase)) problemas.push({ hint: "tarifa_fase_invalida", campo: "fase", texto: "Elige a qué fase le pones precio." });
  const monto = leerMonto(e.tarifa);
  if (monto === null || monto <= 0 || monto > TARIFA_MAXIMA) problemas.push({ hint: "tarifa_monto_invalido", campo: "tarifa", texto: "Escribe cuánto cobra por prenda: un monto mayor que cero." });
  if (e.minimo.trim() !== "" && !/^\d+$/.test(e.minimo.trim())) problemas.push({ hint: "tarifa_minimo_invalido", campo: "minimo", texto: "El mínimo es un número de prendas, de una en adelante (o déjalo vacío si no pide mínimo)." });
  else if (e.minimo.trim() !== "" && Number(e.minimo) <= 0) problemas.push({ hint: "tarifa_minimo_invalido", campo: "minimo", texto: "El mínimo es de una prenda en adelante (o déjalo vacío si no pide mínimo)." });
  if (e.fijo.trim() !== "") {
    const fijo = leerMonto(e.fijo);
    if (fijo === null || fijo > TARIFA_MAXIMA) problemas.push({ hint: "tarifa_fijo_invalido", campo: "fijo", texto: "El fijo por orden es un monto de cero en adelante (o déjalo vacío si no cobra fijo)." });
  }
  return problemas;
}

/** Los argumentos de `guardar_tarifa_servicio`. Solo se llama con una entrada sin problemas. */
export function argumentosDeTarifa(e: EntradaDeTarifa): { p_proveedor_id: string; p_fase_clave: string; p_tarifa_prenda: number; p_cantidad_minima: number | null; p_fijo_orden: number; p_nota: string | null } {
  return {
    p_proveedor_id: e.proveedorId,
    p_fase_clave: e.fase,
    p_tarifa_prenda: leerMonto(e.tarifa) ?? 0,
    p_cantidad_minima: e.minimo.trim() === "" ? null : Number(e.minimo),
    p_fijo_orden: e.fijo.trim() === "" ? 0 : (leerMonto(e.fijo) ?? 0),
    p_nota: e.nota.trim() === "" ? null : e.nota.trim(),
  };
}

/** El aviso de éxito: «Tarifa de Confecciones del Norte para Costura: S/ 4.50 por prenda». */
export function textoTarifaGuardada(nombre: string, fase: string, tarifa: number): string {
  return `Tarifa de ${nombre} para ${nombreDeFase(fase as FaseClave)}: ${soles(tarifa)} por prenda`;
}

export { nombreDeFase };
