#!/usr/bin/env node
/**
 * Prueba de «Compré ropa» desde el celular (ADR-0480, actividad 3): `20261023005000_compras_simple_compra_rapida.sql`.
 *
 * QUÉ PROMETE
 *   · El módulo es la llave: registrar, ver proveedores y ver habituales piden «Mi plata para compras» (`ordenes_compra`).
 *   · Una compra es un papel por completar y una orden por tienda de destino, con sus prendas; la prenda elegida del catálogo trae su
 *     categoría y su marca de ahí. Todo o nada.
 *   · No mueve plata en los libros (Felipe 2026-10-22): ni un movimiento de dinero; en su celular, «tienes para comprar» baja lo comprado.
 *   · Repetir el mismo envío devuelve lo mismo (no duplica órdenes); con otros datos, `compra_rapida_otros_datos`.
 *   · Validaciones: proveedor, tipo de papel, monto, la foto si hay papel, la tienda de cada prenda, la prenda del catálogo y la regla de
 *     líneas de las órdenes (cantidad, costo, categoría y marca). Lo rechazado no deja nada.
 *   · Los habituales: primero lo comprado aquí (con cuántas veces y lo de la vez pasada), después las prendas del catálogo del proveedor.
 *   · El papel no se borra ni cambia lo anotado; solo su estado. `anon` no ejecuta nada y la tabla no se lee directo.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, la migración pegada dos veces y ROLLBACK siempre.
 *
 * USO
 *   pnpm pruebas:compras-simple-compra                                  → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_compra.mjs --contenedor <otro>  → contra otro contenedor
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261023005000_compras_simple_compra_rapida.sql"), "utf8").replace(
  /^set lock_timeout.*$/gm,
  "",
);

// La foto del papel opcional (20261023180000) corrige la función de arriba: se carga después, como en la base.
const MIGRACION_FOTO = readFileSync(join(RAIZ, "supabase", "migrations", "20261023180000_compras_simple_foto_opcional.sql"), "utf8").replace(
  /^set lock_timeout.*$/gm,
  "",
);

// La ronda de compras (20261023183000): sin una abierta, la base no deja anotar una compra ni un gasto. Se vuelve a pegar después de la
// migración de este archivo (que deja funciones de antes) y cada persona de la semilla empieza con su ronda abierta.
const RONDA = readFileSync(join(RAIZ, "supabase", "migrations", "20261023183000_compras_simple_ronda_de_compras.sql"), "utf8").replace(
  /^set lock_timeout.*$/gm,
  "",
);
const RONDAS_ABIERTAS = `
insert into retail.compra_rondas (persona_id, abierta_por)
select distinct c.persona_id, c.persona_id from retail.colaboradores c
 where not exists (select 1 from retail.compra_rondas r where r.persona_id = c.persona_id and r.cerrada_en is null);`;

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
${MIGRACION_FOTO}
${MIGRACION_FOTO}
${RONDAS_ABIERTAS}
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
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
-- Un proveedor con prendas en el catálogo y dos de ellas (las primeras por nombre).
select p.proveedor_id as prov from retail.productos p where p.proveedor_id is not null and p.estado = 'activo' and not p.es_prueba
 group by p.proveedor_id order by count(*) desc limit 1 \\gset
select id as p1 from retail.productos where proveedor_id = :'prov' and estado = 'activo' and not es_prueba order by referencia limit 1 \\gset
select id as p2 from retail.productos where proveedor_id = :'prov' and estado = 'activo' and not es_prueba order by referencia offset 1 limit 1 \\gset
select categoria_id as cat, marca_id as marca from retail.productos where id = :'p1' \\gset
-- Las mismas, como configuración de la sesión: psql no reemplaza sus variables dentro de un texto entre $q$ (lo que prueba un error).
select set_config('t.prov', :'prov', true), set_config('t.p1', :'p1', true), set_config('t.p2', :'p2', true), set_config('t.tru', :'tru', true),
       set_config('t.lima', :'lima', true), set_config('t.taller', :'taller', true), set_config('t.cat', :'cat', true),
       set_config('t.marca', :'marca', true) \\g /dev/null
`;

const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Compradora ADR-0480') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
`;
// Micaela registra una compra a «prov»: seis de p1 a Trujillo y cuatro de p2 a Lima, en boleta de S/ 500.
const LINEAS = `jsonb_build_array(
  jsonb_build_object('producto_id', current_setting('t.p1')::uuid, 'cantidad', 6, 'costo', 50, 'precio_venta', 129.90, 'destino_id', current_setting('t.tru')::uuid, 'categoria_id', '00000000-0000-4000-8000-000000000000'),
  jsonb_build_object('producto_id', current_setting('t.p2')::uuid, 'cantidad', 4, 'costo', 45, 'precio_venta', 149.90, 'destino_id', current_setting('t.lima')::uuid))`;
const ID = "aaaaaaaa-0480-4000-8000-0000000000c1";
const COMPRA = (id = ID, monto = 500) =>
  `select retail.registrar_compra_rapida('${id}', current_setting('t.prov')::uuid, 'boleta', ${monto}, 'papeles/x.jpg', ${LINEAS})`;
const intento = (sql) => `pg_temp.intento($q$${sql}$q$)`;
const hint = (sql) => `split_part(${intento(sql)}, '|', 2)`;

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
  "sin «Mi plata para compras» no se registra ni se ven proveedores ni habituales (42501)",
  `${rolDeMicaela("existencias")}${como(MICAELA, "compra_rapida")}
select left(${intento(COMPRA())}, 5), left(${intento("select retail.fn_proveedores_para_comprar()")}, 5),
       left(${intento("select retail.fn_habituales_proveedor(null)")}, 5);`,
  "42501|42501|42501",
);

caso(
  "una compra es un papel por completar y una orden por tienda; la prenda del catálogo trae su categoría y su marca",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
select jsonb_array_length(${COMPRA().slice(7)} -> 'ordenes');
reset role;
select (select estado || ':' || tipo || ':' || monto from retail.compra_papeles where id = '${ID}'),
       (select count(*) from retail.ordenes_compra where papel_id = '${ID}'),
       (select string_agg(u.nombre || '=' || i.cantidad, ',' order by u.nombre) from retail.ordenes_compra o
          join retail.orden_compra_items i on i.orden_compra_id = o.id join retail.ubicaciones u on u.id = o.ubicacion_destino_id
         where o.papel_id = '${ID}'),
       (select bool_and(i.categoria_id = p.categoria_id and i.producto_id = p.id) from retail.ordenes_compra o
          join retail.orden_compra_items i on i.orden_compra_id = o.id join retail.productos p on p.id = i.producto_id where o.papel_id = '${ID}'),
       (select bool_and(o.creada_por = :'micaela') from retail.ordenes_compra o where o.papel_id = '${ID}');`,
  "2 / por_completar:boleta:500.00|2|Tienda Lima=4,Tienda Trujillo=6|t|t",
);

caso(
  "no mueve plata en los libros; en su celular, «tienes para comprar» baja lo comprado",
  `${rolDeMicaela("ordenes_compra")}
reset role;
select count(*) as movs_antes from retail.movimientos_dinero \\gset
${como(MICAELA, "compra_rapida")}
${COMPRA()} \\g /dev/null
select (retail.fn_mi_plata_compras() ->> 'compras_por_completar')::numeric, jsonb_array_length(retail.fn_mi_plata_compras() -> 'compras'),
       retail.fn_mi_plata_compras() -> 'compras' -> 0 ->> 'prendas';
reset role;
select (select count(*) from retail.movimientos_dinero) - :'movs_antes';`,
  "500.00|1|10 / 0",
);

caso(
  "repetir el mismo envío devuelve lo mismo y no duplica; con otro monto, compra_rapida_otros_datos",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA()} \\g /dev/null
${COMPRA()} \\g /dev/null
select ${hint(COMPRA(ID, 450))};
reset role;
select count(*) from retail.ordenes_compra where papel_id = '${ID}';`,
  "compra_rapida_otros_datos / 2",
);

caso(
  "validaciones del papel: proveedor, tipo, monto y la ruta de la foto; la foto es opcional, con papel o sin él (20261023180000)",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
select ${hint(`select retail.registrar_compra_rapida(gen_random_uuid(), null, 'boleta', 10, 'papeles/x.jpg', ${LINEAS})`)},
       ${hint(`select retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'recibo', 10, 'papeles/x.jpg', ${LINEAS})`)},
       ${hint(`select retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'boleta', 0, 'papeles/x.jpg', ${LINEAS})`)},
       ${intento(`select retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'boleta', 10, null, ${LINEAS})`)},
       ${hint(`select retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'boleta', 10, 'otra/x.jpg', ${LINEAS})`)},
       ${intento(`select retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'sin_comprobante', 10, null, ${LINEAS})`)};`,
  "orden_compra_proveedor|compra_rapida_tipo|monto_invalido|SIN_ERROR|compra_rapida_foto|SIN_ERROR",
);

caso(
  "validaciones de las prendas: tienda (no el Taller), prenda que no existe, cantidad, sin categoría; lo rechazado no deja nada",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
select ${hint(`select retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'sin_comprobante', 10, null, jsonb_build_array(jsonb_build_object('producto_id', current_setting('t.p1')::uuid, 'cantidad', 1, 'costo', 5, 'destino_id', current_setting('t.taller')::uuid)))`)},
       ${hint(`select retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'sin_comprobante', 10, null, jsonb_build_array(jsonb_build_object('producto_id', gen_random_uuid(), 'cantidad', 1, 'costo', 5, 'destino_id', current_setting('t.tru')::uuid)))`)},
       ${hint(`select retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'sin_comprobante', 10, null, jsonb_build_array(jsonb_build_object('producto_id', current_setting('t.p1')::uuid, 'cantidad', 0, 'costo', 5, 'destino_id', current_setting('t.tru')::uuid)))`)},
       ${hint(`select retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'sin_comprobante', 10, null, jsonb_build_array(jsonb_build_object('descripcion', 'Algo', 'cantidad', 1, 'costo', 5, 'destino_id', current_setting('t.tru')::uuid)))`)},
       ${hint(`select retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'sin_comprobante', 10, null, '[]'::jsonb)`)};
reset role;
select count(*) from retail.compra_papeles where persona_id = :'micaela';`,
  "compra_rapida_destino|compra_rapida_producto|orden_compra_cantidad|orden_compra_categoria|orden_compra_sin_lineas / 0",
);

caso(
  "una prenda sin catálogo (descripción, categoría y marca) se registra y queda entre sus habituales por su nombre",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
select retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'sin_comprobante', 120, null,
  jsonb_build_array(jsonb_build_object('descripcion', 'Casaca corta acolchada', 'categoria_id', current_setting('t.cat')::uuid, 'marca_id', current_setting('t.marca')::uuid, 'cantidad', 3, 'costo', 40, 'precio_venta', 99.9, 'destino_id', current_setting('t.tru')::uuid))) \\g /dev/null
select h ->> 'nombre', h ->> 'veces', h ->> 'ultima_cantidad', h ->> 'costo', h ->> 'producto_id' is null
  from jsonb_array_elements(retail.fn_habituales_proveedor(current_setting('t.prov')::uuid)) h where h ->> 'nombre' = 'Casaca corta acolchada';`,
  "Casaca corta acolchada|1|3|40.00|t",
);

caso(
  "habituales: lo comprado va primero con lo de la vez pasada; el resto del catálogo después, sin repetir",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
select jsonb_array_length(retail.fn_habituales_proveedor(current_setting('t.prov')::uuid)) as antes \\gset
${COMPRA()} \\g /dev/null
select jsonb_array_length(retail.fn_habituales_proveedor(current_setting('t.prov')::uuid)) = :'antes'::integer,
       (retail.fn_habituales_proveedor(current_setting('t.prov')::uuid) -> 0 ->> 'veces')::integer, retail.fn_habituales_proveedor(current_setting('t.prov')::uuid) -> 0 ->> 'ultima_cantidad',
       (select count(*) from jsonb_array_elements(retail.fn_habituales_proveedor(current_setting('t.prov')::uuid)) h where h ->> 'producto_id' = current_setting('t.p1'));`,
  (s) => /^t\|1\|(6|4)\|1$/.test(s),
);

caso(
  "proveedores para comprar: el del catálogo sale con sus categorías y, tras la compra, con una compra",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA()} \\g /dev/null
select p ->> 'compras', (p -> 'categorias') ? current_setting('t.cat')
  from jsonb_array_elements(retail.fn_proveedores_para_comprar()) p where p ->> 'id' = current_setting('t.prov');`,
  "1|t",
);

caso(
  "el papel no se borra ni cambia lo anotado (ni como postgres); su estado sí",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA()} \\g /dev/null
reset role;
select split_part(${intento(`update retail.compra_papeles set monto = 1 where id = '${ID}'`)}, '|', 3),
       split_part(${intento(`delete from retail.compra_papeles where id = '${ID}'`)}, '|', 3),
       ${intento(`update retail.compra_papeles set estado = 'completado' where id = '${ID}'`)};`,
  "Lo que anotó la compradora no cambia: Compras lo corrige al completar el papel.|El papel de una compra no se borra.|SIN_ERROR",
);

caso(
  "una prenda que ya está en una orden de compra es historia: «Eliminar producto» la frena y dice por qué",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA()} \\g /dev/null
${como(FELIPE, null)}
select puede, razon from retail.fn_producto_se_puede_eliminar(current_setting('t.p1')::uuid);`,
  (s) => /^f\|.*líneas de órdenes de compra \(1\)/.test(s),
);

caso(
  "anon no ejecuta ninguna de las tres; la tabla no se lee directo",
  `reset role;
select has_function_privilege('anon', 'retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb)', 'execute'),
       has_function_privilege('anon', 'retail.fn_proveedores_para_comprar()', 'execute'),
       has_function_privilege('anon', 'retail.fn_habituales_proveedor(uuid)', 'execute'),
       has_table_privilege('authenticated', 'retail.compra_papeles', 'select');`,
  "f|f|f|f",
);

caso(
  "la actividad anota la compra sin montos",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA()} \\g /dev/null
reset role;
select modulo, descripcion ~ 'S/' from retail.actividad where accion = 'compra_registrada' and registro_id = '${ID}';`,
  "ordenes_compra|f",
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas) process.exit(1);
