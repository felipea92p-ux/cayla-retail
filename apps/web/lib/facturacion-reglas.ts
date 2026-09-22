// Reglas puras de Facturación (ADR-0124): ni Supabase ni `next/headers`, para poder
// probarlas sin levantar nada — mismo criterio que `proformas-reglas.ts`. El reloj
// entra por parámetro; nada lee `Date.now()` escondido adentro.
import type { EstadoComprobante } from "./comprobantes-reglas";
import { duracionCorta } from "./facturacion-resumen-reglas";
import { marcarPorVencer, type ProformaFila } from "./proformas-reglas";

/* ------------------------------ El mes ------------------------------ */

export type Mes = { anio: number; mes: number };

export const NOMBRES_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"] as const;

const PARAMETRO_MES = /^\d{4}-(0?[1-9]|1[0-2])$/;

/** ¿Es un `?m=` que vale la pena obedecer? Mes 1-12 explícito: un `2026-13` con el regex
 *  viejo pasaba la validación y `Date.UTC` lo enrollaba en silencio a enero del año
 *  siguiente, mientras el título seguía mostrando «undefined 2026». */
export function esMesValido(m: string | null | undefined): m is string {
  return !!m && PARAMETRO_MES.test(m);
}

/** El mes que pide la URL; con un valor ausente o inválido, el mes actual. */
export function mesDeParametro(m: string | null | undefined, actual: Mes): Mes {
  if (!esMesValido(m)) return actual;
  const [anio, mes] = m.split("-").map(Number);
  return { anio, mes };
}

/** Cómo se escribe un mes en la URL: `2026-9`, sin cero a la izquierda. Así ya vivían los
 *  enlaces guardados; `mesDeParametro` acepta las dos formas. */
export function paramDeMes({ anio, mes }: Mes): string {
  return `${anio}-${mes}`;
}

