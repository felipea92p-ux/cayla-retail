#!/usr/bin/env node
// `pnpm terminales:crear <TRU|AQP|LIM> "<nombre>" [--rol "<rol>"] [--cambiar-clave]` — ADR-0162, RESPALDO.
//
// EL PROBLEMA PRIMERO. Una terminal es un aparato con su propia cuenta de Auth, SIN persona. Crear un usuario de Auth
// exige la LLAVE DE SERVICIO, que salta todo candado (RLS). Desde el 2026-09-22 (Felipe) lo normal es crearla desde la
// pantalla (Colaboradores ▸ Terminales), cuya Server Action comprueba primero que quien la usa es líder. Este script queda
// como respaldo —si el servidor aún no tiene la llave, o para arreglar algo a mano— y aplica las MISMAS reglas puras
// (`apps/web/lib/terminales-reglas.ts`).
//
// Sin tipo (20260923040000): una terminal es tienda + nombre + ROL. Puede haber varias por tienda; dos activas de la misma
// tienda no pueden llamarse igual (la base lo exige con un índice único).
//
// QUÉ HACE
//   Crear: resuelve la tienda y el rol, se detiene si ya hay una terminal con ese nombre ahí (activa o desactivada: a una
//   desactivada se la REACTIVA desde la pantalla, no se duplica), pide confirmación mostrando a qué proyecto apunta, crea el
//   usuario de Auth (correo terminal-<tienda>-<nombre>-<azar>@cayla.pe, email_confirm) e inserta la fila en
//   retail.terminales. Si la fila no entra, borra el usuario recién creado: nunca queda una cuenta huérfana.
//   --cambiar-clave: no crea nada; le pone una clave nueva a la terminal de ese nombre en esa tienda.
//   En los dos casos la clave se muestra UNA sola vez: no se guarda en ningún lado.
//
// Habla con la API REST de Supabase con `fetch` (Node 18+): no necesita instalar nada en la raíz del repo.
// Nunca imprime ni escribe la llave de servicio.

import crypto from "node:crypto";
import readline from "node:readline/promises";
import {
  AYUDA,
  codigoDeTienda,
  correoTerminal,
  generarClave,
  leerArgumentos,
  mensajeErrorAlta,
  normalizarNombre,
  resolverRol,
  resolverTienda,
  sufijoAzar,
} from "./reglas.mjs";

function salir(mensaje, codigo = 1) {
  console.error(`\n${mensaje}\n`);
  process.exit(codigo);
}

let args;
try {
  args = leerArgumentos(process.argv.slice(2));
} catch (e) {
  salir(`${e.message}\n\n${AYUDA}`);
}
if (args.ayuda) {
  console.log(AYUDA);
  process.exit(0);
}

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const LLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !LLAVE) {
  salir("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno. Ponlas solo para este comando, nunca en un archivo del repo.");
}

const cabeceras = { apikey: LLAVE, Authorization: `Bearer ${LLAVE}`, "Content-Type": "application/json" };
const azar = (n) => crypto.randomBytes(n);

