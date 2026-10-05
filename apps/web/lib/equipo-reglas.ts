// Reglas puras de «Equipo» (Colaboradores ▸ Equipo, propuesta de Felipe del 2026-10-05: una sola lista agrupada por sede,
// en vez de pestañas por estado). Sin base ni React: el servidor y el navegador dicen lo mismo, y se prueban solas
// (`equipo-reglas.test.ts`). Las RPC y los permisos no cambian: esto solo decide CÓMO se muestra lo que ya llega.
import type { Colaborador, ColaboradorInactivo, ColaboradorSuspendido, RolColaborador, Terminal } from "./colaboradores";
import { ETIQUETA_ROL, accionesDeFila, fechaLima, type AccionFila } from "./colaboradores-reglas";
import { diaYHoraLima } from "./fechas-lima";
import type { ClaveModulo } from "./modulos";

/** Una persona con acceso a retail, en cualquiera de sus estados. Quien fue dado de baja en Dynamic se muestra como
 *  suspendido (Felipe 2026-10-05: «si Dynamic dio de baja, en retail debería aparecer como suspendido»), con su nota. */
export type EstadoPersona = "activa" | "suspendida" | "baja_dynamic";

export type PersonaEquipo = {
  tipo: "persona";
  id: string;
  nombre: string;
  correo: string;
  estado: EstadoPersona;
  /** Líder o Integrante (la columna `colaboradores.rol`): decide quién la puede tocar, no lo que ve. */
  nivel: RolColaborador;
  /** El nombre del rol que ve (ADR-0161 B) o, sin roles leídos, el nivel. Es el ÚNICO rótulo de acceso en pantalla. */
  rolNombre: string;
  /** El id de su rol, si se leyó. */
  rolId: string | null;
  ubicacionId: string | null;
  ubicacionNombre: string | null;
  esYo: boolean;
  esAdmin: boolean;
  /** Marcó asistencia hoy en su sede y sigue en la jornada (Dynamic). */
  deTurno: boolean;
  ultimoAcceso: string | null;
  suspendidaEn: string | null;
  suspendidaPor: string | null;
  motivo: string | null;
  /** Lo que se le puede hacer desde la ficha, ya filtrado por quién mira (ADR-0178). */
  acciones: AccionFila[];
  /** ¿Quien mira puede reactivarla o quitarla? (solo si está suspendida en retail). */
  puedeReactivar: boolean;
};

export type AparatoEquipo = {
  tipo: "aparato";
  id: string;
  nombre: string;
  rolNombre: string;
  ubicacionId: string;
  ubicacionNombre: string;
  activo: boolean;
  ultimoAcceso: string | null;
};

export type MiembroEquipo = PersonaEquipo | AparatoEquipo;

type UbicacionMin = { id: string; nombre: string };

export type EntradaEquipo = {
  activos: readonly Colaborador[];
  suspendidos: readonly ColaboradorSuspendido[];
  inactivos: readonly ColaboradorInactivo[];
  /** `null` = no se pudieron leer: el equipo sale sin aparatos. */
  terminales: readonly Terminal[] | null;
  ubicaciones: readonly UbicacionMin[];
  /** El rol de cada persona (id y nombre), o `undefined` si no se leyeron los roles. */
  rolDe?: (personaId: string) => { id: string; nombre: string } | null;
  admins: readonly string[];
  fueraDeAlcance: readonly string[];
  soyAdmin: boolean;
  deTurno: ReadonlySet<string>;
};

/** Quien mira alcanza a esta persona: no está fuera de su alcance y, si es líder, quien mira es Admin. */
function alcanza(personaId: string, nivel: RolColaborador, e: Pick<EntradaEquipo, "fueraDeAlcance" | "soyAdmin">): boolean {
  return !e.fueraDeAlcance.includes(personaId) && (e.soyAdmin || nivel !== "lider");
}