export function mesAnterior({ anio, mes }: Mes): Mes {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

export function mesSiguiente({ anio, mes }: Mes): Mes {
  return mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
}

export function esMismoMes(a: Mes, b: Mes): boolean {
  return a.anio === b.anio && a.mes === b.mes;
}

/** Cómo se dice un mes dentro de una frase: «este mes» si es el actual; si no, «en agosto» (con
 *  el año cuando no es el de hoy: «en agosto de 2025»). Las tarjetas de Comprobantes lo usan para
 *  no decir «este mes» mirando un mes que ya pasó. */
export function periodoDelMes(mes: Mes, actual: Mes): string {
  if (esMismoMes(mes, actual)) return "este mes";
  const nombre = NOMBRES_MES[mes.mes - 1].toLowerCase();
  return mes.anio === actual.anio ? `en ${nombre}` : `en ${nombre} de ${mes.anio}`;
}

/* ---------------------------- Las pestañas ---------------------------- */

export type ClavePestana = "series" | "emitidos" | "cola" | "proformas";

export type PestanaFacturacion = { clave: ClavePestana; etiqueta: string; ruta: string; conMes: boolean };

const RUTA = "/vender/comprobantes";

/** Las cuatro vistas, en el orden en que se dibujan. `conMes`: solo Proformas y
 *  Emitidos viven en un mes; Series no tiene tiempo. Desde 2026-09-22 (D-60) la pantalla es
 *  «Comprobantes»: el envío a SUNAT es automático, así que la base es Series y ya no hay Resumen ni
 *  Códigos de descuento (el código se sigue usando al cobrar en Vender). */
export const PESTANAS: readonly PestanaFacturacion[] = [
  { clave: "series", etiqueta: "Series", ruta: RUTA, conMes: false },
  { clave: "emitidos", etiqueta: "Emitidos", ruta: `${RUTA}/emitidos`, conMes: true },
  { clave: "cola", etiqueta: "Por reintentar", ruta: `${RUTA}/por-reintentar`, conMes: false },
  { clave: "proformas", etiqueta: "Proformas", ruta: `${RUTA}/proformas`, conMes: true },
];

/** La pestaña que le toca a una ruta. Una ruta desconocida cae en Series (la base). El
 *  prefijo tiene que terminar en `/` o en el fin: `/proformas-viejas` no es Proformas. */
export function pestanaDeRuta(pathname: string): ClavePestana {
  const limpia = pathname.replace(/\/+$/, "");
  const hallada = PESTANAS.find((p) => p.clave !== "series" && (limpia === p.ruta || limpia.startsWith(`${p.ruta}/`)));
  return hallada?.clave ?? "series";
}

/** El enlace de una pestaña. Solo las dos que viven en un mes llevan `?m=`, y solo si el
 *  de la URL actual es válido: así el mes se conserva entre Proformas y Comprobantes sin
 *  arrastrar basura. */
export function hrefPestana(pestana: PestanaFacturacion, m: string | null | undefined): string {
  return pestana.conMes && esMesValido(m) ? `${pestana.ruta}?m=${m}` : pestana.ruta;
}

/* ------------------- Lo que esperan de SUNAT y de la clienta ------------------- */

export type ResumenPorEnviar = { porEnviar: number; rechazados: number; masAntiguoAt: string | null };

/** «Por enviar» = `pendiente` + `pendiente_reintento` + `rechazado`, de cualquier tipo y SIN filtro
 *  de mes: es una cola, no un historial (un `pendiente` de hace tres semanas sigue esperando).
 *  `enviado` no cuenta: ya está en manos de SUNAT y no hay nada que hacer. */
export function resumenPorEnviar(filas: { estado: EstadoComprobante; created_at: string }[]): ResumenPorEnviar {
  const cola = filas.filter((f) => f.estado === "pendiente" || f.estado === "pendiente_reintento" || f.estado === "rechazado");
  // Se comparan instantes, no texto: `10:00-05:00` son las 15:00Z, y como texto ganaría
  // a `14:00Z` aunque sea más nuevo.
  const masAntiguo = cola.reduce<string | null>((min, f) => (min === null || Date.parse(f.created_at) < Date.parse(min) ? f.created_at : min), null);
  return { porEnviar: cola.length, rechazados: cola.filter((f) => f.estado === "rechazado").length, masAntiguoAt: masAntiguo };
}

export type ResumenProformas = { vigentes: number; monto: number; porVencer: number; vencidas: number };

/** Las proformas vigentes de la base, separadas en las que siguen valiendo y las que ya
 *  vencieron. Nadie escribe `vencida`: sin esta separación una «vigente» de hace un mes
 *  contaría como plata por cobrar. `vigentes` y `monto` son solo las que aún valen;
 *  `porVencer` es un subconjunto de esas; `vencidas` va aparte. */
export function resumenProformas(filas: ProformaFila[], ahora: number = Date.now()): ResumenProformas {
  const vigentes = marcarPorVencer(filas, ahora).filter((p) => p.estado === "vigente");
  const alDia = vigentes.filter((p) => !p.vencida);
  return {
    vigentes: alDia.length,
    monto: Math.round(alDia.reduce((suma, p) => suma + Number(p.total), 0) * 100) / 100,
    porVencer: alDia.filter((p) => p.porVencer).length,
    vencidas: vigentes.length - alDia.length,
  };
}

/* ----------------------- La cola de reintento (D-60) ----------------------- */

/** Pasadas estas horas en la cola sin llegar a SUNAT, el líder recibe el aviso: el reintento solo no
 *  alcanzó (Lucode caído mucho rato, credenciales vencidas) y alguien tiene que mirar. */
export const HORAS_AVISO_COLA = 1;

export type ResumenCola = { total: number; masDeUnaHora: number };

export function resumenCola(filas: { horas_esperando: number | null }[]): ResumenCola {
  return { total: filas.length, masDeUnaHora: filas.filter((f) => (f.horas_esperando ?? 0) >= HORAS_AVISO_COLA).length };
}

/* ------------------------ Contadores de las pestañas ------------------------ */

export type ConteoPestana = { valor: number; tono: "neutro" | "ambar" | "rojo"; texto: string };
export type ConteosPestanas = Partial<Record<ClavePestana, ConteoPestana>>;

/** Lo que cada pestaña muestra como contador. Sin dato (`null`: la consulta falló) o en
 *  cero no se dibuja nada: un contador que miente es peor que ninguno, y un «0» no le pide
 *  nada a nadie. `texto` es lo que lee un lector de pantalla: el número solo no dice qué
 *  cuenta. */
export function conteosDePestanas(porEnviar: ResumenPorEnviar | null, proformas: ResumenProformas | null, cola: ResumenCola | null = null): ConteosPestanas {
  const conteos: ConteosPestanas = {};
  if (cola && cola.total > 0) {
    conteos.cola =
      cola.masDeUnaHora > 0
        ? { valor: cola.total, tono: "rojo", texto: "en cola, alguno hace más de 1 hora" }
        : { valor: cola.total, tono: "ambar", texto: "en cola, se reintentan solos" };
  }
  if (porEnviar && porEnviar.porEnviar > 0) {
    conteos.emitidos =
      porEnviar.rechazados > 0
        ? { valor: porEnviar.porEnviar, tono: "rojo", texto: "por enviar a SUNAT, con rechazados" }
        : { valor: porEnviar.porEnviar, tono: "ambar", texto: "por enviar a SUNAT" };
  }
  if (proformas && proformas.vigentes > 0) {
    conteos.proformas = { valor: proformas.vigentes, tono: "neutro", texto: proformas.vigentes === 1 ? "vigente" : "vigentes" };
  }
  return conteos;
}

/* ------------------------- Cuándo llegó lo que se ve ------------------------- */

/** Pasados estos segundos sin recargar, lo que se ve ya no es «vivo» (punto ámbar y quieto). */
export const SEGUNDOS_VISTA_FRESCA = 600;

/** «actualizado ahora», «actualizado hace 16 s», «actualizado hace 3 min», «actualizado hace 2 h 5 min».
 *  La cabecera lo dice porque una pantalla que se deja abierta todo el día no se actualiza sola: una
 *  edad a la vista avisa cuándo conviene recargar. */
export function textoDeFrescura(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  if (s < 5) return "actualizado ahora";
  if (s < 60) return `actualizado hace ${s} s`;
  return `actualizado hace ${duracionCorta(s)}`;
}

/* ------------------------------- Las tiendas ------------------------------- */

/** Solo las tiendas emiten comprobantes: ni un almacén ni el Taller (tipo `taller` desde
 *  2026-09-15) tienen serie ni mostrador. */
export function tiendasOperativas<T extends { tipo: string }>(ubicaciones: T[]): T[] {
  return ubicaciones.filter((u) => u.tipo === "tienda");
}

/** La tienda que se preselecciona en los modales: la de la persona si es una tienda
 *  operativa; si no, la primera; `""` si no hay ninguna. */
export function ubicacionActualDe<T extends { id: string }>(tiendas: T[], ubicacionIdDeLaPersona: string): string {
  return (tiendas.find((u) => u.id === ubicacionIdDeLaPersona) ?? tiendas[0])?.id ?? "";
}
