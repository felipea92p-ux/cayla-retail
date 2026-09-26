// Crear una terminal y cambiarle la clave desde la PANTALLA (Felipe, 2026-09-22: ya no solo con el script).
//
// EL PROBLEMA PRIMERO. Crear la cuenta de Auth de un aparato exige la llave de servicio, que salta todo candado (RLS).
// El ADR-0162 la dejó fuera de la web por eso. Traerla a la web solo es aceptable si NADIE sin permiso puede llegar a
// usarla. Por eso el orden de este archivo es la regla:
//   1. Se pregunta a la base, con la SESIÓN de quien llama (no con la llave), si puede gestionar colaboradores
//      (`fn_puede_gestionar_colaboradores()`: el líder, o un rol con el módulo Colaboradores — Felipe, 2026-09-22,
//      20260923131000; antes solo `fn_es_lider()`). Si no puede, o la pregunta falla, se rechaza y la llave NI SE CREA.
//   2. Recién ahí se abre el cliente con la llave (`admin()`), se valida tienda, rol y nombre, y se crea la cuenta.
//   3. Si la fila de `retail.terminales` no entra, se borra la cuenta recién creada: nunca queda una cuenta que pueda
//      iniciar sesión sin terminal (misma lógica que `pnpm terminales:crear`).
//   4. La clave vuelve UNA vez a la pantalla y no se guarda ni se escribe en ningún log.
//
// QUIÉN (ADR-0161 act. d, 2026-09-23, `20260923240000`). La pantalla manda la firma del combo «Responsable» y la sesión
// de quien llama viaja firmada. `personaActual` (`fn_actor_persona_id(true)`) se pregunta JUSTO después del permiso: si no
// hay responsable válido, se corta ahí —antes de abrir la llave y de crear la cuenta de Auth— con el mensaje de la base.
// Al crear, ese responsable es `creada_por`; al cambiar la clave, `registrar_cambio_clave_terminal` lo anota después.
//
// Aquí no hay Supabase ni Next: todo lo que habla con afuera llega por `Dependencias`. Así la verificación de líder se
// prueba con un doble (`terminales-alta.test.ts`) sin base ni llave. La Server Action (`app/actions/terminales.ts`) le pasa
// las de verdad (`lib/terminales-admin.ts`, `server-only`).

import {
  codigoDeTienda,
  correoTerminal,
  generarClave,
  mensajeErrorAlta,
  sufijoAzar,
  validarEntrada,
  type Azar,
  type EntradaTerminal,
} from "./terminales-reglas";

/** El error de la base tal cual (forma de supabase-js), para que la pantalla lo reconozca como «del responsable». */
export type ErrorBase = { code?: string | null; hint?: string | null; message?: string | null };

export type ResultadoClave =
  /** `aviso`: la clave SÍ cambió, pero no quedó anotado quién (falló `registrar_cambio_clave_terminal`). */
  | { ok: true; nombre: string; tienda: string; correo: string; clave: string; aviso?: string }
  /** `causa`: el error de la base cuando el rechazo vino del responsable (para `responsable.despues`). */
  | { ok: false; error: string; causa?: ErrorBase };

/** Lo que se hace con la llave de servicio. Solo existe DESPUÉS de comprobar que quien llama puede gestionar colaboradores. */
export type AdminTerminales = {
  leerTienda: (id: string) => Promise<{ id: string; nombre: string; tipo: string; activo: boolean } | null>;
  leerRol: (id: string) => Promise<{ id: string; nombre: string; clave: string | null; fijo: boolean; archivado: boolean } | null>;
  nombreActivoOcupado: (ubicacionId: string, nombre: string) => Promise<boolean>;
  crearUsuario: (correo: string, clave: string) => Promise<{ id: string } | { error: string; yaExiste: boolean }>;
  borrarUsuario: (id: string) => Promise<boolean>;
  insertarTerminal: (fila: {
    ubicacion_id: string;
    nombre: string;
    rol_id: string;
    auth_user_id: string;
    creada_por: string | null;
  }) => Promise<{ error: { code?: string | null; message?: string | null } | null }>;
  leerTerminal: (id: string) => Promise<{ id: string; nombre: string; auth_user_id: string | null; ubicacion_nombre: string } | null>;
  correoDeUsuario: (id: string) => Promise<string | null>;
  cambiarClave: (userId: string, clave: string) => Promise<boolean>;
};

