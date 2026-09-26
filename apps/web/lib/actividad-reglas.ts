// La actividad de cada módulo (ADR-0207; migración 20260926090000_actividad_por_modulo.sql).
//
// PROMETE: quién ve el botón «Actividad», de qué módulo es la pantalla donde uno está parado, qué módulos ya anotan su
// actividad, el rango de fechas de cada periodo (en hora de Lima) y cómo se agrupan las filas por día. Lógica pura: se
// importa desde el servidor y desde el cliente, y se prueba con `actividad-reglas.test.ts`.
//
// El alcance real (el líder ve todas las sedes; con el módulo, solo la suya; una terminal, nunca) lo hace cumplir la base
// en `fn_actividad`. Esto solo decide qué se pinta.

import { ARBOL, rutaActiva, type Nodo } from "./menu";
import { MODULOS, type ClaveModulo } from "./modulos";

/** Los módulos que ya anotan su actividad. Crece con cada migración que suma los disparadores de un módulo. */
export const MODULOS_CON_ACTIVIDAD: readonly ClaveModulo[] = ["vender", "historial", "caja", "cambios"];

export function anotaActividad(clave: ClaveModulo): boolean {
  return MODULOS_CON_ACTIVIDAD.includes(clave);
}

/** ¿Esta cuenta ve el botón «Actividad»? El líder (y el Admin, que es líder), o una PERSONA cuyo rol ve el módulo. Una
 *  terminal nunca: es un aparato compartido de mostrador. */
export function veActividad(perfil: { rol: "lider" | "integrante"; terminal?: boolean; modulos?: readonly ClaveModulo[] | null }): boolean {
  if (perfil.terminal) return false;
  return perfil.rol === "lider" || !!perfil.modulos?.includes("actividad");
}

/** Las pantallas que no cuelgan del lateral pero sí son de un módulo. */
const RUTAS_FUERA_DEL_MENU: readonly { ruta: string; modulo: ClaveModulo }[] = [
  { ruta: "/clientas", modulo: "clientas" },
  { ruta: "/colaboradores", modulo: "colaboradores" },
  { ruta: "/configuracion", modulo: "configuracion" },
];

function hojasConModulo(nodos: readonly Nodo[]): { ruta: string; modulo: ClaveModulo }[] {
  return nodos.flatMap((n) => {
    if (n.estado !== "viva") return [];
    if ("hijos" in n && n.hijos) return hojasConModulo(n.hijos);
    return "ruta" in n && n.modulo ? [{ ruta: n.ruta, modulo: n.modulo }] : [];
  });
}

const RUTAS_DE_MODULO = [...hojasConModulo(ARBOL), ...RUTAS_FUERA_DEL_MENU];

/** El módulo de la pantalla donde uno está parado: la ruta más larga que la contiene (`/vender/historial` es del
 *  Historial, no del Punto de venta). Inicio, Buscar o una ruta sin módulo: `null` (el panel muestra todos). */
export function moduloDeRuta(pathname: string): ClaveModulo | null {
  let mejor: { ruta: string; modulo: ClaveModulo } | null = null;
  for (const r of RUTAS_DE_MODULO) {
    if (rutaActiva(pathname, r.ruta) && (!mejor || r.ruta.length > mejor.ruta.length)) mejor = r;
  }
  return mejor?.modulo ?? null;
}

export function nombreDeModulo(clave: string): string {
  return MODULOS.find((m) => m.clave === clave)?.nombre ?? clave;
}

// Los combos de la actividad son `Desplegable` del sistema (ADR-0209), no el <select> del navegador. Un `Desplegable`
// con un valor que no está entre sus opciones muestra «Elegir»: por eso lo elegido SIEMPRE está en la lista. En los dos
// casos, `""` es «todos».

/** El combo «Módulo» (panel de la cabecera y pantalla completa): todos, los que ya anotan su actividad y, si uno está
 *  parado en un módulo que todavía no anota, ese también — el combo dice dónde está uno y la nota explica que aún no anota. */
export function opcionesDeModulo(actual: ClaveModulo | null): { valor: ClaveModulo | ""; texto: string }[] {
  const claves = actual && !anotaActividad(actual) ? [...MODULOS_CON_ACTIVIDAD, actual] : MODULOS_CON_ACTIVIDAD;
  return [{ valor: "", texto: "Todos los módulos" }, ...claves.map((m) => ({ valor: m, texto: nombreDeModulo(m) }))];
}

/** Lo que devuelve `fn_actividad_personas`: quienes tienen actividad en la sede y el módulo que se miran. */
export type PersonaConActividad = { persona_id: string; nombre: string };

