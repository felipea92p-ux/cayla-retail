// Reglas puras de /colaboradores: sin base de datos ni React, para probarlas sin ninguno de los dos y
// para que el servidor y el navegador digan exactamente lo mismo (importable desde ambos lados).
import { diaYHoraLima } from "./fechas-lima";
import type {
  Colaborador,
  ColaboradorSuspendido,
  DynamicDisponible,
  EventoAcceso,
  RolColaborador,
  Terminal,
} from "./colaboradores";

export const ETIQUETA_ROL: Record<RolColaborador, string> = { lider: "Líder", colaborador: "Colaborador" };

/** Lo que dice la confirmación de Desactivar / Reactivar (textos del spike aprobado, pantalla 5). Desactivar corta la
 *  sesión del aparato en el acto: `fn_terminal_actual()` deja de devolverlo y con eso todas sus lecturas y escrituras. */
export function confirmacionTerminal(t: Pick<Terminal, "nombre" | "activo">): { titulo: string; texto: string; boton: string } {
  return t.activo
    ? {
        titulo: `Desactivar ${t.nombre}`,
        texto: "El aparato deja de funcionar al instante: su sesión ya no puede leer ni guardar nada. Su historial se conserva.",
        boton: "Desactivar",
      }
    : { titulo: `Reactivar ${t.nombre}`, texto: "El aparato vuelve a funcionar con su misma clave.", boton: "Reactivar" };
}