export type Dependencias = {
  /** `fn_puede_gestionar_colaboradores()` con la sesión de quien llama. `null` = no se pudo preguntar (se trata como «no»). */
  puedeGestionar: () => Promise<boolean | null>;
  /** ADR-0178 «solo das lo que tienes»: `fn_rol_dentro_de_lo_mio(rol)` con la sesión de quien llama. La terminal se crea
   *  con la llave de servicio, así que la base no ve a quien la crea: esta es la pregunta que lo cubre. `null` = no se pudo
   *  preguntar (se trata como «no»). Ausente = no se pregunta (maquetas y pruebas viejas). */
  rolDentroDeLoMio?: (rolId: string) => Promise<boolean | null>;
  /** El responsable del combo (`fn_actor_persona_id(true)` con la sesión FIRMADA), para `creada_por`. Si la base lo
   *  rechaza (falta elegirlo, no está de turno…) devuelve `{ error }` con su mensaje y nada se crea ni se cambia. */
  personaActual: () => Promise<{ id: string | null } | { error: string; causa?: ErrorBase }>;
  /** `registrar_cambio_clave_terminal(p_terminal_id)` con la sesión firmada: anota quién cambió la clave. Devuelve el
   *  mensaje de error, o `null` si quedó anotado. */
  registrarCambioClave: (terminalId: string) => Promise<string | null>;
  /** Abre el cliente con la llave de servicio. Lanza si falta la variable. Se llama SOLO tras confirmar el permiso. */
  admin: () => AdminTerminales;
  azar: Azar;
};

const SIN_PERMISO = "Solo un líder de equipo, o un rol con el módulo Colaboradores, puede crear terminales o cambiarles la clave.";

async function exigirPermiso(deps: Dependencias): Promise<string | null> {
  const puede = await deps.puedeGestionar().catch(() => null);
  return puede === true ? null : SIN_PERMISO;
}

/** El responsable, preguntado a la base. Si falla o lanza, se corta con su mensaje (falla cerrado). */
async function exigirResponsable(deps: Dependencias): Promise<{ id: string | null } | { ok: false; error: string; causa?: ErrorBase }> {
  const r = await deps.personaActual().catch((e: unknown) => ({
    error: e instanceof Error && e.message ? e.message : "No se pudo confirmar quién hace esta operación. Inténtalo de nuevo.",
  }));
  if ("error" in r) return { ok: false, error: r.error, ...("causa" in r && r.causa ? { causa: r.causa } : {}) };
  return r;
}

function abrirAdmin(deps: Dependencias): AdminTerminales | { error: string } {
  try {
    return deps.admin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo abrir la conexión de administración." };
  }
}

