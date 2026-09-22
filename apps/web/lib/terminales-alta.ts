// Crear una terminal y cambiarle la clave desde la PANTALLA (Felipe, 2026-09-22: ya no solo con el script).
//
// EL PROBLEMA PRIMERO. Crear la cuenta de Auth de un aparato exige la llave de servicio, que salta todo candado (RLS).
// El ADR-0162 la dejó fuera de la web por eso. Traerla a la web solo es aceptable si NADIE que no sea líder puede llegar a
// usarla. Por eso el orden de este archivo es la regla:
//   1. Se pregunta a la base, con la SESIÓN de quien llama (no con la llave), si es líder (`fn_es_lider()`). Si no lo es,
//      o la pregunta falla, se rechaza y la llave NI SE CREA.
//   2. Recién ahí se abre el cliente con la llave (`admin()`), se valida tienda, rol y nombre, y se crea la cuenta.
//   3. Si la fila de `retail.terminales` no entra, se borra la cuenta recién creada: nunca queda una cuenta que pueda
//      iniciar sesión sin terminal (misma lógica que `pnpm terminales:crear`).
//   4. La clave vuelve UNA vez a la pantalla y no se guarda ni se escribe en ningún log.
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

export type ResultadoClave =
  | { ok: true; nombre: string; tienda: string; correo: string; clave: string }
  | { ok: false; error: string };

/** Lo que se hace con la llave de servicio. Solo existe DESPUÉS de comprobar que quien llama es líder. */
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
  /** `fn_es_lider()` con la sesión de quien llama. `null` = no se pudo preguntar (se trata como «no»). */
  esLider: () => Promise<boolean | null>;
  /** La persona de quien llama (`fn_actor_persona_id(false)`), para `creada_por`. */
  personaActual: () => Promise<string | null>;
  /** Abre el cliente con la llave de servicio. Lanza si falta la variable. Se llama SOLO tras confirmar al líder. */
  admin: () => AdminTerminales;
  azar: Azar;
};

const SOLO_LIDER = "Solo un líder de equipo puede crear terminales o cambiarles la clave.";

async function exigirLider(deps: Dependencias): Promise<string | null> {
  const lider = await deps.esLider().catch(() => null);
  return lider === true ? null : SOLO_LIDER;
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
  const rechazo = await exigirLider(deps);
  if (rechazo) return { ok: false, error: rechazo };

  const v = validarEntrada(entrada);
  if (!v.ok) return v;
  const { ubicacionId, nombre, rolId } = v.datos;

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
  const creadaPor = await deps.personaActual().catch(() => null);
  const { error } = await admin.insertarTerminal({ ubicacion_id: ubicacionId, nombre, rol_id: rolId, auth_user_id: usuarioId, creada_por: creadaPor });
  if (error) {
    const deshecha = await admin.borrarUsuario(usuarioId).catch(() => false);
    const aviso = deshecha ? "" : ` OJO: la cuenta ${correo} quedó creada sin terminal; bórrala en Supabase ▸ Authentication.`;
    return { ok: false, error: mensajeErrorAlta(error) + aviso };
  }

  return { ok: true, nombre, tienda: tienda.nombre, correo, clave };
}

export async function cambiarClaveTerminalCon(deps: Dependencias, entrada: { terminalId?: string } | null | undefined): Promise<ResultadoClave> {
  const rechazo = await exigirLider(deps);
  if (rechazo) return { ok: false, error: rechazo };

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
  return { ok: true, nombre: t.nombre, tienda: t.ubicacion_nombre, correo, clave };
}
