#!/usr/bin/env node
/**
 * Crea en la base LOCAL las cuentas de prueba que faltan para auditar el modo oscuro «cuenta por cuenta» (ADR-0336).
 *
 * El seed solo trae tres personas (Felipe, Sandra —Admin y Líder— y Micaela, Integrante). Una terminal de ventas, una terminal
 * administrativa y una persona con un rol personalizado ven pantallas DISTINTAS (el rol decide qué módulos ve, ADR-0161), y
 * sin ellas el modo oscuro solo se auditaría con la vista del líder.
 *
 * Idempotente: puede correr cuantas veces haga falta. Datos inventados, claves del seed (`cayla-local`), ids fijos. NUNCA
 * toca producción: se niega a correr si el contenedor no es el de la base local de este repo.
 *
 *   pnpm --filter web tema:cuentas
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR = "supabase_db_cayla-retail";
const CLAVE = "cayla-local";

const psql = (sql) =>
  execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// Seguridad: es la base local (base `postgres` del contenedor del repo) y es la del seed, no una que alguien copió de otro lado.
const hayFelipe = psql("select count(*) from auth.users where email = 'felipe@cayla.local'");
if (hayFelipe !== "1") throw new Error("No parece la base local del seed (falta felipe@cayla.local): no toco nada.");

/** Un usuario de auth con identidad de correo, como lo hace `supabase/seed.sql`. */
const usuario = (id, idIdentidad, correo) => `
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${correo}',
    extensions.crypt('${CLAVE}', extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', '', '', '', '', '')
  on conflict (id) do nothing;
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values ('${idIdentidad}', '${id}', '${id}', '{"sub":"${id}","email":"${correo}","email_verified":true}'::jsonb, 'email', now(), now(), now())
  on conflict (id) do nothing;`;

const ID = (n) => `22222222-2222-4222-8222-0000000000${n}`;

const sql = `
begin;

-- 1) Terminal de ventas de Lima (el mostrador): su rol es «Terminal de ventas».
${usuario(ID("a1"), ID("a2"), "mostrador.lima@cayla.local")}
insert into retail.terminales (id, ubicacion_id, nombre, auth_user_id, rol_id)
select '${ID("a3")}', u.id, 'Mostrador Lima (prueba del tema)', '${ID("a1")}', retail.fn_rol_por_clave('terminal_ventas')
from retail.ubicaciones u where u.nombre = 'Tienda Lima'
on conflict (id) do nothing;

-- 2) Terminal administrativa de Lima (inventario y catálogo).
${usuario(ID("c1"), ID("c2"), "administrativa.lima@cayla.local")}
insert into retail.terminales (id, ubicacion_id, nombre, auth_user_id, rol_id)
select '${ID("c3")}', u.id, 'Administrativa Lima (prueba del tema)', '${ID("c1")}', retail.fn_rol_por_clave('terminal_administrativa')
from retail.ubicaciones u where u.nombre = 'Tienda Lima'
on conflict (id) do nothing;

-- 3) Un rol PERSONALIZADO con pocos módulos y una persona que lo tiene: el menú más corto que existe.
insert into retail.roles (id, clave, nombre, descripcion)
values ('${ID("b3")}', null, 'Prueba del tema: ventas y stock', 'Rol de prueba local: pocos módulos, para ver el sistema con un menú corto')
on conflict (id) do nothing;
insert into retail.rol_modulos (rol_id, modulo)
select '${ID("b3")}', m from unnest(array['inicio', 'vender', 'caja', 'existencias', 'productos']) m
on conflict do nothing;

${usuario(ID("b1"), ID("b2"), "lucia@cayla.local")}
insert into public.personas (auth_user_id, nombres, apellidos, rol, sede_base_id)
select '${ID("b1")}', 'Lucía', 'Prueba del tema', 'integrante', s.id from public.sedes s where s.codigo = 'LIM'
on conflict (auth_user_id) do nothing;
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, rol_id)
select p.id, 'colaborador', u.id, '${ID("b3")}'
from public.personas p, retail.ubicaciones u
where p.auth_user_id = '${ID("b1")}' and u.nombre = 'Tienda Lima'
on conflict (persona_id) do nothing;

commit;
`;

execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

const filas = psql(`
  select u.email, coalesce(r.nombre, '(sin rol)') from auth.users u
  left join retail.terminales t on t.auth_user_id = u.id
  left join public.personas p on p.auth_user_id = u.id
  left join retail.colaboradores c on c.persona_id = p.id
  left join retail.roles r on r.id = coalesce(t.rol_id, c.rol_id)
  where u.email like '%@cayla.local' order by 1`);
console.log("Cuentas locales (clave de todas: la del seed):\n" + filas.split("\n").map((l) => "  " + l.replace("|", "  →  ")).join("\n"));