export async function crearTerminalCon(deps: Dependencias, entrada: Partial<EntradaTerminal>): Promise<ResultadoClave> {
  // 1. Primero el candado, con la sesión de quien llama. Sin esto no se toca la llave.
  const rechazo = await exigirPermiso(deps);
  if (rechazo) return { ok: false, error: rechazo };
  // ADR-0161 act. d: quién la crea. Sin responsable válido no se toca la llave ni se crea la cuenta.
  const responsable = await exigirResponsable(deps);
  if ("error" in responsable) return responsable;

  const v = validarEntrada(entrada);
  if (!v.ok) return v;
  const { ubicacionId, nombre, rolId } = v.datos;

  // ADR-0178: quien no es líder solo da a una terminal un rol cuyos módulos ve él mismo.
  if (deps.rolDentroDeLoMio && (await deps.rolDentroDeLoMio(rolId).catch(() => null)) !== true) {
    return { ok: false, error: "Ese rol incluye módulos que tú no tienes: solo puedes dar lo que tú ves. Elige otro rol o pídeselo a un líder." };
  }

  const admin = abrirAdmin(deps);
  if ("error" in admin) return { ok: false, error: admin.error };

  // 2. Lo que la base volverá a exigir, dicho antes y con palabras (el disparador es el candado real).
  const tienda = await admin.leerTienda(ubicacionId);
  if (!tienda || tienda.tipo !== "tienda" || !tienda.activo) return { ok: false, error: "Elige una tienda activa: las terminales viven en una tienda." };
  const rol = await admin.leerRol(rolId);
  if (!rol || rol.archivado) return { ok: false, error: "Ese rol ya no está disponible. Actualiza la pantalla y elige otro." };
  if (rol.fijo || rol.clave === "lider") return { ok: false, error: "Una terminal no puede tener el rol Líder de equipo." };
  if (await admin.nombreActivoOcupado(ubicacionId, nombre)) {
    return { ok: false, error: `${tienda.nombre} ya tiene una terminal activa llamada «${nombre}». Elige otro nombre.` };
  }

  // 3. La cuenta del aparato. Hasta 3 intentos solo si el correo ya existe (el sufijo al azar chocó): casi imposible.
  const clave = generarClave(deps.azar);
  const codigo = codigoDeTienda(tienda.nombre);
  let correo = "";
  let usuarioId: string | null = null;
  for (let intento = 0; intento < 3 && !usuarioId; intento++) {
    correo = correoTerminal(codigo, nombre, sufijoAzar(deps.azar));
    const r = await admin.crearUsuario(correo, clave);
    if ("id" in r) usuarioId = r.id;
    else if (!r.yaExiste) return { ok: false, error: `No se pudo crear la cuenta de la terminal: ${r.error}` };
  }
  if (!usuarioId) return { ok: false, error: "No se pudo crear la cuenta de la terminal: el correo ya existe. Inténtalo de nuevo." };

  // 4. La fila. Si no entra, se deshace la cuenta: nunca una cuenta que inicie sesión sin terminal.
  const { error } = await admin.insertarTerminal({ ubicacion_id: ubicacionId, nombre, rol_id: rolId, auth_user_id: usuarioId, creada_por: responsable.id });
  if (error) {
    const deshecha = await admin.borrarUsuario(usuarioId).catch(() => false);
    const aviso = deshecha ? "" : ` OJO: la cuenta ${correo} quedó creada sin terminal; bórrala en Supabase ▸ Authentication.`;
    return { ok: false, error: mensajeErrorAlta(error) + aviso };
  }

  return { ok: true, nombre, tienda: tienda.nombre, correo, clave };
}

export async function cambiarClaveTerminalCon(deps: Dependencias, entrada: { terminalId?: string } | null | undefined): Promise<ResultadoClave> {
  const rechazo = await exigirPermiso(deps);
  if (rechazo) return { ok: false, error: rechazo };
  const responsable = await exigirResponsable(deps);
  if ("error" in responsable) return responsable;

  const terminalId = String(entrada?.terminalId ?? "").trim();
  if (!terminalId) return { ok: false, error: "Falta la terminal. Actualiza la pantalla." };

  const admin = abrirAdmin(deps);
  if ("error" in admin) return { ok: false, error: admin.error };

  const t = await admin.leerTerminal(terminalId);
  if (!t) return { ok: false, error: "Esa terminal ya no existe. Actualiza la pantalla." };
  if (!t.auth_user_id) return { ok: false, error: `«${t.nombre}» ya no tiene cuenta: crea una terminal nueva.` };

  const clave = generarClave(deps.azar);
  if (!(await admin.cambiarClave(t.auth_user_id, clave))) return { ok: false, error: "No se pudo cambiar la clave. Inténtalo de nuevo." };
  const correo = (await admin.correoDeUsuario(t.auth_user_id)) ?? "(sin correo)";
  // La clave ya cambió: si anotar quién falla, igual se devuelve (la de antes ya no sirve), con un aviso.
  const fallo = await deps.registrarCambioClave(t.id).catch((e: unknown) => (e instanceof Error ? e.message : "error desconocido"));
  const aviso = fallo ? `La clave cambió, pero no quedó anotado quién la cambió: ${fallo}` : undefined;
  return { ok: true, nombre: t.nombre, tienda: t.ubicacion_nombre, correo, clave, ...(aviso ? { aviso } : {}) };
}
