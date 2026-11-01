#!/usr/bin/env node
/**
 * Pruebas del cierre «ya estaba registrada» (ADR-0551, decisión C y actividad 3; Felipe 2026-10-31) — migración
 * `20261031171000_produccion_cierre_ya_estaba_en_stock.sql`, sobre el cierre vivo de `cerrar_produccion`. CAYLA V2.
 *
 * LO QUE VIGILA. Que una orden marcada «ya estaba» cierre con todo lo de siempre (buenas por talla, estado, costo de la orden) pero SIN tocar el
 * stock: ninguna fila en `movimientos`, el stock del Taller y de la sede igual que antes, `variantes.costo` sin moverse e `inventariado_at` nulo. Que solo un
 * líder la marque, solo en proceso y nunca una muestra (también en el esquema, con un CHECK). Que no se pueda declarar «ya estaba» de lo que nunca se
 * registró (`ya_estaba_sin_registro`, y que lo rechazado no deje nada escrito). Que desmarcar devuelva el cierre de siempre y que «Revertir» no
 * descuente un stock que nunca entró. Que el cierre normal no cambie.
 *
 * USO
 *   node scripts/pruebas/produccion_ya_estaba.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_ya_estaba.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_ya_estaba.mjs --base otra                 → contra otra base del mismo contenedor
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
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261031171000_produccion_cierre_ya_estaba_en_stock.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// El lote se mide contra lo que la base YA tiene registrado del modelo (el seed trae 26 por variante; una base de desarrollo usada, más): tiene que ser mayor, o «sin nada
// registrado» nunca fallaría. Sale de la propia base, no de un número fijo.
const BASE_REGISTRADA = Number(
  correr(`select coalesce(max(r), 0) from (
    select coalesce((select sum(m.cantidad) from retail.movimientos m where m.variante_id = v.id and (m.tipo = 'entrada' or (m.tipo = 'ajuste' and m.cantidad > 0))), 0) as r
      from retail.variantes v where v.producto_id = (
        select p.id from retail.productos p
         where p.es_prueba is not true and p.estado <> 'descontinuado'
           and (select count(distinct v2.color_codigo) from retail.variantes v2 where v2.producto_id = p.id and v2.activo and v2.color_codigo is not null) >= 2
         order by p.created_at limit 1) and v.activo
  ) x;`).salida
);
const LOTE = Math.max(60, BASE_REGISTRADA + 40); // prendas de cada color
const TOTAL = LOTE * 2;
// Costo de la orden: 10.00 por prenda (el costo vigente de la prenda se fija en 8.00: dentro de lo normal, y distinto para ver si se mueve).
const TELA = LOTE * 16;
const AVIOS = LOTE * 4;

// Envolturas que nunca abortan el caso: devuelven «OK» o «<sqlstate>|<hint>|<mensaje>» (una subtransacción: el error deshace lo que esa llamada escribió).
const ENVOLTURAS = `
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
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, null) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK:' || v_fila.numero;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_avance(p_fase, p_lineas, null);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.cierra(p_oid uuid, p_buenas jsonb, p_tela numeric default null, p_avios numeric default null, p_maquila numeric default null, p_confirma boolean default false) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.cerrar_produccion(p_oid, p_buenas, p_tela, p_avios, p_maquila, p_confirma);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.revierte(p_oid uuid) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.revertir_produccion(p_oid);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.marca(p_oid uuid, p_si boolean) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.marcar_orden_ya_en_stock(p_oid, p_si);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

// Datos propios: el modelo del seed con dos colores distintos (v1 y v2), el Taller y Tienda Trujillo.
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as sub_tru from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
update retail.variantes set costo = 8.00 where id in (:'v1', :'v2');
${como(FELIPE)}
`;

const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const ESPINA_TALLER = `jsonb_build_array(${TALLER("corte")}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const APERTURA = (muestra) => `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', ${muestra}, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '${LOTE}'), jsonb_build_object('variante_id', :'v2', 'cantidad', '${LOTE}')))`;
// [[variante, cantidad], …] → [{variante_id, cantidad}, …]
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;

// Una orden de LOTE y LOTE con sus tres pasos hechos (LOTE es más que lo que ya hay registrado por variante): lista para pasar al stock. Deja :oid.
const ORDEN_LISTA = `select pg_temp.abre(${APERTURA(false)}, ${ESPINA_TALLER}) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
   select id as f_acab from retail.produccion_fases where produccion_id = :'oid' and clave = 'acabado' \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", LOTE], ["v2", LOTE])}) as a0 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", LOTE], ["v2", LOTE])}) as a1 \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", LOTE], ["v2", LOTE])}) as a2 \\gset`;
// Lo que la tienda ya tenía registrado antes de abrir la orden: ajustes «Encontré prendas» (como el Chaleco en Tienda Trujillo).
const REGISTRADO_EN_TRU = (n1, n2) => `
   insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
     values (:'v1', :'tru', :'sub_tru', 'ajuste', ${n1}, 'reposicion', 'Encontré prendas de prueba') returning id as mt1 \\gset
   insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
     values (:'v2', :'tru', :'sub_tru', 'ajuste', ${n2}, 'reposicion', 'Encontré prendas de prueba') returning id as mt2 \\gset
   select retail.fn_aplicar_movimiento(:'mt1') as _t1, retail.fn_aplicar_movimiento(:'mt2') as _t2 \\gset`;

const MOV_DE_LA_ORDEN = `(select count(*) from retail.movimientos where produccion_id = :'oid')`;
const ESTADO = `(select estado from retail.producciones where id = :'oid')`;
const INGRESO = `(select ingreso_al_stock from retail.producciones where id = :'oid')`;
const STOCK = (v, u) => `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'${v}' and ubicacion_id = :'${u}')`;
const COSTO_VARIANTE = (v) => `(select costo from retail.variantes where id = :'${v}')`;

let fallas = 0;
let casos = 0;
function anotar(nombre, bien, esperado, obtenido) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  anotar(nombre, bien, typeof esperado === "function" ? "(condición)" : esperado, obtenido);
}

// M. LA MIGRACIÓN ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 la migración se vuelve a cargar sin error (idempotente): la columna, su CHECK y las dos funciones nuevas, una cada una; cerrar_produccion sigue siendo una",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws(',',
     (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'producciones' and column_name = 'ingreso_al_stock'),
     (select count(*) from pg_constraint where conrelid = 'retail.producciones'::regclass and conname = 'producciones_ingreso_al_stock_valido'),
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('marcar_orden_ya_en_stock', 'fn_produccion_exigir_ya_registrada')),
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'cerrar_produccion'));`,
  "1,1,2,1"
);

// Y. LA MARCA ------------------------------------------------------------------------------------------------------------------
caso(
  "Y1 una orden nace «movimiento» (lo de siempre); un líder la marca y la desmarca, y cada cambio queda en Actividad",
  `${ORDEN_LISTA}
   select ${INGRESO} as nace \\gset
   select pg_temp.marca(:'oid', true) as m1 \\gset
   select ${INGRESO} as marcada \\gset
   select pg_temp.marca(:'oid', true) as m_repetida \\gset
   select pg_temp.marca(:'oid', false) as m2 \\gset
   select concat_ws(',', :'nace', :'m1', :'marcada', :'m_repetida', :'m2', ${INGRESO},
     (select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = 'produccion_ya_en_stock'));`,
  "movimiento,OK,ya_estaba,OK,OK,movimiento,2"
);
caso(
  "Y2 quien no es líder no la marca (42501) y la orden queda como estaba",
  `${ORDEN_LISTA}
   ${como(MICAELA)}
   select pg_temp.marca(:'oid', true) as m \\gset
   select concat_ws(',', split_part(:'m', '|', 1), ${INGRESO});`,
  "42501,movimiento"
);
caso(
  "Y3 una muestra no se marca (muestra_sin_stock) y el esquema tampoco la deja quedar «ya estaba» (CHECK 23514)",
  `select pg_temp.abre(${APERTURA(true)}, ${ESPINA_TALLER}) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select pg_temp.marca(:'oid', true) as m \\gset
   select pg_temp.intento('update retail.producciones set ingreso_al_stock = ''ya_estaba'' where id = ''' || :'oid' || '''') as ch \\gset
   select concat_ws(',', pg_temp.eh(:'m'), split_part(:'ch', '|', 1), ${INGRESO});`,
  "P0001|muestra_sin_stock,23514,movimiento"
);
caso(
  "Y4 un valor inventado tampoco entra al esquema (CHECK)",
  `${ORDEN_LISTA}
   select pg_temp.intento('update retail.producciones set ingreso_al_stock = ''en_camino'' where id = ''' || :'oid' || '''') as ch \\gset
   select split_part(:'ch', '|', 1);`,
  "23514"
);

// C. EL CIERRE «YA ESTABA» -----------------------------------------------------------------------------------------------------
caso(
  "C1 cierra con todo lo de siempre y SIN tocar el stock: ni una fila en movimientos, el Taller y la tienda igual, variantes.costo sin moverse, inventariado_at nulo; el costo queda en la orden",
  `${ORDEN_LISTA}
   ${REGISTRADO_EN_TRU(LOTE, LOTE)}
   select ${STOCK("v1", "taller")} as t_antes, ${STOCK("v1", "tru")} as tru_antes, ${COSTO_VARIANTE("v1")} as costo_antes \\gset
   select (select count(*) from retail.movimientos) as movs_antes \\gset
   select pg_temp.marca(:'oid', true) as m \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}, ${TELA}, ${AVIOS}, 0) as c \\gset
   select concat_ws(',', :'m', :'c', ${ESTADO}, ${INGRESO},
     (select cantidad_buenas from retail.producciones where id = :'oid'),
     (select costo_unitario from retail.producciones where id = :'oid'),
     (select inventariado_at is null from retail.producciones where id = :'oid'),
     ${MOV_DE_LA_ORDEN},
     (select count(*) from retail.movimientos) - :movs_antes,
     ${STOCK("v1", "taller")} - :t_antes, ${STOCK("v1", "tru")} - :tru_antes,
     ${COSTO_VARIANTE("v1")} - :costo_antes);`,
  `OK,OK,terminada,ya_estaba,${TOTAL},10.00,t,0,0,0,0,0.00`
);
caso(
  "C2 un segundo cierre se rechaza como siempre (ya está cerrada) y tampoco escribe nada",
  `${ORDEN_LISTA}
   ${REGISTRADO_EN_TRU(LOTE, LOTE)}
   select pg_temp.marca(:'oid', true) as m \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}, ${TELA}, ${AVIOS}, 0) as c1 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}, ${TELA}, ${AVIOS}, 0) as c2 \\gset
   select concat_ws(',', :'c1', split_part(:'c2', '|', 1), ${MOV_DE_LA_ORDEN});`,
  "OK,P0001,0"
);
caso(
  "C3 sin nada registrado antes, no se puede declarar «ya estaba» (ya_estaba_sin_registro): la orden sigue en proceso y no queda ni una buena escrita",
  `${ORDEN_LISTA}
   select pg_temp.marca(:'oid', true) as m \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}, ${TELA}, ${AVIOS}, 0) as c \\gset
   select concat_ws(',', pg_temp.eh(:'c'), ${ESTADO}, ${INGRESO},
     (select count(*) from retail.produccion_lineas where produccion_id = :'oid' and cantidad_buenas is not null), ${MOV_DE_LA_ORDEN});`,
  "P0001|ya_estaba_sin_registro,en_proceso,ya_estaba,0,0"
);
caso(
  "C4 registrado de más en un color pero de menos en otro: se rechaza por el que falta, con su talla y color en el mensaje",
  `${ORDEN_LISTA}
   ${REGISTRADO_EN_TRU(LOTE, 10)}
   select pg_temp.marca(:'oid', true) as m \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}, ${TELA}, ${AVIOS}, 0) as c \\gset
   select concat_ws(',', pg_temp.eh(:'c'), :'c' like '%marcaste ${LOTE} buenas%solo se registraron%', ${ESTADO});`,
  "P0001|ya_estaba_sin_registro,t,en_proceso"
);
caso(
  "C5 pasar menos buenas de las registradas está bien (el tope es hacia arriba): LOTE-10 y LOTE-20 con LOTE y LOTE registradas",
  `${ORDEN_LISTA}
   ${REGISTRADO_EN_TRU(LOTE, LOTE)}
   select pg_temp.marca(:'oid', true) as m \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE - 10], ["v2", LOTE - 20])}, ${TELA}, ${AVIOS}, 0) as c \\gset
   select concat_ws(',', :'c', ${ESTADO}, (select cantidad_buenas from retail.producciones where id = :'oid'), ${MOV_DE_LA_ORDEN});`,
  `OK,terminada,${TOTAL - 30},0`
);

caso(
  "C6 una orden «ya estaba» con costo CERO cierra sin la pregunta del costo atípico (esa pregunta cuida el promedio de la prenda, que aquí no se toca); la misma orden sin marca sí pregunta",
  `${ORDEN_LISTA}
   ${REGISTRADO_EN_TRU(LOTE, LOTE)}
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}) as c_normal \\gset
   select pg_temp.marca(:'oid', true) as m \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}) as c_ya \\gset
   select concat_ws(',', split_part(:'c_normal', '|', 3), :'c_ya', ${ESTADO}, ${INGRESO}, ${MOV_DE_LA_ORDEN});`,
  "costo_atipico,OK,terminada,ya_estaba,0"
);

// D. DESMARCAR Y EL CIERRE DE SIEMPRE ------------------------------------------------------------------------------------------
caso(
  "D1 desmarcada, la orden cierra como siempre: una entrada por talla y color al Taller, el stock sube y el costo real entra al promedio de la prenda",
  `${ORDEN_LISTA}
   ${REGISTRADO_EN_TRU(LOTE, LOTE)}
   select ${STOCK("v1", "taller")} as t_antes, ${COSTO_VARIANTE("v1")} as costo_antes \\gset
   select pg_temp.marca(:'oid', true) as m1 \\gset
   select pg_temp.marca(:'oid', false) as m2 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}, ${TELA}, ${AVIOS}, 0) as c \\gset
   select concat_ws(',', :'c', ${ESTADO}, ${INGRESO}, (select inventariado_at is not null from retail.producciones where id = :'oid'),
     ${MOV_DE_LA_ORDEN}, ${STOCK("v1", "taller")} - :t_antes, ${COSTO_VARIANTE("v1")} <> :costo_antes);`,
  `OK,terminada,movimiento,t,2,${LOTE},t`
);
caso(
  "D2 una orden que nunca se marcó cierra igual que antes (sin la casilla): 2 entradas, todas las prendas, y el tope de cordura ni se pregunta",
  `${ORDEN_LISTA}
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}, ${TELA}, ${AVIOS}, 0) as c \\gset
   select concat_ws(',', :'c', ${ESTADO}, ${INGRESO}, ${MOV_DE_LA_ORDEN},
     (select sum(cantidad) from retail.movimientos where produccion_id = :'oid' and tipo = 'entrada'));`,
  `OK,terminada,movimiento,2,${TOTAL}`
);
caso(
  "D3 una orden cerrada ya no se marca (orden_cerrada)",
  `${ORDEN_LISTA}
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}, ${TELA}, ${AVIOS}, 0) as c \\gset
   select pg_temp.marca(:'oid', true) as m \\gset
   select concat_ws(',', :'c', pg_temp.eh(:'m'), ${INGRESO});`,
  "OK,P0001|orden_cerrada,movimiento"
);

// R. REVERTIR ------------------------------------------------------------------------------------------------------------------
caso(
  "R1 revertir una orden «ya estaba» la reabre SIN descontar un stock que nunca entró (cero movimientos, cero stock movido) y la deja «movimiento»",
  `${ORDEN_LISTA}
   ${REGISTRADO_EN_TRU(LOTE, LOTE)}
   select ${STOCK("v1", "taller")} as t_antes, ${STOCK("v1", "tru")} as tru_antes \\gset
   select pg_temp.marca(:'oid', true) as m \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}, ${TELA}, ${AVIOS}, 0) as c \\gset
   select pg_temp.revierte(:'oid') as rv \\gset
   select concat_ws(',', :'c', :'rv', ${ESTADO}, ${INGRESO}, ${MOV_DE_LA_ORDEN},
     ${STOCK("v1", "taller")} - :t_antes, ${STOCK("v1", "tru")} - :tru_antes,
     (select cantidad_buenas is null from retail.producciones where id = :'oid'));`,
  "OK,OK,en_proceso,movimiento,0,0,0,t"
);
caso(
  "R2 revertir una orden normal sigue devolviendo el stock (2 salidas de reversión) y también queda «movimiento»",
  `${ORDEN_LISTA}
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}, ${TELA}, ${AVIOS}, 0) as c \\gset
   select pg_temp.revierte(:'oid') as rv \\gset
   select concat_ws(',', :'c', :'rv', ${ESTADO}, ${INGRESO},
     (select count(*) from retail.movimientos where produccion_id = :'oid' and motivo = 'reversion_produccion' and tipo = 'salida'));`,
  "OK,OK,en_proceso,movimiento,2"
);

// L. LO QUE LA PANTALLA LEE ----------------------------------------------------------------------------------------------------
caso(
  "L1 la lectura de la orden dice cómo entra al stock (ingreso_al_stock), antes y después de marcarla",
  `${ORDEN_LISTA}
   select retail.fn_orden_produccion(:'oid') -> 'orden' ->> 'ingreso_al_stock' as antes \\gset
   select pg_temp.marca(:'oid', true) as m \\gset
   select retail.fn_orden_produccion(:'oid') -> 'orden' ->> 'ingreso_al_stock' as despues \\gset
   select concat_ws(',', :'antes', :'despues');`,
  "movimiento,ya_estaba"
);

// F. LA FORMA -------------------------------------------------------------------------------------------------------------------
caso(
  "F1 la forma: marcar es security definer con search_path, abierta a la cuenta y cerrada a anon; el tope de cordura, cerrado a la API; cerrar y revertir siguen siendo security definer y de una firma",
  `reset role;
   select concat_ws(',',
     (select p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%' from pg_proc p where p.oid = 'retail.marcar_orden_ya_en_stock(uuid, boolean)'::regprocedure),
     has_function_privilege('authenticated', 'retail.marcar_orden_ya_en_stock(uuid, boolean)', 'execute'),
     has_function_privilege('anon', 'retail.marcar_orden_ya_en_stock(uuid, boolean)', 'execute'),
     has_function_privilege('authenticated', 'retail.fn_produccion_exigir_ya_registrada(uuid)', 'execute') or has_function_privilege('anon', 'retail.fn_produccion_exigir_ya_registrada(uuid)', 'execute'),
     (select bool_and(p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('cerrar_produccion', 'revertir_produccion')),
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('cerrar_produccion', 'revertir_produccion')));`,
  "t,t,f,f,t,2"
);

// I. LA INVARIANTE QUE UN CHECK NO PUEDE ESCRIBIR ----------------------------------------------------------------------------------------
caso(
  "I1 ninguna orden «ya estaba» tiene entradas de producción ni inventariado_at: ni las de esta prueba ni las que ya hubiera en la base",
  `${ORDEN_LISTA}
   ${REGISTRADO_EN_TRU(LOTE, LOTE)}
   select pg_temp.marca(:'oid', true) as m \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", LOTE], ["v2", LOTE])}, ${TELA}, ${AVIOS}, 0) as c \\gset
   select count(*) from retail.producciones p
    where p.ingreso_al_stock = 'ya_estaba' and p.estado = 'terminada'
      and (p.inventariado_at is not null or exists (select 1 from retail.movimientos m where m.produccion_id = p.id and m.motivo = 'produccion'));`,
  "0"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
