import type { FilaPorRecibir } from "./recepcion-envio-busqueda";
import { diaLima, horaLima, sumarDias } from "./fechas-lima";
import { ESTADO_ENVIO } from "./ordenes-compra-reglas";

// Los filtros de «Envíos por recibir en esta sede» (Recibir mercadería): estado, proveedor y fecha de envío. Es lógica pura, sin React: la
// tarjeta (`components/recepcion-envio/FiltrosDeEnvios.tsx`) solo dibuja las píldoras y llama a estas funciones. La lista es corta (los
// envíos de UNA sede que aún no se cierran), así que se filtra en el navegador, sin tocar la URL ni la base.

/** Los estados que la persona distingue en la tabla (Felipe 2026-10-28): «abierto» (alguien ya empezó a contarlo: se sigue recibiendo), «por abrir»
 *  (va en camino o llegó una orden sin guía: todavía no se abre el fardo) y «ajeno» (lo que esta cuenta no puede abrir porque hizo la orden). */
export type EstadoDeFila = "abierto" | "por_abrir" | "ajeno";

export const ESTADOS_DE_FILA: readonly { valor: EstadoDeFila; texto: string }[] = [
  { valor: "abierto", texto: ESTADO_ENVIO.abierto.texto },
  { valor: "por_abrir", texto: "Por abrir" },
  { valor: "ajeno", texto: "No puedo abrir yo" },
];

/** Lo que quien hizo la orden no puede recibir (decisión 17) cuenta como «ajeno» aunque el envío esté abierto, vaya en camino o la orden venga
 *  sin guía: es lo que la persona ve en la fila (el texto «La recibe otra persona» en vez del botón). Un envío en camino y una orden sin guía
 *  son «por abrir»: ninguno se abrió todavía. */
export function estadoDeFila(f: FilaPorRecibir): EstadoDeFila {
  const mio = f.tipo === "orden" ? f.orden.creadaPorMi : f.envio.creadoPorMi;
  if (mio) return "ajeno";
  return f.tipo === "envio" && f.envio.estado === "abierto" ? "abierto" : "por_abrir";
}

/** El día de Lima (`aaaa-mm-dd`) en que salió el envío. Una orden sin guía no tiene envío todavía: `null`. */
export function diaDeEnvio(f: FilaPorRecibir): string | null {
  return f.tipo === "envio" ? diaLima(f.envio.despachadoEn) : null;
}

/** Los proveedores de una fila: un envío puede traer prendas de varios. `proveedorSinAviso`: de quién es un envío que llegó sin aviso. */
export function proveedoresDeFila(f: FilaPorRecibir, proveedorSinAviso: string | null = null): string[] {
  if (f.tipo === "orden") return f.orden.proveedor ? [f.orden.proveedor] : [];
  return [...f.envio.proveedores, ...(proveedorSinAviso ? [proveedorSinAviso] : [])];
}

export type FiltrosEnvios = {
  estados: EstadoDeFila[];
  /** El nombre del proveedor tal como se lee en la tabla (la base de la lista solo manda nombres). */
  proveedor: string | null;
  /** `aaaa-mm-dd` o «» (sin límite). */
  desde: string;
  hasta: string;
};

export const SIN_FILTROS: FiltrosEnvios = { estados: [], proveedor: null, desde: "", hasta: "" };

/** Cuántos de los tres filtros están puestos (la fecha cuenta una vez aunque tenga los dos extremos). */
export function contarFiltros(f: FiltrosEnvios): number {
  return (f.estados.length > 0 ? 1 : 0) + (f.proveedor ? 1 : 0) + (f.desde || f.hasta ? 1 : 0);
}

/** Aplica los tres filtros a la vez (todos tienen que cumplirse; dentro de «Estado», basta uno). Con la fecha puesta, lo que no tiene
 *  fecha de envío (una orden sin guía) no entra: no salió todavía, así que no cae en ningún rango. */
export function filtrarFilas(filas: readonly FilaPorRecibir[], f: FiltrosEnvios, proveedorSinAviso: (envioId: string) => string | null = () => null): FilaPorRecibir[] {
  const conFecha = Boolean(f.desde || f.hasta);
  return filas.filter((fila) => {
    if (f.estados.length > 0 && !f.estados.includes(estadoDeFila(fila))) return false;
    if (f.proveedor && !proveedoresDeFila(fila, fila.tipo === "envio" ? proveedorSinAviso(fila.envio.id) : null).includes(f.proveedor)) return false;
    if (conFecha) {
      const dia = diaDeEnvio(fila);
      if (!dia || (f.desde && dia < f.desde) || (f.hasta && dia > f.hasta)) return false;
    }
    return true;
  });
}

