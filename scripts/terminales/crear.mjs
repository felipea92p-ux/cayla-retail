#!/usr/bin/env node
// `pnpm terminales:crear <TRU|AQP|LIM> <ventas|administrativa> [--cambiar-clave]` — ADR-0162, fase F5.
//
// EL PROBLEMA PRIMERO. Una terminal es un aparato con su propia cuenta de Auth, SIN persona. Crear un usuario de Auth
// exige la LLAVE DE SERVICIO, que salta todo candado (RLS); la web de retail no la tiene ni debe tenerla por algo que pasa
// seis veces en total. Por eso crear y cambiar la clave lo hace este script, que corre un líder en su máquina; la pantalla
// Colaboradores ▸ Terminales solo ve, desactiva y reactiva. Mismo criterio que Dynamic (`scripts/setup-terminales-prod.mjs`).
//
// QUÉ HACE
//   Crear: resuelve la tienda en retail.ubicaciones, se detiene si ya hay una terminal de ese tipo ahí (activa o
//   desactivada: a una desactivada se la REACTIVA desde la pantalla, no se duplica), pide confirmación mostrando a qué
//   proyecto apunta, crea el usuario de Auth (correo terminal-<tipo>-<tienda>@cayla.pe, email_confirm) e inserta la fila en
//   retail.terminales. Si la fila no entra, borra el usuario recién creado (sin historial todavía): nunca queda una cuenta
//   huérfana que pueda iniciar sesión sin terminal.
//   --cambiar-clave: no crea nada; le pone una clave nueva a la terminal existente de esa tienda y tipo.
//   En los dos casos la clave se muestra UNA sola vez: no se guarda en ningún lado.
//
// Habla con la API REST de Supabase con `fetch` (Node 18+): no necesita instalar nada en la raíz del repo.
// Nunca imprime ni escribe la llave de servicio.

import crypto from "node:crypto";
import readline from "node:readline/promises";
import { AYUDA, correoDe, generarClave, leerArgumentos, nombreDe, resolverTienda } from "./reglas.mjs";

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
  if (!r.ok) throw new Error(`La base respondió ${r.status}: ${texto}`);
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
  3. Si se pierde: pnpm terminales:crear ${args.tienda} ${args.tipo} --cambiar-clave
  4. Si se pierde el APARATO: Colaboradores ▸ Terminales ▸ Desactivar (corta su sesión en el acto).
`);
}

async function main() {
  const { tienda: codigo, tipo, cambiarClave } = args;

  const ubicaciones = await rest("ubicaciones?select=id,nombre,tipo,activo");
  const tienda = resolverTienda(ubicaciones, codigo);
  const existentes = await rest(
    `terminales?select=id,nombre,activo,auth_user_id&ubicacion_id=eq.${tienda.id}&tipo=eq.${tipo}&order=activo.desc,creada_at.desc`
  );
  const activa = existentes.find((t) => t.activo);

  console.log(`\nProyecto: ${new URL(URL_BASE).host}`);
  console.log(`Tienda:   ${tienda.nombre}`);
  console.log(`Tipo:     ${tipo}`);

  if (cambiarClave) {
    const t = activa ?? existentes[0];
    if (!t) salir(`${tienda.nombre} no tiene terminal de ${tipo}. Créala sin --cambiar-clave.`);
    if (!t.auth_user_id) salir(`«${t.nombre}» ya no tiene cuenta de Auth. Créala de nuevo sin --cambiar-clave.`);
    console.log(`Terminal: ${t.nombre}${t.activo ? "" : " (DESACTIVADA: reactívala en Colaboradores ▸ Terminales para usarla)"}`);
    console.log("\nSe le pondrá una clave NUEVA. La de ahora deja de servir; el aparato tendrá que volver a iniciar sesión.");
    if (!(await confirmar("Escribe SI para continuar: "))) salir("Cancelado. No se cambió nada.", 0);
    const usuario = await authAdmin(`users/${t.auth_user_id}`);
    const clave = generarClave(crypto.randomBytes);
    await authAdmin(`users/${t.auth_user_id}`, { method: "PUT", body: { password: clave } });
    mostrarClave({ nombre: t.nombre, correo: usuario.email ?? usuario.user?.email ?? "(sin correo)", clave, tienda: tienda.nombre });
    return;
  }

  if (activa) {
    salir(`${tienda.nombre} ya tiene una terminal de ${tipo} activa: «${activa.nombre}». Hay una sola por tienda y tipo.
Si perdiste la clave: pnpm terminales:crear ${codigo} ${tipo} --cambiar-clave`);
  }
  if (existentes.length > 0) {
    salir(`${tienda.nombre} tiene la terminal «${existentes[0].nombre}» DESACTIVADA. No se crea otra: reactívala en
Colaboradores ▸ Terminales, y si no recuerdas la clave: pnpm terminales:crear ${codigo} ${tipo} --cambiar-clave`);
  }

  const correo = correoDe(tipo, codigo);
  const nombre = nombreDe(tipo, codigo);
  console.log(`Nombre:   ${nombre}`);
  console.log(`Correo:   ${correo}`);
  console.log("\nSe creará una cuenta de Auth SIN persona y su fila en retail.terminales.");
  if (!(await confirmar("Escribe SI para continuar: "))) salir("Cancelado. No se creó nada.", 0);

  const clave = generarClave(crypto.randomBytes);
  let usuario;
  try {
    usuario = await authAdmin("users", { method: "POST", body: { email: correo, password: clave, email_confirm: true } });
  } catch (e) {
    if (e.estado === 422 || e.codigo === "email_exists") {
      salir(`Ya existe una cuenta de Auth con el correo ${correo}, pero ninguna terminal de ${tipo} en ${tienda.nombre} la usa.
Revísala en Supabase ▸ Authentication antes de seguir: no se reutiliza una cuenta sin saber de dónde viene.`);
    }
    throw e;
  }
  const authUserId = usuario.id ?? usuario.user?.id;

  try {
    await rest("terminales", {
      method: "POST",
      prefer: "return=minimal",
      body: { ubicacion_id: tienda.id, nombre, tipo, auth_user_id: authUserId, activo: true },
    });
  } catch (e) {
    // La cuenta se creó hace un segundo y nunca inició sesión: se deshace para no dejar una cuenta sin terminal.
    await authAdmin(`users/${authUserId}`, { method: "DELETE" }).catch(() => {
      console.error(`OJO: no se pudo deshacer la cuenta ${correo} (${authUserId}). Bórrala a mano en Supabase ▸ Authentication.`);
    });
    throw e;
  }

  mostrarClave({ nombre, correo, clave, tienda: tienda.nombre });
}

main().catch((e) => salir(`No se pudo terminar: ${e.message}`));
