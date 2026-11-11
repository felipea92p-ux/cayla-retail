#!/usr/bin/env node
/**
 * Pruebas de ADR-0636, paso 2 — unir una recepción «sin aviso» con la compra pagada a la que pertenece
 * (`20261110011000_unir_recepcion_con_su_compra.sql`).
 *
 * (Incluye lo que cerró la revisión adversarial del 2026-11-10: U15 a U19; y la lista de parejas posibles del paso 3, `20261110022000`: L1 a L6.
 * Desde `20261111152000` (2026-11-11), U6 y L5: lo contado sin recibir en el envío de Compras ya no frena la unión: lo RECIBIDO sigue sin unirse, con la guarda de siempre.
 * Desde `20261111175000`, U21 y U22: corregir el proveedor de una marca en una recepción cerrada, y un Admin une con faltante.
 * Desde `20261111165000`, U20: una compra unida deja de salir «por enviar» en Recibir, en Órdenes de compra y en Análisis.)
 *
 * LO QUE VIGILA. Que una misma mercadería nunca entre dos veces al stock ni se quede sin pasar al libro: tras unir, la compra sale de su
 * envío propio, ya no se puede volver a mandar, y su papel pasa al libro cuando la recepción está cerrada, con lo llegado anotado como
 * «recibido antes». La unión no toca stock ni `movimientos`.
 *
 * CÓMO. Cada caso corre en su transacción con ROLLBACK (nada queda escrito), con la migración cargada dos veces dentro del caso (es
 * re-ejecutable) y los candados diferidos revisados al final. Las personas son las de `compras_pagadas_hacia.mjs`.
 * USO
 *   RETAIL_CONTENEDOR_PG=supabase_db_cayla-lima node scripts/pruebas/unir_recepcion_con_compra.mjs → contra una base local al día (la de CI es `supabase_db_cayla-retail`)
 *   node scripts/pruebas/unir_recepcion_con_compra.mjs --contenedor supabase_db_x → otro stack
 *   node scripts/pruebas/unir_recepcion_con_compra.mjs --sin-migracion           → sin cargar la migración: tiene que FALLAR
 *   node scripts/pruebas/unir_recepcion_con_compra.mjs --ver                     → imprime lo obtenido de cada caso (para escribir lo esperado)
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
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG || "supabase_db_cayla-retail");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const VER_TODO = process.argv.includes("--ver");
const MIGRACION = SIN_MIGRACION
  ? ""
  : ["20261110011000_unir_recepcion_con_su_compra.sql", "20261110022000_uniones_posibles_recepcion_compra.sql", "20261111152000_unir_descarta_lo_contado_en_el_envio_propio.sql", "20261111165000_ordenes_unidas_no_salen_por_enviar.sql", "20261111175000_corregir_proveedor_de_una_marca_y_unir_con_faltante.sql"]
      .map((f) =>
        readFileSync(join(RAIZ, "supabase/migrations", f), "utf8")
          .replace(/^set lock_timeout.*$/gm, "")
          .replace(/^reset lock_timeout;$/gm, ""),
      )
      .join("\n");

const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo: recibe y une
const SANDRA = "22222222-2222-4222-8222-000000000005"; // líder: compra y manda

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
const como = (auth, clave = null) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n` +
  `select set_config('request.headers', '${JSON.stringify(clave ? { "x-responsable-omitido": clave } : {})}', true) \\g /dev/null\nset local role authenticated;\n`;
// Micaela elige en el combo «Responsable» a ella misma, en Trujillo.
const MICAELA_AQUI = `${como(MICAELA)}select set_config('request.headers', json_build_object('x-responsable', :'micaela_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null\n`;
const COMPRADORA = (clave) => como(SANDRA, clave);

const J = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const A = (...xs) => `jsonb_build_array(${xs.join(", ")})`;

// «OK» o «sqlstate|hint» si falló.
const atrapa = (nombre, firma, llamada) => `
create function pg_temp.${nombre}(${firma}) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  return (${llamada})::jsonb;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('error', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
grant execute on function pg_temp.${nombre}(${firma.replace(/p_\w+ /g, "")}) to authenticated;`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
create function pg_temp.h(p jsonb) returns text language sql as $f$
  select case when p ? 'error' then coalesce(p ->> 'hint', p ->> 'error') else 'OK' end;
$f$;
grant execute on function pg_temp.h(jsonb) to authenticated;
${atrapa("sinaviso", "p_u uuid, p_prov uuid, p_guia text, p_nota text, p_token uuid", "retail.abrir_envio_sin_aviso(p_u, p_prov, p_guia, p_nota, p_token)")}
${atrapa("guarda", "p_d uuid, p_item uuid, p_cont integer, p_sep jsonb, p_ver integer, p_extra integer, p_prov uuid, p_cat uuid, p_marca uuid", "retail.guardar_conteo_envio(p_d, p_item, p_cont, p_sep, p_ver, p_extra, p_prov, p_cat, p_marca)")}
${atrapa("cierra", "p_d uuid, p_version integer, p_lineas jsonb, p_nota text, p_token uuid", "retail.cerrar_conteo_envio(p_d, p_version, p_lineas, p_nota, p_token)")}
${atrapa("une", "p_d uuid, p_papel uuid, p_token uuid", "retail.unir_recepcion_con_compra(p_d, p_papel, p_token)")}
${atrapa("lleva", "p_d uuid, p_item uuid, p_extra integer, p_ver integer, p_prod uuid, p_vars jsonb, p_costo numeric, p_conf boolean, p_token uuid", "retail.llevar_al_stock_ahora(p_d, p_item, p_extra, p_ver, p_prod, p_vars, p_costo, p_conf, p_token)")}
${atrapa("abre", "p_id uuid, p_version integer", "retail.abrir_despacho(p_id, p_version)")}
${atrapa("corrige_marca", "p_d uuid, p_marca uuid, p_prov uuid, p_motivo text", "retail.corregir_proveedor_de_marca(p_d, p_marca, p_prov, p_motivo)")}

-- Como en producción: responsable obligatorio; Micaela marcó su entrada en Trujillo.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as otra from retail.ubicaciones where tipo = 'tienda' and nombre <> 'Tienda Trujillo' order by nombre limit 1 \\gset
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
insert into retail.compra_rondas (persona_id, abierta_por)
select distinct c.persona_id, c.persona_id from retail.colaboradores c
 where not exists (select 1 from retail.compra_rondas r where r.persona_id = c.persona_id and r.cerrada_en is null);
insert into retail.proveedores (nombre) values ('Proveedor Unir Prueba') returning id as prov \\gset
insert into retail.proveedores (nombre) values ('Proveedor Unir Otro') returning id as prov2 \\gset
insert into retail.marcas (nombre) values ('Marca Unir Prueba') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Polos Unir', 'accesorios') returning id as cat \\gset
select id as t_s from retail.tallas where valor = 'S' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat', :'t_s');
select codigo as c1 from retail.colores where activo order by orden, codigo limit 1 \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov'), (:'marca', :'prov2');
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat', 'Polo Unir', :'marca', :'prov') returning id as prod \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'prod', :'t_s', :'c1', 59.90, 10) returning id as var \\gset
select set_config('t.tru', :'tru', true), set_config('t.otra', :'otra', true), set_config('t.prov', :'prov', true),
       set_config('t.cat', :'cat', true), set_config('t.marca', :'marca', true) \\g /dev/null
insert into retail.roles (nombre) values ('ZZ Unir sin nada') returning id as rol_nada \\gset
insert into retail.roles (nombre) values ('ZZ Unir recibe') returning id as rol_recibe \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol_recibe', 'recibir');
update retail.colaboradores set rol_id = :'rol_recibe' where persona_id = :'micaela_p';
`;

// La compradora registra una compra rápida (nota de venta, n prendas a S/ 10, a la sede indicada): su papel queda en :<nombre>.
const COMPRA = (nombre, n, { prov = "'prov'", sede = "t.tru", token } = {}) => `
${COMPRADORA("compra_rapida")}
select retail.registrar_compra_rapida('${token}', :${prov}::uuid, 'nota_venta', ${n * 10}, 'papeles/prueba-${nombre}.jpg', jsonb_build_array(
  jsonb_build_object('descripcion', 'Polo prueba', 'categoria_id', current_setting('t.cat')::uuid, 'marca_id', current_setting('t.marca')::uuid,
                     'cantidad', ${n}, 'costo', 10, 'destino_id', current_setting('${sede}')::uuid))) \\g /dev/null
reset role;
select '${token}'::uuid as ${nombre} \\gset
`;
// Y la manda: su envío propio queda en :<nombre>.
const MANDA = (nombre, token) => `
${COMPRADORA("compra_mandar")}
select retail.mandar_compras_a_tienda(current_setting('t.tru')::uuid, 1, '${token}') \\g /dev/null
reset role;
select d.id as ${nombre} from retail.despachos d where d.estado = 'en_camino' and d.ubicacion_destino_id = :'tru' order by d.numero desc limit 1 \\gset
`;
// Micaela abre una recepción sin aviso (proveedor :<prov>) y cuenta n prendas del Polo Unir: la recepción en :<nombre>.
const SIN_AVISO = (nombre, n, { prov = "prov" } = {}) => `
${MICAELA_AQUI}
select pg_temp.sinaviso(:'tru', :'${prov}', 'G-77', null, gen_random_uuid()) as sa_${nombre} \\gset
select (:'sa_${nombre}'::jsonb ->> 'despacho_id') as ${nombre} \\gset
select pg_temp.guarda(:'${nombre}', null, ${n}, ${J({ prendas: A(J({ producto_id: ":'prod'", cantidad: n, variantes: A(J({ variante_id: ":'var'", cantidad: n, danadas: 0, danada_solucion: "null::text" })) })), nuevas: A() })},
  null::int, null::int, null::uuid, :'cat', :'marca') \\g /dev/null
`;
const CIERRA = (nombre, { costo = "null::numeric" } = {}) => `
reset role;
select version as k_${nombre} from retail.despacho_conteos where despacho_id = :'${nombre}' and extra_posicion = 1 \\gset
select version as v_${nombre} from retail.despachos where id = :'${nombre}' \\gset
${MICAELA_AQUI}
select pg_temp.cierra(:'${nombre}', :v_${nombre}, ${A(J({ extra_posicion: "1", version: `:k_${nombre}`, costo_unitario: costo, confirma_costo: "false", faltante_causa: "null::text", sobrante_causa: "null::text", nota: "null::text" }))}, null::text, null::uuid) as cierre_${nombre} \\gset
`;
const STOCK = `coalesce((select sum(s.cantidad) from retail.stock s where s.variante_id = :'var'), 0)`;
const MOVS = `(select count(*) from retail.movimientos m where m.variante_id = :'var')`;

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
  if (VER_TODO) console.log(`▶ ${nombre}\n    ${obtenido}`);
  const ok = esperado === null ? true : typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

const A1 = "aaaaaaaa-0636-4000-8000-0000000000a1";
const A2 = "aaaaaaaa-0636-4000-8000-0000000000a2";
const B1 = "aaaaaaaa-0636-4000-8000-0000000000b1";

caso(
  "U1 llegó sin aviso y la compra aún no se manda: se une, el papel pasa al libro, lo llegado queda «recibido antes» y el stock no se mueve",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8)}
   ${CIERRA("r1")}
   reset role;
   select ${STOCK} as stock_antes, ${MOVS} as movs_antes \\gset
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select concat_ws(' / ',
     concat_ws(':', :'u'::jsonb ->> 'unido', :'u'::jsonb ->> 'repetido', :'u'::jsonb ->> 'paso_al_libro', :'u'::jsonb ->> 'prendas_papel', :'u'::jsonb ->> 'prendas_recibidas',
               :'u'::jsonb ->> 'error', :'u'::jsonb ->> 'msg'),
     (select estado from retail.compra_papeles where id = :'p1'),
     (select coalesce(sum(a.cantidad), 0) from retail.compra_item_recibido_antes a),
     (${STOCK} = :'stock_antes') and (${MOVS} = :'movs_antes'),
     (select sum(retail.fn_compra_item_por_mandar(i.id)) from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id where o.papel_id = :'p1'));`,
  "true:false:true:8:8 / completado / 8 / t / 0",
);

// Lo que respondió una unión, en una línea: unido:repetido:paso_al_libro:anulados:nuevos:error|pista
const RESP = (u) => `concat_ws(':', :'${u}'::jsonb ->> 'unido', :'${u}'::jsonb ->> 'repetido', :'${u}'::jsonb ->> 'paso_al_libro',
  jsonb_array_length(coalesce(:'${u}'::jsonb -> 'envios_anulados', '[]')), jsonb_array_length(coalesce(:'${u}'::jsonb -> 'envios_nuevos', '[]')),
  coalesce(:'${u}'::jsonb ->> 'hint', :'${u}'::jsonb ->> 'error', ''))`;
const POR_MANDAR = (p) => `(select coalesce(sum(retail.fn_compra_item_por_mandar(i.id)), 0) from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id where o.papel_id = :'${p}')`;
const ESTADO = (d) => `(select estado from retail.despachos where id = :'${d}')`;

caso(
  "U2 la compra ya iba en su envío: ese envío se anula y la compra deja de estar por mandar",
  `${COMPRA("p1", 8, { token: A1 })}${MANDA("e1", B1)}
   ${SIN_AVISO("r1", 8)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u")}, ${ESTADO("e1")}, (select estado from retail.compra_papeles where id = :'p1'), ${POR_MANDAR("p1")});`,
  "true:false:true:1:0: / anulado / completado / 0",
);
caso(
  "U3 la misma unión otra vez responde «repetido» y no cambia nada",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u1 \\gset
   select pg_temp.une(:'r1', :'p1', null) as u2 \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u2")}, (select count(*) from retail.compra_papel_llegadas), (select count(*) from retail.compra_item_recibido_antes));`,
  "true:true:true:0:0: / 1 / 1",
);
caso(
  "U4 un envío con dos compras: se anula y nace otro en camino con la que no se unió; la unida ya no viaja",
  `${COMPRA("p1", 8, { token: A1 })}${COMPRA("p2", 5, { token: A2 })}${MANDA("e1", B1)}
   select (select count(distinct di.despacho_id) from retail.despacho_items di where di.despacho_id = :'e1') as una_sola \\gset
   ${SIN_AVISO("r1", 8)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u")}, ${ESTADO("e1")},
     (select count(*) from retail.despachos d where d.estado = 'en_camino' and d.ubicacion_destino_id = :'tru'),
     (select coalesce(sum(di.cantidad), 0) from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id where d.estado = 'en_camino' and d.ubicacion_destino_id = :'tru'),
     ${POR_MANDAR("p1")}, ${POR_MANDAR("p2")}, (select estado from retail.compra_papeles where id = :'p2'));`,
  "true:false:true:1:1: / anulado / 1 / 5 / 0 / 0 / por_completar",
);
caso(
  "U5 lo unido no se puede volver a enviar: ni en un envío nuevo ni agregado a uno vivo (compra_ya_llego)",
  `${COMPRA("p1", 8, { token: A1 })}${COMPRA("p2", 5, { token: A2 })}${MANDA("e1", B1)}
   ${SIN_AVISO("r1", 8)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select d.id as e2 from retail.despachos d where d.estado = 'en_camino' and d.ubicacion_destino_id = :'tru' limit 1 \\gset
   select i.id as oci from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id where o.papel_id = :'p1' limit 1 \\gset
   create function pg_temp.intento_envio(p_d uuid, p_oci uuid) returns text language plpgsql as $f$
   declare v_h text;
   begin
     insert into retail.despacho_items (despacho_id, orden_compra_item_id, cantidad, categoria_id, marca_id, descripcion, precio_unitario)
       values (p_d, p_oci, 1, current_setting('t.cat')::uuid, current_setting('t.marca')::uuid, 'x', 10);
     set constraints all immediate;
     return 'SIN_ERROR';
   exception when others then
     get stacked diagnostics v_h = pg_exception_hint;
     return coalesce(v_h, sqlstate);
   end $f$;
   select pg_temp.intento_envio(:'e2', :'oci');`,
  "compra_ya_llego",
);
caso(
  "U6 si el envío propio solo tiene prendas CONTADAS (nada recibido) se une igual: se anula, lo contado queda como historia y el stock no se mueve",
  `${COMPRA("p1", 8, { token: A1 })}${MANDA("e1", B1)}
   ${MICAELA_AQUI}
   reset role;
   select version as v_e1 from retail.despachos where id = :'e1' \\gset
   select id as di1 from retail.despacho_items where despacho_id = :'e1' limit 1 \\gset
   ${MICAELA_AQUI}
   select pg_temp.abre(:'e1', :v_e1) as ab \\gset
   select pg_temp.guarda(:'e1', :'di1', 3, '{}'::jsonb, null::int, null::int, null::uuid, null::uuid, null::uuid) as g \\gset
   ${SIN_AVISO("r1", 8)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   reset role;
   select ${STOCK} as stock_antes, ${MOVS} as movs_antes \\gset
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u")}, :'u'::jsonb ->> 'conteos_descartados', ${ESTADO("e1")}, (select count(*) from retail.compra_papel_llegadas),
     (select estado from retail.compra_papeles where id = :'p1'), ${POR_MANDAR("p1")},
     (select sum(k.contadas) from retail.despacho_conteos k where k.despacho_id = :'e1'),
     (${STOCK} = :'stock_antes') and (${MOVS} = :'movs_antes'), :'ab'::jsonb ->> 'error', :'g'::jsonb ->> 'error');`,
  "true:false:true:1:0: / 3 / anulado / 1 / completado / 0 / 3 / t",
);
caso(
  "U7 con otro proveedor no se une (union_sin_prendas): primero se corrige el proveedor de la recepción",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8, { prov: "prov2" })}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u")}, (select count(*) from retail.compra_papel_llegadas), (select estado from retail.compra_papeles where id = :'p1'));`,
  "0:0:union_sin_prendas / 0 / por_completar",
);
caso(
  "U8 una compra para otra tienda no se une a esta recepción (union_otra_sede)",
  `${COMPRA("p1", 8, { token: A1, sede: "t.otra" })}
   ${SIN_AVISO("r1", 8)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select ${RESP("u")};`,
  "0:0:union_otra_sede",
);
caso(
  "U9 sin nada en el stock todavía no hay qué unir (union_sin_prendas): se cierra primero la recepción",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8)}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u")}, (select count(*) from retail.compra_papel_llegadas));`,
  "0:0:union_sin_prendas / 0",
);
caso(
  "U9b con la recepción abierta pero lo llegado ya en el stock («llevar al stock ahora»): se une, el papel espera, y pasa al libro al cerrarla",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8)}
   reset role;
   select k.version as ver, k.extra_posicion as extra from retail.despacho_conteos k where k.despacho_id = :'r1' \\gset
   ${MICAELA_AQUI}
   select pg_temp.lleva(:'r1', null, :'extra', :'ver', :'prod', ${A(J({ variante_id: ":'var'", cantidad: 8, danadas: 0, danada_solucion: "null::text" }))}, null::numeric, false, gen_random_uuid()) as ll \\gset
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select (select estado from retail.compra_papeles where id = :'p1') as antes, (select coalesce(sum(a.cantidad), 0) from retail.compra_item_recibido_antes a) as ra_antes \\gset
   ${CIERRA("r1")}
   reset role;
   select concat_ws(' / ', pg_temp.h(:'ll'::jsonb), ${RESP("u")}, :'antes', :'ra_antes', (select estado from retail.compra_papeles where id = :'p1'),
     (select coalesce(sum(a.cantidad), 0) from retail.compra_item_recibido_antes a), pg_temp.h(:'cierre_r1'::jsonb));`,
  "OK / true:false:false:0:0: / por_completar / 0 / completado / 8 / OK",
);
caso(
  "U10 permisos: sin el módulo Recibir no (union_sin_modulo); sin responsable no (responsable_requerido)",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select set_config('request.headers', '', true) \\g /dev/null
   select pg_temp.une(:'r1', :'p1', null) as sin_resp \\gset
   reset role;
   update retail.colaboradores set rol_id = :'rol_nada' where persona_id = :'micaela_p';
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as sin_modulo \\gset
   reset role;
   select concat_ws(' / ', pg_temp.h(:'sin_resp'::jsonb), pg_temp.h(:'sin_modulo'::jsonb), (select count(*) from retail.compra_papel_llegadas));`,
  "responsable_requerido / union_sin_modulo / 0",
);
caso(
  "U11 solo una recepción «sin aviso»: un envío con aviso se rechaza (union_no_es_sin_aviso)",
  `${COMPRA("p1", 8, { token: A1 })}${MANDA("e1", B1)}
   ${MICAELA_AQUI}
   select pg_temp.une(:'e1', :'p1', null) as u \\gset
   reset role;
   select ${RESP("u")};`,
  "0:0:union_no_es_sin_aviso",
);
caso(
  "U12 dos compras y una sola recepción de 8: la primera se une, la segunda no tiene qué unir (union_sin_prendas); con 13 llegadas, las dos",
  `${COMPRA("p1", 8, { token: A1 })}${COMPRA("p2", 5, { token: A2 })}
   ${SIN_AVISO("r1", 8)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u1 \\gset
   select pg_temp.une(:'r1', :'p2', null) as u2 \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u1")}, ${RESP("u2")}, (select count(*) from retail.compra_papel_llegadas));`,
  "true:false:true:0:0: / 0:0:union_sin_prendas / 1",
);
caso(
  "U13 con 13 llegadas contra dos compras de 8 y 5: las dos se unen y cada una reparte lo suyo",
  `${COMPRA("p1", 8, { token: A1 })}${COMPRA("p2", 5, { token: A2 })}
   ${SIN_AVISO("r1", 13)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u1 \\gset
   select pg_temp.une(:'r1', :'p2', null) as u2 \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u1")}, ${RESP("u2")}, (select coalesce(sum(a.cantidad), 0) from retail.compra_item_recibido_antes a),
     (select string_agg(estado, ',' order by estado) from retail.compra_papeles where id in (:'p1', :'p2')));`,
  "true:false:true:0:0: / true:false:true:0:0: / 13 / completado,completado",
);
caso(
  "U14 una compra que ya no está pendiente no se une (union_papel_no_pendiente); y una unión ya hecha no se cambia ni se borra",
  `${COMPRA("p1", 8, { token: A1 })}${COMPRA("p2", 5, { token: A2 })}
   ${SIN_AVISO("r1", 13)}${CIERRA("r1")}
   reset role;
   update retail.compra_papeles set estado = 'completado' where id = :'p2';
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p2', null) as u_viejo \\gset
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   create function pg_temp.toca() returns text language plpgsql as $f$
   begin
     update retail.compra_papel_llegadas set prendas_papel = prendas_papel + 1;
     return 'SIN_ERROR';
   exception when others then return sqlstate;
   end $f$;
   select concat_ws(' / ', ${RESP("u_viejo")}, ${RESP("u")}, pg_temp.toca());`,
  "0:0:union_papel_no_pendiente / true:false:true:0:0: / P0001",
);

// ---- Lo que cerró la revisión adversarial (2026-11-10) ----
const TOCA = `create function pg_temp.toca(p_sql text) returns text language plpgsql as $f$
   declare v_h text;
   begin
     execute p_sql;
     return 'SIN_ERROR';
   exception when others then
     get stacked diagnostics v_h = pg_exception_hint;
     return coalesce(v_h, sqlstate);
   end $f$;`;
const Q = (p) => `''' || :'${p}' || '''`;
caso(
  "U15 llegó menos de lo comprado: no se une todavía (union_llego_menos) y nada cambia",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 5)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u")}, (select count(*) from retail.compra_papel_llegadas), (select estado from retail.compra_papeles where id = :'p1'), ${POR_MANDAR("p1")});`,
  "0:0:union_llego_menos / 0 / por_completar / 8",
);
caso(
  "U16 una compra unida no se anula, no cambia de tienda ni de proveedor, y sus prendas no cambian de cantidad ni se quitan (compra_ya_llego)",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   ${TOCA}
   select concat_ws(' / ', ${RESP("u")},
     pg_temp.toca('update retail.ordenes_compra set estado = ''anulada'' where papel_id = ${Q("p1")}'),
     pg_temp.toca('update retail.ordenes_compra set ubicacion_destino_id = ${Q("otra")} where papel_id = ${Q("p1")}'),
     pg_temp.toca('update retail.ordenes_compra set proveedor_id = ${Q("prov2")} where papel_id = ${Q("p1")}'),
     pg_temp.toca('update retail.orden_compra_items set cantidad = cantidad + 1 where orden_compra_id in (select id from retail.ordenes_compra where papel_id = ${Q("p1")})'),
     pg_temp.toca('delete from retail.orden_compra_items where orden_compra_id in (select id from retail.ordenes_compra where papel_id = ${Q("p1")})'),
     pg_temp.toca('update retail.ordenes_compra set nota = ''x'' where papel_id = ${Q("p1")}'));`,
  "true:false:true:0:0: / compra_ya_llego / compra_ya_llego / compra_ya_llego / compra_ya_llego / compra_ya_llego / SIN_ERROR",
);
caso(
  "U17 el proveedor de una recepción unida no se corrige (proveedor_con_compra_unida): así el comprobante no queda con 0 «recibido antes»",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8)}
   reset role;
   select k.version as ver, k.extra_posicion as extra from retail.despacho_conteos k where k.despacho_id = :'r1' \\gset
   ${MICAELA_AQUI}
   select pg_temp.lleva(:'r1', null, :'extra', :'ver', :'prod', ${A(J({ variante_id: ":'var'", cantidad: 8, danadas: 0, danada_solucion: "null::text" }))}, null::numeric, false, gen_random_uuid()) as ll \\gset
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   ${TOCA}
   select set_config('retail.corrige_proveedor', 'si', true) \\g /dev/null
   select concat_ws(' / ', ${RESP("u")}, pg_temp.toca('update retail.despacho_recibidos set proveedor_id = ${Q("prov2")} where despacho_id = ${Q("r1")}'));`,
  "true:false:false:0:0: / proveedor_con_compra_unida",
);
caso(
  "U18 quien hizo la compra no la une (recibir_quien_compro), aunque reciba en la tienda",
  `reset role;
   insert into retail.rol_modulos (rol_id, modulo) values (:'rol_recibe', 'ordenes_compra');
   ${como(MICAELA, "compra_rapida")}
   select retail.registrar_compra_rapida('${A1}', current_setting('t.prov')::uuid, 'nota_venta', 80, 'papeles/prueba-u18.jpg', jsonb_build_array(
     jsonb_build_object('descripcion', 'Polo prueba', 'categoria_id', current_setting('t.cat')::uuid, 'marca_id', current_setting('t.marca')::uuid,
                        'cantidad', 8, 'costo', 10, 'destino_id', current_setting('t.tru')::uuid))) \\g /dev/null
   reset role;
   select '${A1}'::uuid as p1 \\gset
   ${SIN_AVISO("r1", 8)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u")}, (select count(*) from retail.compra_papel_llegadas), (select estado from retail.compra_papeles where id = :'p1'));`,
  "0:0:recibir_quien_compro / 0 / por_completar",
);
caso(
  "U19 con 8 llegadas llevadas al stock con la recepción abierta: la primera compra (8) se une y la segunda (5) no, y al cerrar solo la primera reparte",
  `${COMPRA("p1", 8, { token: A1 })}${COMPRA("p2", 5, { token: A2 })}
   ${SIN_AVISO("r1", 8)}
   reset role;
   select k.version as ver, k.extra_posicion as extra from retail.despacho_conteos k where k.despacho_id = :'r1' \\gset
   ${MICAELA_AQUI}
   select pg_temp.lleva(:'r1', null, :'extra', :'ver', :'prod', ${A(J({ variante_id: ":'var'", cantidad: 8, danadas: 0, danada_solucion: "null::text" }))}, null::numeric, false, gen_random_uuid()) as ll \\gset
   select pg_temp.une(:'r1', :'p1', null) as u1 \\gset
   select pg_temp.une(:'r1', :'p2', null) as u2 \\gset
   reset role;
   ${CIERRA("r1")}
   reset role;
   select concat_ws(' / ', ${RESP("u1")}, ${RESP("u2")}, (select count(*) from retail.compra_papel_llegadas),
     (select string_agg(estado, ',' order by estado) from retail.compra_papeles where id in (:'p1', :'p2')),
     (select coalesce(sum(a.cantidad), 0) from retail.compra_item_recibido_antes a));`,
  "true:false:false:0:0: / 0:0:union_sin_prendas / 1 / completado,por_completar / 8",
);

// ---- Paso 3: la lista de parejas posibles (`fn_uniones_posibles`) ----
// Lo que dice la lista, en una línea: n filas, luego por fila clase:se_puede:motivo:llegadas:faltan:monto|valor
const LISTA = (nombre = "lista") => `
   select retail.fn_uniones_posibles(:'tru') as ${nombre} \\gset`;
const FILAS = (l, i = 0) => `concat_ws(':', :'${l}'::jsonb -> ${i} ->> 'clase', :'${l}'::jsonb -> ${i} ->> 'se_puede', coalesce(:'${l}'::jsonb -> ${i} ->> 'motivo', '-'),
     :'${l}'::jsonb -> ${i} ->> 'prendas_llegadas', coalesce(:'${l}'::jsonb -> ${i} ->> 'faltan', '-'),
     coalesce(:'${l}'::jsonb -> ${i} ->> 'monto_papel', 'null') || '|' || coalesce(:'${l}'::jsonb -> ${i} ->> 'valor_llegado', 'null'))`;
caso(
  "U20 una compra unida deja de salir «por enviar»: en Recibir («Llegó esta orden») y en Órdenes de compra (Análisis no tiene migración en el repo)",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8)}${CIERRA("r1")}
   reset role;
   select o.id as oc1 from retail.ordenes_compra o where o.papel_id = :'p1' limit 1 \\gset
   create function pg_temp.vistas(p_oc uuid, p_tru uuid) returns text language sql security definer as $f$
     select concat_ws(':',
       (select count(*) from jsonb_array_elements(retail.fn_ordenes_directas_por_recibir(p_tru)) x where (x ->> 'orden_id')::uuid = p_oc),
       (select count(*) from retail.fn_ordenes_compra_por_enviar() q where q.orden_compra_id = p_oc));
   $f$;
   grant execute on function pg_temp.vistas(uuid, uuid) to authenticated;
   ${COMPRADORA("compra_mandar")}
   select pg_temp.vistas(:'oc1', :'tru') as antes \\gset
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   ${COMPRADORA("compra_mandar")}
   select pg_temp.vistas(:'oc1', :'tru') as despues \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u")}, :'antes', :'despues');`,
  "true:false:true:0:0: / 1:1 / 0:0",
);
// Sandra pasa a Admin (Dynamic la marca «admin» y aquí es líder): firma sin combo y puede unir lo que ella compró.
const SANDRA_ADMIN = `reset role;\nupdate public.personas set rol = 'admin' where auth_user_id = '${SANDRA}';\n${COMPRADORA(null)}`;
caso(
  "U21 la recepción cerrada quedó con otro proveedor: se corrige SOLO esa marca (lo recibido, lo contado y el lote de sus movimientos), el stock no se mueve y después se une",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8, { prov: "prov2" })}${CIERRA("r1")}
   reset role;
   select ${STOCK} as stock_antes, ${MOVS} as movs_antes \\gset
   ${SANDRA_ADMIN}
   select pg_temp.corrige_marca(:'r1', :'marca', :'prov', 'Lo de esta marca es de su proveedor') as c \\gset
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   reset role;
   select concat_ws(' / ', pg_temp.h(:'c'::jsonb), :'c'::jsonb ->> 'recibidos', ${RESP("u")},
     (select string_agg(distinct (r.proveedor_id = :'prov')::text, ',') from retail.despacho_recibidos r where r.despacho_id = :'r1'),
     (select string_agg(distinct (l.proveedor_id = :'prov')::text, ',') from retail.despacho_recibidos r join retail.movimientos m on m.id = r.movimiento_id join retail.lotes l on l.id = m.lote_id where r.despacho_id = :'r1'),
     (${STOCK} = :'stock_antes') and (${MOVS} = :'movs_antes'), (select estado from retail.compra_papeles where id = :'p1'));`,
  "OK / 1 / true:false:true:0:0: / true / true / t / completado",
);
caso(
  "U22 llegó menos (7 de 8): sin la marca no se une; con la marca pero sin ser Admin tampoco; un Admin con la marca une, y el papel pasa con 7 «recibido antes»",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 7)}${CIERRA("r1")}
   ${MICAELA_AQUI}
   select pg_temp.une(:'r1', :'p1', null) as u1 \\gset
   select set_config('retail.union_acepta_faltante', 'si', false) \\g /dev/null
   select pg_temp.une(:'r1', :'p1', null) as u2 \\gset
   ${SANDRA_ADMIN}
   select set_config('retail.union_acepta_faltante', 'si', false) \\g /dev/null
   select pg_temp.une(:'r1', :'p1', null) as u3 \\gset
   reset role;
   select concat_ws(' / ', ${RESP("u1")}, ${RESP("u2")}, ${RESP("u3")}, :'u3'::jsonb ->> 'prendas_recibidas',
     (select estado from retail.compra_papeles where id = :'p1'), (select coalesce(sum(a.cantidad), 0) from retail.compra_item_recibido_antes a), ${POR_MANDAR("p1")});`,
  "0:0:union_llego_menos / 0:0:union_llego_menos / true:false:true:0:0: / 7 / completado / 7 / 0",
);
caso(
  "L1 mismas prendas y mismo valor es «exacto»: aparece con su recepción y su compra, y quien solo recibe no ve los montos",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8)}${CIERRA("r1", { costo: "10" })}
   ${MICAELA_AQUI}${LISTA()}
   reset role;
   ${COMPRADORA("compra_rapida")}${LISTA("lista_lider")}
   reset role;
   select concat_ws(' / ', jsonb_array_length(:'lista'::jsonb), ${FILAS("lista")}, ${FILAS("lista_lider")},
     (:'lista'::jsonb -> 0 ->> 'despacho_id') = :'r1', (:'lista'::jsonb -> 0 ->> 'papel_id') = :'p1');`,
  "1 / exacto:true:-:8:-:null|null / exacto:true:-:8:-:80.00|80.00 / t / t",
);
caso(
  "L2 si llegaron todas pero el valor difiere (o no se sabe) es «probable»",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8)}${CIERRA("r1", { costo: "11" })}
   ${COMPRADORA("compra_rapida")}${LISTA("l_difiere")}
   reset role;
   ${COMPRA("p2", 8, { token: A2, prov: "'prov2'" })}
   ${SIN_AVISO("r2", 8, { prov: "prov2" })}${CIERRA("r2")}
   ${COMPRADORA("compra_rapida")}${LISTA("l_sin_costo")}
   reset role;
   select concat_ws(' / ', ${FILAS("l_difiere")}, jsonb_array_length(:'l_sin_costo'::jsonb), ${FILAS("l_sin_costo", 0)}, ${FILAS("l_sin_costo", 1)});`,
  "probable:true:-:8:-:80.00|88.00 / 2 / probable:true:-:8:-:80.00|null / probable:true:-:8:-:80.00|88.00",
);
caso(
  "L3 si llegó menos de lo comprado sale «parcial», no se puede unir y dice cuántas faltan",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 5)}${CIERRA("r1", { costo: "10" })}
   ${MICAELA_AQUI}${LISTA()}
   reset role;
   select ${FILAS("lista")};`,
  "parcial:false:llego_menos:5:3:null|null",
);
caso(
  "L4 una compra ya unida deja de salir, y la que quedó sin prendas libres tampoco",
  `${COMPRA("p1", 8, { token: A1 })}${COMPRA("p2", 5, { token: A2 })}
   ${SIN_AVISO("r1", 8)}${CIERRA("r1", { costo: "10" })}
   ${MICAELA_AQUI}${LISTA("antes")}
   select pg_temp.une(:'r1', :'p1', null) as u \\gset
   ${LISTA("despues")}
   reset role;
   select concat_ws(' / ', jsonb_array_length(:'antes'::jsonb), ${FILAS("antes", 0)}, ${FILAS("antes", 1)}, ${RESP("u")}, jsonb_array_length(:'despues'::jsonb));`,
  "2 / exacto:true:-:8:-:null|null / probable:true:-:8:-:null|null / true:false:true:0:0: / 0",
);
caso(
  "L5 si la compra ya tiene su envío propio con prendas contadas (nada recibido), sale y se puede unir",
  `${COMPRA("p1", 8, { token: A1 })}${MANDA("e1", B1)}
   ${MICAELA_AQUI}
   reset role;
   select version as v_e1 from retail.despachos where id = :'e1' \\gset
   select id as di1 from retail.despacho_items where despacho_id = :'e1' limit 1 \\gset
   ${MICAELA_AQUI}
   select pg_temp.abre(:'e1', :v_e1) as ab \\gset
   select pg_temp.guarda(:'e1', :'di1', 3, '{}'::jsonb, null::int, null::int, null::uuid, null::uuid, null::uuid) as g \\gset
   ${SIN_AVISO("r1", 8)}${CIERRA("r1", { costo: "10" })}
   ${MICAELA_AQUI}${LISTA()}
   reset role;
   select ${FILAS("lista")};`,
  "exacto:true:-:8:-:null|null",
);
caso(
  "L6 otra sede no ve la lista de esta; sin el módulo no se lee (union_sin_modulo); proveedor distinto no se cruza",
  `${COMPRA("p1", 8, { token: A1 })}
   ${SIN_AVISO("r1", 8, { prov: "prov2" })}${CIERRA("r1", { costo: "10" })}
   ${MICAELA_AQUI}${LISTA("distinto")}
   select jsonb_array_length(retail.fn_uniones_posibles(:'otra')) as otra_sede \\gset
   reset role;
   update retail.colaboradores set rol_id = :'rol_nada' where persona_id = :'micaela_p';
   ${MICAELA_AQUI}
   create function pg_temp.sin_mod() returns text language plpgsql as $f$
   declare v_h text;
   begin
     perform retail.fn_uniones_posibles(current_setting('t.tru')::uuid);
     return 'SIN_ERROR';
   exception when others then
     get stacked diagnostics v_h = pg_exception_hint;
     return coalesce(v_h, sqlstate);
   end $f$;
   select pg_temp.sin_mod() as sin_modulo \\gset
   reset role;
   select concat_ws(' / ', jsonb_array_length(:'distinto'::jsonb), :'otra_sede', :'sin_modulo');`,
  "0 / 0 / union_sin_modulo",
);

console.log(`\n${casos - fallas}/${casos} casos en verde.`);
process.exit(fallas ? 1 : 0);