export function armarEquipo(e: EntradaEquipo): MiembroEquipo[] {
  const porNombre = (nombre: string | null) => (nombre ? (e.ubicaciones.find((u) => u.nombre === nombre)?.id ?? null) : null);
  const rol = (id: string, nivel: RolColaborador) => {
    const r = e.rolDe?.(id);
    return { rolId: r?.id ?? null, rolNombre: r?.nombre ?? ETIQUETA_ROL[nivel] };
  };
  const activos: PersonaEquipo[] = e.activos.map((c) => ({
    tipo: "persona",
    id: c.persona_id,
    nombre: c.nombre,
    correo: c.correo,
    estado: "activa",
    nivel: c.rol,
    ...rol(c.persona_id, c.rol),
    ubicacionId: c.ubicacion_id,
    ubicacionNombre: c.ubicacion_asignada,
    esYo: c.es_yo,
    esAdmin: e.admins.includes(c.persona_id),
    deTurno: e.deTurno.has(c.persona_id),
    ultimoAcceso: c.ultimo_acceso,
    suspendidaEn: null,
    suspendidaPor: null,
    motivo: null,
    acciones: accionesDeFila(c, e.soyAdmin, !e.fueraDeAlcance.includes(c.persona_id)),
    puedeReactivar: false,
  }));
  const suspendidos: PersonaEquipo[] = e.suspendidos.map((c) => ({
    tipo: "persona",
    id: c.persona_id,
    nombre: c.nombre,
    correo: c.correo,
    estado: "suspendida",
    nivel: c.rol,
    ...rol(c.persona_id, c.rol),
    ubicacionId: porNombre(c.ubicacion_asignada),
    ubicacionNombre: c.ubicacion_asignada,
    esYo: false,
    esAdmin: false,
    deTurno: false,
    ultimoAcceso: null,
    suspendidaEn: c.suspendido_en,
    suspendidaPor: c.suspendido_por_nombre,
    motivo: c.motivo,
    acciones: [],
    puedeReactivar: alcanza(c.persona_id, c.rol, e),
  }));
  // La base no devuelve en qué sede de retail estaba (solo la de Dynamic): van a su propio grupo al final.
  const bajas: PersonaEquipo[] = e.inactivos.map((c) => ({
    tipo: "persona",
    id: c.persona_id,
    nombre: c.nombre,
    correo: c.correo,
    estado: "baja_dynamic",
    nivel: c.rol,
    ...rol(c.persona_id, c.rol),
    ubicacionId: null,
    ubicacionNombre: null,
    esYo: false,
    esAdmin: false,
    deTurno: false,
    ultimoAcceso: null,
    suspendidaEn: null,
    suspendidaPor: null,
    motivo: null,
    acciones: [],
    puedeReactivar: false,
  }));
  const aparatos: AparatoEquipo[] = (e.terminales ?? []).map((t) => ({
    tipo: "aparato",
    id: t.id,
    nombre: t.nombre,
    rolNombre: t.rol_nombre,
    ubicacionId: t.ubicacion_id,
    ubicacionNombre: t.ubicacion_nombre,
    activo: t.activo,
    ultimoAcceso: t.ultimo_acceso,
  }));
  return [...activos, ...suspendidos, ...bajas, ...aparatos];
}

/** Los atajos de arriba: toda CAYLA, cada sede, los suspendidos y los aparatos. */
export type FiltroEquipo = "todas" | "suspendidas" | "aparatos" | { sede: string };

export const SIN_SEDE = "_todas";
export const BAJA_DYNAMIC = "_dynamic";

export type GrupoEquipo = {
  /** El id de la ubicación, o `SIN_SEDE` (líderes que operan en todas) o `BAJA_DYNAMIC`. */
  clave: string;
  nombre: string;
  miembros: MiembroEquipo[];
  personas: number;
  aparatos: number;
  deTurno: number;
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function coincide(m: MiembroEquipo, texto: string): boolean {
  const q = sinTildes(texto.trim());
  if (!q) return true;
  const campos = m.tipo === "persona" ? [m.nombre, m.correo, m.rolNombre] : [m.nombre, m.rolNombre, "aparato"];
  return campos.some((c) => sinTildes(c).includes(q));
}

function pasaFiltro(m: MiembroEquipo, f: FiltroEquipo): boolean {
  if (f === "todas") return true;
  if (f === "aparatos") return m.tipo === "aparato";
  if (f === "suspendidas") return m.tipo === "persona" && m.estado !== "activa";
  return m.ubicacionId === f.sede;
}

/** Orden dentro de una sede: activas (líderes primero, luego por nombre), suspendidas, y al final los aparatos. */
function peso(m: MiembroEquipo): number {
  if (m.tipo === "aparato") return 3;
  if (m.estado !== "activa") return 2;
  return m.nivel === "lider" ? 0 : 1;
}

export function agruparPorSede(miembros: readonly MiembroEquipo[], ubicaciones: readonly UbicacionMin[], filtro: FiltroEquipo, texto: string): GrupoEquipo[] {
  const visibles = miembros.filter((m) => pasaFiltro(m, filtro) && coincide(m, texto));
  const claveDe = (m: MiembroEquipo) => (m.tipo === "persona" && m.estado === "baja_dynamic" ? BAJA_DYNAMIC : (m.ubicacionId ?? SIN_SEDE));
  const orden = [SIN_SEDE, ...ubicaciones.map((u) => u.id), BAJA_DYNAMIC];
  const nombreDe = (clave: string, ejemplo: MiembroEquipo) =>
    clave === SIN_SEDE ? "Todas las sedes" : clave === BAJA_DYNAMIC ? "Baja en Dynamic" : (ubicaciones.find((u) => u.id === clave)?.nombre ?? ejemplo.ubicacionNombre ?? "Otra sede");
  const grupos = new Map<string, MiembroEquipo[]>();
  for (const m of visibles) grupos.set(claveDe(m), [...(grupos.get(claveDe(m)) ?? []), m]);
  return [...grupos.entries()]
    .sort(([a], [b]) => (orden.indexOf(a) === -1 ? 99 : orden.indexOf(a)) - (orden.indexOf(b) === -1 ? 99 : orden.indexOf(b)))
    .map(([clave, ms]) => {
      const ordenados = [...ms].sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, "es"));
      return {
        clave,
        nombre: nombreDe(clave, ms[0]),
        miembros: ordenados,
        personas: ms.filter((m) => m.tipo === "persona").length,
        aparatos: ms.filter((m) => m.tipo === "aparato").length,
        deTurno: ms.filter((m) => m.tipo === "persona" && m.deTurno).length,
      };
    });
}

