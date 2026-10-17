import { z } from "zod";
import { colorDeLaPieza, LOOK_VACIO, poner, presentes, type Look, type Memoria, type PiezaParaTallas, type PrendaDelProbador } from "./probador";

// Los looks que el cliente guarda desde «Arma el tuyo» (ADR-0434, actividad 8), tal como los devuelve `retail.tienda_mis_looks`: cada
// uno, su nombre y sus prendas (modelo y color; sin tallas ni precios, que se leen al día). La base decide qué se guarda (de 2 a 4
// prendas que se ven en la web, una vez por look, hasta 30); aquí se valida la forma, se reconoce si el look que se está armando ya está
// guardado y se arma el look para dibujarlo. Lógica pura, con su prueba al lado.

const esquemaPieza = z.object({
  posicion: z.number().int().min(1).max(4),
  producto_id: z.string().uuid(),
  color: z.string().min(1),
  se_ve: z.boolean().catch(false),
});

const esquemaLook = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1).max(40),
  guardado_en: z.string().min(1),
  piezas: z.array(z.unknown()),
});

export type PiezaGuardada = { posicion: number; productoId: string; color: string; seVe: boolean };
export type LookGuardado = { id: string; nombre: string; guardadoEn: string; piezas: PiezaGuardada[] };

/** Lo que responde `tienda_mis_looks`; un look raro se salta (los demás se ven). `null` sin cuenta o si la respuesta no tiene forma. */
export function interpretarMisLooks(dato: unknown): LookGuardado[] | null {
  const r = z.object({ looks: z.array(z.unknown()) }).safeParse(dato);
  if (!r.success) return null;
  return r.data.looks.flatMap((x) => {
    const l = esquemaLook.safeParse(x);
    if (!l.success) return [];
    const piezas = l.data.piezas.flatMap((p) => {
      const y = esquemaPieza.safeParse(p);
      return y.success ? [{ posicion: y.data.posicion, productoId: y.data.producto_id, color: y.data.color, seVe: y.data.se_ve }] : [];
    });
    return piezas.length > 0 ? [{ id: l.data.id, nombre: l.data.nombre, guardadoEn: l.data.guardado_en, piezas: piezas.sort((a, b) => a.posicion - b.posicion) }] : [];
  });
}

/** Un look se puede guardar con 2 a 4 prendas (un vestido solo no es un look: ADR-0434). */
export const MINIMO_PARA_GUARDAR = 2;

/** ¿Las mismas prendas en los mismos colores, en cualquier orden? (lo que la base llama la huella del look). */
export function mismasPiezas(a: readonly PiezaParaTallas[], b: readonly { productoId: string; color: string }[]): boolean {
  if (a.length !== b.length) return false;
  const de = new Set(a.map((p) => `${p.id}.${p.color.toUpperCase()}`));
  return b.every((p) => de.has(`${p.productoId}.${p.color.toUpperCase()}`));
}

/** El look guardado que tiene exactamente estas prendas, si lo hay (el corazón del probador va lleno). */
export function buscarGuardado(piezas: readonly PiezaParaTallas[], guardados: readonly LookGuardado[]): LookGuardado | null {
  return guardados.find((g) => mismasPiezas(piezas, g.piezas)) ?? null;
}

/**
 * Un look guardado puesto en el probador: cada prenda que sigue en el probador de esta tienda, en su lugar (con las reglas de `poner`:
 * un vestido saca lo de arriba y abajo), y aparte las que ya no están (dejaron de verse, o en esta tienda no hay).
 */
export function lookDelGuardado(g: LookGuardado, prendas: readonly PrendaDelProbador[]): { look: Look; faltan: PiezaGuardada[] } {
  let look = LOOK_VACIO;
  let memoria: Memoria = { arriba: null, abajo: null };
  const faltan: PiezaGuardada[] = [];
  for (const pieza of g.piezas) {
    const p = prendas.find((x) => x.id === pieza.productoId);
    const color = p?.colores.find((c) => c.codigo === pieza.color.toUpperCase());
    if (!p || !color || !pieza.seVe) {
      faltan.push(pieza);
      continue;
    }
    const puesto = poner(look, memoria, p, color.codigo);
    look = puesto.look;
    memoria = puesto.memoria;
  }
  return { look, faltan };
}

