#!/usr/bin/env node
/**
 * Prueba de «Corregir una compra» (ADR-0561): `20261029012000_mis_compras_corregir_una_compra.sql`.
 *
 * QUÉ PROMETE
 *   · El módulo es la llave, y solo se corrige una compra PROPIA (la de otra persona: compra_corregir_ajena).
 *   · La plata vuelve: mientras la compra espera a Compras, «tienes para comprar» sale de lo pagado del papel, así que bajar un costo devuelve la
 *     diferencia y subirlo la descuenta, sin escribir ningún movimiento de dinero.
 *   · El papel acompaña a las prendas SOLO si ya cuadraba con ellas; lo pagado acompaña (pagó todo → paga el monto nuevo; pagó una parte → no pasa del monto).
 *   · Una prenda no baja de lo que ya salió en un envío. No se corrige una compra completada, de una ronda cerrada ni con una orden anulada.
 *   · Todo o nada: un dato malo no deja nada escrito. Dos toques con el mismo lote no corrigen dos veces.
 *   · El rastro: una fila por dato (cuál, antes y ahora), quién y cuándo; no se cambia ni se borra. El papel sigue inmutable fuera de la corrección.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, la migración pegada dos veces y ROLLBACK siempre. La base ya tiene que tener «Compras simple»
 * (20261023183000 en adelante): esta migración no las repite.
 *
 * USO
 *   pnpm pruebas:compras-simple-corregir                                      → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_corregir.mjs --contenedor <otro>      → contra otro contenedor
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
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261029012000_mis_compras_corregir_una_compra.sql"), "utf8").replace(
  /^set lock_timeout.*$/gm,
  "",
);

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth, clave) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n` +
  `select set_config('request.headers', '${JSON.stringify(clave ? { "x-responsable-omitido": clave } : {})}', true) \\g /dev/null\n` +
  `set local role authenticated;\n`;

const PRELUDIO = `
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
-- Cada persona de la semilla con su ronda abierta (sin una abierta, la base no deja anotar una compra).
insert into retail.compra_rondas (persona_id, abierta_por)
select distinct c.persona_id, c.persona_id from retail.colaboradores c
 where not exists (select 1 from retail.compra_rondas r where r.persona_id = c.persona_id and r.cerrada_en is null);
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select p.proveedor_id as prov from retail.productos p where p.proveedor_id is not null and p.estado = 'activo' and not p.es_prueba
 group by p.proveedor_id order by count(*) desc limit 1 \\gset
select id as p1 from retail.productos where proveedor_id = :'prov' and estado = 'activo' and not es_prueba order by referencia limit 1 \\gset
select id as p2 from retail.productos where proveedor_id = :'prov' and estado = 'activo' and not es_prueba order by referencia offset 1 limit 1 \\gset
select set_config('t.prov', :'prov', true), set_config('t.p1', :'p1', true), set_config('t.p2', :'p2', true), set_config('t.tru', :'tru', true),
       set_config('t.lima', :'lima', true) \\g /dev/null
`;

const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Compradora ADR-0561') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
`;
// Seis de p1 a Trujillo a S/ 50 y cuatro de p2 a Lima a S/ 45: las prendas suman S/ 480.
const LINEAS = `jsonb_build_array(
  jsonb_build_object('producto_id', current_setting('t.p1')::uuid, 'cantidad', 6, 'costo', 50, 'precio_venta', 129.90, 'destino_id', current_setting('t.tru')::uuid),
  jsonb_build_object('producto_id', current_setting('t.p2')::uuid, 'cantidad', 4, 'costo', 45, 'precio_venta', 149.90, 'destino_id', current_setting('t.lima')::uuid))`;
const ID = "aaaaaaaa-0561-4000-8000-0000000000c1";
const OTRA = "aaaaaaaa-0561-4000-8000-0000000000c2";
// Todo pagado (de fábrica): el papel dice 480 y las prendas suman 480.
const COMPRA = (id = ID, monto = 480, pago = "") =>
  `select retail.registrar_compra_rapida('${id}', current_setting('t.prov')::uuid, 'boleta', ${monto}, 'papeles/x.jpg', ${LINEAS}${pago})`;
// Deja en `t.it1` y `t.it2` las líneas de p1 y de p2 de esa compra.
const ITEMS = (id = ID) => `
reset role;
select i.id as it1 from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
 where o.papel_id = '${id}' and i.producto_id = :'p1' \\gset
select i.id as it2 from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
 where o.papel_id = '${id}' and i.producto_id = :'p2' \\gset
select set_config('t.it1', :'it1', true), set_config('t.it2', :'it2', true) \\g /dev/null
`;
const CAMBIOS = (...cambios) => `jsonb_build_array(${cambios.join(", ")})`;
const cambio = (n, campos) => `jsonb_build_object('item_id', current_setting('t.it${n}'), ${campos})`;
const CORREGIR = (cambios, lote = "bbbbbbbb-0561-4000-8000-000000000001", papel = ID) =>
  `select retail.corregir_compra_rapida('${papel}', '${lote}', ${cambios})`;
// Una compra con UNA prenda de «Algo nuevo» (sin prenda del catálogo): 5 a S/ 22 en Trujillo, con la categoría y la marca de p1.
const NUEVA = "aaaaaaaa-0561-4000-8000-0000000000c3";
const LINEA_NUEVA = `jsonb_build_array(jsonb_build_object('descripcion', 'Polo Venus', 'categoria_id', (select categoria_id from retail.productos where id = current_setting('t.p1')::uuid),
  'marca_id', (select marca_id from retail.productos where id = current_setting('t.p1')::uuid), 'cantidad', 5, 'costo', 22, 'precio_venta', 39.90, 'destino_id', current_setting('t.tru')::uuid))`;
const COMPRA_NUEVA = `select retail.registrar_compra_rapida('${NUEVA}', current_setting('t.prov')::uuid, 'boleta', 110, 'papeles/x.jpg', ${LINEA_NUEVA})`;
// Deja en `t.nu1` la línea de «Algo nuevo», y en `t.cat2` y `t.marca2` otra categoría y otra marca activas.
const ITEM_NUEVO = `
reset role;
select i.id as nu1, i.categoria_id as cat1, i.marca_id as marca1 from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id where o.papel_id = '${NUEVA}' \\gset
select id as cat2 from retail.categorias where activo and id <> :'cat1' order by nombre limit 1 \\gset
select id as marca2 from retail.marcas where activo and id <> :'marca1' order by nombre limit 1 \\gset
select set_config('t.nu1', :'nu1', true), set_config('t.cat2', :'cat2', true), set_config('t.marca2', :'marca2', true) \\g /dev/null
`;
const cambioNuevo = (campos) => `jsonb_build_object('item_id', current_setting('t.nu1'), ${campos})`;
const intento = (sql) => `pg_temp.intento($q$${sql}$q$)`;
const hint = (sql) => `split_part(${intento(sql)}, '|', 2)`;
const TIENE = `retail.fn_mi_plata_tiene(:'micaela')`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).join(" / ");
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => !l.includes("NOTICE")).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

caso(
  "sin «Mi plata para compras» no se lee ni se corrige (42501); otra persona no corrige la compra ajena",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${ITEMS()}
reset role;
delete from retail.rol_modulos where rol_id = :'rol';
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'existencias');
${como(MICAELA, "c")}
select left(${intento(`select retail.fn_compra_para_corregir('${ID}')`)}, 5),
       left(${intento(CORREGIR(CAMBIOS(cambio(1, "'costo', 40")))) }, 5);
${como(FELIPE, "c")}
select ${hint(`select retail.fn_compra_para_corregir('${ID}')`)}, ${hint(CORREGIR(CAMBIOS(cambio(1, "'costo', 40"))))};`,
  "42501|42501 / compra_corregir_ajena|compra_corregir_ajena",
);

caso(
  "la plata vuelve: bajar un costo devuelve la diferencia, el papel baja con las prendas y lo pagado también",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${ITEMS()}
select ${TIENE} as antes \\gset
select count(*) as movs_antes from retail.movimientos_dinero \\gset
${como(MICAELA, "c")}
select (${CORREGIR(CAMBIOS(cambio(1, "'costo', 40")))}) ->> 'monto';
reset role;
select ${TIENE} - :'antes', (select monto || '/' || pagado from retail.compra_papeles where id = '${ID}'),
       (select count(*) from retail.movimientos_dinero) - :'movs_antes';`,
  "420.00 / 60.00|420.00/420.00|0",
);

caso(
  "subir el costo la descuenta (pagó todo: paga el monto nuevo)",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${ITEMS()}
select ${TIENE} as antes \\gset
${como(MICAELA, "c")}
${CORREGIR(CAMBIOS(cambio(2, "'cantidad', 8")))} \\g /dev/null
reset role;
select ${TIENE} - :'antes', (select monto || '/' || pagado from retail.compra_papeles where id = '${ID}');`,
  "-180.00|660.00/660.00",
);

caso(
  "pagó solo un adelanto: bajar el costo no mueve su plata (nunca salió); lo que baja es lo que falta pagar",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA(ID, 480, ", 100, 'yape'")} \\g /dev/null
${ITEMS()}
select ${TIENE} as antes \\gset
${como(MICAELA, "c")}
${CORREGIR(CAMBIOS(cambio(1, "'costo', 40")))} \\g /dev/null
reset role;
select ${TIENE} - :'antes', (select monto || '/' || pagado || '/' || medio_pago from retail.compra_papeles where id = '${ID}');`,
  "0.00|420.00/100.00/yape",
);

caso(
  "el adelanto no pasa del monto nuevo: si el papel baja de lo que pagó, vuelve lo que pagó de más",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA(ID, 480, ", 400, 'efectivo'")} \\g /dev/null
${ITEMS()}
select ${TIENE} as antes \\gset
${como(MICAELA, "c")}
${CORREGIR(CAMBIOS(cambio(1, "'cantidad', 1"), cambio(2, "'cantidad', 1")))} \\g /dev/null
reset role;
select ${TIENE} - :'antes', (select monto || '/' || pagado from retail.compra_papeles where id = '${ID}');`,
  "305.00|95.00/95.00",
);

caso(
  "si el papel no cuadraba con las prendas, se queda como estaba (la plata no se mueve) y la corrección igual guarda las prendas",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA(ID, 500)} \\g /dev/null
${ITEMS()}
select ${TIENE} as antes \\gset
${como(MICAELA, "c")}
select (${CORREGIR(CAMBIOS(cambio(1, "'costo', 40")))}) ->> 'prendas';
reset role;
select ${TIENE} - :'antes', (select monto || '/' || pagado from retail.compra_papeles where id = '${ID}'),
       (select i.precio_unitario from retail.orden_compra_items i where i.id = :'it1');`,
  "1 / 0.00|500.00/500.00|40.00",
);

caso(
  "una prenda no baja de lo que ya salió en un envío; sí puede subir y bajar hasta lo enviado",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${ITEMS()}
insert into retail.despachos (ubicacion_destino_id, despachado_por) values (:'tru', :'micaela') returning id as desp \\gset
insert into retail.despacho_items (despacho_id, orden_compra_item_id, cantidad, categoria_id, marca_id, precio_unitario)
select :'desp', i.id, 4, i.categoria_id, i.marca_id, i.precio_unitario from retail.orden_compra_items i where i.id = :'it1';
${como(MICAELA, "c")}
select ${hint(CORREGIR(CAMBIOS(cambio(1, "'cantidad', 3")), "bbbbbbbb-0561-4000-8000-000000000002"))},
       ${intento(CORREGIR(CAMBIOS(cambio(1, "'cantidad', 4")), "bbbbbbbb-0561-4000-8000-000000000003"))},
       (retail.fn_compra_para_corregir('${ID}') -> 'lineas' -> 0 ->> 'enviadas');`,
  "compra_corregir_menos_de_lo_enviado|SIN_ERROR|4",
);

caso(
  "no se corrige una compra completada, de una ronda cerrada, facturada ni con una orden anulada",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${ITEMS()}
reset role;
update retail.compra_papeles set estado = 'completado' where id = '${ID}';
${como(MICAELA, "c")}
select ${hint(CORREGIR(CAMBIOS(cambio(1, "'costo', 40")), "bbbbbbbb-0561-4000-8000-000000000004"))},
       retail.fn_compra_para_corregir('${ID}') ->> 'motivo', retail.fn_compra_para_corregir('${ID}') ->> 'se_puede';
reset role;
update retail.compra_papeles set estado = 'por_completar' where id = '${ID}';
update retail.ordenes_compra set estado = 'anulada', anulada_por = :'micaela', anulada_en = now(), motivo_anulacion = 'prueba'
 where papel_id = '${ID}' and ubicacion_destino_id = :'lima';
${como(MICAELA, "c")}
select ${hint(CORREGIR(CAMBIOS(cambio(1, "'costo', 40")), "bbbbbbbb-0561-4000-8000-000000000005"))};
reset role;
update retail.ordenes_compra set estado = 'generada', anulada_por = null, anulada_en = null, motivo_anulacion = null where papel_id = '${ID}';
insert into retail.compra_cierres (persona_id, fecha, decision, monto, cerrado_por, ronda_id)
select :'micaela', retail.fn_hoy_lima(), 'se_queda', 0, :'micaela', ronda_id from retail.compra_papeles where id = '${ID}' returning id as cid \\gset
update retail.compra_rondas set cerrada_en = now(), cierre_id = :'cid' where id = (select ronda_id from retail.compra_papeles where id = '${ID}');
${como(MICAELA, "c")}
select ${hint(CORREGIR(CAMBIOS(cambio(1, "'costo', 40")), "bbbbbbbb-0561-4000-8000-000000000006"))};`,
  "compra_corregir_completada|completada|false / compra_corregir_orden_anulada / compra_corregir_ronda_cerrada",
);

caso(
  "todo o nada: un dato malo en la segunda prenda no deja corregida la primera; los datos mal escritos se rechazan",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${ITEMS()}
${como(MICAELA, "c")}
select ${hint(CORREGIR(CAMBIOS(cambio(1, "'costo', 40"), cambio(2, "'cantidad', 0")), "bbbbbbbb-0561-4000-8000-000000000007"))},
       ${hint(CORREGIR(CAMBIOS(cambio(1, "'cantidad', 2.5")), "bbbbbbbb-0561-4000-8000-000000000008"))},
       ${hint(CORREGIR(CAMBIOS(cambio(1, "'costo', -3")), "bbbbbbbb-0561-4000-8000-000000000009"))},
       ${hint(CORREGIR(CAMBIOS(cambio(1, "'precio_venta', 9000")), "bbbbbbbb-0561-4000-8000-00000000000a"))},
       ${hint(CORREGIR(CAMBIOS(cambio(1, "'costo', 50")), "bbbbbbbb-0561-4000-8000-00000000000b"))},
       ${hint(CORREGIR(CAMBIOS(cambio(1, "'costo', 40"), cambio(1, "'costo', 41")), "bbbbbbbb-0561-4000-8000-00000000000c"))},
       ${hint(CORREGIR("'[]'::jsonb", "bbbbbbbb-0561-4000-8000-00000000000d"))};
reset role;
select (select i.precio_unitario from retail.orden_compra_items i where i.id = :'it1'),
       (select monto from retail.compra_papeles where id = '${ID}'),
       (select count(*) from retail.compra_correcciones);`,
  "orden_compra_cantidad|compra_corregir_numero|orden_compra_precio|orden_compra_sugerido|compra_corregir_sin_cambios|compra_corregir_repetida|compra_corregir_sin_cambios / 50.00|480.00|0",
);

caso(
  "una prenda de otra compra no se toca desde esta",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${COMPRA(OTRA)} \\g /dev/null
${ITEMS(OTRA)}
${como(MICAELA, "c")}
select ${hint(CORREGIR(CAMBIOS(cambio(1, "'costo', 40")), "bbbbbbbb-0561-4000-8000-00000000000e"))};`,
  "compra_corregir_prenda_ajena",
);

caso(
  "dos toques con el mismo lote no corrigen dos veces; el mismo lote en otra compra se rechaza",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${COMPRA(OTRA)} \\g /dev/null
${ITEMS()}
${como(MICAELA, "c")}
select (${CORREGIR(CAMBIOS(cambio(1, "'costo', 40")))}) ->> 'ya_estaba';
select (${CORREGIR(CAMBIOS(cambio(1, "'costo', 40")))}) ->> 'ya_estaba';
select ${hint(CORREGIR(CAMBIOS(cambio(1, "'costo', 40")), "bbbbbbbb-0561-4000-8000-000000000001", OTRA))};
reset role;
select (select i.precio_unitario from retail.orden_compra_items i where i.id = :'it1'), (select count(*) from retail.compra_correcciones where papel_id = '${ID}');`,
  "false / true / compra_corregir_otro_lote / 40.00|3",
);

caso(
  "el rastro: una fila por dato (cuál, antes y ahora), quién y cuándo; no se cambia ni se borra",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${ITEMS()}
${como(MICAELA, "c")}
${CORREGIR(CAMBIOS(cambio(1, "'costo', 40, 'precio_venta', 119.90")))} \\g /dev/null
reset role;
select string_agg(campo || ':' || coalesce(antes, '-') || '>' || coalesce(despues, '-'), ',' order by campo) from retail.compra_correcciones where papel_id = '${ID}';
select bool_and(corregida_por = :'micaela' and corregida_en is not null) from retail.compra_correcciones;
select ${hint("update retail.compra_correcciones set despues = '1'")}, ${hint("delete from retail.compra_correcciones")};`,
  "costo:50.00>40.00,monto:480.00>420.00,pagado:480.00>420.00,precio_venta:129.90>119.90 / t / |",
);

caso(
  "el papel sigue inmutable fuera de la corrección: ni el monto a mano, ni el proveedor aunque se invoque la marca de la corrección",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
reset role;
select left(${intento(`update retail.compra_papeles set monto = 100, pagado = 100 where id = '${ID}'`)}, 14);
select set_config('retail.compra_corrigiendo', 'si', true) \\g /dev/null
select left(${intento(`update retail.compra_papeles set tipo = 'factura' where id = '${ID}'`)}, 14),
       ${intento(`update retail.compra_papeles set monto = 300, pagado = 300 where id = '${ID}'`)};`,
  "P0001||Lo que  / P0001||Lo que |SIN_ERROR",
);

caso(
  "una prenda de «Algo nuevo» cambia su nombre, su categoría y su marca, con su rastro; la de catálogo no (compra_corregir_del_catalogo)",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${COMPRA_NUEVA} \\g /dev/null
${ITEMS()}
${ITEM_NUEVO}
${como(MICAELA, "c")}
select ${hint(CORREGIR(CAMBIOS(cambio(1, "'descripcion', 'Otro nombre'")), "bbbbbbbb-0561-4000-8000-000000000010"))},
       ${hint(CORREGIR(CAMBIOS(cambio(1, "'categoria_id', current_setting('t.cat2')")), "bbbbbbbb-0561-4000-8000-000000000011"))},
       ${intento(CORREGIR(CAMBIOS(cambio(1, "'costo', 40")), "bbbbbbbb-0561-4000-8000-000000000012"))};
select (${CORREGIR(CAMBIOS(cambioNuevo("'descripcion', 'Polo Venus manga larga', 'categoria_id', current_setting('t.cat2'), 'marca_id', current_setting('t.marca2')")), "bbbbbbbb-0561-4000-8000-000000000013", NUEVA)}) ->> 'prendas';
reset role;
select (select i.descripcion || '/' || (i.categoria_id = :'cat2') || '/' || (i.marca_id = :'marca2') from retail.orden_compra_items i where i.id = :'nu1'),
       (select string_agg(campo, ',' order by campo) from retail.compra_correcciones where papel_id = '${NUEVA}');`,
  "compra_corregir_del_catalogo|compra_corregir_del_catalogo|SIN_ERROR / 1 / Polo Venus manga larga/true/true|categoria,marca,nombre",
);

caso(
  "nombre vacío o muy largo, categoría o marca inactiva o que no existe: se rechazan sin dejar nada",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA_NUEVA} \\g /dev/null
${ITEM_NUEVO}
reset role;
update retail.marcas set activo = false where id = :'marca2';
${como(MICAELA, "c")}
select ${hint(CORREGIR(CAMBIOS(cambioNuevo("'descripcion', '   '")), "bbbbbbbb-0561-4000-8000-000000000014", NUEVA))},
       ${hint(CORREGIR(CAMBIOS(cambioNuevo("'descripcion', repeat('x', 201)")), "bbbbbbbb-0561-4000-8000-000000000015", NUEVA))},
       ${hint(CORREGIR(CAMBIOS(cambioNuevo("'categoria_id', gen_random_uuid()")), "bbbbbbbb-0561-4000-8000-000000000016", NUEVA))},
       ${hint(CORREGIR(CAMBIOS(cambioNuevo("'marca_id', current_setting('t.marca2')")), "bbbbbbbb-0561-4000-8000-000000000017", NUEVA))},
       ${hint(CORREGIR(CAMBIOS(cambioNuevo("'marca_id', 'no-es-un-uuid'")), "bbbbbbbb-0561-4000-8000-000000000018", NUEVA))};
reset role;
select (select descripcion from retail.orden_compra_items where id = :'nu1'), (select count(*) from retail.compra_correcciones);`,
  "compra_corregir_nombre|orden_compra_descripcion|orden_compra_categoria|orden_compra_marca|compra_corregir_cambio / Polo Venus|0",
);

caso(
  "la lectura trae las categorías y marcas activas para elegir, y nada si ya no se puede corregir",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
select jsonb_array_length(retail.fn_compra_para_corregir('${ID}') -> 'categorias') > 0, jsonb_array_length(retail.fn_compra_para_corregir('${ID}') -> 'marcas') > 0;
reset role;
update retail.compra_papeles set estado = 'completado' where id = '${ID}';
${como(MICAELA, "c")}
select jsonb_array_length(retail.fn_compra_para_corregir('${ID}') -> 'categorias'), jsonb_array_length(retail.fn_compra_para_corregir('${ID}') -> 'marcas');`,
  "t|t / 0|0",
);

const OTRA_TIENDA = `
reset role;
insert into retail.ubicaciones (nombre, tipo) values ('Tienda de prueba ADR-0561', 'tienda') returning id as otra \\gset
select set_config('t.otra', :'otra', true) \\g /dev/null
`;
const A_LIMA = `'destino_id', current_setting('t.lima')`;
const ORDENES = `(select string_agg(u.nombre || '=' || o.estado || ':' || (select count(*) from retail.orden_compra_items i where i.orden_compra_id = o.id), ',' order by u.nombre)
                    from retail.ordenes_compra o join retail.ubicaciones u on u.id = o.ubicacion_destino_id where o.papel_id = '${ID}')`;

caso(
  "cambiar de tienda: la prenda pasa a la orden de la otra tienda; la orden que se queda sin prendas se anula con su motivo y la compra se sigue corrigiendo",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${ITEMS()}
${como(MICAELA, "c")}
select (${CORREGIR(CAMBIOS(cambio(1, A_LIMA)))}) ->> 'prendas';
${CORREGIR(CAMBIOS(cambio(1, "'costo', 40")), "bbbbbbbb-0561-4000-8000-000000000020")} \\g /dev/null
reset role;
select ${ORDENES},
       (select string_agg(antes || '>' || despues, ',') from retail.compra_correcciones where papel_id = '${ID}' and campo = 'tienda'),
       (select motivo_anulacion like 'Corrección de la compra:%' from retail.ordenes_compra o join retail.ubicaciones u on u.id = o.ubicacion_destino_id
         where o.papel_id = '${ID}' and u.nombre = 'Tienda Trujillo'),
       retail.fn_compra_corregible('${ID}') is null;`,
  "1 / Tienda Lima=generada:2,Tienda Trujillo=anulada:0|Tienda Trujillo>Tienda Lima|t|t",
);

caso(
  "una tienda sin orden en esta compra recibe una orden nueva (la misma que habría creado al anotarla); volver a una tienda anulada la reabre",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${ITEMS()}
${OTRA_TIENDA}
${como(MICAELA, "c")}
${CORREGIR(CAMBIOS(cambio(2, "'destino_id', current_setting('t.otra')")), "bbbbbbbb-0561-4000-8000-000000000021")} \\g /dev/null
reset role;
select (select count(*) from retail.ordenes_compra where papel_id = '${ID}' and estado = 'generada'),
       (select count(*) from retail.ordenes_compra where papel_id = '${ID}' and estado = 'anulada'),
       (select count(*) from retail.ordenes_compra where id = md5('${ID}:' || :'otra')::uuid and papel_id = '${ID}' and creada_por = :'micaela');
${como(MICAELA, "c")}
${CORREGIR(CAMBIOS(cambio(2, "'destino_id', current_setting('t.lima')")), "bbbbbbbb-0561-4000-8000-000000000022")} \\g /dev/null
reset role;
select (select count(*) from retail.ordenes_compra where papel_id = '${ID}' and estado = 'generada'),
       (select count(*) from retail.ordenes_compra where papel_id = '${ID}' and estado = 'anulada' and anulada_en is not null);`,
  "2|1|1 / 2|1",
);

caso(
  "una prenda de la que ya salió algo no cambia de tienda; una tienda que no existe o no es de la empresa se rechaza",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${ITEMS()}
insert into retail.despachos (ubicacion_destino_id, despachado_por) values (:'tru', :'micaela') returning id as desp \\gset
insert into retail.despacho_items (despacho_id, orden_compra_item_id, cantidad, categoria_id, marca_id, precio_unitario)
select :'desp', i.id, 2, i.categoria_id, i.marca_id, i.precio_unitario from retail.orden_compra_items i where i.id = :'it1';
${como(MICAELA, "c")}
select ${hint(CORREGIR(CAMBIOS(cambio(1, A_LIMA)), "bbbbbbbb-0561-4000-8000-000000000023"))},
       ${hint(CORREGIR(CAMBIOS(cambio(2, "'destino_id', gen_random_uuid()")), "bbbbbbbb-0561-4000-8000-000000000024"))},
       ${hint(CORREGIR(CAMBIOS(cambio(2, "'destino_id', 'no-es-un-uuid'")), "bbbbbbbb-0561-4000-8000-000000000025"))};
reset role;
select ${ORDENES}, (select count(*) from retail.compra_correcciones);`,
  "compra_corregir_tienda_con_envio|compra_rapida_destino|compra_corregir_cambio / Tienda Lima=generada:1,Tienda Trujillo=generada:1|0",
);

caso(
  "queda la actividad de la corrección, sin montos; anon no ejecuta nada y la tabla no se lee directo",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "c")}
${COMPRA()} \\g /dev/null
${ITEMS()}
${como(MICAELA, "c")}
${CORREGIR(CAMBIOS(cambio(1, "'costo', 40")))} \\g /dev/null
select ${intento("select count(*) from retail.compra_correcciones")};
reset role;
select count(*) from retail.actividad where accion = 'compra_corregida' and registro_id = '${ID}' and descripcion !~ 'S/';
set local role anon;
select left(${intento(`select retail.corregir_compra_rapida('${ID}', gen_random_uuid(), '[]'::jsonb)`)}, 5),
       left(${intento(`select retail.fn_compra_para_corregir('${ID}')`)}, 5);`,
  (o) => o.startsWith("42501|") && o.includes(" / 1 / ") && o.endsWith("42501|42501"),
);

console.log(`\n${casos - fallas} de ${casos} casos`);
process.exit(fallas ? 1 : 0);
