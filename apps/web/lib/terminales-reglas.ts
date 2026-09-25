// Reglas PURAS de las terminales (ADR-0162, sin tipo desde 20260923040000): cómo se nombra una terminal, qué correo y qué
// clave recibe su cuenta de Auth, y qué se valida antes de crearla. Sin red, sin base, sin React: se usan desde la Server
// Action (`app/actions/terminales.ts` → `lib/terminales-alta.ts`) y desde el script de respaldo `pnpm terminales:crear`
// (`scripts/terminales/crear.mjs`, que importa este archivo tal cual: Node 24 le quita los tipos al cargarlo). Por eso este
// archivo NO importa nada y no usa sintaxis que Node no sepa borrar (enums, `namespace`, propiedades de parámetro).
//
// Se prueba con `terminales-reglas.test.ts` (vitest) y con `pnpm terminales:probar` (node --test).

/** Una tienda de CAYLA y cómo se la reconoce por nombre: producción las llama «Tienda TRU» y el Postgres local «Tienda
 *  Trujillo», así que se aceptan las dos formas. */
export const TIENDAS: Readonly<Record<"TRU" | "AQP" | "LIM", readonly string[]>> = {
  TRU: ["tru", "trujillo"],
  AQP: ["aqp", "arequipa"],
  LIM: ["lim", "lima"],
};
export type CodigoTienda = keyof typeof TIENDAS;

export type UbicacionParaTerminal = { id: string; nombre: string; tipo: string; activo: boolean };

/** El nombre de una terminal, como lo vio quien lo escribió pero sin espacios de sobra. */
export const NOMBRE_MAX = 60;

/** Lo que se sugiere al crear: la mayoría de las terminales son el mostrador (Felipe, 2026-09-22). */
export const CLAVE_ROL_SUGERIDO = "terminal_ventas";

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** «Terminal  Caja   TRU » → «Terminal Caja TRU». */
export function normalizarNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ");
}

/** El código corto de una tienda para el correo: TRU/AQP/LIM si su nombre lo lleva (como palabra suelta, por código o por
 *  ciudad); si no, las primeras letras de su nombre sin «tienda» (una tienda nueva no rompe nada). */
export function codigoDeTienda(nombreUbicacion: string): string {
  const palabras = sinTildes(nombreUbicacion).split(/[^a-z0-9]+/).filter(Boolean);
  for (const [codigo, claves] of Object.entries(TIENDAS)) {
    if (claves.some((c) => palabras.includes(c))) return codigo.toLowerCase();
  }
  const resto = palabras.filter((p) => p !== "tienda").join("");
  return (resto || "tienda").slice(0, 8);
}

/** Minúsculas, sin tildes, solo letras y números separados por guiones; recortado sin dejar un guion al final. */
export function slug(texto: string, max = 24): string {
  const s = sinTildes(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, max).replace(/-+$/g, "") || "terminal";
}

/** De la lista de ubicaciones, la tienda ACTIVA que corresponde a un código (el script recibe «TRU»). Exige exactamente
 *  una: con cero o con dos, lanza y dice cuáles hay (mejor detenerse que crear en la tienda equivocada). */
export function resolverTienda<U extends UbicacionParaTerminal>(ubicaciones: readonly U[], codigo: CodigoTienda): U {
  const claves = TIENDAS[codigo];
  const tiendas = ubicaciones.filter((u) => u.tipo === "tienda" && u.activo);
  const coinciden = tiendas.filter((u) => {
    const palabras = sinTildes(u.nombre).split(/[^a-z0-9]+/);
    return claves.some((c) => palabras.includes(c));
  });
  const lista = tiendas.map((u) => `«${u.nombre}»`).join(", ") || "ninguna";
  if (coinciden.length === 0) throw new Error(`No encontré una tienda activa para ${codigo}. Tiendas activas: ${lista}.`);
  if (coinciden.length > 1) throw new Error(`Hay más de una tienda activa que parece ${codigo}: ${coinciden.map((u) => `«${u.nombre}»`).join(", ")}.`);
  return coinciden[0]!;
}

/** Devuelve n bytes aleatorios. En el servidor, `crypto.randomBytes`/`getRandomValues`; en las pruebas, uno fijo. */
export type Azar = (n: number) => ArrayLike<number>;

// Sin 0/O, 1/l/I: la clave se escribe UNA vez a mano en el aparato y no debe prestarse a confusión.
export const ALFABETO_CLAVE = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Para el sufijo del correo: solo minúsculas y números, sin los confundibles.
const ALFABETO_SUFIJO = "abcdefghijkmnpqrstuvwxyz23456789";

/** `largo` símbolos del alfabeto, cada uno igual de probable: se descartan los bytes que sesgarían el reparto (rechazo). */
function simbolos(azar: Azar, alfabeto: string, largo: number): string {
  const tope = 256 - (256 % alfabeto.length);
  const salida: string[] = [];
  while (salida.length < largo) {
    const bytes = azar(32);
    for (let i = 0; i < bytes.length && salida.length < largo; i++) {
      const b = bytes[i]!;
      if (b < tope) salida.push(alfabeto[b % alfabeto.length]!);
    }
  }
  return salida.join("");
}

/** Clave fuerte y tecleable: 4 grupos de 5 (20 símbolos de 56 ≈ 116 bits), p. ej. «Hk7mP-q2Rst-…». */
export function generarClave(azar: Azar): string {
  const s = simbolos(azar, ALFABETO_CLAVE, 20);
  return [0, 5, 10, 15].map((i) => s.slice(i, i + 5)).join("-");
}