export type Atajo = { clave: string; etiqueta: string; filtro: FiltroEquipo; n: number };

/** Los atajos con su número. Una sede sin nadie no sale; «Suspendidos» y «Aparatos» solo si hay alguno. */
export function atajosEquipo(miembros: readonly MiembroEquipo[], ubicaciones: readonly UbicacionMin[]): Atajo[] {
  const personas = miembros.filter((m): m is PersonaEquipo => m.tipo === "persona");
  const aparatos = miembros.filter((m) => m.tipo === "aparato");
  const sedes = ubicaciones
    .map((u) => ({ clave: u.id, etiqueta: u.nombre, filtro: { sede: u.id } as FiltroEquipo, n: personas.filter((p) => p.ubicacionId === u.id).length }))
    .filter((a) => a.n > 0 || aparatos.some((x) => x.ubicacionId === a.clave));
  const suspendidas = personas.filter((p) => p.estado !== "activa").length;
  return [
    { clave: "todas", etiqueta: "Todas", filtro: "todas", n: personas.length },
    ...sedes,
    ...(suspendidas > 0 ? [{ clave: "suspendidas", etiqueta: "Suspendidos", filtro: "suspendidas" as const, n: suspendidas }] : []),
    ...(aparatos.length > 0 ? [{ clave: "aparatos", etiqueta: "Aparatos", filtro: "aparatos" as const, n: aparatos.length }] : []),
  ];
}

export function mismoFiltro(a: FiltroEquipo, b: FiltroEquipo): boolean {
  return typeof a === "string" || typeof b === "string" ? a === b : a.sede === b.sede;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIA_MS = 24 * 3600 * 1000;
/** El día calendario de Lima (UTC−5 fijo), como número de días desde 1970. */
const diaLima = (ms: number) => Math.floor((ms - 5 * 3600 * 1000) / DIA_MS);

/** «hoy 09:12», «ayer 18:05», «lun 16:20» (esta semana) o «12/09/2026»; sin fecha, «Aún no entra». En hora de Lima. */
export function cuandoEntro(iso: string | null, ahoraIso: string): string {
  if (!iso) return "Aún no entra";
  const t = Date.parse(iso);
  const dias = diaLima(Date.parse(ahoraIso)) - diaLima(t);
  const { hora } = diaYHoraLima(iso);
  if (dias <= 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  if (dias < 7) return `${DIAS[new Date(t - 5 * 3600 * 1000).getUTCDay()]} ${hora}`;
  return fechaLima(iso);
}

/** La frase de arriba de la ficha: lo importante de la persona en una línea. `fuerte` va en negrita. */
export function fraseFicha(p: PersonaEquipo, ahoraIso: string): { texto: string; fuerte?: boolean }[] {
  if (p.estado === "baja_dynamic")
    return [{ texto: "Está de baja en Dynamic", fuerte: true }, { texto: ": no puede entrar. Si su cuenta vuelve a estar activa allá, recupera el acceso." }];
  if (p.estado === "suspendida") {
    const partes = [{ texto: "Acceso suspendido", fuerte: true }, { texto: p.suspendidaEn ? ` el ${fechaLima(p.suspendidaEn)}` : "" }];
    if (p.suspendidaPor) partes.push({ texto: ` por ${p.suspendidaPor}` });
    partes.push({ texto: p.motivo ? `. Motivo: ${p.motivo}.` : "." });
    partes.push({ texto: " Conserva su sede, su rol y su historial." });
    return partes;
  }
  if (p.deTurno) return [{ texto: "Está de turno hoy", fuerte: true }, { texto: p.ubicacionNombre ? ` en ${p.ubicacionNombre}.` : "." }];
  if (!p.ultimoAcceso) return [{ texto: "Todavía no ha entrado al sistema", fuerte: true }, { texto: "." }];
  return [{ texto: "Entró por última vez " }, { texto: cuandoEntro(p.ultimoAcceso, ahoraIso), fuerte: true }, { texto: "." }];
}

/** Lo que gana y pierde una cuenta al pasar de un rol a otro (para «+ Caja · − Existencias» antes de confirmar). */
export function diferenciaDeModulos(antes: readonly ClaveModulo[], despues: readonly ClaveModulo[]): { suma: ClaveModulo[]; quita: ClaveModulo[] } {
  return { suma: despues.filter((m) => !antes.includes(m)), quita: antes.filter((m) => !despues.includes(m)) };
}

/** Las personas que la RPC de turno devuelve como presentes hoy en su propia sede (`fn_asesoras_de_turno`). */
export function presentesDeTurno(filas: readonly { persona_id: string; estado_ahora: string; es_de_esta_sede: boolean }[]): string[] {
  return filas.filter((f) => f.es_de_esta_sede && (f.estado_ahora === "presente" || f.estado_ahora === "en_pausa")).map((f) => f.persona_id);
}