/** Los proveedores que hay en la tabla, sin repetir y en orden alfabético sin tildes: las opciones de la píldora «Proveedor». */
export function proveedoresDeLaLista(filas: readonly FilaPorRecibir[], proveedorSinAviso: (envioId: string) => string | null = () => null): string[] {
  const nombres = new Set<string>();
  for (const fila of filas) for (const n of proveedoresDeFila(fila, fila.tipo === "envio" ? proveedorSinAviso(fila.envio.id) : null)) nombres.add(n);
  return [...nombres].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

// ---- La fecha ------------------------------------------------------------------------------------------------------------------------

export type PeriodoEnvio = "hoy" | "ayer" | "7-dias" | "30-dias" | "mas-de-7";

/** Períodos de un toque. «Hace más de una semana» es el que más sirve en esta tabla: lo que salió hace tiempo y todavía no llegó. */
export const PERIODOS_ENVIO: readonly { clave: PeriodoEnvio; etiqueta: string }[] = [
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "ayer", etiqueta: "Ayer" },
  { clave: "7-dias", etiqueta: "Últimos 7 días" },
  { clave: "30-dias", etiqueta: "Últimos 30 días" },
  { clave: "mas-de-7", etiqueta: "Hace más de una semana" },
];

export function rangoDePeriodoEnvio(clave: PeriodoEnvio, hoy: string): { desde: string; hasta: string } {
  switch (clave) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "ayer":
      return { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) };
    case "7-dias":
      return { desde: sumarDias(hoy, -7), hasta: hoy };
    case "30-dias":
      return { desde: sumarDias(hoy, -30), hasta: hoy };
    case "mas-de-7":
      return { desde: "", hasta: sumarDias(hoy, -8) };
  }
}

/** Qué período de un toque coincide con el rango puesto; `null` si es un rango a mano. */
export function periodoDeRangoEnvio(desde: string, hasta: string, hoy: string): PeriodoEnvio | null {
  if (!desde && !hasta) return null;
  return PERIODOS_ENVIO.find((p) => {
    const r = rangoDePeriodoEnvio(p.clave, hoy);
    return r.desde === desde && r.hasta === hasta;
  })?.clave ?? null;
}

/** Tras editar un extremo a mano, deja el rango coherente: si «desde» quedó después de «hasta» (o al revés), el otro extremo acompaña al
 *  que se acaba de tocar. Nunca queda un rango invertido que devuelva cero filas sin explicación. */
export function ajustarRangoEnvio(desde: string, hasta: string, editado: "desde" | "hasta"): { desde: string; hasta: string } {
  if (desde && hasta && desde > hasta) return editado === "desde" ? { desde, hasta: desde } : { desde: hasta, hasta };
  return { desde, hasta };
}

/** `dd/mm` si la fecha es de este año, `dd/mm/aaaa` si no (un envío de diciembre visto en enero). */
function fechaCorta(dia: string, hoy: string): string {
  const [a, m, d] = dia.split("-");
  return a === hoy.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`;
}

/** Lo que dice la píldora «Fechas» cuando está puesta: el nombre del período de un toque o el rango. */
export function textoFechasEnvio(desde: string, hasta: string, hoy: string): string {
  const clave = periodoDeRangoEnvio(desde, hasta, hoy);
  if (clave) return PERIODOS_ENVIO.find((p) => p.clave === clave)?.etiqueta ?? "";
  if (desde && hasta) return `${fechaCorta(desde, hoy)} – ${fechaCorta(hasta, hoy)}`;
  return desde ? `Desde ${fechaCorta(desde, hoy)}` : `Hasta ${fechaCorta(hasta, hoy)}`;
}

/** La celda «Enviado» de un envío: el día (en Lima) y, debajo, la hora. `null` si no hay fecha (una orden sin guía, o la base no la mandó). */
export function fechaDeEnvioParaTabla(instante: string | null, hoy: string): { dia: string; hora: string | null; completa: string } | null {
  const dia = diaLima(instante);
  if (!dia) return null;
  const hora = horaLima(instante);
  const [a, m, d] = dia.split("-");
  return { dia: fechaCorta(dia, hoy), hora, completa: `${d}/${m}/${a}${hora ? ` a las ${hora}` : ""}` };
}