/** 4 símbolos al azar para que dos terminales con el mismo nombre (una desactivada y su reemplazo) no choquen en Auth. */
export function sufijoAzar(azar: Azar): string {
  return simbolos(azar, ALFABETO_SUFIJO, 4);
}

/** terminal-tru-terminal-caja-tru-k7m2@cayla.pe — sin datos de ninguna persona: tienda, nombre del aparato y azar. */
export function correoTerminal(tienda: string, nombre: string, sufijo: string): string {
  // El nombre suele repetir «terminal» y el código de la tienda: se quitan para que el correo no diga todo dos veces.
  const nombreCorto = slug(
    sinTildes(nombre)
      .split(/[^a-z0-9]+/)
      .filter((p) => p && p !== "terminal" && p !== tienda)
      .join(" ") || nombre,
  );
  return `terminal-${slug(tienda, 8)}-${nombreCorto}-${sufijo}@cayla.pe`;
}

export type EntradaTerminal = { ubicacionId: string; nombre: string; rolId: string };
export type Validacion = { ok: true; datos: EntradaTerminal } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que se revisa ANTES de tocar Auth (la base lo vuelve a exigir con su disparador; esto solo da un mensaje claro). */
export function validarEntrada(entrada: Partial<EntradaTerminal> | null | undefined): Validacion {
  const ubicacionId = String(entrada?.ubicacionId ?? "").trim();
  const rolId = String(entrada?.rolId ?? "").trim();
  const nombre = normalizarNombre(String(entrada?.nombre ?? ""));
  if (!UUID.test(ubicacionId)) return { ok: false, error: "Elige la tienda de la terminal." };
  if (nombre.length === 0) return { ok: false, error: "Ponle un nombre a la terminal, por ejemplo «Terminal Caja TRU»." };
  if (nombre.length > NOMBRE_MAX) return { ok: false, error: `El nombre es muy largo: hasta ${NOMBRE_MAX} letras.` };
  if (!UUID.test(rolId)) return { ok: false, error: "Elige el rol de la terminal: es lo que decide qué ve." };
  return { ok: true, datos: { ubicacionId, nombre, rolId } };
}

/** ¿Ya hay una terminal ACTIVA con ese nombre en esa tienda? Misma comparación que el índice de la base
 *  (`lower(btrim(nombre))`), más el colapso de espacios que ya hizo `normalizarNombre`. */
export function nombreOcupado(activas: readonly { ubicacion_id: string; nombre: string; activo: boolean }[], ubicacionId: string, nombre: string): boolean {
  const buscado = normalizarNombre(nombre).toLowerCase();
  return activas.some((t) => t.activo && t.ubicacion_id === ubicacionId && normalizarNombre(t.nombre).toLowerCase() === buscado);
}

/** Los módulos que solo se dan a PERSONAS (ADR-0161 P6, 20260923140000): un aparato compartido no da ni quita accesos. La
 *  misma lista vive en `lib/modulos.ts` (MODULOS_SOLO_PERSONAS) y en la base (`fn_exigir_rol_de_terminal`); aquí se repite
 *  porque este archivo no importa nada (lo carga Node tal cual). `terminales-reglas.test.ts` vigila que digan lo mismo. */
export const MODULOS_SOLO_PERSONAS_TERMINAL: readonly string[] = ["colaboradores", "roles", "actividad"];

/** Un rol que se le puede dar a una terminal: vigente, que no sea Líder (los permisos son de la cuenta, y una cuenta
 *  compartida no puede ser líder) y sin Colaboradores ni Roles y accesos (P6). */
export function rolesParaTerminal<R extends { archivado: boolean; fijo: boolean; clave: string | null; modulos?: readonly string[] }>(roles: readonly R[]): R[] {
  return roles.filter(
    (r) => !r.archivado && !r.fijo && r.clave !== "lider" && !(r.modulos ?? []).some((m) => MODULOS_SOLO_PERSONAS_TERMINAL.includes(m)),
  );
}

/** El rol que sale elegido al abrir «Nueva terminal»: «Terminal de ventas», o nada si no está disponible. */
export function rolSugerido(roles: readonly { id: string; clave: string | null; archivado: boolean; fijo: boolean }[]): string {
  return rolesParaTerminal(roles).find((r) => r.clave === CLAVE_ROL_SUGERIDO)?.id ?? "";
}

/** Nombre que se propone al elegir la tienda: «Terminal Caja TRU», o «Terminal Caja 2 TRU» si ya hay una. */
export function nombrePropuesto(codigo: string, ocupados: readonly string[]): string {
  const cod = codigo.toUpperCase();
  const libres = (n: string) => !ocupados.some((o) => normalizarNombre(o).toLowerCase() === n.toLowerCase());
  const base = `Terminal Caja ${cod}`;
  if (libres(base)) return base;
  for (let i = 2; i < 100; i++) {
    const n = `Terminal Caja ${i} ${cod}`;
    if (libres(n)) return n;
  }
  return base;
}

/** Del error de Postgres/PostgREST al insertar, lo que se le dice al líder. Nunca el mensaje crudo de la base cuando se
 *  sabe qué pasó. */
export function mensajeErrorAlta(error: { code?: string | null; message?: string | null } | null | undefined): string {
  if (!error) return "No se pudo crear la terminal. Inténtalo de nuevo.";
  if (error.code === "23505") return "Esa tienda ya tiene una terminal activa con ese nombre. Elige otro.";
  if (error.code === "23514" || error.code === "23502" || error.code === "23503") {
    return error.message ? `No se pudo crear: ${error.message}` : "La base rechazó la terminal.";
  }
  return `No se pudo crear la terminal: ${error.message ?? "error desconocido"}`;
}