/** El combo «Persona»: todas y quienes tienen actividad en lo que se mira. Si la elegida sale de esa lista (se cambió de
 *  módulo o de sede y ahí no hizo nada), sigue en el combo: un filtro no se cambia solo, y el combo dice a quién filtra. */
export function opcionesDePersona(
  personas: readonly PersonaConActividad[],
  elegida: PersonaConActividad | null,
): { valor: string; texto: string }[] {
  const lista = elegida && !personas.some((p) => p.persona_id === elegida.persona_id) ? [...personas, elegida] : personas;
  return [{ valor: "", texto: "Todas las personas" }, ...lista.map((p) => ({ valor: p.persona_id, texto: p.nombre }))];
}

/** Lo que devuelve `fn_actividad`. */
export type FilaActividad = {
  id: number;
  ocurrio_at: string;
  modulo: string;
  accion: string;
  descripcion: string;
  persona_id: string | null;
  persona_nombre: string | null;
  terminal_nombre: string | null;
  ubicacion_id: string | null;
  ubicacion_nombre: string | null;
  ubicacion_destino_nombre: string | null;
  tabla: string;
  registro_id: string;
  detalle: Record<string, unknown>;
  origen: "vivo" | "carga_inicial";
};

export type Periodo = "hoy" | "7d" | "30d" | "todo";
export const PERIODOS: readonly { clave: Periodo; etiqueta: string }[] = [
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "7d", etiqueta: "7 días" },
  { clave: "30d", etiqueta: "30 días" },
  { clave: "todo", etiqueta: "Todo" },
];

// Lima no cambia de hora en el año: UTC−5 fijo. Las tiendas viven en ese reloj, no en el del aparato de quien mira.
const LIMA_MS = 5 * 60 * 60 * 1000;

/** La medianoche de Lima del día de `ahora`, en UTC. */
export function inicioDelDiaLima(ahora: Date): Date {
  const lima = new Date(ahora.getTime() - LIMA_MS);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate()) + LIMA_MS);
}

/** Desde cuándo pedir la actividad: «Hoy» desde la medianoche de Lima; «7 días» incluye hoy y los 6 anteriores. */
export function desdeDe(periodo: Periodo, ahora: Date): string | null {
  const hoy = inicioDelDiaLima(ahora).getTime();
  const DIA = 24 * 60 * 60 * 1000;
  switch (periodo) {
    case "hoy":
      return new Date(hoy).toISOString();
    case "7d":
      return new Date(hoy - 6 * DIA).toISOString();
    case "30d":
      return new Date(hoy - 29 * DIA).toISOString();
    case "todo":
      return null;
  }
}

const FECHA_LARGA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" });
const HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });

export function horaLima(iso: string): string {
  return HORA.format(new Date(iso));
}

/** «Hoy», «Ayer» o «jueves, 24 de setiembre», en hora de Lima. */
export function etiquetaDelDia(iso: string, ahora: Date): string {
  const DIA = 24 * 60 * 60 * 1000;
  const hoy = inicioDelDiaLima(ahora).getTime();
  const dia = inicioDelDiaLima(new Date(iso)).getTime();
  if (dia === hoy) return "Hoy";
  if (dia === hoy - DIA) return "Ayer";
  const texto = FECHA_LARGA.format(new Date(iso));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Las filas, ya ordenadas de la más nueva a la más vieja, partidas por día. */
export function agruparPorDia(filas: readonly FilaActividad[], ahora: Date): { dia: string; filas: FilaActividad[] }[] {
  const grupos: { dia: string; filas: FilaActividad[] }[] = [];
  for (const f of filas) {
    const dia = etiquetaDelDia(f.ocurrio_at, ahora);
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.dia === dia) ultimo.filas.push(f);
    else grupos.push({ dia, filas: [f] });
  }
  return grupos;
}

/** Quién lo hizo, como se lee: el nombre, o «Alguien» en una fila vieja sin firma. */
export function quien(f: Pick<FilaActividad, "persona_nombre">): string {
  return f.persona_nombre?.trim() || "Alguien";
}

/** La línea chica de debajo: hora, aparato, sede (solo si se miran varias) y si fue una venta de prueba. */
export function pieDeFila(f: FilaActividad, opciones: { conSede: boolean }): string {
  const partes = [horaLima(f.ocurrio_at)];
  if (f.terminal_nombre) partes.push(f.terminal_nombre);
  if (opciones.conSede && f.ubicacion_nombre) {
    partes.push(f.ubicacion_destino_nombre ? `${f.ubicacion_nombre} → ${f.ubicacion_destino_nombre}` : f.ubicacion_nombre);
  }
  if (f.detalle?.es_prueba) partes.push("prueba");
  return partes.join(" · ");
}

export const TAMANO_PAGINA = 40;