/** El aviso de éxito tras alternar: «Terminal Ventas TRU desactivada». `activoAntes` es el estado ANTES de la acción. */
export function avisoTerminal(nombre: string, activoAntes: boolean): string {
  return `${nombre} ${activoAntes ? "desactivada" : "reactivada"}`;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type FiltroRol = "todos" | RolColaborador;

/** Nombre o correo, sin importar tildes ni mayúsculas, más el filtro por rol. */
export function filtrarColaboradores<T extends { nombre: string; correo: string; rol: RolColaborador }>(
  lista: readonly T[],
  texto: string,
  rol: FiltroRol
): T[] {
  const q = sinTildes(texto.trim());
  return lista.filter((c) => (rol === "todos" || c.rol === rol) && (q === "" || sinTildes(c.nombre).includes(q) || sinTildes(c.correo).includes(q)));
}

/** Para el buscador del modal de alta: nombre o correo. */
export function filtrarDisponibles(lista: readonly DynamicDisponible[], texto: string): DynamicDisponible[] {
  const q = sinTildes(texto.trim());
  return q === "" ? [...lista] : lista.filter((d) => sinTildes(d.nombre).includes(q) || sinTildes(d.correo).includes(q));
}

export type ResumenAccesos = {
  conAcceso: number;
  lideres: number;
  colaboradores: number;
  suspendidos: number;
  /** Cuentas activas en Dynamic: con acceso, suspendidas y las que todavía no tienen. */
  cuentasDynamic: number;
};

/** Los cuatro números de arriba, todos derivados de las listas reales (nada inventado). Desde el ADR-0162 las
 *  terminales no son personas ni viven en `fn_colaboradores()`: aquí solo se cuentan personas. */
export function resumirAccesos(
  activos: readonly Colaborador[],
  suspendidos: readonly ColaboradorSuspendido[],
  disponibles: readonly DynamicDisponible[]
): ResumenAccesos {
  const lideres = activos.filter((c) => c.rol === "lider").length;
  return {
    conAcceso: activos.length,
    lideres,
    colaboradores: activos.length - lideres,
    suspendidos: suspendidos.length,
    cuentasDynamic: activos.length + suspendidos.length + disponibles.length,
  };
}

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «Se agregarán 2 personas como Colaborador en Taller LIM». */
export function resumenAlta(cuantas: number, ubicacion: string | null): string {
  if (cuantas === 0) return "Elige al menos una persona para continuar";
  const donde = ubicacion ? ` en ${ubicacion}` : "";
  return `Se ${cuantas === 1 ? "agregará" : "agregarán"} ${plural(cuantas, "persona", "personas")} como Colaborador${donde}`;
}

/** Lo que puede hacer la fila del menú «⋯», en el orden en que se muestra. */
/* Colaboradores tiene DOS secciones (spike `docs/maquetas/colaboradores-ux-spike-2026-09/`, Felipe 2026-09-22): «Cuentas»
 * (personas y terminales, filtradas por estado) y «Roles y accesos». Antes eran 7 pestañas que mezclaban estados de una
 * misma lista, un tipo de cuenta, la configuración y un historial. Actividad se abre aparte: se consulta, no se trabaja ahí.
 * Vive aquí (y no en el panel, que es "use client") porque la página del servidor lee `?pestana=`. */
export type SeccionColaboradores = "cuentas" | "roles";
export type TipoCuenta = "personas" | "terminales";
export type EstadoCuenta = "activas" | "pendientes" | "suspendidas" | "inactivas";
export type VistaColaboradores = { seccion: SeccionColaboradores; tipo: TipoCuenta; estado: EstadoCuenta; actividad: boolean };

/** Los enlaces viejos (`?pestana=pendientes`, `?pestana=actividad`…) siguen llevando al mismo lugar. */
const VISTAS: Record<string, Partial<VistaColaboradores>> = {
  cuentas: {},
  activos: {},
  terminales: { tipo: "terminales" },
  roles: { seccion: "roles" },
  pendientes: { estado: "pendientes" },
  suspendidos: { estado: "suspendidas" },
  inactivas: { estado: "inactivas" },
  actividad: { actividad: true },
};

export function vistaDe(valor: string | undefined): VistaColaboradores {
  return { seccion: "cuentas", tipo: "personas", estado: "activas", actividad: false, ...VISTAS[valor ?? ""] };
}

export type AvisoPorAtender = { estado: EstadoCuenta; tono: "ambar" | "neutro"; titulo: string; detalle: string; accion: string };

/** «Por atender»: solo lo que pide que un líder haga algo. Con todo en cero, no hay avisos (y la pantalla no los pinta). */
export function porAtender(pendientes: number, inactivas: number): AvisoPorAtender[] {
  const avisos: AvisoPorAtender[] = [];
  if (pendientes > 0)
    avisos.push({
      estado: "pendientes",
      tono: "ambar",
      titulo: `${plural(pendientes, "alta espera", "altas esperan")} tu aprobación.`,
      detalle: "No pueden vender, abrir caja ni mover stock hasta que un líder la apruebe.",
      accion: "Revisar",
    });
  if (inactivas > 0)
    avisos.push({
      estado: "inactivas",
      tono: "neutro",
      titulo: `${plural(inactivas, "cuenta con acceso está inactiva", "cuentas con acceso están inactivas")} en Dynamic.`,
      detalle: "No pueden entrar. Si Dynamic las reactiva, recuperan su acceso solas.",
      accion: "Ver",
    });
  return avisos;
}

/** `cambiar_rol` (ADR-0161 B): el rol decide qué módulos ve. Desde 2026-09-22 también a un líder (se le baja o se sube a
 *  alguien a Líder); nunca a uno mismo. «Cambiar ubicación» sigue siendo solo de quien no es líder: un líder opera todas. */
export type AccionFila = "cambiar_rol" | "cambiar_ubicacion" | "suspender" | "quitar";

export function accionesDeFila(c: Pick<Colaborador, "rol" | "es_yo">): AccionFila[] {
  if (c.es_yo) return [];
  return c.rol === "colaborador" ? ["cambiar_rol", "cambiar_ubicacion", "suspender", "quitar"] : ["cambiar_rol", "suspender", "quitar"];
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** «16/09/2026», en hora de Lima (mismo día en servidor y navegador). */
export function fechaLima(iso: string): string {
  const lima = new Date(Date.parse(iso) - 5 * 3600 * 1000);
  return `${dosDigitos(lima.getUTCDate())}/${dosDigitos(lima.getUTCMonth() + 1)}/${lima.getUTCFullYear()}`;
}

/** «22/09 11:15», en hora de Lima. */
export function fechaHoraLima(iso: string): string {
  const { dia, hora } = diaYHoraLima(iso);
  return `${dia} ${hora}`;
}

/** Último ingreso a la app; nunca entró = «Aún no ingresa». */
export function ultimoAccesoTexto(iso: string | null): string {
  return iso ? fechaHoraLima(iso) : "Aún no ingresa";
}

export type FraseEvento = {
  etiqueta: string;
  tono: "verde" | "ambar" | "neutro";
  /** Partes de la frase: `fuerte` va en negrita (nombres). */
  partes: { texto: string; fuerte?: boolean }[];
  detalle: string | null;
};

const R = (texto: string, fuerte = false) => ({ texto, fuerte });
const como = (rol: RolColaborador | null) => (rol ? ETIQUETA_ROL[rol] : "Colaborador");

/** La frase de una línea del historial. `por_nombre` nulo solo pasa con las altas sembradas. */
export function fraseEvento(e: Pick<EventoAcceso, "accion" | "persona_nombre" | "por_nombre" | "rol" | "ubicacion_anterior" | "ubicacion_nueva" | "motivo">): FraseEvento {
  const quien = e.por_nombre ?? "Alguien";
  const persona = e.persona_nombre ?? "una persona";
  switch (e.accion) {
    case "alta":
      if (e.por_nombre === null) {
        return {
          etiqueta: "Alta",
          tono: "verde",
          partes: [R(persona, true), R(` ya tenía acceso como ${como(e.rol)} cuando se empezó a llevar este historial.`)],
          detalle: e.ubicacion_nueva ? `Ubicación: ${e.ubicacion_nueva}` : null,
        };
      }
      return {
        etiqueta: "Alta",
        tono: "verde",
        partes: [R(quien, true), R(" dio acceso a "), R(persona, true), R(` como ${como(e.rol)}.`)],
        detalle: e.ubicacion_nueva ? `Ubicación fija: ${e.ubicacion_nueva}` : null,
      };
    case "baja":
      return {
        etiqueta: "Baja",
        tono: "neutro",
        partes: [R(quien, true), R(" quitó el acceso a "), R(persona, true), R(".")],
        detalle: e.ubicacion_anterior ? `Estaba en: ${e.ubicacion_anterior}` : null,
      };
    case "suspension":
      return {
        etiqueta: "Suspensión",
        tono: "ambar",
        partes: [R(quien, true), R(" suspendió el acceso a "), R(persona, true), R(".")],
        detalle: e.motivo ? `Motivo: ${e.motivo}` : null,
      };
    case "reactivacion":
      return {
        etiqueta: "Reactivación",
        tono: "neutro",
        partes: [R(quien, true), R(" reactivó el acceso a "), R(persona, true), R(".")],
        detalle: e.ubicacion_nueva ? `Vuelve a: ${e.ubicacion_nueva}` : null,
      };
    case "aprobacion":
      return {
        etiqueta: "Aprobación",
        tono: "verde",
        partes: [R(quien, true), R(" aprobó el alta de "), R(persona, true), R(` como ${como(e.rol)}.`)],
        detalle: e.ubicacion_nueva ? `Ubicación: ${e.ubicacion_nueva}` : null,
      };
    case "ubicacion":
      return {
        etiqueta: "Ubicación",
        tono: "neutro",
        partes: [
          R(quien, true),
          R(" cambió la ubicación de "),
          R(persona, true),
          R(` de ${e.ubicacion_anterior ?? "—"} a `),
          R(e.ubicacion_nueva ?? "—", true),
          R("."),
        ],
        detalle: null,
      };
  }
}
