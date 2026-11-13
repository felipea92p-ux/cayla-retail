#!/usr/bin/env node
/**
 * Prueba de ADR-0660 — «Por definir» en Mis compras (`20261113211000_mis_compras_por_definir.sql`).
 *
 * QUÉ PROMETE
 *   · Una prenda nueva se anota con la categoría «por definir» y el precio «a la espera», y la compra se guarda con su papel y su pago.
 *   · Lo vacío tiene que decirse: una prenda nueva sin categoría y sin decir «por definir» se rechaza; una del catálogo no queda por definir;
 *     decir a la vez la categoría (o el precio) y que está por definir, tampoco. Una orden del escritorio no lleva nada por definir.
 *   · El aviso (`fn_compras_por_definir`): Compras ve cada modelo que espera (sus líneas por tienda juntas); la compradora, solo lo suyo.
 *   · Definir (`definir_prenda_de_compra`): llena lo que falta, apaga la espera, queda en `compra_correcciones` y un reintento no duplica.
 *     Lo ya definido, lo ajeno (para la compradora) y lo que ya está en la tienda no se define desde aquí. Lo definido no vuelve atrás.
 *   · Recibir: una línea sin categoría no se cuenta ni se cierra; la tienda dice qué es (`corregir_linea_al_contar`) y la compra lo guarda;
 *     lo que faltó queda con su categoría.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK, con la migración pegada dos veces (es re-ejecutable).
 *
 * USO
 *   pnpm pruebas:mis-compras-por-definir                                  → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/mis_compras_por_definir.mjs --contenedor <otro>  → contra otro contenedor
 *   node scripts/pruebas/mis_compras_por_definir.mjs --sin-migracion      → sin pegar la migración (sobre una base sin ella, tiene que FALLAR)
 *   node scripts/pruebas/mis_compras_por_definir.mjs --ver                → imprime lo obtenido de cada caso
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
const MIGRACION = process.argv.includes("--sin-migracion")
  ? ""
  : readFileSync(join(RAIZ, "supabase", "migrations", "20261113211000_mis_compras_por_definir.sql"), "utf8")
      .replace(/^set lock_timeout.*$/gm, "")
      .replace(/^reset lock_timeout;$/gm, "");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: compra, manda y ve «Revisar compras»
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
// Micaela elige en el combo «Responsable» a ella misma, en Trujillo.
const MICAELA_AQUI = `${como(MICAELA)}select set_config('request.headers', json_build_object('x-responsable', :'micaela_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null\n`;
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Por definir ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela_p';
`;

const J = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const A = (...xs) => `jsonb_build_array(${xs.join(", ")})`;

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
grant execute on function pg_temp.intento(text) to authenticated;
${atrapa("compra", "p_id uuid, p_prov uuid, p_lineas jsonb", "retail.registrar_compra_rapida(p_id, p_prov, 'nota_venta', 840, 'papeles/por-definir.jpg', p_lineas, 840, 'yape', null, null)")}
${atrapa("define", "p_ids uuid[], p_cat uuid, p_precio numeric, p_token uuid", "retail.definir_prenda_de_compra(p_ids, p_cat, p_precio, p_token)")}
${atrapa("aviso", "", "retail.fn_compras_por_definir()")}
${atrapa("abre", "p_id uuid, p_version integer", "retail.abrir_despacho(p_id, p_version)")}
${atrapa("guarda", "p_d uuid, p_item uuid, p_cont integer, p_sep jsonb, p_ver integer, p_extra integer, p_prov uuid, p_cat uuid, p_marca uuid", "retail.guardar_conteo_envio(p_d, p_item, p_cont, p_sep, p_ver, p_extra, p_prov, p_cat, p_marca)")}
${atrapa("cierra", "p_d uuid, p_version integer, p_lineas jsonb, p_nota text, p_token uuid", "retail.cerrar_conteo_envio(p_d, p_version, p_lineas, p_nota, p_token)")}
${atrapa("dice_que_es", "p_d uuid, p_ids uuid[], p_cat uuid, p_marca uuid", "retail.corregir_linea_al_contar(p_d, p_ids, p_cat, p_marca)")}
${atrapa("corrige", "p_papel uuid, p_lote uuid, p_cambios jsonb", "retail.corregir_compra_rapida(p_papel, p_lote, p_cambios, null)")}

-- Como en producción: responsable obligatorio; Micaela marcó su entrada en Trujillo.
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
insert into retail.proveedores (nombre) values ('Proveedor Por Definir') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Por Definir') returning id as marca \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
insert into retail.categorias (nombre, familia) values ('Blusas Por Definir', 'accesorios') returning id as cat \\gset
insert into retail.categorias (nombre, familia, activo) values ('Inactiva Por Definir', 'accesorios', false) returning id as cat_off \\gset
select p.id as p1 from retail.productos p where p.estado = 'activo' and not p.es_prueba order by p.referencia limit 1 \\gset
insert into retail.roles (nombre) values ('ZZ Sin nada Por Definir') returning id as rol_nada \\gset
update retail.colaboradores set rol_id = :'rol_nada' where persona_id = :'micaela_p';
select set_config('t.prov', :'prov', true), set_config('t.tru', :'tru', true), set_config('t.lim', :'lim', true),
       set_config('t.cat', :'cat', true), set_config('t.marca', :'marca', true), set_config('t.p1', :'p1', true) \\g /dev/null
`;

// La compra de casi todos los casos: Felipe anota la proforma de un proveedor nuevo. «Blusa bordada» (12 a S/ 20, a Trujillo) sin saber qué es
// pero con su precio; «Modelo Nela» (12 a S/ 25: 6 a Trujillo y 6 a Lima) sin saber qué es ni a cuánto se vende. Papel S/ 840, pagado por Yape.
const PAPEL = "aaaaaaaa-0660-4000-8000-0000000000a1";
const L_BLUSA = J({ descripcion: "'Blusa bordada'", categoria_por_definir: "true", cantidad: 12, costo: 20, precio_venta: 59.9, destino_id: "current_setting('t.tru')::uuid" });
const L_NELA = (destino) =>
  J({ descripcion: "'Modelo Nela'", categoria_por_definir: "true", precio_por_definir: "true", cantidad: 6, costo: 25, destino_id: `current_setting('${destino}')::uuid` });
const COMPRA = `
${como(FELIPE, "compra_rapida")}
select pg_temp.h(pg_temp.compra('${PAPEL}', :'prov', ${A(L_BLUSA, L_NELA("t.tru"), L_NELA("t.lim"))})) as compra_ok \\gset
reset role;
select i.id as l_blusa from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
 where o.papel_id = '${PAPEL}' and i.descripcion = 'Blusa bordada' \\gset
select i.id as l_nela_tru from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
 where o.papel_id = '${PAPEL}' and i.descripcion = 'Modelo Nela' and o.ubicacion_destino_id = :'tru' \\gset
select i.id as l_nela_lim from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
 where o.papel_id = '${PAPEL}' and i.descripcion = 'Modelo Nela' and o.ubicacion_destino_id = :'lim' \\gset
`;
// Felipe la manda a Trujillo: el envío en :envio y su versión en :v_envio.
const MANDA = `
${como(FELIPE, "compra_mandar")}
select retail.mandar_compras_a_tienda(current_setting('t.tru')::uuid, 1, 'aaaaaaaa-0660-4000-8000-0000000000b1') ->> 'despacho_id' as envio \\gset
reset role;
select version as v_envio from retail.despachos where id = :'envio' \\gset
select id as di_blusa from retail.despacho_items where despacho_id = :'envio' and orden_compra_item_id = :'l_blusa' \\gset
select id as di_nela from retail.despacho_items where despacho_id = :'envio' and orden_compra_item_id = :'l_nela_tru' \\gset
`;
// Micaela (con Recibir) lo abre.
const ABRE = `
${rolDeMicaela("recibir")}
${MICAELA_AQUI}
select pg_temp.abre(:'envio', :v_envio) as ab \\gset
select (:'ab'::jsonb ->> 'version')::int as v_envio \\gset
`;
const SEP_NUEVA = (n, nombre) => `'${JSON.stringify({ prendas: [], nuevas: [{ cantidad: n, descripcion: nombre }] })}'::jsonb`;

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

caso(
  "P1 la compra con prendas por definir se guarda con su papel y su pago: tres líneas sin categoría, dos esperando su precio",
  `${COMPRA}
   select concat_ws(' / ', :'compra_ok',
     (select count(*) from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id where o.papel_id = '${PAPEL}' and i.categoria_id is null),
     (select count(*) from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
       where o.papel_id = '${PAPEL}' and i.precio_por_definir and i.precio_venta_sugerido is null),
     (select i.precio_venta_sugerido from retail.orden_compra_items i where i.id = :'l_blusa'),
     (select concat_ws(':', p.monto, p.pagado, p.medio_pago) from retail.compra_papeles p where p.id = '${PAPEL}'),
     (select count(*) from retail.ordenes_compra o where o.papel_id = '${PAPEL}'));`,
  "OK / 3 / 2 / 59.90 / 840.00:840.00:yape / 2",
);

caso(
  "P2 lo vacío tiene que decirse: sin categoría ni «por definir», del catálogo, categoría y «por definir», precio y «a la espera»; nada queda",
  `${como(FELIPE, "compra_rapida")}
   select concat_ws(' / ',
     pg_temp.h(pg_temp.compra(gen_random_uuid(), :'prov', ${A(J({ descripcion: "'Sin decir'", cantidad: 1, costo: 10, precio_venta: 20, destino_id: "current_setting('t.tru')::uuid" }))})),
     pg_temp.h(pg_temp.compra(gen_random_uuid(), :'prov', ${A(J({ producto_id: "current_setting('t.p1')::uuid", categoria_por_definir: "true", cantidad: 1, costo: 10, destino_id: "current_setting('t.tru')::uuid" }))})),
     pg_temp.h(pg_temp.compra(gen_random_uuid(), :'prov', ${A(J({ descripcion: "'Doble'", categoria_id: "current_setting('t.cat')::uuid", categoria_por_definir: "true", cantidad: 1, costo: 10, precio_venta: 20, destino_id: "current_setting('t.tru')::uuid" }))})),
     pg_temp.h(pg_temp.compra(gen_random_uuid(), :'prov', ${A(J({ descripcion: "'Precio doble'", categoria_id: "current_setting('t.cat')::uuid", precio_por_definir: "true", cantidad: 1, costo: 10, precio_venta: 20, destino_id: "current_setting('t.tru')::uuid" }))})),
     pg_temp.h(pg_temp.compra(gen_random_uuid(), :'prov', ${A(J({ descripcion: "'Marca rara'", categoria_por_definir: "'quizas'", cantidad: 1, costo: 10, destino_id: "current_setting('t.tru')::uuid" }))}))) as rechazos \\gset
   reset role;
   select concat_ws(' / ', :'rechazos', (select count(*) from retail.compra_papeles p where p.proveedor_id = :'prov'));`,
  "orden_compra_categoria / compra_por_definir_catalogo / compra_por_definir / compra_por_definir / compra_por_definir / 0",
);

caso(
  "P3 una orden del escritorio no lleva nada por definir (la regla de las órdenes y el candado de la tabla)",
  `reset role;
   insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'felipe_p') returning id as o_esc \\gset
   select concat_ws(' / ',
     pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, cantidad, precio_unitario) values (%L, 1, null, 2, 10)', :'o_esc')),
     pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, cantidad, precio_unitario, precio_por_definir) values (%L, 1, %L, 2, 10, true)', :'o_esc', :'cat')),
     pg_temp.intento(format('select retail.fn_orden_compra_validar(%L, %L, null, null, %L, null)', :'prov', :'tru',
       jsonb_build_array(jsonb_build_object('categoria_id', null, 'cantidad', 1, 'precio_unitario', 10))::text)));`,
  "por_definir_solo_mis_compras / por_definir_solo_mis_compras / orden_compra_categoria",
);

caso(
  "P4 el aviso: Compras ve cada modelo que espera (las dos tiendas de «Modelo Nela» juntas); sin módulo, no; la compradora, solo lo suyo",
  `${COMPRA}
   ${como(FELIPE)}
   select pg_temp.aviso() as av \\gset
   ${rolDeMicaela("ordenes_compra")}
   ${MICAELA_AQUI}
   select jsonb_array_length(pg_temp.aviso()) as suyas \\gset
   ${rolDeMicaela()}
   ${MICAELA_AQUI}
   select pg_temp.h(pg_temp.aviso()) as sin_modulo \\gset
   reset role;
   select concat_ws(' / ', jsonb_array_length(:'av'::jsonb),
     (select string_agg(concat_ws(':', x ->> 'nombre', x ->> 'categoria_por_definir', x ->> 'precio_por_definir', jsonb_array_length(x -> 'ids'),
                                  x ->> 'cantidad', jsonb_array_length(x -> 'tiendas'), x ->> 'mia'), ',' order by x ->> 'nombre')
        from jsonb_array_elements(:'av'::jsonb) x),
     :'suyas', :'sin_modulo');`,
  "2 / Blusa bordada:true:false:1:12:1:true,Modelo Nela:true:true:2:12:2:true / 0 / por_definir_sin_modulo",
);

caso(
  "P5 Compras define «Modelo Nela» (qué es y su precio): sus dos líneas lo saben, la espera se apaga, queda anotado y el reintento no duplica",
  `${COMPRA}
   ${como(FELIPE, "compra_definir")}
   select pg_temp.h(pg_temp.define(array[:'l_nela_tru', :'l_nela_lim']::uuid[], :'cat', 49.90, 'aaaaaaaa-0660-4000-8000-0000000000d1')) as def \\gset
   select pg_temp.define(array[:'l_nela_tru', :'l_nela_lim']::uuid[], :'cat', 49.90, 'aaaaaaaa-0660-4000-8000-0000000000d1') ->> 'ya_estaba' as otra_vez \\gset
   select jsonb_array_length(pg_temp.aviso()) as quedan \\gset
   reset role;
   select concat_ws(' / ', :'def', :'otra_vez', :'quedan',
     (select string_agg(concat_ws(':', i.categoria_id = :'cat', i.precio_venta_sugerido, i.precio_por_definir), ',') from retail.orden_compra_items i
       where i.id in (:'l_nela_tru', :'l_nela_lim')),
     (select string_agg(c.campo || ':' || coalesce(c.antes, '-') || '>' || c.despues, ',' order by c.campo, c.orden_compra_item_id) from retail.compra_correcciones c
       where c.papel_id = '${PAPEL}' and c.orden_compra_item_id = :'l_nela_tru'),
     (select count(*) from retail.compra_correcciones c where c.papel_id = '${PAPEL}'));`,
  "OK / true / 1 / t:49.90:f,t:49.90:f / categoria:Por definir>Blusas Por Definir,precio_venta:->49.90 / 4",
);

caso(
  "P6 definir no deja: lo ya definido, nada que definir, un precio 0 sin saber qué es, una categoría inactiva, y la compra ajena para la compradora",
  `${COMPRA}
   ${como(FELIPE, "compra_definir")}
   select concat_ws(' / ',
     pg_temp.h(pg_temp.define(array[:'l_blusa']::uuid[], null, 39.90, gen_random_uuid())),
     pg_temp.h(pg_temp.define(array[:'l_blusa']::uuid[], null, null, gen_random_uuid())),
     pg_temp.h(pg_temp.define(array[:'l_nela_tru']::uuid[], null, 0, gen_random_uuid())),
     pg_temp.h(pg_temp.define(array[:'l_blusa']::uuid[], :'cat_off', null, gen_random_uuid()))) as felipe \\gset
   select pg_temp.h(pg_temp.define(array[:'l_blusa']::uuid[], :'cat', null, gen_random_uuid())) as una \\gset
   select pg_temp.h(pg_temp.define(array[:'l_blusa']::uuid[], :'cat', null, gen_random_uuid())) as ya \\gset
   ${rolDeMicaela("ordenes_compra")}
   ${MICAELA_AQUI}
   select pg_temp.h(pg_temp.define(array[:'l_nela_tru']::uuid[], :'cat', null, gen_random_uuid())) as ajena \\gset
   reset role;
   select concat_ws(' / ', :'felipe', :'una', :'ya', :'ajena');`,
  "por_definir_ya_definida / por_definir_nada / orden_compra_sugerido / orden_compra_categoria / OK / por_definir_ya_definida / por_definir_ajena",
);

caso(
  "P7 lo definido no vuelve a «por definir»: ni la categoría ni el precio",
  `${COMPRA}
   reset role;
   update retail.orden_compra_items set categoria_id = :'cat' where id = :'l_nela_tru';
   select concat_ws(' / ',
     pg_temp.intento(format('update retail.orden_compra_items set categoria_id = null where id = %L', :'l_nela_tru')),
     pg_temp.intento(format('update retail.orden_compra_items set precio_por_definir = true, precio_venta_sugerido = null where id = %L', :'l_blusa')));`,
  "por_definir_no_vuelve / por_definir_no_vuelve",
);

caso(
  "P8 «Para mandar» no se salta lo que espera, y corregir la compra con una prenda por definir sigue pasando la regla; poner el precio apaga la espera",
  `${COMPRA}
   ${como(FELIPE, "compra_rapida")}
   select (select string_agg(c ->> 'nombre', ',' order by c ->> 'nombre') from jsonb_array_elements(retail.fn_mi_plata_compras() -> 'por_mandar') t,
            jsonb_array_elements(t -> 'compras') c) as para_mandar \\gset
   select pg_temp.h(pg_temp.corrige('${PAPEL}', gen_random_uuid(), ${A(J({ item_id: ":'l_nela_lim'", precio_venta: 45 }))})) as corr \\gset
   reset role;
   select concat_ws(' / ', :'para_mandar', :'corr',
     (select concat_ws(':', i.precio_venta_sugerido, i.precio_por_definir, i.categoria_id is null) from retail.orden_compra_items i where i.id = :'l_nela_lim'));`,
  "Blusa bordada,Modelo Nela,Modelo Nela / OK / 45.00:f:t",
);

caso(
  "P9 en camino, definir le dice también a la línea del envío; ya abierto en la tienda, la define quien recibe",
  `${COMPRA}
   ${MANDA}
   ${como(FELIPE, "compra_definir")}
   select pg_temp.h(pg_temp.define(array[:'l_blusa']::uuid[], :'cat', null, gen_random_uuid())) as en_camino \\gset
   ${ABRE}
   ${como(FELIPE, "compra_definir")}
   select pg_temp.h(pg_temp.define(array[:'l_nela_tru']::uuid[], :'cat', null, gen_random_uuid())) as abierto \\gset
   reset role;
   select concat_ws(' / ', :'en_camino', (select di.categoria_id = :'cat' from retail.despacho_items di where di.id = :'di_blusa'),
                    (select di.categoria_id is null from retail.despacho_items di where di.id = :'di_nela'), :'abierto');`,
  "OK / t / t / por_definir_en_tienda",
);

caso(
  "P10 Recibir: sin categoría no se cuenta ni se cierra; la tienda dice qué es y la compra lo guarda; lo que faltó queda con su categoría",
  `${COMPRA}
   ${MANDA}
   ${ABRE}
   select pg_temp.h(pg_temp.guarda(:'envio', :'di_nela', 0, ${SEP_NUEVA(0, "Modelo Nela")}, null::int, null::int, null::uuid, null::uuid, null::uuid)) as sin_cat \\gset
   select pg_temp.h(pg_temp.cierra(:'envio', :v_envio, '[]'::jsonb, null::text, null::uuid)) as cierre_sin_cat \\gset
   select pg_temp.h(pg_temp.dice_que_es(:'envio', array[:'di_blusa', :'di_nela']::uuid[], :'cat', :'marca')) as dice \\gset
   select pg_temp.h(pg_temp.guarda(:'envio', :'di_blusa', 0, ${SEP_NUEVA(0, "Blusa bordada")}, null::int, null::int, null::uuid, null::uuid, null::uuid)) as g1 \\gset
   select pg_temp.h(pg_temp.guarda(:'envio', :'di_nela', 0, ${SEP_NUEVA(0, "Modelo Nela")}, null::int, null::int, null::uuid, null::uuid, null::uuid)) as g2 \\gset
   reset role;
   select version as v_envio from retail.despachos where id = :'envio' \\gset
   select version as k1 from retail.despacho_conteos where despacho_id = :'envio' and despacho_item_id = :'di_blusa' \\gset
   select version as k2 from retail.despacho_conteos where despacho_id = :'envio' and despacho_item_id = :'di_nela' \\gset
   ${MICAELA_AQUI}
   select pg_temp.h(pg_temp.cierra(:'envio', :v_envio, ${A(
     J({ despacho_item_id: ":'di_blusa'", version: ":k1", costo_unitario: "null::numeric", confirma_costo: "false", faltante_causa: "'no_vino'", sobrante_causa: "null::text", nota: "null::text" }),
     J({ despacho_item_id: ":'di_nela'", version: ":k2", costo_unitario: "null::numeric", confirma_costo: "false", faltante_causa: "'no_vino'", sobrante_causa: "null::text", nota: "null::text" }),
   )}, null::text, gen_random_uuid())) as cierre \\gset
   reset role;
   select concat_ws(' / ', :'sin_cat', :'cierre_sin_cat', :'dice', :'g1', :'g2', :'cierre',
     (select count(*) from retail.orden_compra_items i where i.id in (:'l_blusa', :'l_nela_tru') and i.categoria_id = :'cat'),
     (select i.categoria_id is null from retail.orden_compra_items i where i.id = :'l_nela_lim'),
     (select count(*) from retail.despacho_diferencias f where f.despacho_id = :'envio' and f.categoria_id = :'cat'));`,
  "recepcion_por_definir / recepcion_por_definir / OK / OK / OK / OK / 2 / t / 2",
);

caso(
  "P11 lo de siempre no cambia: una compra con categoría y precio no espera nada y no sale en el aviso",
  `${como(FELIPE, "compra_rapida")}
   select pg_temp.h(pg_temp.compra('aaaaaaaa-0660-4000-8000-0000000000c1', :'prov', ${A(J({ descripcion: "'Polo de siempre'", categoria_id: "current_setting('t.cat')::uuid", marca_id: "current_setting('t.marca')::uuid", cantidad: 10, costo: 84, precio_venta: 129.9, destino_id: "current_setting('t.tru')::uuid" }))})) as ok \\gset
   select jsonb_array_length(pg_temp.aviso()) as aviso \\gset
   reset role;
   select concat_ws(' / ', :'ok', :'aviso',
     (select concat_ws(':', i.categoria_id = :'cat', i.precio_venta_sugerido, i.precio_por_definir) from retail.orden_compra_items i
        join retail.ordenes_compra o on o.id = i.orden_compra_id where o.papel_id = 'aaaaaaaa-0660-4000-8000-0000000000c1'));`,
  "OK / 0 / t:129.90:f",
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas) process.exit(1);
