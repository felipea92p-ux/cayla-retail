#!/usr/bin/env node
/**
 * Pruebas de «la prenda «Sin color» a la que le llegan colores» al recibir (ADR-0393, act. 2026-11-14) — migración
 * `20261114234000_recibir_sin_color_toma_color.sql`.
 *
 * LO QUE VIGILA. Que en «Sumar tallas o colores» de Recibir mercadería, a una prenda que nació «Sin color» y no tiene historia se le
 * puedan sumar los colores que llegaron: cada «Sin color» toma el primer color que llegó en su talla (la misma variante, con su código
 * viejo sonando) y la que no toma ninguno se desactiva. Que con historia (stock) no se adivine el color: se frena sin escribir nada y se
 * dice qué hacer. Y que todo lo demás siga idéntico: llegar «Sin color» a una prenda «Sin color», o mezclar en lo que llegó.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga DOS veces dentro de cada caso, así se prueba que se puede
 * pegar dos veces). Felipe (líder y Admin) hace la orden y el envío; Micaela, de Tienda Trujillo y con un rol de prueba con Recibir, abre
 * el envío y suma a la prenda. La prenda nace con variantes «Sin color» a S/ 79.90.
 *   S0  la migración pegada dos veces deja cada reemplazo una sola vez.
 *   S1  S y M «Sin color» reciben dos colores: las dos toman el primero (mismo id, código nuevo, el viejo sigue sonando) y el segundo nace
 *       con el precio de la hermana.
 *   S2  S, M y L «Sin color» reciben un color solo en S y M: L se desactiva.
 *   S3  S «Sin color» con stock: se frena con su talla y nada cambia.
 *   S4  lo que llega «Sin color» a una prenda «Sin color»: igual que antes (nace la talla nueva «Sin color»).
 *   S5  la combinación de color ya existía desactivada: se reactiva, y la «Sin color» de esa talla se desactiva.
 *   S6  lo que llega mezcla «Sin color» y colores: igual que antes, el candado de mezcla frena y nada cambia.
 *
 * USO
 *   node scripts/pruebas/recibir_sin_color_toma_color.mjs                             → contra el stack local compartido
 *   node scripts/pruebas/recibir_sin_color_toma_color.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/recibir_sin_color_toma_color.mjs --sin-migracion             → sin cargar la migración: contra una base sin el
 *                                                                                       cambio, la prueba tiene que FALLAR
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
const MIGRACION = SIN_MIGRACION
  ? ""
  : readFileSync(join(RAIZ, "supabase", "migrations", "20261114234000_recibir_sin_color_toma_color.sql"), "utf8")
      .replace(/^set lock_timeout.*$/m, "")
      .replace(/^reset lock_timeout;$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

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
const SIN_ENCABEZADOS = `select set_config('request.headers', '', true) \\g /dev/null\n`;

// Cada llamada devuelve su respuesta (jsonb) o {error, hint, msg}.
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
-- «OK» si respondió, o «sqlstate|hint|mensaje» si falló.
create function pg_temp.e(p jsonb) returns text language sql as $f$
  select case when p ? 'error' then (p ->> 'error') || '|' || coalesce(p ->> 'hint', '') || '|' || (p ->> 'msg') else 'OK' end;
$f$;
grant execute on function pg_temp.e(jsonb) to authenticated;
-- Las variantes de la prenda, «talla:color:precio:activa», en un orden fijo: «sin» es «Sin color»; c1 y c2, los dos colores de la prueba.
create function pg_temp.lista(p_prod uuid, p_c1 text, p_c2 text) returns text language sql as $f$
  select string_agg(x, ',' order by x collate "C") from (
    select coalesce(t.valor, '-') || ':'
           || case when v.color_codigo is null then 'sin' when v.color_codigo = p_c1 then 'c1' when v.color_codigo = p_c2 then 'c2' else 'otro' end
           || ':' || v.precio || ':' || v.activo as x
      from retail.variantes v left join retail.tallas t on t.id = v.talla_id
     where v.producto_id = p_prod) s;
$f$;
${atrapa("abre", "p_id uuid, p_version integer", "retail.abrir_despacho(p_id, p_version)")}
${atrapa(
  "prepara",
  "p_d uuid, p_item uuid, p_cat uuid, p_marca uuid, p_prod uuid, p_ref text, p_vars jsonb, p_precio numeric, p_desc text, p_tej uuid, p_pat uuid, p_conf boolean, p_token uuid, p_prov uuid",
  "retail.preparar_prenda_al_recibir(p_d, p_item, p_cat, p_marca, p_prod, p_ref, p_vars, p_precio, p_desc, p_tej, p_pat, p_conf, p_token, p_prov)",
)}

-- Datos propios de la prueba, creados como Felipe (líder).
select set_config('request.jwt.claim.sub', '${FELIPE}', true) \\g /dev/null
select set_config('request.jwt.claims', '{"sub":"${FELIPE}","role":"authenticated"}', true) \\g /dev/null
insert into retail.proveedores (nombre) values ('Proveedor Sin Color Prueba') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Sin Color Prueba') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Pantalones Sin Color Prueba', 'accesorios') returning id as cat \\gset
select id as t_s from retail.tallas where valor = 'S' \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset
select id as t_l from retail.tallas where valor = 'L' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat', :'t_s'), (:'cat', :'t_m'), (:'cat', :'t_l');
select codigo as c1 from retail.colores where activo order by orden, codigo limit 1 \\gset
select codigo as c2 from retail.colores where activo order by orden, codigo limit 1 offset 1 \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as alm_t from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
-- Como en producción: el responsable obligatorio encendido; Micaela marcó su entrada en Trujillo.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
-- La orden de Felipe a Trujillo: 10 pantalones de esa categoría y marca a S/ 30.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, fecha_entrega_estimada, creada_por)
  values (:'prov', :'tru', retail.fn_hoy_lima() + 7, :'felipe_p') returning id as o1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario)
  values (:'o1', 1, :'cat', :'marca', 'Pantalón lino', 10, 30) returning id as l1 \\gset
-- La prenda que nació «Sin color» (sus variantes las pone cada caso). Su pareja marca–proveedor va antes: la exige productos_marca_proveedor_fk.
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat', 'Pantalón Sin Color Prueba', :'marca', :'prov')
  returning id as prod \\gset
select set_config('request.jwt.claim.sub', '', true) \\g /dev/null
select set_config('request.jwt.claims', '', true) \\g /dev/null
`;

// Micaela con un rol de prueba que ve SOLO Recibir. Se va con el ROLLBACK.
const MICAELA_RECIBE = `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba sin color ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'recibir');
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
${como(MICAELA)}${EN_TIENDA}`;

// SQL de jsonb.
const J = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const A = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
const MATRIZ = (...pares) => A(...pares.map(([t, c]) => J({ talla_id: t ? `:'${t}'` : "null::uuid", color_codigo: c ? `:'${c}'` : "null::text" })));

// Como postgres, pero con la sesión de Felipe puesta (los disparadores que anotan quién firma la leen).
const CON_FELIPE = `reset role;
select set_config('request.jwt.claim.sub', '${FELIPE}', true) \\g /dev/null
select set_config('request.jwt.claims', '{"sub":"${FELIPE}","role":"authenticated"}', true) \\g /dev/null
`;
// Una variante de la prenda: :<nombre> y su código en :cod_<nombre>.
const VARIANTE = (nombre, talla, color = null, activo = true) => `${CON_FELIPE}
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo, activo)
  values (:'prod', :'${talla}', ${color ? `:'${color}'` : "null"}, 79.90, 25, ${activo}) returning id as ${nombre} \\gset
select codigo as cod_${nombre} from retail.variantes where id = :'${nombre}' \\gset
`;
// Felipe envía la orden; Micaela abre el envío y le suma a la prenda lo que llegó: la respuesta queda en :r.
const SUMA = (...pares) => `
${como(FELIPE)}${SIN_ENCABEZADOS}
select (retail.crear_envio(:'tru', ${A(J({ orden_compra_item_id: ":'l1'", cantidad: 10 }))}, 'T001-90', null, null) ->> 'despacho_id') as d1 \\gset
reset role;
select version as v_d1 from retail.despachos where id = :'d1' \\gset
select id as di_l1 from retail.despacho_items where despacho_id = :'d1' and orden_compra_item_id = :'l1' \\gset
${MICAELA_RECIBE}
select pg_temp.abre(:'d1', :v_d1) as ab \\gset
select pg_temp.prepara(:'d1', :'di_l1', null, null, :'prod', null, ${MATRIZ(...pares)}, null, null, null, null, false, null, null) as r \\gset
reset role;
`;
const LISTA = `pg_temp.lista(:'prod', :'c1', :'c2')`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    // Al final se disparan los candados diferidos: si algo quedó mezclado, el caso falla aquí.
    obtenido = psql(`${PRELUDIO}${sql}\nset constraints all immediate;\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL|HINT|CONTEXT|LINE/.test(l)).slice(0, 4).join(" ")}`;
  }
  if (obtenido === esperado) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  }
}

caso(
  "S0 la migración pegada dos veces deja cada reemplazo una sola vez",
  `select (length(d) - length(replace(d, '20261114234000', ''))) / length('20261114234000')
     from pg_get_functiondef('retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)'::regprocedure) d;`,
  "3",
);

caso(
  "S1 S y M «Sin color» reciben dos colores: toman el primero (misma variante, código nuevo, el viejo sigue sonando); el segundo nace con el precio de la hermana",
  `${VARIANTE("sc_s", "t_s")}${VARIANTE("sc_m", "t_m")}
   ${SUMA(["t_s", "c1"], ["t_m", "c1"], ["t_s", "c2"], ["t_m", "c2"])}
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), ${LISTA},
     (select v.color_codigo = :'c1' and v.codigo <> :'cod_sc_s' from retail.variantes v where v.id = :'sc_s'),
     (select cb.variante_id = :'sc_s' from retail.codigos_barras cb where cb.codigo = :'cod_sc_s'),
     jsonb_array_length(:'r'::jsonb -> 'variantes'));`,
  "OK / M:c1:79.90:true,M:c2:79.90:true,S:c1:79.90:true,S:c2:79.90:true / t / t / 4",
);

caso(
  "S2 S, M y L «Sin color» reciben un color solo en S y M: L se desactiva (no se borra)",
  `${VARIANTE("sc_s", "t_s")}${VARIANTE("sc_m", "t_m")}${VARIANTE("sc_l", "t_l")}
   ${SUMA(["t_s", "c1"], ["t_m", "c1"])}
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), ${LISTA});`,
  "OK / L:sin:79.90:false,M:c1:79.90:true,S:c1:79.90:true",
);

caso(
  "S3 S «Sin color» con stock: no se adivina su color, se frena con su talla y nada cambia",
  `${VARIANTE("sc_s", "t_s")}${VARIANTE("sc_m", "t_m")}
   ${CON_FELIPE}
   insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
     values (:'sc_s', :'tru', :'alm_t', 'entrada', 2, 'prueba sin color: colchón') returning id as m0 \\gset
   select retail.fn_aplicar_movimiento(:'m0') \\g /dev/null
   ${SUMA(["t_s", "c1"], ["t_m", "c1"])}
   -- El nombre se lee de la base: al guardarlo, la base lo normaliza («Sin» → «sin»).
   select concat_ws(' / ', replace(pg_temp.e(:'r'::jsonb), (select referencia from retail.productos where id = :'prod'), 'LA PRENDA'), ${LISTA});`,
  "P0001|recepcion_sin_color_con_historia|«LA PRENDA» ya tiene prendas «Sin color» (talla S) y no se sabe de qué color son. " +
    "Ponles color en Catálogo ▸ Productos ▸ Editar y vuelve a sumar. / M:sin:79.90:true,S:sin:79.90:true",
);

caso(
  "S4 lo que llega «Sin color» a una prenda «Sin color»: igual que antes",
  `${VARIANTE("sc_s", "t_s")}${VARIANTE("sc_m", "t_m")}
   ${SUMA(["t_l", null])}
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), ${LISTA});`,
  "OK / L:sin:79.90:true,M:sin:79.90:true,S:sin:79.90:true",
);

caso(
  "S5 la combinación de color ya existía desactivada: se reactiva y la «Sin color» de esa talla se desactiva",
  `${VARIANTE("sc_s", "t_s")}${VARIANTE("c1_s", "t_s", "c1", false)}
   ${SUMA(["t_s", "c1"])}
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), ${LISTA});`,
  "OK / S:c1:79.90:true,S:sin:79.90:false",
);

caso(
  "S6 lo que llega mezcla «Sin color» y colores: el candado de mezcla frena como siempre y nada cambia",
  `${VARIANTE("sc_s", "t_s")}${VARIANTE("sc_m", "t_m")}
   ${SUMA(["t_s", "c1"], ["t_l", null])}
   select concat_ws(' / ', pg_temp.e(:'r'::jsonb), ${LISTA});`,
  "P0001|mezcla_sin_color|Esta prenda quedaría con variantes «Sin color» junto a otras con color. Ponle color a las que no lo tienen o desactívalas. " +
    "/ M:sin:79.90:true,S:sin:79.90:true",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
