#!/usr/bin/env node
/**
 * Prueba de «Corregir una compra» con el envío todavía sin recibir (`20261116215000_corregir_compra_con_envio_abierto.sql`, ADR-0561 act.
 * 2026-11-16). Nació del ENV-24 de Trujillo: aretes anotados de más y tres prendas «por definir» que nunca se compraron.
 *
 * QUÉ PROMETE
 *   · La lectura dice por prenda hasta cuánto baja (`envios.minimo`) y si se puede quitar (`envios.quitable`, `por_que`).
 *   · Bajar lo que viajó: con el envío en camino o abierto, la compra y su línea del envío bajan juntas, el envío sube de versión y queda el
 *     rastro. Lo contado no frena ni se toca. Cada línea del envío queda con al menos 1, y lo que ya llegó a la tienda no baja.
 *   · Quitar lo que se anotó por error: sale de la compra y de su envío, queda `quitada` en el rastro con lo que decía, y la orden que se queda
 *     vacía se anula con su motivo. No se quita lo que la tienda ya está contando, la única prenda de un envío, ni todas las de una compra.
 *   · Una línea del envío sigue sin poder borrarse por fuera de «Corregir una compra».
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK, con la migración pegada dos veces (es re-ejecutable).
 *
 * USO
 *   pnpm pruebas:corregir-compra-envio-abierto                                  → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/corregir_compra_con_envio_abierto.mjs --contenedor <otro>
 *   node scripts/pruebas/corregir_compra_con_envio_abierto.mjs --sin-migracion  → sin pegar la migración (sobre una base sin ella, FALLA)
 *   node scripts/pruebas/corregir_compra_con_envio_abierto.mjs --ver            → imprime lo obtenido de cada caso
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
const VER_TODO = process.argv.includes("--ver");
const leerMigracion = (archivo) =>
  readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8")
    .replace(/^set lock_timeout.*$/gm, "")
    .replace(/^reset (lock_timeout|search_path);$/gm, "");
const MIGRACION = process.argv.includes("--sin-migracion") ? "" : leerMigracion("20261116215000_corregir_compra_con_envio_abierto.sql");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: compra, manda y corrige lo suyo
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo: recibe

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
const MICAELA_AQUI = `${como(MICAELA)}select set_config('request.headers', json_build_object('x-responsable', :'micaela_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null\n`;
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Envío abierto ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela_p';
`;

const J = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const A = (...xs) => `jsonb_build_array(${xs.join(", ")})`;

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
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_hint text;
begin
  execute p_sql;
  return 'OK';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return coalesce(nullif(v_hint, ''), sqlstate);
end;
$f$;
${atrapa("compra", "p_id uuid, p_prov uuid, p_lineas jsonb", "retail.registrar_compra_rapida(p_id, p_prov, 'nota_venta', 540, 'papeles/envio-abierto.jpg', p_lineas, 540, 'yape', null, null)")}
${atrapa("abre", "p_id uuid, p_version integer", "retail.abrir_despacho(p_id, p_version)")}
${atrapa("guarda", "p_d uuid, p_item uuid, p_cont integer, p_sep jsonb, p_ver integer, p_extra integer, p_prov uuid, p_cat uuid, p_marca uuid", "retail.guardar_conteo_envio(p_d, p_item, p_cont, p_sep, p_ver, p_extra, p_prov, p_cat, p_marca)")}
${atrapa("dice_que_es", "p_d uuid, p_ids uuid[], p_cat uuid, p_marca uuid", "retail.corregir_linea_al_contar(p_d, p_ids, p_cat, p_marca)")}
${atrapa("corrige", "p_papel uuid, p_lote uuid, p_cambios jsonb", "retail.corregir_compra_rapida(p_papel, p_lote, p_cambios, null)")}
${atrapa("para_corregir", "p_papel uuid", "retail.fn_compra_para_corregir(p_papel)")}
${atrapa("rastro", "p_papel uuid", "retail.fn_compra_correcciones(p_papel)")}

insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
insert into retail.compra_rondas (persona_id, abierta_por)
select distinct c.persona_id, c.persona_id from retail.colaboradores c
 where not exists (select 1 from retail.compra_rondas r where r.persona_id = c.persona_id and r.cerrada_en is null);
insert into retail.proveedores (nombre) values ('Proveedor Envío Abierto') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Envío Abierto') returning id as marca \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
insert into retail.categorias (nombre, familia) values ('Aretes Envío Abierto', 'accesorios') returning id as cat \\gset
select set_config('t.tru', :'tru', true), set_config('t.lim', :'lim', true), set_config('t.cat', :'cat', true), set_config('t.marca', :'marca', true) \\g /dev/null
`;

// La compra: «Aretes» (12 a S/ 20, a Trujillo, con su categoría), «Lentes» (3 a S/ 5.40, a Trujillo, por definir) y «Surtido» (8 a S/ 4.50, a Lima,
// por definir). Papel S/ 540 pagado por Yape: no cuadra con las prendas (293.40), así que el papel no se mueve solo.
const PAPEL = "aaaaaaaa-0561-4000-8000-0000000016a1";
const L_ARETES = J({ descripcion: "'Aretes'", categoria_id: "current_setting('t.cat')::uuid", marca_id: "current_setting('t.marca')::uuid", cantidad: 12, costo: 20, precio_venta: 39.9, destino_id: "current_setting('t.tru')::uuid" });
const L_LENTES = J({ descripcion: "'Lentes'", categoria_por_definir: "true", cantidad: 3, costo: 5.4, precio_venta: 19.9, destino_id: "current_setting('t.tru')::uuid" });
const L_SURTIDO = J({ descripcion: "'Surtido'", categoria_por_definir: "true", cantidad: 8, costo: 4.5, precio_venta: 14.9, destino_id: "current_setting('t.lim')::uuid" });
const COMPRA = `
${como(FELIPE, "compra_rapida")}
select pg_temp.h(pg_temp.compra('${PAPEL}', :'prov', ${A(L_ARETES, L_LENTES, L_SURTIDO)})) as compra_ok \\gset
reset role;
select i.id as l_aretes from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id where o.papel_id = '${PAPEL}' and i.descripcion = 'Aretes' \\gset
select i.id as l_lentes from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id where o.papel_id = '${PAPEL}' and i.descripcion = 'Lentes' \\gset
select i.id as l_surtido from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id where o.papel_id = '${PAPEL}' and i.descripcion = 'Surtido' \\gset
select i.orden_compra_id as o_lim from retail.orden_compra_items i where i.id = :'l_surtido' \\gset
`;
// Felipe manda lo de Trujillo: el envío lleva «Aretes» y «Lentes».
const MANDA = `
${como(FELIPE, "compra_mandar")}
select retail.mandar_compras_a_tienda(current_setting('t.tru')::uuid, 1, 'aaaaaaaa-0561-4000-8000-0000000016b1') ->> 'despacho_id' as envio \\gset
reset role;
select version as v_envio from retail.despachos where id = :'envio' \\gset
select id as di_aretes from retail.despacho_items where despacho_id = :'envio' and orden_compra_item_id = :'l_aretes' \\gset
select id as di_lentes from retail.despacho_items where despacho_id = :'envio' and orden_compra_item_id = :'l_lentes' \\gset
`;
const ABRE = `
${rolDeMicaela("recibir")}
${MICAELA_AQUI}
select pg_temp.abre(:'envio', :v_envio) as ab \\gset
reset role;
select version as v_envio from retail.despachos where id = :'envio' \\gset
`;
const CORRIGE = (cambios, nombre = "corr") => `
${como(FELIPE, "compra_corregir")}
select pg_temp.h(pg_temp.corrige('${PAPEL}', gen_random_uuid(), ${A(...cambios)})) as ${nombre} \\gset
reset role;`;
const SEP = (n, nombre) => `'${JSON.stringify({ prendas: [], nuevas: [{ cantidad: n, descripcion: nombre }] })}'::jsonb`;

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
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

// La lectura de una prenda: «minimo:quitable:por_que».
const LEE = (linea) => `(select concat_ws(':', x -> 'envios' ->> 'minimo', x -> 'envios' ->> 'quitable', coalesce(x -> 'envios' ->> 'por_que', '-'))
   from jsonb_array_elements(:'lec'::jsonb -> 'lineas') x where x ->> 'id' = :'${linea}')`;

caso(
  "E1 la lectura dice hasta cuánto baja y si se quita: sin envío, 1 y sí; en camino, 1 y sí; la única prenda de su envío no se quita",
  `${COMPRA}
   ${como(FELIPE, "compra_corregir")}
   select pg_temp.para_corregir('${PAPEL}') as lec \\gset
   select ${LEE("l_aretes")} as antes \\gset
   ${MANDA}
   ${como(FELIPE, "compra_corregir")}
   select pg_temp.para_corregir('${PAPEL}') as lec \\gset
   reset role;
   select concat_ws(' / ', :'compra_ok', :'antes', ${LEE("l_aretes")}, ${LEE("l_lentes")}, ${LEE("l_surtido")});`,
  "OK / 1:true:- / 1:true:- / 1:true:- / 1:true:-",
);

caso(
  "E2 bajar con el envío en camino: la compra y su línea del envío bajan juntas, el envío sube de versión y queda el rastro",
  `${COMPRA}
   ${MANDA}
   ${CORRIGE([J({ item_id: ":'l_aretes'", cantidad: 5 })])}
   select concat_ws(' / ', :'corr',
     (select cantidad from retail.orden_compra_items where id = :'l_aretes'),
     (select cantidad from retail.despacho_items where id = :'di_aretes'),
     (select version > :v_envio from retail.despachos where id = :'envio'),
     (select string_agg(campo || ':' || antes || '>' || despues, ',') from retail.compra_correcciones where papel_id = '${PAPEL}'),
     (select monto from retail.compra_papeles where id = '${PAPEL}'));`,
  "OK / 5 / 5 / t / cantidad:12>5 / 540.00",
);

caso(
  "E3 bajar con el envío abierto y ya contado: lo contado no se toca y se compara después con lo nuevo; no baja de 1 por línea",
  `${COMPRA}
   ${MANDA}
   ${ABRE}
   ${MICAELA_AQUI}
   select pg_temp.h(pg_temp.guarda(:'envio', :'di_aretes', 7, ${SEP(0, "Aretes")}, null::int, null::int, null::uuid, null::uuid, null::uuid)) as g \\gset
   ${CORRIGE([J({ item_id: ":'l_aretes'", cantidad: 6 })])}
   ${CORRIGE([J({ item_id: ":'l_aretes'", cantidad: 0 })], "a_cero")}
   select concat_ws(' / ', :'g', :'corr', :'a_cero',
     (select cantidad from retail.despacho_items where id = :'di_aretes'),
     (select contadas from retail.despacho_conteos where despacho_item_id = :'di_aretes'));`,
  "OK / OK / orden_compra_cantidad / 6 / 7",
);

caso(
  "E4 subir lo que viajó sigue sin tocar el envío (lo de más espera otro envío)",
  `${COMPRA}
   ${MANDA}
   ${CORRIGE([J({ item_id: ":'l_aretes'", cantidad: 15 })])}
   select concat_ws(' / ', :'corr', (select cantidad from retail.orden_compra_items where id = :'l_aretes'), (select cantidad from retail.despacho_items where id = :'di_aretes'));`,
  "OK / 15 / 12",
);

caso(
  "E5 quitar lo que se anotó por error con el envío abierto: sale de la compra y del envío, queda «quitada» en el rastro y se lee",
  `${COMPRA}
   ${MANDA}
   ${ABRE}
   ${CORRIGE([J({ item_id: ":'l_lentes'", quitar: "true" })])}
   ${como(FELIPE, "compra_corregir")}
   select pg_temp.rastro('${PAPEL}') as ras \\gset
   reset role;
   select concat_ws(' / ', :'corr',
     (select count(*) from retail.orden_compra_items where id = :'l_lentes'),
     (select count(*) from retail.despacho_items where despacho_id = :'envio'),
     (select version > :v_envio from retail.despachos where id = :'envio'),
     (select string_agg(campo || ':' || antes || '>' || coalesce(despues, '-') || ':' || (orden_compra_item_id is null), ',') from retail.compra_correcciones where papel_id = '${PAPEL}'),
     (select c ->> 'campo' from jsonb_array_elements(:'ras'::jsonb -> 0 -> 'cambios') c));`,
  "OK / 0 / 1 / t / quitada:Lentes · 3 × S/ 5.40>-:true / quitada",
);

caso(
  "E6 quitar la única prenda de una orden (sin envío) la anula con su motivo, y la compra se sigue corrigiendo",
  `${COMPRA}
   ${CORRIGE([J({ item_id: ":'l_surtido'", quitar: "true" })])}
   ${como(FELIPE, "compra_corregir")}
   select pg_temp.para_corregir('${PAPEL}') ->> 'se_puede' as se_puede \\gset
   reset role;
   select concat_ws(' / ', :'corr', (select estado || ':' || motivo_anulacion from retail.ordenes_compra where id = :'o_lim'), :'se_puede');`,
  "OK / anulada:Corrección de la compra: se quitaron o se movieron todas sus prendas / true",
);

caso(
  "E7 no se quita lo que la tienda ya está contando, y es todo o nada: lo que venía antes en la misma corrección tampoco queda",
  `${COMPRA}
   ${MANDA}
   ${ABRE}
   ${MICAELA_AQUI}
   select pg_temp.h(pg_temp.guarda(:'envio', :'di_aretes', 2, ${SEP(0, "Aretes")}, null::int, null::int, null::uuid, null::uuid, null::uuid)) as g \\gset
   ${CORRIGE([J({ item_id: ":'l_lentes'", quitar: "true" }), J({ item_id: ":'l_aretes'", quitar: "true" })])}
   ${como(FELIPE, "compra_corregir")}
   select pg_temp.para_corregir('${PAPEL}') as lec \\gset
   reset role;
   select concat_ws(' / ', :'g', :'corr',
     (select count(*) from retail.compra_correcciones where papel_id = '${PAPEL}'),
     (select count(*) from retail.despacho_items where despacho_id = :'envio'),
     ${LEE("l_aretes")});`,
  "OK / compra_corregir_no_se_quita / 0 / 2 / 1:false:la tienda ya la está contando",
);

caso(
  "E7b la única prenda de su envío no se quita (el envío no se queda vacío): se pide a Compras",
  `${COMPRA}
   ${MANDA}
   ${CORRIGE([J({ item_id: ":'l_lentes'", quitar: "true" })], "lentes")}
   ${CORRIGE([J({ item_id: ":'l_aretes'", quitar: "true" })], "aretes")}
   ${como(FELIPE, "compra_corregir")}
   select pg_temp.para_corregir('${PAPEL}') as lec \\gset
   reset role;
   select concat_ws(' / ', :'lentes', :'aretes', ${LEE("l_aretes")});`,
  "OK / compra_corregir_no_se_quita / 1:false:es la única prenda de su envío: avísale a Compras",
);

caso(
  "E8 una compra se queda con al menos una prenda; «quitar» mal escrito no se entiende",
  `${COMPRA}
   ${CORRIGE([J({ item_id: ":'l_aretes'", quitar: "true" }), J({ item_id: ":'l_lentes'", quitar: "true" }), J({ item_id: ":'l_surtido'", quitar: "true" })], "todas")}
   ${CORRIGE([J({ item_id: ":'l_lentes'", quitar: "'si'" })], "rara")}
   ${CORRIGE([J({ item_id: ":'l_lentes'", quitar: "false" })], "falso")}
   select concat_ws(' / ', :'todas', :'rara', :'falso', (select count(*) from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id where o.papel_id = '${PAPEL}'));`,
  "compra_corregir_sin_prendas / compra_corregir_cambio / compra_corregir_cambio / 3",
);

caso(
  "E8b dos prendas quitadas en la misma corrección (las dos «por definir», en dos tiendas) dejan dos filas en el rastro, cada una con su línea",
  `${COMPRA}
   ${CORRIGE([J({ item_id: ":'l_lentes'", quitar: "true" }), J({ item_id: ":'l_surtido'", quitar: "true" })])}
   select concat_ws(' / ', :'corr',
     (select string_agg(antes, ',' order by antes) from retail.compra_correcciones where papel_id = '${PAPEL}' and campo = 'quitada'),
     (select count(*) from retail.compra_correcciones where papel_id = '${PAPEL}' and prenda_quitada_id in (:'l_lentes', :'l_surtido')),
     pg_temp.intento(format('insert into retail.compra_correcciones (lote, papel_id, campo, antes, despues, corregida_por) values (gen_random_uuid(), %L, %L, %L, null, %L)', '${PAPEL}', 'quitada', 'x', :'felipe_p')));`,
  "OK / Lentes · 3 × S/ 5.40,Surtido · 8 × S/ 4.50 / 2 / 23514",
);

caso(
  "E9 una línea del envío sigue sin borrarse por fuera de «Corregir una compra», ni con la marca encendida si la tienda ya la contó",
  `${COMPRA}
   ${MANDA}
   ${ABRE}
   ${MICAELA_AQUI}
   select pg_temp.h(pg_temp.dice_que_es(:'envio', array[:'di_lentes']::uuid[], :'cat', null::uuid)) as dice \\gset
   select pg_temp.h(pg_temp.guarda(:'envio', :'di_lentes', 0, ${SEP(0, "Lentes")}, null::int, null::int, null::uuid, null::uuid, null::uuid)) as g \\gset
   reset role;
   select concat_ws(' / ', :'dice', :'g',
     pg_temp.intento(format('delete from retail.despacho_items where id = %L', :'di_aretes')),
     pg_temp.intento(format('select set_config(%L, %L, true); delete from retail.despacho_items where id = %L', 'retail.compra_quitando', 'si', :'di_lentes')));`,
  "OK / OK / envio_no_se_borra / envio_no_se_borra",
);

caso(
  "E10 lo que ya llegó a la tienda no baja: con una prenda entrada de esa línea, el mínimo es lo enviado",
  `${COMPRA}
   ${MANDA}
   ${ABRE}
   reset role;
   insert into retail.despacho_pendientes (despacho_id, despacho_item_id, tipo, cantidad, descripcion, anotado_por)
   values (:'envio', :'di_aretes', 'crear', 1, 'Aretes', :'felipe_p');
   ${CORRIGE([J({ item_id: ":'l_aretes'", cantidad: 11 })])}
   ${como(FELIPE, "compra_corregir")}
   select pg_temp.para_corregir('${PAPEL}') as lec \\gset
   reset role;
   select concat_ws(' / ', :'corr', ${LEE("l_aretes")});`,
  "compra_corregir_menos_de_lo_enviado / 12:false:ya llegó a la tienda",
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas) process.exit(1);