/** «Guardado hoy», «Guardado ayer», «Guardado el 14 de octubre»: cuándo, en palabras (el día de Lima). */
export function cuandoSeGuardo(guardadoEn: string, hoyLima: string): string {
  const dia = diaDeLima(guardadoEn);
  if (!dia) return "Guardado";
  if (dia === hoyLima) return "Guardado hoy";
  const ayer = new Date(`${hoyLima}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  if (dia === ayer.toISOString().slice(0, 10)) return "Guardado ayer";
  const [, mes, d] = dia.split("-").map(Number);
  return `Guardado el ${d} de ${MESES[mes - 1]}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** El día de Lima («2026-10-16») de un instante. */
function diaDeLima(instante: string): string | null {
  const t = Date.parse(instante);
  if (Number.isNaN(t)) return null;
  return new Date(t - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

export type EstadoGuardarLook = "guardado" | "tope" | "no_disponible" | "cuenta_inactiva" | "invalido" | "sin_sesion" | "sin_respuesta";
export type RespuestaGuardarLook = { estado: EstadoGuardarLook; id: string | null; nombre: string | null };

/** La respuesta de `tienda_guardar_look`: el estado y, si se guardó, el look (su id y su nombre). Lo raro, `sin_respuesta`. */
export function leerRespuestaGuardar(dato: unknown): RespuestaGuardarLook {
  const r = z
    .object({ estado: z.enum(["guardado", "tope", "no_disponible", "cuenta_inactiva", "invalido", "sin_cuenta"]), id: z.string().uuid().optional(), nombre: z.string().optional() })
    .safeParse(dato);
  if (!r.success) return { estado: "sin_respuesta", id: null, nombre: null };
  if (r.data.estado === "sin_cuenta") return { estado: "sin_sesion", id: null, nombre: null };
  if (r.data.estado === "guardado" && (!r.data.id || !r.data.nombre)) return { estado: "sin_respuesta", id: null, nombre: null };
  return { estado: r.data.estado, id: r.data.id ?? null, nombre: r.data.nombre ?? null };
}

/** Lo que se le dice al cliente al tocar el corazón del probador. */
export function avisoAlGuardar(estado: EstadoGuardarLook): string {
  switch (estado) {
    case "guardado":
      return "Guardado en tus favoritos";
    case "tope":
      return "Ya tienes 30 looks guardados. Quita alguno en tus favoritos para guardar otro.";
    case "no_disponible":
      return "Una prenda de tu look ya no está en la tienda online.";
    case "cuenta_inactiva":
      return "Tu ficha del Club no está activa. Acércate a cualquier tienda CAYLA y la revisan contigo.";
    case "invalido":
      return "Agrégale otra prenda para guardarlo: un look lleva al menos dos.";
    case "sin_sesion":
      return "Entra a tu cuenta para guardarlo.";
    default:
      return "No pudimos guardarlo. Vuelve a intentarlo en un momento.";
  }
}

/** Las prendas del look para guardarlo, en el orden de las zonas. */
export function piezasParaGuardar(look: Look): { producto_id: string; color: string }[] {
  return presentes(look).map((z) => ({ producto_id: look[z]!.id, color: look[z]!.color }));
}

/* ---------------- La página del look guardado y su tarjeta en Favoritos ---------------- */

/** La página de un look guardado, con la tienda elegida (sus precios y su stock). */
export const hrefDelGuardado = (id: string, sede: string | null = null): string =>
  `/looks/guardado/${id}${sede ? `?sede=${encodeURIComponent(sede)}` : ""}`;

/** «2026-10-16»: un día de Lima como lo compara `cuandoSeGuardo`. */
export const diaIso = (d: { anio: number; mes: number; dia: number }): string =>
  `${d.anio}-${String(d.mes).padStart(2, "0")}-${String(d.dia).padStart(2, "0")}`;

/** Lo que lee un lector de pantalla en la figura: «Tu look: 1, Top Estela en rosa pálido; 2, …». */
export function etiquetaDelLook(look: Look, indice: ReadonlyMap<string, PrendaDelProbador>): string {
  const partes = presentes(look).flatMap((z) => {
    const p = indice.get(look[z]!.id);
    return p ? [`${p.nombre} en ${colorDeLaPieza(p, look[z]!).nombre.toLocaleLowerCase("es")}`] : [];
  });
  return `Tu look: ${partes.map((x, i) => `${i + 1}, ${x}`).join("; ")}`;
}

/** Las prendas guardadas que ya no están (dejaron de verse en la web o ya no se pueden probar): el look sigue con las demás. */
export function textoDeLasQueFaltan(n: number): string | null {
  if (n <= 0) return null;
  return n === 1
    ? "Una prenda que guardaste ya no está: el look sigue con las demás."
    : `${n} prendas que guardaste ya no están: el look sigue con las demás.`;
}

/** La nota del final de la página: el precio y el stock no se guardan, se leen al día. */
export function notaDelGuardado(tienda: string | null): string {
  return `Cada vez que lo abres, el precio y lo que queda ${tienda ? `en ${tienda}` : "en las tiendas"} se ven al día.`;
}
