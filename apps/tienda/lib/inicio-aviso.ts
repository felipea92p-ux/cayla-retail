import { z } from "zod";
import { beneficioAniversario, beneficioCumple, listaDicha, type Aniversario } from "./club";
import type { Dia } from "./cuentas";

// El aviso al entrar (ADR-0408; Felipe, 2026-10-14: «Si no le llegan los avisos por WhatsApp, cuando inicie sesión igual le debe salir
// algún mensaje»). Al entrar se llega al Inicio, y ahí arriba sale lo que la persona tiene a su favor en el Club: su descuento de
// cumpleaños disponible, su vale por aniversario disponible o una talla que esperaba con «Avísame» y ya llegó. Sale para todo el que
// tiene cuenta (es su beneficio, no publicidad), se cierra con «Entendido» y no vuelve a salir para ESE mismo beneficio: lo recuerda el
// navegador, con una cookie por beneficio. En «Mi cuenta» sigue siempre.
//
// La base dice qué hay (`retail.tienda_mis_avisos_del_club`, con las reglas que cobra la caja); aquí, qué se dice, cómo se llama cada
// aviso y cuánto dura su cookie. Lógica pura, con su prueba al lado. Los textos del cumpleaños y del vale son los MISMOS de «Mi cuenta»
// (`beneficioCumple`, `beneficioAniversario`): un beneficio se dice igual en los dos lugares.

/* ---------------- Lo que devuelve la base ---------------- */

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const esquema = z.object({
  cumple: z.object({ pct: z.coerce.number().positive(), hasta: fecha }).nullable(),
  vale: z.object({ monto: z.coerce.number().positive(), vence: fecha, aniversario: fecha }).nullable(),
  llegaron: z.array(z.unknown()),
});
const esquemaLlego = z.object({
  id: z.string().uuid(),
  producto: z.string().min(1),
  color: z.string().nullable(),
  talla: z.string().nullable(),
  sede: z.string().nullable(),
  hay_en: z.array(z.string()),
});

export type IconoAviso = "regalo" | "ticket" | "campana";
/** Un beneficio a favor de la persona, como se dice en el aviso. `clave`: cómo se llama su cookie (sin el prefijo). */
export type AvisoClub = { clave: string; tipo: "cumple" | "vale" | "llego"; icono: IconoAviso; titulo: string; texto: string };

/** «Blusa Emma ya llegó», «Negro · Talla M. Hay en Trujillo: sepárala antes de que se acabe.» */
function avisoDeLlegada(e: z.infer<typeof esquemaLlego>, dueno: string): AvisoClub {
  const detalle = [e.color, e.talla ? `Talla ${e.talla}` : null].filter(Boolean).join(" · ");
  const donde = e.sede ? [e.sede] : e.hay_en;
  const hay = donde.length ? `Hay en ${listaDicha(donde)}: sepárala antes de que se acabe.` : "Sepárala antes de que se acabe.";
  return {
    clave: `llego-${dueno}-${e.id}`,
    tipo: "llego",
    icono: "campana",
    titulo: `${e.producto} ya llegó`,
    texto: detalle ? `${detalle}. ${hay}` : hay,
  };
}

/** El vale disponible como lo ve «Mi cuenta»: el caso «vale» de `beneficioAniversario` solo mira el monto y hasta cuándo. */
const aniversarioConVale = (monto: number, vence: string): Aniversario => ({
  estado: "vale",
  valeMonto: monto,
  valeVence: vence,
  valeCanjeadoEl: null,
  proximo: null,
  anioCuenta: false,
  compras: 0,
  monto: 0,
  comprasMeta: 1,
  montoMeta: 1,
  siguienteMonto: null,
  dias: 1,
});

/**
 * Lo que la base dice que está a favor de la persona, en palabras: primero el cumpleaños, después el vale y al final lo que llegó (lo
 * último que pidió primero). `usuarioId` le pone dueño a cada clave (sus 8 primeras letras): en un aparato que comparten dos personas,
 * cerrar el aviso de una no cierra ni borra el de la otra. null si la respuesta no tiene la forma (no sale ningún aviso a medias); una
 * espera rara se deja fuera sola.
 */
export function avisosDelClub(dato: unknown, usuarioId: string, hoy: Dia): AvisoClub[] | null {
  const r = esquema.safeParse(dato);
  if (!r.success) return null;
  const dueno = usuarioId.toLowerCase().slice(0, 8);
  const avisos: AvisoClub[] = [];
  const { cumple, vale, llegaron } = r.data;
  if (cumple) {
    const b = beneficioCumple({ estado: "disponible", dia: null, mes: null, pct: cumple.pct, hasta: cumple.hasta, canjeadoEl: null }, false, hoy);
    avisos.push({ clave: `cumple-${dueno}-${cumple.hasta}`, tipo: "cumple", icono: "regalo", titulo: b.titulo, texto: b.texto });
  }
  if (vale) {
    const b = beneficioAniversario(aniversarioConVale(vale.monto, vale.vence), false, hoy);
    avisos.push({ clave: `vale-${dueno}-${vale.vence}`, tipo: "vale", icono: "ticket", titulo: b.titulo, texto: b.texto });
  }
  for (const crudo of llegaron) {
    const e = esquemaLlego.safeParse(crudo);
    if (e.success) avisos.push(avisoDeLlegada(e.data, dueno));
  }
  return avisos;
}

