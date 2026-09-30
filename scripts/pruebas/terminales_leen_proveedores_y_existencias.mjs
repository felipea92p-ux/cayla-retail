#!/usr/bin/env node
/**
 * Pruebas de la PUERTA de lectura de retail y las terminales (ADR-0289, migración
 * `20260930050000_terminales_pasan_la_puerta_de_lectura.sql`) — CAYLA V2.
 *
 * EL BUG QUE VIGILA. El 2026-09-30 Compras ▸ Proveedores le mostró «Esta pantalla no está mostrando datos» a la terminal
 * administrativa de Tienda TRU: la web la dejó entrar (su rol trae el módulo), pero `fn_proveedores()` y
 * `fn_proveedores_resumen()` terminan en `where fn_tiene_acceso_retail()`, y esa puerta solo reconocía personas. La base
 * respondió 200 con `[]`, sin error, y la pantalla lanzó porque no encontró la fila del resumen. Con la misma cuenta,
 * `fn_existencias()` también devolvía cero filas (el stock se habría visto vacío, que es peor: no avisa).
 *
 * QUÉ PRUEBA.
 *   · LA PUERTA. Pasan: una terminal activa (administrativa o de ventas), un líder, una colaboradora. NO pasan: una
 *     terminal desactivada, una terminal de una sede desactivada, una cuenta sin persona ni terminal, sin sesión, una
 *     persona de Dynamic sin colaborador, una colaboradora con el alta pendiente de aprobación.
 *   · LA PANTALLA COMPLETA. Lo que la web deja ver (módulo `proveedores`) y lo que la base responde coinciden: la terminal
 *     administrativa recibe TODOS los proveedores y UNA fila de resumen (la fila que faltaba); la de ventas recibe el
 *     directorio pero el dinero le llega en NULL; la desactivada y la de afuera no reciben nada.
 *   · EL DINERO NO SE ABRE DE MÁS. Con módulos de Compras, cada terminal ve la deuda de SU tienda y no la de otra (el
 *     líder, toda). Es la comprobación que no se pudo hacer contra producción (hoy tiene 0 compras).
 *   · EXISTENCIAS. `fn_existencias` y `fn_existencias_productos` le devuelven a la terminal lo mismo que el núcleo.
 *   · EL BARRIDO. Toda lectura que se puede llamar sin argumentos y usa la puerta devuelve filas a la terminal cuando se
 *     las devuelve al líder. Es la prueba que habría atrapado el bug original, y atrapa el de la próxima función.
 *   · LA MIGRACIÓN. Se puede pegar dos veces sin cambiar nada, se detiene sin tocar si la puerta tiene otro cuerpo, deja
 *     UNA firma con los mismos permisos, y nada más (políticas, vistas) depende de la puerta.
 *
 * CÓMO. Mismo patrón que `terminales_sin_persona.mjs`: cada escenario en su transacción con ROLLBACK; las terminales, sus
 * cuentas de Auth y lo que haga falta se crean DENTRO del escenario y desaparecen con él. La sesión se simula con
 * `request.jwt.claim.sub` (lo que PostgREST hace con cada petición). Las funciones que se prueban son SECURITY DEFINER,
 * así que no hace falta cambiar de rol de Postgres.
 *
 * USO
 *   pnpm pruebas:terminales-lecturas                 → contra la base `postgres` del stack local
 *   pnpm pruebas:terminales-lecturas --base otra     → contra otra base del mismo contenedor
 *   … --en-seco                                       → carga la migración dentro de cada escenario (base sin ella)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const EN_SECO = process.argv.includes("--en-seco");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260930050000_terminales_pasan_la_puerta_de_lectura.sql"), "utf8");

// El cuerpo ANTERIOR de la puerta, tal cual lo dejó 20260922170000 (el de producción hasta el 2026-09-30, md5 403086e4…):
// sirve para reproducir el bug y para probar que la migración parte de él sin cambiar los permisos.
const CUERPO_ANTERIOR = readFileSync(join(RAIZ, "supabase", "migrations", "20260922170000_alta_colaborador_requiere_aprobacion.sql"), "utf8").match(
  /create or replace function retail\.fn_tiene_acceso_retail\(\)[\s\S]*?\$\$;/
)?.[0];
if (!CUERPO_ANTERIOR) throw new Error("No encontré fn_tiene_acceso_retail() en 20260922170000: la prueba parte de ese cuerpo.");

// Seed local: Felipe (líder) y Micaela (colaboradora de Trujillo).
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
// Creados en cada escenario.
const T_ADMIN_TRU = "33333333-3333-4333-8333-0000000000a2";
const T_ADMIN_LIM = "33333333-3333-4333-8333-0000000000a3";
const T_VENTAS_TRU = "33333333-3333-4333-8333-0000000000a1";
const T_APAGADA = "33333333-3333-4333-8333-0000000000a4";
const T_SEDE_APAGADA = "33333333-3333-4333-8333-0000000000a5";
const AFUERA = "33333333-3333-4333-8333-0000000000d1"; // cuenta de Auth sin persona, sin colaborador, sin terminal
const SOLO_DYNAMIC = "33333333-3333-4333-8333-0000000000d2"; // persona de Dynamic activa, sin colaborador (la forma de la cuenta que falló)
const PENDIENTE = "33333333-3333-4333-8333-0000000000d3"; // colaboradora con el alta pendiente de aprobación
const P_SOLO_DYNAMIC = "33333333-3333-4333-8333-0000000000e2";
const P_PENDIENTE = "33333333-3333-4333-8333-0000000000e3";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Todo lo que un escenario necesita, dentro de su transacción. */
const PRELUDIO = `
begin;
${EN_SECO ? MIGRACION : ""}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;

select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
select (select count(*) from retail.proveedores) as n_prov, (select count(*) from retail.proveedores where activo) as n_prov_activos,
       (select count(*) from retail.fn_existencias_base(null, null)) as n_exist \\gset

-- Las cuentas de Auth: tres terminales de Trujillo/Lima, una desactivada, una en una sede que se apaga, y las que NO son actores de retail.
insert into auth.users (id, aud, role, email) values
  ('${T_ADMIN_TRU}', 'authenticated', 'authenticated', 't-admin-tru@prueba.local'),
  ('${T_ADMIN_LIM}', 'authenticated', 'authenticated', 't-admin-lim@prueba.local'),
  ('${T_VENTAS_TRU}', 'authenticated', 'authenticated', 't-ventas-tru@prueba.local'),
  ('${T_APAGADA}', 'authenticated', 'authenticated', 't-apagada@prueba.local'),
  ('${T_SEDE_APAGADA}', 'authenticated', 'authenticated', 't-sede-apagada@prueba.local'),
  ('${AFUERA}', 'authenticated', 'authenticated', 'afuera@prueba.local'),
  ('${SOLO_DYNAMIC}', 'authenticated', 'authenticated', 'solo-dynamic@prueba.local'),
  ('${PENDIENTE}', 'authenticated', 'authenticated', 'pendiente@prueba.local');
-- Una sede que después se desactiva, para probar la terminal de una sede apagada sin tocar Trujillo ni Lima.
insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede de prueba', 'tienda', true);
select id as sede_prueba from retail.ubicaciones where nombre = 'Sede de prueba' \\gset
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values
  (:'tru', 'Terminal Almacén TRU', retail.fn_rol_por_clave('terminal_administrativa'), '${T_ADMIN_TRU}'),
  (:'lim', 'Terminal Almacén LIM', retail.fn_rol_por_clave('terminal_administrativa'), '${T_ADMIN_LIM}'),
  (:'tru', 'Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS_TRU}'),
  (:'tru', 'Terminal Apagada TRU', retail.fn_rol_por_clave('terminal_administrativa'), '${T_APAGADA}'),
  (:'sede_prueba', 'Terminal de sede de prueba', retail.fn_rol_por_clave('terminal_administrativa'), '${T_SEDE_APAGADA}');
-- Una persona de Dynamic sin retail (como la cuenta que falló) y una colaboradora con el alta sin aprobar.
insert into public.personas (id, auth_user_id, nombres, apellidos, estado, sede_base_id)
  select '${P_SOLO_DYNAMIC}'::uuid, '${SOLO_DYNAMIC}'::uuid, 'Solo', 'Dynamic', 'activo', sede_dynamic_id from retail.ubicaciones where id = :'tru'
  union all select '${P_PENDIENTE}'::uuid, '${PENDIENTE}'::uuid, 'Alta', 'Pendiente', 'activo', sede_dynamic_id from retail.ubicaciones where id = :'tru';
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, estado) values ('${P_PENDIENTE}', 'colaborador', :'tru', 'pendiente_aprobacion');
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
/** Apaga la terminal / la sede: se hace como postgres, antes de cambiar de sesión. */
const APAGAR_TERMINAL = `update retail.terminales set activo = false, desactivada_at = now() where auth_user_id = '${T_APAGADA}';\n`;
const APAGAR_SEDE = `update retail.ubicaciones set activo = false where id = :'sede_prueba';\n`;
/** Como en producción, el rol «Terminal Almacén» ve los módulos de dinero de Compras (la base local no los siembra). */
const MODULOS_DE_DINERO = `insert into retail.rol_modulos (rol_id, modulo)
  select retail.fn_rol_por_clave('terminal_administrativa'), m from unnest(array['facturas_compra', 'por_pagar', 'notas_credito']) m on conflict do nothing;\n`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
const puerta = `select retail.fn_tiene_acceso_retail()::text;`;

// ===========================================================================
// 1. LA PUERTA: quién pasa y quién no
// ===========================================================================

caso("la terminal ADMINISTRATIVA activa pasa la puerta (el bug: antes no)", como(T_ADMIN_TRU) + puerta, "true");
caso("la terminal de VENTAS activa pasa la puerta (es un actor de retail; lo que ve lo decide su rol)", como(T_VENTAS_TRU) + puerta, "true");
caso("el líder (Felipe) sigue pasando", como(FELIPE) + puerta, "true");
caso("la colaboradora (Micaela) sigue pasando", como(MICAELA) + puerta, "true");
caso("una terminal DESACTIVADA no pasa", APAGAR_TERMINAL + como(T_APAGADA) + puerta, "false");
caso("una terminal de una sede DESACTIVADA no pasa", APAGAR_SEDE + como(T_SEDE_APAGADA) + puerta, "false");
caso("una cuenta de Auth sin persona, sin colaborador y sin terminal no pasa", como(AFUERA) + puerta, "false");
caso("una persona de Dynamic activa SIN colaborador no pasa (la puerta no se ensancha a Dynamic)", como(SOLO_DYNAMIC) + puerta, "false");
caso("una colaboradora con el alta pendiente de aprobación no pasa", como(PENDIENTE) + puerta, "false");
caso("sin sesión (auth.uid() nulo) no pasa", `set local request.jwt.claim.sub = '';\nset local request.jwt.claims = '{}';\n` + puerta, "false");

caso(
  "PRUEBA DE LA PRUEBA: con el cuerpo ANTERIOR de la puerta la terminal no pasa y recibe cero proveedores y cero filas de resumen — el bug de producción",
  `${CUERPO_ANTERIOR}\n` + como(T_ADMIN_TRU) +
    `select concat_ws(',', retail.fn_tiene_acceso_retail(), (select count(*) from retail.fn_proveedores()), (select count(*) from retail.fn_proveedores_resumen()), (select count(*) from retail.fn_existencias()));`,
  "f,0,0,0"
);

// ===========================================================================
// 2. LA PANTALLA DE PROVEEDORES, completa: lo que la web deja ver es lo que la base responde
// ===========================================================================

caso(
  "COHERENCIA web/base: la terminal administrativa ve el módulo Proveedores Y la base le responde (antes: módulo sí, datos no)",
  como(T_ADMIN_TRU) + `select concat_ws(',', retail.fn_ve_modulo('proveedores'), retail.fn_tiene_acceso_retail(), (select count(*) from retail.fn_proveedores()) = :n_prov);`,
  "t,t,t"
);
caso(
  "REGRESIÓN DEL BUG: fn_proveedores_resumen() devuelve UNA fila a la terminal (la web lanza si vienen cero)",
  como(T_ADMIN_TRU) + `select concat_ws(',', (select count(*) from retail.fn_proveedores_resumen()), (select activos from retail.fn_proveedores_resumen()) = :n_prov_activos);`,
  "1,t"
);
caso(
  "la terminal de VENTAS recibe el directorio, pero el dinero le llega en NULL (facturas, saldos y el resumen)",
  como(T_VENTAS_TRU) +
    `select concat_ws(',', (select count(*) from retail.fn_proveedores()) = :n_prov,
       (select count(*) from retail.fn_proveedores() where facturas is not null or total_facturado is not null or saldo is not null or saldo_favor is not null),
       (select deuda_total is null and con_saldo is null from retail.fn_proveedores_resumen()));`,
  "t,0,t"
);
caso(
  "una terminal desactivada recibe cero proveedores y cero filas de resumen",
  APAGAR_TERMINAL + como(T_APAGADA) + `select concat_ws(',', (select count(*) from retail.fn_proveedores()), (select count(*) from retail.fn_proveedores_resumen()));`,
  "0,0"
);
caso(
  "la cuenta de afuera recibe cero proveedores y cero filas de resumen",
  como(AFUERA) + `select concat_ws(',', (select count(*) from retail.fn_proveedores()), (select count(*) from retail.fn_proveedores_resumen()));`,
  "0,0"
);

// ===========================================================================
// 3. EL DINERO NO SE ABRE DE MÁS: cada terminal ve la deuda de SU tienda
// ===========================================================================

const FOTO = (auth, sufijo) =>
  como(auth) +
  `select coalesce(max(facturas), 0) as f_${sufijo}, coalesce(max(saldo), 0) as s_${sufijo} from retail.fn_proveedores() where id = :'prov' \\gset\n`;
const COMPRA = (letra, ubic, cant) => `
select retail.registrar_compra(:'prov', 'TST', '${letra}' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'${ubic}',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'descripcion', 'L1', 'cantidad', ${cant}, 'costo_unitario', 10,
    'destinos', jsonb_build_array(jsonb_build_object('ubicacion_id', :'${ubic}', 'cantidad', ${cant})))),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as c_${letra} \\gset