/** PostgREST sobre el schema `retail` (en producción vive dentro del proyecto de Dynamic). */
async function rest(ruta, { method = "GET", body, prefer } = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    method,
    headers: {
      ...cabeceras,
      "Accept-Profile": "retail",
      "Content-Profile": "retail",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await r.text();
  if (!r.ok) {
    const json = (() => {
      try {
        return JSON.parse(texto);
      } catch {
        return null;
      }
    })();
    const e = new Error(`La base respondió ${r.status}: ${json?.message ?? texto}`);
    e.codigo = json?.code;
    e.mensaje = json?.message;
    throw e;
  }
  return texto ? JSON.parse(texto) : null;
}

/** API de administración de Auth (solo con la llave de servicio). */
async function authAdmin(ruta, { method = "GET", body } = {}) {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/${ruta}`, { method, headers: cabeceras, body: body ? JSON.stringify(body) : undefined });
  const texto = await r.text();
  const json = texto ? JSON.parse(texto) : null;
  if (!r.ok) {
    const e = new Error(json?.msg || json?.message || json?.error_description || texto || `Auth respondió ${r.status}`);
    e.estado = r.status;
    e.codigo = json?.error_code ?? json?.code;
    throw e;
  }
  return json;
}

async function confirmar(pregunta) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(pregunta)).trim().toUpperCase() === "SI";
  } finally {
    rl.close();
  }
}

function mostrarClave({ nombre, correo, clave, tienda }) {
  console.log(`
────────────────────────────────────────────────────────
  ${nombre}
  correo:  ${correo}
  clave:   ${clave}
────────────────────────────────────────────────────────
Esta clave NO se vuelve a mostrar ni se guarda en ningún lado.
  1. En el aparato de ${tienda}, abre retail e inicia sesión con ese correo y esa clave.
  2. No la anotes en papel junto al aparato ni la mandes por chat.
  3. Si se pierde: Colaboradores ▸ Terminales ▸ Cambiar clave (o este script con --cambiar-clave).
  4. Si se pierde el APARATO: Colaboradores ▸ Terminales ▸ Desactivar (corta su sesión en el acto).
`);
}

async function main() {
  const { tienda: codigo, nombre, cambiarClave } = args;

  const ubicaciones = await rest("ubicaciones?select=id,nombre,tipo,activo");
  const tienda = resolverTienda(ubicaciones, codigo);
  const deLaTienda = await rest(`terminales?select=id,nombre,activo,auth_user_id&ubicacion_id=eq.${tienda.id}&order=activo.desc,creada_at.desc`);
  const mismoNombre = deLaTienda.filter((t) => normalizarNombre(t.nombre).toLowerCase() === nombre.toLowerCase());
  const activa = mismoNombre.find((t) => t.activo);

  console.log(`\nProyecto: ${new URL(URL_BASE).host}`);
  console.log(`Tienda:   ${tienda.nombre}`);
  console.log(`Nombre:   ${nombre}`);

  if (cambiarClave) {
    const t = activa ?? mismoNombre[0];
    if (!t) salir(`${tienda.nombre} no tiene una terminal llamada «${nombre}». Créala sin --cambiar-clave.`);
    if (!t.auth_user_id) salir(`«${t.nombre}» ya no tiene cuenta de Auth. Crea una terminal nueva.`);
    if (!t.activo) console.log("OJO: está DESACTIVADA. Reactívala en Colaboradores ▸ Terminales para usarla.");
    console.log("\nSe le pondrá una clave NUEVA. La de ahora deja de servir; el aparato tendrá que volver a iniciar sesión.");
    if (!(await confirmar("Escribe SI para continuar: "))) salir("Cancelado. No se cambió nada.", 0);
    const usuario = await authAdmin(`users/${t.auth_user_id}`);
    const clave = generarClave(azar);
    await authAdmin(`users/${t.auth_user_id}`, { method: "PUT", body: { password: clave } });
    mostrarClave({ nombre: t.nombre, correo: usuario.email ?? usuario.user?.email ?? "(sin correo)", clave, tienda: tienda.nombre });
    return;
  }

  if (activa) {
    salir(`${tienda.nombre} ya tiene una terminal activa llamada «${activa.nombre}». Elige otro nombre.
Si perdiste su clave: Colaboradores ▸ Terminales ▸ Cambiar clave.`);
  }
  if (mismoNombre.length > 0) {
    salir(`${tienda.nombre} tiene la terminal «${mismoNombre[0].nombre}» DESACTIVADA. No se crea otra con el mismo nombre:
reactívala en Colaboradores ▸ Terminales, o elige otro nombre.`);
  }

  const roles = await rest("roles?select=id,nombre,clave,fijo,archivado_at");
  const rol = resolverRol(roles, args.rol);
  console.log(`Rol:      ${rol.nombre}`);

  const clave = generarClave(azar);
  let correo = correoTerminal(codigoDeTienda(tienda.nombre), nombre, sufijoAzar(azar));
  console.log(`Correo:   ${correo}`);
  console.log("\nSe creará una cuenta de Auth SIN persona y su fila en retail.terminales.");
  if (!(await confirmar("Escribe SI para continuar: "))) salir("Cancelado. No se creó nada.", 0);

  let usuario;
  for (let intento = 0; intento < 3 && !usuario; intento++) {
    try {
      usuario = await authAdmin("users", { method: "POST", body: { email: correo, password: clave, email_confirm: true } });
    } catch (e) {
      // El sufijo al azar chocó con una cuenta existente (casi imposible): otro sufijo.
      if (e.estado === 422 || e.codigo === "email_exists") {
        correo = correoTerminal(codigoDeTienda(tienda.nombre), nombre, sufijoAzar(azar));
        continue;
      }
      throw e;
    }
  }
  if (!usuario) salir("No se pudo crear la cuenta: el correo ya existía tres veces seguidas. Vuelve a intentarlo.");
  const authUserId = usuario.id ?? usuario.user?.id;

  try {
    await rest("terminales", {
      method: "POST",
      prefer: "return=minimal",
      body: { ubicacion_id: tienda.id, nombre, rol_id: rol.id, auth_user_id: authUserId, activo: true },
    });
  } catch (e) {
    // La cuenta se creó hace un segundo y nunca inició sesión: se deshace para no dejar una cuenta sin terminal.
    await authAdmin(`users/${authUserId}`, { method: "DELETE" }).catch(() => {
      console.error(`OJO: no se pudo deshacer la cuenta ${correo} (${authUserId}). Bórrala a mano en Supabase ▸ Authentication.`);
    });
    salir(mensajeErrorAlta({ code: e.codigo, message: e.mensaje ?? e.message }));
  }

  mostrarClave({ nombre, correo, clave, tienda: tienda.nombre });
}

main().catch((e) => salir(`No se pudo terminar: ${e.message}`));
