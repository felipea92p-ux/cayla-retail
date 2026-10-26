#!/usr/bin/env node
/**
 * Pruebas de «un Admin recibe lo que él mismo compró» (ADR-0517; Felipe 2026-10-26) — migración
 * `20261026161000_admin_recibe_lo_que_compro.sql`.
 *
 * LO QUE VIGILA. La decisión 17 de ADR-0362 («quien hace la orden no la recibe, ni el líder») ahora tiene UNA excepción: la cuenta de un
 * Admin (Admin en Dynamic y Líder activo aquí, `fn_es_admin()`). Que ese Admin abra, cuente y cierre el envío de su propia compra y
 * reciba «sin guía» su propia orden; que el mismo líder SIN ser Admin siga frenado; que quien compra y no es líder tampoco pase; que lo
 * que hace el Admin quede a la vista (la fila de Actividad «lo recibió quien hizo la compra» y las claves del detalle del envío); y que el
 * Taller (insumos) conserve el bloqueo íntegro.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga DOS veces dentro de cada caso, así se prueba que se puede
 * pegar dos veces). Felipe es líder y Admin (firma él sin combo) y hace las órdenes y los envíos; Sandra es líder y Admin; Micaela es de
 * Tienda Trujillo y no es líder (un rol de prueba con Recibir; firma ella en el combo «Responsable»). «Sin ser Admin» = a Felipe se le baja
 * el rol en Dynamic (`public.personas.rol`) dentro del caso: sigue siendo líder aquí.
 *   A  EL ADMIN: abre, cierra su propio envío y queda constancia (Actividad, detalle y Revisar compras); «Llegó esta orden» también.
 *   N  SIN SER ADMIN: el líder común sigue frenado en abrir, recibir y «Llegó esta orden», y la pantalla se lo avisa.
 *   M  LA PERSONA COMÚN: Micaela recibe lo de Felipe sin rastro de «lo propio»; lo que hizo ella, no.
 *   C  LA CUENTA: la excepción se pregunta a la cuenta (una cuenta sin persona, como una terminal, no la tiene).
 *   S  LA FORMA: las piezas internas cerradas, el disparador y el Taller intacto.
 *
 * USO
 *   node scripts/pruebas/recibir_lo_propio.mjs                              → contra el stack local compartido
 *   node scripts/pruebas/recibir_lo_propio.mjs --contenedor supabase_db_x   → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/recibir_lo_propio.mjs --sin-migracion              → sin cargar la migración: contra una base sin el cambio,
 *                                                                              la prueba tiene que FALLAR
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const MIGRACIONES = SIN_MIGRACION
  ? ""
  : readFileSync(join(RAIZ, "supabase", "migrations", "20261026161000_admin_recibe_lo_que_compro.sql"), "utf8")
      .replace(/^set lock_timeout.*$/m, "")
      .replace(/^reset lock_timeout;$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const SANDRA = "22222222-2222-4222-8222-000000000005";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth) =>
  `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;
// Micaela elige en el combo «Responsable» a ella misma, en Trujillo (marcó su entrada en el preludio).
const EN_TIENDA = `select set_config('request.headers', json_build_object('x-responsable', :'micaela_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null\n`;
// Felipe sin ser Admin firma por el combo «Responsable» (el Admin firma a su nombre sin marcar asistencia): se elige a sí mismo, de turno.
const FELIPE_EN_TIENDA = `select set_config('request.headers', json_build_object('x-responsable', :'felipe_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null\n`;
const SIN_ENCABEZADOS = `select set_config('request.headers', '', true) \\g /dev/null\n`;

// Cada llamada devuelve su respuesta (jsonb) o {error, hint, msg, detail}.
const atrapa = (nombre, firma, llamada) => `
create function pg_temp.${nombre}(${firma}) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_detail text;
begin
  return (${llamada})::jsonb;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint, v_detail = pg_exception_detail;
  return jsonb_build_object('error', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg, 'detail', nullif(v_detail, ''));
end;
$f$;
grant execute on function pg_temp.${nombre}(${firma.replace(/p_\w+ /g, "")}) to authenticated;`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
${MIGRACIONES}
${MIGRACIONES}
set local search_path = retail, public, extensions;
-- «OK» si respondió, o «sqlstate|hint|mensaje» si falló.
create function pg_temp.e(p jsonb) returns text language sql as $f$
  select case when p ? 'error' then (p ->> 'error') || '|' || coalesce(p ->> 'hint', '') || '|' || (p ->> 'msg') else 'OK' end;
$f$;
grant execute on function pg_temp.e(jsonb) to authenticated;
-- ¿Esta cuenta puede recibir lo que compró? (la pregunta se hace a la CUENTA, sin cambiar de rol).
create function pg_temp.puede(p_sub uuid) returns boolean language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  return retail.fn_recepcion_puede_recibir_lo_propio();
end;
$f$;
${atrapa("abre", "p_id uuid, p_version integer", "retail.abrir_despacho(p_id, p_version)")}
${atrapa("sin_guia", "p_orden uuid, p_token uuid", "retail.recibir_orden_sin_envio(p_orden, p_token)")}
${atrapa(
  "recibe",
  "p_id uuid, p_version integer, p_lineas jsonb, p_extras jsonb, p_nota text, p_token uuid",
  "retail.recibir_despacho(p_id, p_version, p_lineas, p_extras, p_nota, p_token)",
)}

-- Datos propios de la prueba, creados como Felipe (líder): la prenda de catálogo nace aprobada.
select set_config('request.jwt.claim.sub', '${FELIPE}', true) \\g /dev/null
select set_config('request.jwt.claims', '{"sub":"${FELIPE}","role":"authenticated"}', true) \\g /dev/null
insert into retail.proveedores (nombre) values ('Proveedor Lo Propio Prueba') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Lo Propio Prueba') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Chompas Lo Propio', 'accesorios') returning id as cat \\gset
select id as t_s from retail.tallas where valor = 'S' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat', :'t_s');
select codigo as c1 from retail.colores where activo order by orden, codigo limit 1 \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select p.id as sandra_p from public.personas p where p.auth_user_id = '${SANDRA}' \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as alm_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
-- Como en producción: el responsable obligatorio encendido; Micaela marcó su entrada en Trujillo.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date),
         (:'felipe_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
-- Una prenda del catálogo de esa categoría y marca (talla S): el envío entra a ella.
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat', 'Chompa Catálogo Lo Propio', :'marca', :'prov')
  returning id as prod_p \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'prod_p', :'t_s', :'c1', 79.90, 25)
  returning id as pv_s \\gset
-- O1 directo a Trujillo, la hace Felipe: l1 = 10 a S/ 30; l2 = 4 a S/ 50.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, fecha_entrega_estimada, creada_por)
  values (:'prov', :'tru', retail.fn_hoy_lima() + 7, :'felipe_p') returning id as o1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario)
  values (:'o1', 1, :'cat', :'marca', 'Chompa cuello alto', 10, 30) returning id as l1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o1', 2, :'cat', :'marca', 4, 50) returning id as l2 \\gset
-- O3 directo a Trujillo, la hace Micaela.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'micaela_p')
  returning id as o3 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o3', 1, :'cat', :'marca', 3, 30) returning id as l_o3 \\gset
select set_config('request.jwt.claim.sub', '', true) \\g /dev/null
select set_config('request.jwt.claims', '', true) \\g /dev/null
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO Recibir. Se va con el ROLLBACK.
const MICAELA_RECIBE = `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba lo propio ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'recibir');
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
${como(MICAELA)}${EN_TIENDA}`;

// Felipe deja de ser Admin en Dynamic (sigue siendo líder aquí). Va con el ROLLBACK.
const FELIPE_SIN_SER_ADMIN = `reset role;\nupdate public.personas set rol = 'integrante' where auth_user_id = '${FELIPE}';\n`;

// SQL de jsonb.
const J = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const A = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
const V = (v, cantidad) => J({ variante_id: `:'${v}'`, cantidad, danadas: 0, danada_solucion: "null::text" });
const LIN = (di, vars) =>
  J({ despacho_item_id: `:'${di}'`, costo_unitario: "null::numeric", confirma_costo: "false", variantes: A(...vars), faltante_causa: "null::text", sobrante_causa: "null::text" });

// Felipe (líder, Admin: firma él sin combo) envía, y la versión queda en :v_<nombre>. `lineas`: [[orden_compra_item, cantidad]].
const ENVIA = (nombre, lineas) => `
${como(FELIPE)}${SIN_ENCABEZADOS}
select (retail.crear_envio(:'tru', ${A(...lineas.map(([l, n]) => J({ orden_compra_item_id: `:'${l}'`, cantidad: n })))}, 'T001-88', null, null) ->> 'despacho_id') as ${nombre} \\gset
reset role;
select version as v_${nombre} from retail.despachos where id = :'${nombre}' \\gset
`;
// Su línea (despacho_item) de una línea pedida: :di_<línea>.
const ITEM = (envio, l) => `select id as di_${l} from retail.despacho_items where despacho_id = :'${envio}' and orden_compra_item_id = :'${l}' \\gset\n`;
const ABRE = (envio) => `select pg_temp.abre(:'${envio}', :v_${envio}) as ab_${envio} \\gset
select (:'ab_${envio}'::jsonb ->> 'version')::int as v_${envio} \\gset
`;
const RECIBE_L2 = (envio) => `pg_temp.recibe(:'${envio}', :v_${envio}, ${A(LIN("di_l2", [V("pv_s", 4)]))}, '[]'::jsonb, null, null)`;
// El papel de la compra (una boleta) de la O1, para que «Revisar compras» lo muestre: queda en :papel.
// Anotar un papel exige que quien compra tenga su ronda de compras abierta (ADR-0480, 20261023183000; la pone la base): en una base armada
// desde cero (CI) nadie la tiene, así que se abre una dentro de la prueba (todo se deshace con el ROLLBACK).
const PAPEL_DE_O1 = `reset role;
insert into retail.compra_rondas (persona_id, abierta_por)
  select :'felipe_p', :'felipe_p'
   where not exists (select 1 from retail.compra_rondas r where r.persona_id = :'felipe_p' and r.cerrada_en is null);
insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, fecha, huella, registrado_por, pagado)
  values (gen_random_uuid(), :'felipe_p', :'prov', 'boleta', 200, retail.fn_hoy_lima(), md5('papel-lo-propio'), :'felipe_p', 0) returning id as papel \\gset
update retail.ordenes_compra set papel_id = :'papel' where id = :'o1';
`;
// Lo que ve quien revisa (Sandra, Admin: no es la compradora): la marca de cada envío de ese papel.
const LEE_REVISAR = `${como(SANDRA)}${SIN_ENCABEZADOS}
select coalesce((select string_agg(e ->> 'recibio_quien_compro', ',') from jsonb_array_elements(retail.fn_revisar_compras() -> 'papeles') p,
                  jsonb_array_elements(p -> 'envios') e where p ->> 'id' = :'papel'), 'sin envío') as marca \\gset
reset role;
`;
const limpio = (expr) => `regexp_replace(${expr}, 'ENV-[0-9]{6}', 'ENV', 'g')`;
const ACT = (envio, accion) => `(select count(*) from retail.actividad a where a.accion = '${accion}' and a.registro_id = :'${envio}')`;
const DETALLE = (envio, claves) => `(select concat_ws(':', ${claves.map((k) => `(retail.fn_envio_detalle(:'${envio}') ->> '${k}')`).join(", ")}))`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nset constraints all immediate;\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL|HINT|CONTEXT|LINE/.test(l)).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

const QUIEN_COMPRO = "42501|recibir_quien_compro|Hiciste esta orden: la tiene que recibir otra persona de la tienda";

// A. EL ADMIN --------------------------------------------------------------------------------------------------------------
caso(
  "A1 el Admin que hizo la orden abre y cierra su envío: cerrado a su nombre, la pantalla no lo bloquea y queda en Actividad y en el detalle",
  `${ENVIA("d1", [["l2", 4]])}${ITEM("d1", "l2")}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   select (select count(*) from jsonb_array_elements(retail.fn_envios_por_recibir(:'tru')) e where (e ->> 'id')::uuid = :'d1' and (e ->> 'creado_por_mi')::boolean) as bloqueadas \\gset
   select ${DETALLE("d1", ["creado_por_mi", "compro_quien_mira", "recibio_quien_compro"])} as det_antes \\gset
   ${ABRE("d1")}
   select ${RECIBE_L2("d1")} as r \\gset
   select ${DETALLE("d1", ["creado_por_mi", "compro_quien_mira", "recibio_quien_compro"])} as det \\gset
   reset role;
   select concat_ws(' / ',
     pg_temp.e(:'ab_d1'::jsonb), pg_temp.e(:'r'::jsonb),
     (select d.estado || ':' || (d.cerrado_por = :'felipe_p') from retail.despachos d where d.id = :'d1'),
     :'bloqueadas' || ' bloqueadas', :'det_antes', :'det',
     ${ACT("d1", "despacho_recibido_lo_propio")} || ' lo propio',
     ${ACT("d1", "despacho_recibido")} || ' recibido',
     (select ${limpio("a.descripcion")} || ':' || a.modulo || ':' || (a.persona_id = :'felipe_p') || ':' || (a.ubicacion_id = :'tru')
        from retail.actividad a where a.accion = 'despacho_recibido_lo_propio' and a.registro_id = :'d1'));`,
  ["OK", "OK", "cerrado:true", "0 bloqueadas", "false:true:false", "false:true:true", "1 lo propio", "1 recibido", "ENV: lo recibió quien hizo la compra:recibir:true:true"].join(" / "),
);
caso(
  "A2 el Admin recibe «sin guía» su propia orden («Llegó esta orden»): crea el envío abierto y la fila ya no sale bloqueada",
  `${como(FELIPE)}${SIN_ENCABEZADOS}
   select (select count(*) from jsonb_array_elements(retail.fn_ordenes_directas_por_recibir(:'tru')) e
            where (e ->> 'orden_id') = :'o1' and (e ->> 'creada_por_mi')::boolean) as bloq \\gset
   select pg_temp.sin_guia(:'o1', null) as sg \\gset
   reset role;
   select concat_ws(' / ', :'bloq' || ' bloqueada', pg_temp.e(:'sg'::jsonb),
     (select d.estado from retail.despachos d where d.id = (:'sg'::jsonb ->> 'despacho_id')::uuid));`,
  "0 bloqueada / OK / abierto",
);
caso(
  "A3 quien revisa las compras ve la marca: el envío del papel lo cerró quien compró (y mientras se cuenta, todavía no)",
  `${ENVIA("d1", [["l2", 4]])}${ITEM("d1", "l2")}${PAPEL_DE_O1}
   ${LEE_REVISAR.replace("as marca", "as marca_antes")}
   ${como(FELIPE)}${SIN_ENCABEZADOS}
   ${ABRE("d1")}
   select ${RECIBE_L2("d1")} as r \\gset
   ${LEE_REVISAR}
   select concat_ws(' / ', :'marca_antes', pg_temp.e(:'r'::jsonb), :'marca');`,
  "false / OK / true",
);

// N. SIN SER ADMIN ---------------------------------------------------------------------------------------------------------
caso(
  "N1 el líder que NO es Admin sigue frenado en abrir y en recibir, y la pantalla se lo avisa antes (creado_por_mi y compro_quien_mira)",
  `${ENVIA("d1", [["l2", 4]])}${ENVIA("d2", [["l1", 10]])}${ITEM("d1", "l2")}
   ${como(SANDRA)}${SIN_ENCABEZADOS}
   ${ABRE("d1")}
   ${FELIPE_SIN_SER_ADMIN}
   ${como(FELIPE)}${FELIPE_EN_TIENDA}
   select pg_temp.e(pg_temp.abre(:'d2', :v_d2)) as abre_d2 \\gset
   select pg_temp.e(${RECIBE_L2("d1")}) as recibe_d1 \\gset
   select (select count(*) from jsonb_array_elements(retail.fn_envios_por_recibir(:'tru')) e where (e ->> 'id')::uuid in (:'d1', :'d2') and (e ->> 'creado_por_mi')::boolean) as bloqueadas \\gset
   select ${DETALLE("d1", ["creado_por_mi", "compro_quien_mira", "recibio_quien_compro"])} as det \\gset
   reset role;
   select concat_ws(' / ', :'abre_d2', :'recibe_d1', :'bloqueadas' || ' bloqueadas', :'det',
     (select d.estado from retail.despachos d where d.id = :'d1'), ${ACT("d1", "despacho_recibido_lo_propio")} || ' lo propio');`,
  [QUIEN_COMPRO, QUIEN_COMPRO, "2 bloqueadas", "true:true:false", "abierto", "0 lo propio"].join(" / "),
);
caso(
  "N2 el líder que NO es Admin tampoco recibe «sin guía» su propia orden, y su fila sale bloqueada",
  `${FELIPE_SIN_SER_ADMIN}
   ${como(FELIPE)}${FELIPE_EN_TIENDA}
   select (select count(*) from jsonb_array_elements(retail.fn_ordenes_directas_por_recibir(:'tru')) e
            where (e ->> 'orden_id') = :'o1' and (e ->> 'creada_por_mi')::boolean) as bloq \\gset
   select pg_temp.e(pg_temp.sin_guia(:'o1', null)) as sg \\gset
   reset role;
   select concat_ws(' / ', :'bloq' || ' bloqueada', :'sg', (select count(*) from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
        where i.orden_compra_id = :'o1') || ' envíos de la orden');`,
  ["1 bloqueada", QUIEN_COMPRO, "0 envíos de la orden"].join(" / "),
);

// M. LA PERSONA COMÚN ------------------------------------------------------------------------------------------------------
caso(
  "M1 Micaela (con Recibir, sin ser líder) recibe lo de Felipe como siempre: sin constancia de «lo propio» y el detalle dice que no es suyo; lo que ella compró, no",
  `${ENVIA("d1", [["l2", 4]])}${ENVIA("d3", [["l_o3", 3]])}${ITEM("d1", "l2")}
   ${MICAELA_RECIBE}
   ${ABRE("d1")}
   select ${RECIBE_L2("d1")} as r \\gset
   select pg_temp.e(pg_temp.abre(:'d3', :v_d3)) as suya \\gset
   select ${DETALLE("d1", ["creado_por_mi", "compro_quien_mira", "recibio_quien_compro"])} as det1 \\gset
   select ${DETALLE("d3", ["creado_por_mi", "compro_quien_mira"])} as det3 \\gset
   reset role;
   select concat_ws(' / ', pg_temp.e(:'ab_d1'::jsonb), pg_temp.e(:'r'::jsonb), :'suya', :'det1', :'det3',
     ${ACT("d1", "despacho_recibido_lo_propio")} || ' lo propio', ${ACT("d1", "despacho_recibido")} || ' recibido');`,
  ["OK", "OK", QUIEN_COMPRO, "false:false:false", "true:true", "0 lo propio", "1 recibido"].join(" / "),
);

caso(
  "M2 quien revisa ve «false» cuando lo cerró otra persona (Micaela recibió lo que compró Felipe)",
  `${ENVIA("d1", [["l2", 4]])}${ITEM("d1", "l2")}${PAPEL_DE_O1}
   ${MICAELA_RECIBE}
   ${ABRE("d1")}
   select ${RECIBE_L2("d1")} as r \\gset
   ${LEE_REVISAR}
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), :'marca');`,
  "OK / false",
);

// C. LA CUENTA -------------------------------------------------------------------------------------------------------------
caso(
  "C1 la excepción se pregunta a la CUENTA: Admin sí; Micaela y una cuenta sin persona (como una terminal) no; Felipe sin ser Admin, tampoco",
  `select pg_temp.puede('${FELIPE}') as f, pg_temp.puede('${SANDRA}') as s, pg_temp.puede('${MICAELA}') as m, pg_temp.puede(gen_random_uuid()) as t \\gset
   ${FELIPE_SIN_SER_ADMIN}
   select pg_temp.puede('${FELIPE}') as f2 \\gset
   select concat_ws(' / ', :'f', :'s', :'m', :'t', :'f2');`,
  "t / t / f / f / f",
);

// S. LA FORMA --------------------------------------------------------------------------------------------------------------
caso(
  "S1 las piezas internas son de la base (security definer, ni authenticated ni anon las ejecutan) y el disparador solo mira el paso a «cerrado»",
  `reset role;
   select concat_ws(' / ',
     (select string_agg(p.proname || ':' || p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':' || has_function_privilege('anon', p.oid, 'execute'),
                        ',' order by p.proname)
        from pg_proc p where p.pronamespace = 'retail'::regnamespace
         and p.proname in ('fn_recepcion_puede_recibir_lo_propio', 'fn_recepcion_mi_persona', 'fn_recepcion_quien_mira', 'fn_despacho_recibido_por_quien_compro')),
     (select (pg_get_triggerdef(t.oid) like '%AFTER UPDATE OF estado ON retail.despachos%')::text || ':' || (pg_get_triggerdef(t.oid) like '%WHEN%cerrado%')::text || ':' || t.tgenabled::text
        from pg_trigger t where t.tgname = 'trg_despacho_recibido_por_quien_compro' and t.tgrelid = 'retail.despachos'::regclass));`,
  "fn_despacho_recibido_por_quien_compro:true:false:false,fn_recepcion_mi_persona:true:false:false,fn_recepcion_puede_recibir_lo_propio:true:false:false,fn_recepcion_quien_mira:true:false:false / true:true:O",
);
caso(
  "S2 el Taller (insumos) conserva su bloqueo íntegro: ninguna función de insumos nombra la excepción, y siguen frenando con recibir_quien_compro",
  `reset role;
   select concat_ws(' / ',
     (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname like '%insumo%' and p.prosrc like '%recibir_quien_compro%') >= 1,
     (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname like '%insumo%' and p.prosrc like '%fn_recepcion_puede_recibir_lo_propio%'));`,
  "t / 0",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
