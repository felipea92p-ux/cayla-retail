#!/usr/bin/env node
/**
 * Pruebas de las órdenes de compra (ADR-0362, fase 1) — migración `20261010214500_ordenes_compra_modulo_y_tablas.sql`: el módulo
 * `ordenes_compra`, las tablas `ordenes_compra` / `orden_compra_items` y la lista `retail.fn_ordenes_compra`. CAYLA V2.
 *
 * LO QUE VIGILA. Que una orden no pueda quedar en un estado imposible (un descuento mayor que lo que cuesta la línea, un porcentaje
 * que no cuadra con los soles descontados, una anulación sin motivo, un número repetido); que solo quien tiene el módulo la vea, y
 * que quien lo tiene vea las de TODAS las sedes (decisiones 34 y 37); y que la lista sume bien y filtre lo que dice filtrar.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK).
 *   M  EL MÓDULO: existe en Compras, orden 145, delegable, y nace SIN rol (ningún `rol_modulos`). La migración se vuelve a cargar
 *      sin error (idempotente: así se pega en producción).
 *   P  PUERTAS: Felipe (líder) lee; Micaela, sin el módulo, recibe 42501; con el módulo en su rol, ve también las órdenes de otra
 *      sede; nadie lee las tablas directo (RLS sin políticas) y `anon` no ejecuta la lista.
 *   L  LA LISTA: de la más nueva a la más vieja, con líneas, unidades y total (descuento incluido); filtra por «por repartir», por
 *      tienda, por estado, por proveedor y por texto (número «OC-000012» o proveedor sin tildes); pagina; un destino raro se rechaza.
 *   C  CANDADOS DEL ESQUEMA: descuento mayor que la línea, porcentaje que no cuadra, cantidad 0, posición repetida, anulada sin
 *      motivo, generada con datos de anulación, entrega antes de la emisión, estado desconocido y número repetido.
 *
 * USO
 *   pnpm pruebas:ordenes-compra                         → contra la base `postgres` del stack local
 *   pnpm pruebas:ordenes-compra --base otra             → contra otra base del mismo contenedor
 *   pnpm pruebas:ordenes-compra --contenedor supabase_db_x → contra otro stack (un banco de pruebas propio)
 * La migración se carga dentro de cada caso (idempotente): corre igual con la base al día o sin ella.
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261010214500_ordenes_compra_modulo_y_tablas.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "");

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${sinCandadosDePegado(MIGRACION)}
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

-- Datos propios de la prueba: dos proveedores (uno con tilde, para buscar sin ella), una marca y una categoría.
insert into retail.proveedores (nombre) values ('Confecciones Peña OC Prueba') returning id as prov \\gset
insert into retail.proveedores (nombre) values ('Textiles Norte OC Prueba') returning id as prov2 \\gset
insert into retail.marcas (nombre) values ('OC Marca Prueba') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('OC Polos Prueba', 'indumentaria') returning id as cat \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
${como(FELIPE)}
`;

// Tres órdenes, en este orden: O1 a Trujillo (2 líneas, una con 10 % de descuento), O2 por repartir (otro proveedor) y O3 a
// Trujillo, anulada. Totales: O1 = 10 × 25.50 + (4 × 100 − 40) = 255 + 360 = 615.00; O2 = 3 × 50 = 150.00.
const TRES_ORDENES = `
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'felipe_p')
  returning id as o1, numero as n1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario) values
  (:'o1', 1, :'cat', :'marca', 'Polo básico', 10, 25.50);
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento, descuento_pct) values
  (:'o1', 2, :'cat', :'marca', 4, 100, 40, 10);
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov2', null, :'felipe_p')
  returning id as o2, numero as n2 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario) values
  (:'o2', 1, :'cat', :'marca', 3, 50);
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por, estado, anulada_por, anulada_en, motivo_anulacion)
  values (:'prov', :'tru', :'felipe_p', 'anulada', :'felipe_p', now(), 'Se pidió dos veces') returning id as o3, numero as n3 \\gset
`;

// Solo las órdenes de esta prueba (la base puede tener otras), como «n1,n2,…» en el orden en que vienen.
const MIAS = (llamada) => `(select string_agg(case f.id when :'o1' then 'O1' when :'o2' then 'O2' when :'o3' then 'O3' end, ',')
  from ${llamada} f where f.id in (:'o1', :'o2', :'o3'))`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// M. MÓDULO ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 el módulo está en Compras (orden 145, delegable, no «solo líder») y nace SIN rol",
  `reset role;
   select concat_ws(',', (select grupo || ':' || orden || ':' || delegable || ':' || solo_lider from retail.modulos where clave = 'ordenes_compra'),
     (select count(*) from retail.rol_modulos where modulo = 'ordenes_compra'));`,
  "Compras:145:true:false,0"
);
caso(
  "M2 la migración se vuelve a cargar sin error (idempotente) y no duplica el módulo",
  `${sinCandadosDePegado(MIGRACION)}
   set local search_path = retail, public, extensions;
   select count(*) from retail.modulos where clave = 'ordenes_compra';`,
  "1"
);

// P. PUERTAS --------------------------------------------------------------------------------------------------------------
caso(
  "P1 Felipe (líder) lee la lista; Micaela, sin el módulo, recibe 42501",
  `select pg_temp.intento('select * from retail.fn_ordenes_compra()') as felipe \\gset
   ${como(MICAELA)}
   select :'felipe' || ',' || split_part(pg_temp.intento('select * from retail.fn_ordenes_compra()'), '|', 1);`,
  "SIN_ERROR,42501"
);
caso(
  "P2 con el módulo en su rol, Micaela ve las órdenes de TODAS las sedes (también la por repartir), no solo la suya",
  `${TRES_ORDENES}
   reset role;
   insert into retail.rol_modulos (rol_id, modulo)
     select c.rol_id, 'ordenes_compra' from retail.colaboradores c join public.personas p on p.id = c.persona_id
      where p.auth_user_id = '${MICAELA}';
   ${como(MICAELA)}
   select ${MIAS("retail.fn_ordenes_compra()")};`,
  "O3,O2,O1"
);
caso(
  "P3 nadie lee las tablas directo (RLS sin políticas) y anon no ejecuta la lista",
  `${TRES_ORDENES}
   set local role authenticated;
   select concat_ws(',', (select count(*) from retail.ordenes_compra), (select count(*) from retail.orden_compra_items)) as directo \\gset
   reset role;
   select :'directo' || ',' || has_function_privilege('anon', 'retail.fn_ordenes_compra(text,text,uuid,text,integer,integer)', 'execute');`,
  "0,0,false"
);

// L. LA LISTA -------------------------------------------------------------------------------------------------------------
caso(
  "L1 de la más nueva a la más vieja, con líneas, unidades y total (el 10 % de descuento ya restado)",
  `${TRES_ORDENES}
   select ${MIAS("retail.fn_ordenes_compra()")} || ' / ' ||
     (select lineas || ':' || unidades || ':' || total || ':' || estado || ':' || coalesce(destino_nombre, '-') || ':' || proveedor_nombre
        from retail.fn_ordenes_compra() where id = :'o1') || ' / ' ||
     (select lineas || ':' || unidades || ':' || total || ':' || coalesce(destino_nombre, 'por repartir')
        from retail.fn_ordenes_compra() where id = :'o2');`,
  "O3,O2,O1 / 2:14:615.00:generada:Tienda Trujillo:Confecciones Peña OC Prueba / 1:3:150.00:por repartir"
);
caso(
  "L2 filtra por «por repartir», por tienda, por estado y por proveedor",
  `${TRES_ORDENES}
   select concat_ws(' / ',
     ${MIAS("retail.fn_ordenes_compra(p_destino => 'por_repartir')")},
     ${MIAS("retail.fn_ordenes_compra(p_destino => :'tru')")},
     coalesce(${MIAS("retail.fn_ordenes_compra(p_destino => :'lima')")}, 'ninguna'),
     ${MIAS("retail.fn_ordenes_compra(p_estado => 'generada')")},
     ${MIAS("retail.fn_ordenes_compra(p_estado => 'anulada')")},
     ${MIAS("retail.fn_ordenes_compra(p_proveedor_id => :'prov2')")});`,
  "O2 / O3,O1 / ninguna / O2,O1 / O3 / O2"
);
caso(
  "L3 busca por número («OC-000012», «oc 12», «12») y por proveedor sin tildes ni mayúsculas",
  `${TRES_ORDENES}
   select concat_ws(' / ',
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => format('OC-%s', lpad(:'n2', 6, '0')))")},
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => format('oc %s', :'n2'))")},
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => :'n1')")},
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => 'pena oc prueba')")},
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => 'PEÑA OC PRUEBA')")},
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => 'textiles norte oc')")});`,
  "O2 / O2 / O1 / O3,O1 / O3,O1 / O2"
);
caso(
  "L4 pagina: de a 2 trae las dos más nuevas, y «antes de» la segunda trae la que sigue",
  `${TRES_ORDENES}
   select concat_ws(' / ',
     (select string_agg(case f.id when :'o1' then 'O1' when :'o2' then 'O2' when :'o3' then 'O3' else 'otra' end, ',')
        from retail.fn_ordenes_compra(p_busqueda => 'oc prueba', p_limite => 2) f),
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => 'oc prueba', p_antes_de => :'n2')")});`,
  "O3,O2 / O1"
);
caso(
  "L5 un destino que no es «por_repartir» ni un id se rechaza con su motivo",
  `select split_part(pg_temp.intento($$select * from retail.fn_ordenes_compra(p_destino => 'lima')$$), '|', 2);`,
  "Ese destino no se entiende"
);

// C. CANDADOS DEL ESQUEMA -------------------------------------------------------------------------------------------------
caso(
  "C1 lo imposible no se guarda: descuento mayor que la línea, % que no cuadra, cantidad 0, posición repetida",
  `${TRES_ORDENES}
   reset role;
   select concat_ws(',',
     split_part(pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento) values (%L, 9, %L, %L, 2, 10, 20.01)', :'o2', :'cat', :'marca')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento, descuento_pct) values (%L, 9, %L, %L, 1, 100, 5, 10)', :'o2', :'cat', :'marca')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario) values (%L, 9, %L, %L, 0, 10)', :'o2', :'cat', :'marca')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario) values (%L, 1, %L, %L, 1, 10)', :'o2', :'cat', :'marca')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento, descuento_pct) values (%L, 9, %L, %L, 3, 33.33, 10.00, 10)', :'o2', :'cat', :'marca')), '|', 1));`,
  "23514,23514,23514,23505,SIN_ERROR"
);
caso(
  "C2 la cabecera tampoco: anulada sin motivo, generada con datos de anulación, entrega antes de la emisión, estado raro, número repetido",
  `${TRES_ORDENES}
   reset role;
   select concat_ws(',',
     split_part(pg_temp.intento(format('update retail.ordenes_compra set estado = %L, anulada_por = %L, anulada_en = now() where id = %L', 'anulada', :'felipe_p', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_compra set anulada_en = now() where id = %L', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_compra set fecha_entrega_estimada = fecha_emision - 1 where id = %L', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_compra set estado = %L where id = %L', 'perdida', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_compra set numero = %s where id = %L', :'n2', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_compra set fecha_entrega_estimada = fecha_emision where id = %L', :'o1')), '|', 1));`,
  "23514,23514,23514,23514,23505,SIN_ERROR"
);

console.log(`\n${casos - fallas}/${casos} casos bien`);
if (fallas > 0) process.exit(1);