`;
const DESPUES = (auth, sufijo) =>
  como(auth) +
  `select (coalesce(max(facturas), 0) - :f_${sufijo}) || '/' || (coalesce(max(saldo), 0) - :s_${sufijo})::numeric(12, 2) as d_${sufijo} from retail.fn_proveedores() where id = :'prov' \\gset\n`;

caso(
  "DINERO POR TIENDA: dos comprobantes (TRU S/118 y Lima S/59) → la terminal de TRU ve solo el suyo, la de Lima solo el suyo, el líder los dos",
  MODULOS_DE_DINERO +
    FOTO(T_ADMIN_TRU, "tru") + FOTO(T_ADMIN_LIM, "lim") + FOTO(FELIPE, "lid") +
    como(FELIPE) + COMPRA("A", "tru", 10) + COMPRA("B", "lim", 5) +
    DESPUES(T_ADMIN_TRU, "tru") + DESPUES(T_ADMIN_LIM, "lim") + DESPUES(FELIPE, "lid") +
    `select :'d_tru' || ' ' || :'d_lim' || ' ' || :'d_lid';`,
  "1/118.00 1/59.00 2/177.00"
);
caso(
  "DINERO POR TIENDA en el resumen: la deuda total que ve la terminal de TRU sube solo lo de su tienda (S/118)",
  MODULOS_DE_DINERO +
    como(T_ADMIN_TRU) + `select coalesce(max(deuda_total), 0) as r0 from retail.fn_proveedores_resumen() \\gset\n` +
    como(FELIPE) + COMPRA("A", "tru", 10) + COMPRA("B", "lim", 5) +
    como(T_ADMIN_TRU) + `select ((select deuda_total from retail.fn_proveedores_resumen()) - :r0)::numeric(12, 2)::text;`,
  "118.00"
);

// ===========================================================================
// 4. EXISTENCIAS: lo mismo que el núcleo
// ===========================================================================

caso(
  "fn_existencias(): la terminal administrativa recibe TODAS las filas del núcleo (y hay filas: la prueba no es vacía)",
  como(T_ADMIN_TRU) + `select concat_ws(',', (select count(*) from retail.fn_existencias()) = :n_exist, :n_exist > 0);`,
  "t,t"
);
caso(
  "fn_existencias_productos(): la cifra «aquí» de la terminal es la del núcleo para su tienda",
  `select producto_id as prod_stock from retail.fn_existencias_base(:'tru', null) where not talla_retirada group by producto_id order by sum(disponible) desc limit 1 \\gset
   select coalesce(sum(e.disponible), 0) as esperado from retail.fn_existencias_base(null, array[:'prod_stock'::uuid]) e where not e.talla_retirada and e.ubicacion_id = :'tru' \\gset\n` +
    como(T_ADMIN_TRU) +
    `select concat_ws(',', (select aqui from retail.fn_existencias_productos(array[:'prod_stock'::uuid], :'tru')) = :esperado, :esperado > 0);`,
  "t,t"
);
caso(
  "una terminal desactivada y la cuenta de afuera reciben cero filas de existencias",
  APAGAR_TERMINAL + como(T_APAGADA) + `select count(*) from retail.fn_existencias() \\gset\n` +
    como(AFUERA) + `select (:'count' || ',' || (select count(*) from retail.fn_existencias()));`,
  "0,0"
);

// ===========================================================================
// 5. EL BARRIDO: lo que lee el líder lo lee la terminal (cualquier función que use la puerta)
// ===========================================================================

caso(
  "BARRIDO: toda lectura sin argumentos que usa la puerta le devuelve filas a la terminal cuando se las devuelve al líder (mínimo 3 revisadas)",
  `create function pg_temp.barrido(p_lider text, p_terminal text) returns text language plpgsql as $f$
   declare r record; v_l bigint; v_t bigint; v_n integer := 0; v_malas text[] := '{}';
   begin
     for r in
       select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'retail' and p.prokind = 'f' and p.proretset and p.pronargs = p.pronargdefaults
          and p.proname <> 'fn_tiene_acceso_retail' and pg_get_functiondef(p.oid) ~ 'fn_tiene_acceso_retail\\(\\)'
        order by p.proname
     loop
       perform set_config('request.jwt.claim.sub', p_lider, true);
       perform set_config('request.jwt.claims', json_build_object('sub', p_lider, 'role', 'authenticated')::text, true);
       execute format('select count(*) from retail.%I()', r.proname) into v_l;
       perform set_config('request.jwt.claim.sub', p_terminal, true);
       perform set_config('request.jwt.claims', json_build_object('sub', p_terminal, 'role', 'authenticated')::text, true);
       execute format('select count(*) from retail.%I()', r.proname) into v_t;
       v_n := v_n + 1;
       if v_l > 0 and v_t = 0 then v_malas := v_malas || r.proname::text; end if;
     end loop;
     return v_n || ':' || array_to_string(v_malas, ',');
   end $f$;
   select pg_temp.barrido('${FELIPE}', '${T_ADMIN_TRU}');`,
  (s) => /^\d+:$/.test(s) && Number(s.split(":")[0]) >= 3
);

// ===========================================================================
// 6. LA MIGRACIÓN
// ===========================================================================

caso(
  "la migración se puede pegar dos veces: el cuerpo de la puerta no cambia",
  `${MIGRACION}\nselect md5(prosrc) as m1 from pg_proc where oid = 'retail.fn_tiene_acceso_retail()'::regprocedure \\gset\n${MIGRACION}\n` +
    `select (md5(prosrc) = :'m1')::text from pg_proc where oid = 'retail.fn_tiene_acceso_retail()'::regprocedure;`,
  "true"
);
caso(
  "la guardia se detiene sin tocar nada si la puerta tiene otro cuerpo (alguien la cambió en vivo)",
  `create or replace function retail.fn_tiene_acceso_retail() returns boolean language sql stable security definer set search_path = retail, public, extensions as $$ select true $$;
   select pg_temp.intento($migracion$${MIGRACION}$migracion$) as intento \\gset
   select (:'intento' like 'P0001|fn_tiene_acceso_retail() tiene otro cuerpo (md5 %') || ',' || (select prosrc ~ 'select true' from pg_proc where oid = 'retail.fn_tiene_acceso_retail()'::regprocedure);`,
  "true,true"
);
caso(
  "la puerta sigue siendo UNA firma, SECURITY DEFINER, STABLE y con el search_path fijado",
  `select concat_ws(',', (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_tiene_acceso_retail'),
     (select prosecdef from pg_proc where oid = 'retail.fn_tiene_acceso_retail()'::regprocedure),
     (select provolatile = 's' from pg_proc where oid = 'retail.fn_tiene_acceso_retail()'::regprocedure),
     (select coalesce(array_to_string(proconfig, ';') like '%search_path=%', false) from pg_proc where oid = 'retail.fn_tiene_acceso_retail()'::regprocedure));`,
  "1,t,t,t"
);
caso(
  "los permisos no cambian: el ACL de la puerta es el mismo antes y después de la migración (parte del cuerpo anterior, así que también prueba que su guardia lo acepta)",
  `${CUERPO_ANTERIOR}
   select coalesce(proacl::text, 'default') as acl0, md5(prosrc) as m0 from pg_proc where oid = 'retail.fn_tiene_acceso_retail()'::regprocedure \\gset
   ${MIGRACION}
   select concat_ws(',', :'m0' = '403086e4cf5f29e8edfe4e1fff620fb9', coalesce(proacl::text, 'default') = :'acl0', md5(prosrc) <> :'m0', prosrc ~ 'fn_terminal_actual')
     from pg_proc where oid = 'retail.fn_tiene_acceso_retail()'::regprocedure;`,
  "t,t,t,t"
);
caso(
  "RADIO DEL CAMBIO: ninguna política, vista ni función de otro schema depende de la puerta (si alguna la usa, hay que revisar qué abre a las terminales)",
  `select concat_ws(',',
     (select count(*) from pg_policies where coalesce(qual, '') || coalesce(with_check, '') ~ 'fn_tiene_acceso_retail'),
     (select count(*) from pg_views where definition ~ 'fn_tiene_acceso_retail'),
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('retail', 'pg_catalog', 'information_schema') and p.prokind = 'f' and pg_get_functiondef(p.oid) ~ 'fn_tiene_acceso_retail'));`,
  "0,0,0"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE}${EN_SECO ? ", en seco" : ""})`);
process.exit(fallas ? 1 : 0);