/* ---------------- Qué sale y cuándo ---------------- */

/** Cuántas tallas que llegaron se nombran una por una; las demás van en una línea («Y llegaron 2 más…»). */
const LLEGADAS_A_LA_VISTA = 3;

export type AvisoAlEntrar = {
  /** Lo que se nombra, en orden. */
  lineas: AvisoClub[];
  /** Cuántas tallas más llegaron (sin nombrarlas). */
  mas: number;
  /** Todo lo que «Entendido» da por visto (lo nombrado y lo contado en «mas»). */
  claves: string[];
};

/** El aviso del Inicio: lo que está a favor y la persona todavía no cerró. null si no hay nada (el aviso no sale). */
export function avisoAlEntrar(avisos: readonly AvisoClub[], vistos: ReadonlySet<string>): AvisoAlEntrar | null {
  const pendientes = avisos.filter((a) => !vistos.has(a.clave));
  if (pendientes.length === 0) return null;
  const beneficios = pendientes.filter((a) => a.tipo !== "llego");
  const llegadas = pendientes.filter((a) => a.tipo === "llego");
  return {
    lineas: [...beneficios, ...llegadas.slice(0, LLEGADAS_A_LA_VISTA)],
    mas: Math.max(0, llegadas.length - LLEGADAS_A_LA_VISTA),
    claves: pendientes.map((a) => a.clave),
  };
}

/** «Y llegó 1 talla más que esperabas: mírala en Mi perfil.» */
export const textoDeMas = (n: number) =>
  n === 1 ? "Y llegó 1 talla más que esperabas: mírala en Mi perfil." : `Y llegaron ${n} tallas más que esperabas: míralas en Mi perfil.`;

/* ---------------- La cookie de cada aviso ---------------- */

/** El prefijo de las cookies de los avisos cerrados (una por beneficio). */
const COOKIE_AVISO = "tienda-aviso-";
// tipo-dueño-qué: el cumpleaños y el vale, con su último día; lo que llegó, con su espera.
const CLAVE = /^(?:(?:cumple|vale)-[0-9a-f]{8}-\d{4}-\d{2}-\d{2}|llego-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** ¿Tiene la forma de la clave de un aviso? (lo que llega del navegador se revisa antes de escribir una cookie con ella). */
const esClaveDeAviso = (v: unknown): v is string => typeof v === "string" && CLAVE.test(v);

/** De quién es un aviso (las 8 primeras letras de su usuario). */
const duenoDeClave = (clave: string) => clave.split("-")[1] ?? "";

export const nombreCookieAviso = (clave: string) => `${COOKIE_AVISO}${clave}`;

/** La clave de un aviso a partir del nombre de su cookie; null si no es una cookie de aviso. */
export function claveDeCookie(nombre: string): string | null {
  if (!nombre.startsWith(COOKIE_AVISO)) return null;
  const clave = nombre.slice(COOKIE_AVISO.length);
  return esClaveDeAviso(clave) ? clave : null;
}

/** Las cookies de aviso que «Entendido» borra: las de la MISMA persona (el dueño de lo que cerró) cuyo aviso ya no está a su favor.
 *  Las de otra persona que usa el mismo aparato no se tocan. */
export function cookiesQueSobran(nombres: readonly string[], cerradas: readonly string[], activas: readonly string[]): string[] {
  const vigentes = new Set([...activas, ...cerradas]);
  const duenos = new Set(cerradas.map(duenoDeClave));
  return nombres.filter((n) => {
    const clave = claveDeCookie(n);
    return clave !== null && duenos.has(duenoDeClave(clave)) && !vigentes.has(clave);
  });
}

/** Lo que manda «Entendido»: de 1 a 40 claves de aviso (un aviso tiene a lo más el cumpleaños, el vale y 30 esperas). Si no, null. */
export function clavesDelNavegador(dato: unknown): string[] | null {
  if (!Array.isArray(dato) || dato.length === 0 || dato.length > 40 || !dato.every(esClaveDeAviso)) return null;
  return [...new Set(dato)];
}

const DIA_S = 24 * 60 * 60;
/** Lo que más dura una cookie en los navegadores (Chrome la corta a 400 días). Una talla que llegó no tiene fecha: medio año. */
const DIAS_DE_UNA_LLEGADA = 180;

/** Cuántos segundos dura la cookie de un aviso cerrado: el cumpleaños y el vale, hasta un día después de su último día (después ya no
 *  salen); lo que llegó, medio año (si la talla se vuelve a acabar y a llegar, `Entendido` borra la cookie vieja y vuelve a avisar). */
export function vidaDeLaCookie(clave: string, hoy: Dia): number {
  const m = /-(\d{4})-(\d{2})-(\d{2})$/.exec(clave);
  if (!clave.startsWith("llego-") && m) {
    const hasta = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const desde = Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia);
    const dias = Math.round((hasta - desde) / (DIA_S * 1000)) + 2;
    return Math.min(400, Math.max(1, dias)) * DIA_S;
  }
  return DIAS_DE_UNA_LLEGADA * DIA_S;
}
