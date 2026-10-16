#!/usr/bin/env node
/**
 * Pruebas del avance de una fase, la Salida a un servicio, su Vuelta y la orden en una sola lectura (ADR-0400, actividades 3 y 4) —
 * migración `20261014155000_produccion_avance_salida_y_vuelta.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que «Terminé N» solo se anote dentro de lo que de verdad entró a la fase, POR TALLA Y COLOR (el plan × 1,10 en el corte; lo
 * terminado en la fase anterior en las demás); que un Deshacer sea una fila nueva y solo del último avance vivo de su talla y color, una vez, y
 * mientras la fase siguiente no haya usado esas prendas; que una Salida no mande más de lo que hay y una Vuelta no devuelva más de lo que salió
 * (con el motivo de lo que no volvió bueno); que lo que vuelve bueno haga avanzar la fase y devengue al servicio; que NADA de esto toque
 * `movimientos`, `movimientos_insumo` ni `stock`; que lo rechazado no deje NADA escrito; que solo quien ve `produccion` parado en ese Taller (o el
 * líder) opere y lea; y que la orden entera llegue en UNA lectura con la forma que la página necesita.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las dos migraciones se cargan dentro de cada caso).
 *   M  LA MIGRACIÓN: se vuelve a cargar sin error.
 *   AV AVANCE: lo normal (fase, por variante, fila, actividad); excede (y el límite exacto); variante ajena; fase de servicio; cantidades inválidas;
 *      una línea mala no deja escrita la buena.
 *   D  DESHACER: la fila negativa; solo el último; una sola vez; no se deshace un deshacer ni una vuelta; no si la fase siguiente ya lo usó.
 *   S  SALIDA: la normal (guía, afuera, actividad); excede por talla (y el límite exacto); fase del Taller; antes de cortar; ajena; inválida.
 *   V  VUELTA: la normal (buenas + faltantes, devengado, avance de vuelta, actividad); excede; sin motivo; validaciones; el flujo completo con
 *      faltantes cierra las fases; Acabado avanza solo con lo que vuelve.
 *   NS NADA TOCA EL STOCK ni los libros: movimientos, movimientos_insumo y stock iguales antes y después de un flujo completo.
 *   T  ORDEN CERRADA: ninguna de las cuatro opera sobre una orden anulada.
 *   P  PUERTAS: sin el módulo → 42501; con el módulo pero parada en Trujillo → 42501; lectura ajena → NULL.
 *   O  LA ORDEN EN UNA LECTURA: la forma completa, los costos del líder, la línea de tiempo del más nuevo al más viejo.
 *   I  EL CANDADO: las cuatro de escritura toman el candado por orden.
 *   F  LA FORMA: las 5 públicas, security definer con search_path, authenticated sí y anon no; las 7 internas, cerradas.
 *
 * USO
 *   node scripts/pruebas/produccion_avances.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_avances.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_avances.mjs --base otra                 → contra otra base del mismo contenedor
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
const leer = (nombre) => sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8"));
const MIGRACION_FASES = leer("20261014154000_produccion_fases_y_tela_de_la_orden.sql");
const MIGRACION = leer("20261014155000_produccion_avance_salida_y_vuelta.sql");

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

// Envolturas que nunca abortan el caso: devuelven «OK» o «<sqlstate>|<hint>|<mensaje>». Un error dentro de una envoltura deshace lo que
// esa llamada escribió (es una subtransacción), igual que lo haría la transacción propia de una RPC.
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
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb, p_insumos jsonb default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, p_insumos) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK:' || v_fila.numero;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_avance(p_fase, p_lineas, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.deshace(p_avance uuid) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.deshacer_avance(p_avance);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.sale(p_fase uuid, p_lineas jsonb, p_guia text default null, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_salida(p_fase, p_lineas, p_guia, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.vuelve(p_fase uuid, p_lineas jsonb, p_guia text default null, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_vuelta(p_fase, p_lineas, p_guia, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

// Datos propios: un proveedor de maquila, lino (tela, 5 % de merma) y el modelo del seed con sus variantes (dos colores distintos).
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION_FASES}
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Confecciones Avances Prueba', 'maquila') returning id as maquila \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('AV-LINO', 'Lino Avances Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
select v.id as v_ajena from retail.variantes v where v.producto_id <> :'prod' and v.activo order by v.id limit 1 \\gset
${como(FELIPE)}
`;

// La apertura de siempre: 30 del primer color (v1) y 20 del segundo (v2), entrega en 10 días.
const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const COSTURA_AFUERA = FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_id: `:'maquila'`, tarifa_prenda: `'4.50'`, cantidad_minima: `'50'`,
  fecha_prometida: `(retail.fn_hoy_lima() + 7)::text` });
const ESPINA = `jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA}, ${TALLER("acabado")})`;
const ESPINA_TALLER = `jsonb_build_array(${TALLER("corte")}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const LINO = `jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'color_codigo', :'c1', 'consumo_por_prenda', '1.2'))`;

// La orden abierta y los ids que todos los casos usan: :oid, :f_corte, :f_cost, :f_acab.
const ORDEN = (fases = ESPINA, insumos = "null") => `
select pg_temp.abre(${APERTURA}, ${fases}, ${insumos}) as r \\gset
select id as oid from pg_temp.ultima \\gset
select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
select id as f_acab from retail.produccion_fases where produccion_id = :'oid' and clave = 'acabado' \\gset
`;
// [[variante, cantidad], …] → [{variante_id, cantidad}, …]
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
// Una línea de Vuelta.
const VL = (v, buenas, segundas, faltantes, motivo) =>
  `jsonb_build_object('variante_id', :'${v}', 'buenas', '${buenas}', 'segundas', '${segundas}', 'faltantes', '${faltantes}', 'motivo', ${motivo ? `'${motivo}'` : "null"})`;
// Un campo de una fase de un jsonb de fases (lo que devuelven las funciones de escritura): FASE_DE(:'j'::jsonb, 'corte', ['estado', 'hechas']).
const FASE_DE = (j, clave, campos) =>
  `(select ${campos.map((c) => `coalesce(f ->> '${c}', '-')`).join(" || ':' || ")} from jsonb_array_elements(${j}) f where f ->> 'clave' = '${clave}')`;
// Un campo de una fase DE LA LECTURA ÚNICA, por variante.
const POR_VARIANTE = (clave, v, campos) =>
  `(select ${campos.map((c) => `coalesce(pv ->> '${c}', '-')`).join(" || ':' || ")} from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'fases') f, jsonb_array_elements(f -> 'por_variante') pv
     where f ->> 'clave' = '${clave}' and (pv ->> 'variante_id')::uuid = :'${v}')`;
const ACTIVIDAD = (accion, patron) =>
  `(select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = '${accion}' and a.descripcion like '${patron}')`;
const FILAS_AVANCE = (fase, extra = "") => `(select count(*) from retail.produccion_avances where fase_id = :'${fase}' ${extra})`;

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
  "M1 la migración se vuelve a cargar sin error (idempotente) y las 5 públicas siguen siendo una cada una",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname in ('registrar_avance','deshacer_avance','registrar_salida','registrar_vuelta','fn_orden_produccion','fn_fases_de_orden');`,
  "6"
);

// AV. AVANCE --------------------------------------------------------------------------------------------------------------------
caso(
  "AV1 «Terminé 20» de Negro en Corte: la fase queda en curso 20/50 (0 días, no -1), el corte de esa talla y color admite hasta 33 (30 × 1,10 hacia arriba), la fila es del Taller y firmada, y la actividad no lleva montos",
  `${ORDEN()}
   select retail.registrar_avance(:'f_corte', ${L(["v1", 20])}, 'primer tendido') as j \\gset
   select concat_ws(',',
     ${FASE_DE(`:'j'::jsonb`, "corte", ["estado", "hechas", "entrada", "dias_en_fase", "actual"])},
     ${POR_VARIANTE("corte", "v1", ["entrada", "hechas", "salieron", "afuera"])},
     ${POR_VARIANTE("corte", "v2", ["entrada", "hechas", "salieron", "afuera"])},
     (select origen || ':' || (hecho_por = :'felipe_p') || ':' || nota from retail.produccion_avances where fase_id = :'f_corte'),
     ${ACTIVIDAD("produccion_avance", "terminó 20 prendas de Corte de la OP-%")});`,
  "en_curso:20:50:0:true,33:20:0:0,22:0:0:0,taller:true:primer tendido,1"
);
caso(
  "AV2 el límite exacto: 20 + 13 = 33 entra; 14 más (o 1 después) excede con la frase que dice cuánto; lo rechazado no deja nada escrito",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 14])}) as a2 \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 13])}) as a3 \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 1])}) as a4 \\gset
   select concat_ws(',', :'a1', pg_temp.eh(:'a2'),
     :'a2' like '%En Corte el plan de % es 30 (hasta 33 cortando de más) y ya terminaste 20: no puedes terminar 14 más',
     :'a3', pg_temp.eh(:'a4'), ${FILAS_AVANCE("f_corte")}, (select sum(cantidad) from retail.produccion_avances where fase_id = :'f_corte'));`,
  "OK,P0001|avance_excede,t,OK,P0001|avance_excede,2,33"
);
caso(
  "AV3 una talla y color que no es de la orden no avanza (avance_variante_ajena) y no deja nada",
  `${ORDEN()}
   select pg_temp.eh(pg_temp.avanza(:'f_corte', ${L(["v_ajena", 5])})) as r1 \\gset
   select concat_ws(',', :'r1', ${FILAS_AVANCE("f_corte")});`,
  "P0001|avance_variante_ajena,0"
);
caso(
  "AV4 una fase de servicio no avanza con «Terminé»: avanza por la Vuelta (fase_de_servicio, con el nombre del servicio)",
  `${ORDEN()}
   select pg_temp.avanza(:'f_cost', ${L(["v1", 5])}) as a \\gset
   select concat_ws(',', split_part(:'a', '|', 1) || '|' || split_part(:'a', '|', 2), :'a' like '%Costura%Confecciones Avances Prueba%', ${FILAS_AVANCE("f_cost")});`,
  "P0001|fase_de_servicio,t,0"
);
caso(
  "AV5 cantidad 0, negativa, con decimales, texto o sin cantidad; sin líneas; una talla repetida; y una línea buena junto a una que excede: ninguna queda escrita",
  `${ORDEN()}
   select concat_ws(',',
     pg_temp.eh(pg_temp.avanza(:'f_corte', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '0')))),
     pg_temp.eh(pg_temp.avanza(:'f_corte', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '-5')))),
     pg_temp.eh(pg_temp.avanza(:'f_corte', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '2.5')))),
     pg_temp.eh(pg_temp.avanza(:'f_corte', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 'abc')))),
     pg_temp.eh(pg_temp.avanza(:'f_corte', jsonb_build_array(jsonb_build_object('variante_id', :'v1')))),
     pg_temp.eh(pg_temp.avanza(:'f_corte', '[]'::jsonb)),
     pg_temp.eh(pg_temp.avanza(:'f_corte', ${L(["v1", 5], ["v1", 6])})),
     pg_temp.eh(pg_temp.avanza(:'f_corte', ${L(["v1", 5], ["v2", 99])}))) as r1 \\gset
   select :'r1' || ',' || ${FILAS_AVANCE("f_corte")};`,
  "P0001|avance_cantidad_invalida,P0001|avance_cantidad_invalida,P0001|avance_cantidad_invalida,P0001|avance_cantidad_invalida,P0001|avance_cantidad_invalida,P0001|avance_sin_lineas,P0001|avance_variante_repetida,P0001|avance_excede,0"
);

// D. DESHACER -------------------------------------------------------------------------------------------------------------------
caso(
  "D1 deshacer el último avance escribe una fila NEGATIVA que apunta al avance (la anterior no se borra): hechas 0, dos filas, y la actividad lo cuenta",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 20])}) as a \\gset
   select id as av from retail.produccion_avances where fase_id = :'f_corte' \\gset
   select retail.deshacer_avance(:'av') as j \\gset
   select concat_ws(',',
     ${FASE_DE(`:'j'::jsonb`, "corte", ["estado", "hechas"])},
     (select cantidad || ':' || origen || ':' || (deshace_id = :'av') from retail.produccion_avances where fase_id = :'f_corte' and origen = 'deshacer'),
     ${FILAS_AVANCE("f_corte")},
     ${ACTIVIDAD("produccion_avance_deshecho", "deshizo 20 prendas terminadas de Corte de la OP-%")});`,
  "en_curso:0,-20:deshacer:true,2,1"
);
caso(
  "D2 con dos avances de la misma talla y color solo se deshace el último: el primero primero no (deshacer_no_es_el_ultimo); en orden, los dos sí",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 10])}) as a2 \\gset
   select id as av1 from retail.produccion_avances where fase_id = :'f_corte' and cantidad = 20 \\gset
   select id as av2 from retail.produccion_avances where fase_id = :'f_corte' and cantidad = 10 \\gset
   select pg_temp.deshace(:'av1') as u1 \\gset
   select hechas from (select coalesce(sum(cantidad), 0) as hechas from retail.produccion_avances where fase_id = :'f_corte') x \\gset
   select pg_temp.deshace(:'av2') as u2 \\gset
   select pg_temp.deshace(:'av1') as u3 \\gset
   select concat_ws(',', pg_temp.eh(:'u1'), :'u1' like 'P0001|deshacer_no_es_el_ultimo|Solo se deshace el último avance de % en Corte%', :'hechas', :'u2', :'u3',
     (select coalesce(sum(cantidad), 0) from retail.produccion_avances where fase_id = :'f_corte'));`,
  "P0001|deshacer_no_es_el_ultimo,t,30,OK,OK,0"
);
caso(
  "D3 deshacer dos veces el mismo avance (deshacer_ya_hecho), deshacer un Deshacer (deshacer_origen) y uno que no existe (avance_inexistente)",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 20])}) as a \\gset
   select id as av from retail.produccion_avances where fase_id = :'f_corte' \\gset
   select pg_temp.deshace(:'av') as u1 \\gset
   select pg_temp.deshace(:'av') as u2 \\gset
   select id as neg from retail.produccion_avances where fase_id = :'f_corte' and origen = 'deshacer' \\gset
   select concat_ws(',', :'u1', pg_temp.eh(:'u2'), pg_temp.eh(pg_temp.deshace(:'neg')), pg_temp.eh(pg_temp.deshace(gen_random_uuid())), ${FILAS_AVANCE("f_corte")});`,
  "OK,P0001|deshacer_ya_hecho,P0001|deshacer_origen,P0001|avance_inexistente,2"
);
caso(
  "D4 no se deshacen las prendas que ya salieron a la fase siguiente (deshacer_ya_avanzo, con el nombre de la fase)",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30])}) as a \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 20])}, '001-1') as s \\gset
   select id as av from retail.produccion_avances where fase_id = :'f_corte' \\gset
   select pg_temp.deshace(:'av') as u \\gset
   select concat_ws(',', pg_temp.eh(:'u'), :'u' like '%ya pasaron a Costura%', (select sum(cantidad) from retail.produccion_avances where fase_id = :'f_corte'));`,
  "P0001|deshacer_ya_avanzo,t,30"
);
caso(
  "D5 con todo en el Taller: deshacer el corte cuando ya se cosió lo que ese corte puso, no; el límite exacto sí; primero la costura y después el corte, sí",
  `${ORDEN(ESPINA_TALLER)}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 10])}) as a2 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 20])}) as a3 \\gset
   select id as av_c20 from retail.produccion_avances where fase_id = :'f_corte' and cantidad = 20 \\gset
   select id as av_c10 from retail.produccion_avances where fase_id = :'f_corte' and cantidad = 10 \\gset
   select id as av_k20 from retail.produccion_avances where fase_id = :'f_cost' \\gset
   select pg_temp.deshace(:'av_c10') as u1 \\gset
   select pg_temp.deshace(:'av_c20') as u2 \\gset
   select pg_temp.deshace(:'av_k20') as u3 \\gset
   select pg_temp.deshace(:'av_c20') as u4 \\gset
   select concat_ws(',', :'u1', pg_temp.eh(:'u2'), :'u3', :'u4',
     (select coalesce(sum(cantidad), 0) from retail.produccion_avances where fase_id = :'f_corte'),
     (select coalesce(sum(cantidad), 0) from retail.produccion_avances where fase_id = :'f_cost'));`,
  "OK,P0001|deshacer_ya_avanzo,OK,OK,0,0"
);

// S. SALIDA ---------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la Salida de 20 de Negro a Costura (afuera) con su guía: Costura queda en curso con 20 afuera, el corte hecha, el disponible por talla y color, la guía como texto y la actividad sin montos",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a \\gset
   select retail.registrar_salida(:'f_cost', ${L(["v1", 20])}, '001-123', 'primer envío') as j \\gset
   select concat_ws(',', :'a',
     ${FASE_DE(`:'j'::jsonb`, "costura", ["estado", "afuera", "salieron", "hechas"])},
     (select guia || ':' || nota || ':' || (hecho_por = :'felipe_p') from retail.produccion_salidas where fase_id = :'f_cost'),
     (select count(*) || ':' || sum(sl.cantidad) from retail.produccion_salida_lineas sl join retail.produccion_salidas s on s.id = sl.salida_id where s.fase_id in (select id from retail.produccion_fases where produccion_id = :'oid')),
     ${ACTIVIDAD("produccion_salida", "mandó 20 prendas de la OP-% a Costura con Confecciones Avances Prueba (guía 001-123)")},
     ${FASE_DE(`:'j'::jsonb`, "corte", ["estado"])},
     ${POR_VARIANTE("costura", "v1", ["entrada", "salieron", "afuera"])});`,
  "OK,en_curso:20:20:0,001-123:primer envío:true,1:20,1,hecha,30:20:20"
);
caso(
  "S2 una Salida no manda más de lo que hay POR TALLA Y COLOR: 20 + 10 = 30 entra, 11 excede; una línea buena junto a una que excede no deja ni la cabecera",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 20])}) as s1 \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 11])}) as s2 \\gset
   select pg_temp.sale(:'f_cost', ${L(["v2", 5], ["v1", 11])}) as s3 \\gset
   select count(*) as salidas from retail.produccion_salidas where fase_id = :'f_cost' \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 10])}) as s4 \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 1])}) as s5 \\gset
   select concat_ws(',', :'s1', pg_temp.eh(:'s2'), :'s2' like '%solo pueden salir a Costura 30 y ya salieron 20: no pueden salir 11 más', pg_temp.eh(:'s3'), :'salidas', :'s4', pg_temp.eh(:'s5'),
     (select count(*) from retail.produccion_salidas where fase_id = :'f_cost'));`,
  "OK,P0001|salida_excede,t,P0001|salida_excede,1,OK,P0001|salida_excede,2"
);
caso(
  "S3 una Salida en una fase del Taller, antes de cortar, de una talla ajena, con cantidad inválida o sin líneas: cada una con su motivo y nada escrito",
  `${ORDEN()}
   select concat_ws(',',
     pg_temp.eh(pg_temp.sale(:'f_corte', ${L(["v1", 5])})),
     pg_temp.eh(pg_temp.sale(:'f_cost', ${L(["v1", 5])})),
     pg_temp.eh(pg_temp.sale(:'f_cost', ${L(["v_ajena", 5])})),
     pg_temp.eh(pg_temp.sale(:'f_cost', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '0')))),
     pg_temp.eh(pg_temp.sale(:'f_cost', '[]'::jsonb))) as r1 \\gset
   select :'r1' || ',' || (select count(*) from retail.produccion_salidas where fase_id in (select id from retail.produccion_fases where produccion_id = :'oid'));`,
  "P0001|salida_fase_del_taller,P0001|salida_excede,P0001|salida_variante_ajena,P0001|salida_cantidad_invalida,P0001|salida_sin_lineas,0"
);

// V. VUELTA ---------------------------------------------------------------------------------------------------------------------
const CORTE_Y_SALIDA = `
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 20])}, '001-123') as s \\gset`;
caso(
  "V1 la Vuelta de 18 buenas + 2 faltantes (con motivo): Costura con 18 hechas, 0 afuera, 2 faltantes y devengado 18 × 4.50 = 81.00; un avance de origen «vuelta» de 18; la actividad sin montos; ese avance no se deshace",
  `${ORDEN()}${CORTE_Y_SALIDA}
   select retail.registrar_vuelta(:'f_cost', jsonb_build_array(${VL("v1", 18, 0, 2, "se perdieron en el servicio")}), '001-124', 'llegó completo') as j \\gset
   select id as av_v from retail.produccion_avances where fase_id = :'f_cost' \\gset
   select concat_ws(',',
     ${FASE_DE(`:'j'::jsonb`, "costura", ["estado", "hechas", "afuera", "faltantes", "devengado"])},
     (select cantidad || ':' || origen || ':' || (vuelta_id is not null) from retail.produccion_avances where fase_id = :'f_cost'),
     (select guia || ':' || nota from retail.produccion_vueltas where fase_id = :'f_cost'),
     (select vl.buenas || ':' || vl.segundas || ':' || vl.faltantes || ':' || vl.motivo from retail.produccion_vuelta_lineas vl join retail.produccion_vueltas vu on vu.id = vl.vuelta_id where vu.fase_id in (select id from retail.produccion_fases where produccion_id = :'oid')),
     ${ACTIVIDAD("produccion_vuelta", "recibió 18 prendas buenas de Costura (Confecciones Avances Prueba) de la OP-% · 2 faltantes")},
     pg_temp.eh(pg_temp.deshace(:'av_v')),
     ${POR_VARIANTE("costura", "v1", ["entrada", "hechas", "salieron", "volvieron_buenas", "segundas", "faltantes", "afuera"])});`,
  "en_curso:18:0:2:81.00,18:vuelta:true,001-124:llegó completo,18:0:2:se perdieron en el servicio,1,P0001|deshacer_origen,30:18:20:18:0:2:0"
);
caso(
  "V2 una Vuelta no devuelve más de lo que salió, POR TALLA Y COLOR: 15 + 5 = 20 entra; 21 y 1 más no; una talla que no salió tampoco; lo rechazado no deja nada",
  `${ORDEN()}${CORTE_Y_SALIDA}
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 15, 0, 0)})) as w1 \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 4, 2, 0, "manchadas")})) as w2 \\gset
   select count(*) as vueltas from retail.produccion_vueltas where fase_id = :'f_cost' \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 3, 2, 0, "manchadas")})) as w3 \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 1, 0, 0)})) as w4 \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v2", 1, 0, 0)})) as w5 \\gset
   select concat_ws(',', :'w1', pg_temp.eh(:'w2'), :'w2' like '%Salieron 20 de % y ya volvieron 15: no pueden volver 6 más', :'vueltas', :'w3', pg_temp.eh(:'w4'), pg_temp.eh(:'w5'),
     (select count(*) from retail.produccion_vueltas where fase_id = :'f_cost'),
     (select sum(cantidad) from retail.produccion_avances where fase_id = :'f_cost'));`,
  "OK,P0001|vuelta_excede,t,1,OK,P0001|vuelta_excede,P0001|vuelta_excede,2,18"
);
caso(
  "V3 lo que no volvió bueno dice por qué: faltantes o segundas sin motivo (o con motivo en blanco) no entran; las buenas solas sí",
  `${ORDEN()}${CORTE_Y_SALIDA}
   select pg_temp.eh(pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 18, 0, 2)}))) as e1 \\gset
   select pg_temp.eh(pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 18, 1, 0)}))) as e2 \\gset
   select pg_temp.eh(pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 18, 0, 2, "   ")}))) as e3 \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 10, 0, 0)})) as ok \\gset
   select concat_ws(',', :'e1', :'e2', :'e3', :'ok', (select count(*) from retail.produccion_vueltas where fase_id = :'f_cost'));`,
  "P0001|vuelta_sin_motivo,P0001|vuelta_sin_motivo,P0001|vuelta_sin_motivo,OK,1"
);

caso(
  "V4 una Vuelta sin nada, con cantidades negativas o con texto, sin líneas, con una talla repetida o ajena, o en una fase del Taller: cada una con su motivo y nada escrito",
  `${ORDEN()}${CORTE_Y_SALIDA}
   select concat_ws(',',
     pg_temp.eh(pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 0, 0, 0)}))),
     pg_temp.eh(pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", -1, 0, 0)}))),
     pg_temp.eh(pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", "abc", 0, 0)}))),
     pg_temp.eh(pg_temp.vuelve(:'f_cost', '[]'::jsonb)),
     pg_temp.eh(pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 5, 0, 0)}, ${VL("v1", 5, 0, 0)}))),
     pg_temp.eh(pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v_ajena", 5, 0, 0)}))),
     pg_temp.eh(pg_temp.vuelve(:'f_corte', jsonb_build_array(${VL("v1", 5, 0, 0)})))) as r1 \\gset
   select :'r1' || ',' || (select count(*) from retail.produccion_vueltas where fase_id in (select id from retail.produccion_fases where produccion_id = :'oid'));`,
  "P0001|vuelta_sin_cantidad,P0001|vuelta_cantidad_invalida,P0001|vuelta_cantidad_invalida,P0001|vuelta_sin_lineas,P0001|vuelta_variante_repetida,P0001|vuelta_variante_ajena,P0001|vuelta_fase_del_taller,0"
);
caso(
  "V5 el flujo completo con faltantes: corte 50 → Salida 50 → Vuelta de 48 buenas y 2 faltantes → Costura queda HECHA (devengado 216.00) y Acabado pasa a ser la actual con entrada 48; terminar 48 en Acabado deja todas las fases hechas",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 30], ["v2", 20])}, '001-200') as s \\gset
   select retail.registrar_vuelta(:'f_cost', jsonb_build_array(${VL("v1", 28, 0, 2, "se perdieron en el servicio")}, ${VL("v2", 20, 0, 0)}), '001-201') as j1 \\gset
   select retail.registrar_avance(:'f_acab', ${L(["v1", 28], ["v2", 20])}) as j2 \\gset
   select concat_ws(',',
     ${FASE_DE(`:'j1'::jsonb`, "costura", ["estado", "hechas", "faltantes", "devengado"])},
     ${FASE_DE(`:'j1'::jsonb`, "acabado", ["estado", "actual", "entrada"])},
     ${FASE_DE(`:'j2'::jsonb`, "acabado", ["estado", "hechas"])},
     (select count(*) from jsonb_array_elements(:'j2'::jsonb) f where f ->> 'actual' = 'true'),
     (select string_agg(f ->> 'estado', '/' order by (f ->> 'secuencia')::int) from jsonb_array_elements(:'j2'::jsonb) f));`,
  "hecha:48:2:216.00,pendiente:true:48,hecha:48,0,hecha/hecha/hecha"
);
caso(
  "V6 Acabado solo avanza con lo que volvió bueno de Costura: con 18 buenas de Negro, 19 excede (con la frase de «solo entraron 18»), otra talla sin nada también, 18 entra, y 1 más no",
  `${ORDEN()}${CORTE_Y_SALIDA}
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 18, 0, 2, "se perdieron")})) as v \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 19])}) as a1 \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v2", 1])}) as a2 \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 18])}) as a3 \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 1])}) as a4 \\gset
   select concat_ws(',', pg_temp.eh(:'a1'), :'a1' like '%En Acabado solo entraron 18 de % y ya terminaste 0: no puedes terminar 19 más', pg_temp.eh(:'a2'), :'a3', pg_temp.eh(:'a4'),
     ${POR_VARIANTE("acabado", "v1", ["entrada", "hechas"])});`,
  "P0001|avance_excede,t,P0001|avance_excede,OK,P0001|avance_excede,18:18"
);

// NS. NADA TOCA EL STOCK -------------------------------------------------------------------------------------------------------
caso(
  "NS1 un flujo completo (avance, deshacer, Salida, Vuelta, Acabado) NO escribe en movimientos, movimientos_insumo ni stock: las prendas en una fase o afuera no son stock",
  `select (select count(*) from retail.movimientos) as m0, (select count(*) from retail.movimientos_insumo) as i0,
          (select coalesce(sum(cantidad), 0) from retail.stock) as s0, (select count(*) from retail.stock) as n0 \\gset
   ${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 3])}) as ax \\gset
   select id as av_x from retail.produccion_avances where fase_id = :'f_corte' and cantidad = 3 \\gset
   select pg_temp.deshace(:'av_x') as dx \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 30], ["v2", 20])}, '001-300') as s \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 28, 0, 2, "se perdieron")}, ${VL("v2", 20, 0, 0)})) as v \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 28], ["v2", 20])}) as b \\gset
   select concat_ws(',',
     (select count(*) from retail.movimientos) = :'m0', (select count(*) from retail.movimientos_insumo) = :'i0',
     (select coalesce(sum(cantidad), 0) from retail.stock) = :'s0', (select count(*) from retail.stock) = :'n0',
     ${FILAS_AVANCE("f_acab")} > 0);`,
  "t,t,t,t,t"
);

// T. ORDEN CERRADA --------------------------------------------------------------------------------------------------------------
caso(
  "T1 en una orden anulada ninguna de las cuatro opera (orden_cerrada)",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30])}) as a \\gset
   select id as av from retail.produccion_avances where fase_id = :'f_corte' \\gset
   update retail.producciones set estado = 'anulada' where id = :'oid';
   select concat_ws(',',
     pg_temp.eh(pg_temp.avanza(:'f_corte', ${L(["v1", 1])})),
     pg_temp.eh(pg_temp.deshace(:'av')),
     pg_temp.eh(pg_temp.sale(:'f_cost', ${L(["v1", 1])})),
     pg_temp.eh(pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 1, 0, 0)}))));`,
  "P0001|orden_cerrada,P0001|orden_cerrada,P0001|orden_cerrada,P0001|orden_cerrada"
);

// P. PUERTAS --------------------------------------------------------------------------------------------------------------------
caso(
  "P1 sin el módulo «produccion» en el rol ninguna de las cuatro opera (42501); con el módulo pero parada en Trujillo tampoco (42501); la lectura única recibe NULL en las dos; Felipe sí",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30])}) as a \\gset
   select id as av from retail.produccion_avances where fase_id = :'f_corte' \\gset
   delete from retail.rol_modulos where modulo = 'produccion' and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   ${como(MICAELA)}
   select concat_ws('/',
     pg_temp.eh(pg_temp.avanza(:'f_corte', ${L(["v1", 1])})),
     pg_temp.eh(pg_temp.deshace(:'av')),
     pg_temp.eh(pg_temp.sale(:'f_cost', ${L(["v1", 1])})),
     pg_temp.eh(pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 1, 0, 0)}))),
     coalesce(retail.fn_orden_produccion(:'oid')::text, 'NULL')) as sin_modulo \\gset
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   ${como(MICAELA)}
   select concat_ws('/',
     pg_temp.eh(pg_temp.avanza(:'f_corte', ${L(["v1", 1])})),
     pg_temp.eh(pg_temp.deshace(:'av')),
     pg_temp.eh(pg_temp.sale(:'f_cost', ${L(["v1", 1])})),
     pg_temp.eh(pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 1, 0, 0)}))),
     coalesce(retail.fn_orden_produccion(:'oid')::text, 'NULL')) as en_trujillo \\gset
   ${como(FELIPE)}
   select :'sin_modulo' || ',' || :'en_trujillo' || ',' || pg_temp.avanza(:'f_corte', ${L(["v1", 1])});`,
  "42501|produccion_sin_modulo/42501|produccion_sin_modulo/42501|produccion_sin_modulo/42501|produccion_sin_modulo/NULL,42501|produccion_sin_taller/42501|produccion_sin_taller/42501|produccion_sin_taller/42501|produccion_sin_taller/NULL,OK"
);

// O. LA ORDEN EN UNA LECTURA ----------------------------------------------------------------------------------------------------
// Una orden con lino (se recibe y se consume por el libro de siempre), costura afuera, y todo lo que se puede anotar.
const ORDEN_COMPLETA = `
   ${ORDEN(ESPINA, LINO)}
   insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'lino', :'taller', 100, 12.50, 'compra') returning id as lote \\gset
   insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id)
     values (:'lino', :'lote', :'taller', 'compra', 100, 12.50, :'felipe_p');
   select retail.fn_orden_produccion(:'oid') as antes \\gset`;
const ANOTAR_TODO = `
   select retail.registrar_consumo_insumo(:'oid', :'lino', 10, 'tendido') as consumo \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 20])}, '001-123') as s \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 18, 0, 2, "se perdieron en el servicio")}), '001-124') as v \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 5])}) as b \\gset
   select id as av_b from retail.produccion_avances where fase_id = :'f_acab' \\gset
   select pg_temp.deshace(:'av_b') as d \\gset
   select retail.fn_orden_produccion(:'oid') as o \\gset`;
caso(
  "O1 fn_orden_produccion, antes de anotar nada: la orden (OP-######, estado, muestra, entrega, quién la abrió, plan), el modelo con su categoría, las 2 líneas en orden, las 3 fases con su detalle por talla y color, la tela con plan 37.800, usado 0 y el saldo del Taller, los costos del líder y los permisos",
  `${ORDEN_COMPLETA}
   select concat_ws(',',
     (:'antes'::jsonb -> 'orden' ->> 'numero_texto') ~ '^OP-[0-9]{6}$',
     (:'antes'::jsonb -> 'orden' ->> 'estado') || ':' || (:'antes'::jsonb -> 'orden' ->> 'es_muestra') || ':' || (:'antes'::jsonb -> 'orden' ->> 'cantidad_plan'),
     (:'antes'::jsonb -> 'orden' ->> 'creado_por_nombre') = 'Felipe Alvarez',
     (:'antes'::jsonb -> 'orden' ->> 'fecha_entrega')::date = retail.fn_hoy_lima() + 10,
     (:'antes'::jsonb -> 'orden' -> 'producto' ->> 'id')::uuid = :'prod',
     (:'antes'::jsonb -> 'orden' -> 'producto' -> 'categoria' ->> 'prefijo') is not null,
     jsonb_array_length(:'antes'::jsonb -> 'lineas'),
     (select string_agg((l ->> 'cantidad_plan'), '/') from jsonb_array_elements(:'antes'::jsonb -> 'lineas') l),
     jsonb_array_length(:'antes'::jsonb -> 'fases'),
     (select string_agg((f ->> 'clave') || ':' || jsonb_array_length(f -> 'por_variante'), '/' order by (f ->> 'secuencia')::int) from jsonb_array_elements(:'antes'::jsonb -> 'fases') f),
     (select (i ->> 'cantidad_plan') || ':' || (i ->> 'usado') || ':' || (i ->> 'saldo') || ':' || (i ->> 'tipo') || ':' || (i ->> 'unidad') from jsonb_array_elements(:'antes'::jsonb -> 'insumos') i),
     (:'antes'::jsonb -> 'costos' ->> 'servicios_estimado') || ':' || (:'antes'::jsonb -> 'costos' ->> 'servicios_devengado'),
     (:'antes'::jsonb -> 'costos' ->> 'tela_estimado'),
     jsonb_array_length(:'antes'::jsonb -> 'linea_de_tiempo') || ':' || ((:'antes'::jsonb -> 'linea_de_tiempo' -> 0) ->> 'tipo'),
     (:'antes'::jsonb -> 'permisos' ->> 'puede_operar') || ':' || (:'antes'::jsonb -> 'permisos' ->> 've_costos'));`,
  (o) => o === "t,en_proceso:false:50,t,t,t,t,2,30/20,3,corte:2/costura:2/acabado:2,37.800:0:100.000:tela:metro,225.00:0.00,472.50,1:apertura,true:true"
);
caso(
  "O2 fn_orden_produccion con todo anotado: costos reales (tela 10 m × 12.50 = 125.00; servicio devengado 18 × 4.50 = 81.00; totales), el usado y el saldo de la tela, y la línea de tiempo del más nuevo al más viejo con el avance_id solo en el que todavía se deshace",
  `${ORDEN_COMPLETA}${ANOTAR_TODO}
   select concat_ws(',',
     (:'o'::jsonb -> 'costos' ->> 'tela_real') || ':' || (:'o'::jsonb -> 'costos' ->> 'servicios_devengado') || ':' || (:'o'::jsonb -> 'costos' ->> 'servicios_estimado'),
     (:'o'::jsonb -> 'costos' ->> 'total_estimado') || ':' || (:'o'::jsonb -> 'costos' ->> 'total_real_hasta_hoy'),
     (select (i ->> 'usado') || ':' || (i ->> 'saldo') from jsonb_array_elements(:'o'::jsonb -> 'insumos') i),
     (select string_agg(t ->> 'tipo', '/' order by ord) from jsonb_array_elements(:'o'::jsonb -> 'linea_de_tiempo') with ordinality as x(t, ord)),
     (select count(*) from jsonb_array_elements(:'o'::jsonb -> 'linea_de_tiempo') t where t ->> 'avance_id' is not null),
     (select (t ->> 'fase_clave') || ':' || (t ->> 'variante_id' = :'v2')::text from jsonb_array_elements(:'o'::jsonb -> 'linea_de_tiempo') t where t ->> 'avance_id' is not null),
     (select bool_and((a.t ->> 'cuando')::timestamptz >= (b.t ->> 'cuando')::timestamptz)
        from jsonb_array_elements(:'o'::jsonb -> 'linea_de_tiempo') with ordinality a(t, o1)
        join jsonb_array_elements(:'o'::jsonb -> 'linea_de_tiempo') with ordinality b(t, o2) on b.o2 = a.o1 + 1));`,
  (o) => o === "125.00:81.00:225.00,697.50:206.00,10.000:90.000,deshacer/avance/vuelta/salida/avance/avance/apertura,1,corte:true,t"
);
caso(
  "O3 la línea de tiempo cuenta lo que pasó con palabras de tienda: la Salida con su guía, la Vuelta con sus faltantes y su motivo, quién lo hizo y sin montos",
  `${ORDEN_COMPLETA}${ANOTAR_TODO}
   select concat_ws(',',
     (select t ->> 'detalle' from jsonb_array_elements(:'o'::jsonb -> 'linea_de_tiempo') t where t ->> 'tipo' = 'salida'),
     (select t ->> 'detalle' from jsonb_array_elements(:'o'::jsonb -> 'linea_de_tiempo') t where t ->> 'tipo' = 'vuelta'),
     (select t ->> 'detalle' from jsonb_array_elements(:'o'::jsonb -> 'linea_de_tiempo') t where t ->> 'tipo' = 'apertura'),
     (select bool_and(t ->> 'quien_nombre' = 'Felipe Alvarez') from jsonb_array_elements(:'o'::jsonb -> 'linea_de_tiempo') t));`,
  (o) =>
    o ===
    "20 prendas a Confecciones Avances Prueba · guía 001-123,18 buenas · 2 faltantes: se perdieron en el servicio · guía 001-124,50 prendas · afuera: Costura con Confecciones Avances Prueba,t"
);
caso(
  "O4 una integrante de Trujillo que lee la orden del Taller recibe NULL, y una orden que no existe también",
  `${ORDEN()}
   ${como(MICAELA)}
   select coalesce(retail.fn_orden_produccion(:'oid')::text, 'NULL') || ',' || coalesce(retail.fn_orden_produccion(gen_random_uuid())::text, 'NULL');`,
  "NULL,NULL"
);

// I. EL CANDADO -----------------------------------------------------------------------------------------------------------------
caso(
  "I1 las cuatro funciones que escriben toman el candado por orden (pg_advisory_xact_lock) antes de leer un saldo (ADR-0190)",
  `select count(*) filter (where pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock%' and pg_get_functiondef(p.oid) like '%produccion:%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname in ('registrar_avance','deshacer_avance','registrar_salida','registrar_vuelta');`,
  "4"
);

// F. LA FORMA -------------------------------------------------------------------------------------------------------------------
const DE = (nombres) => `from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in (${nombres})`;
const PUBLICAS = `'registrar_avance','deshacer_avance','registrar_salida','registrar_vuelta','fn_orden_produccion'`;
const INTERNAS = `'fn_produccion_fase_anterior','fn_produccion_fase_siguiente','fn_produccion_entrada_variante','fn_produccion_variante_texto','fn_produccion_lineas_cantidad','fn_produccion_operar_fase','fn_produccion_avance_deshacible'`;
caso(
  "F1 la forma: las 5 de la web son security definer con search_path, authenticated sí y anon no; las 7 internas, cerradas a la API y con search_path",
  `reset role;
   select concat_ws(',',
     (select count(*) ${DE(PUBLICAS)}),
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%') ${DE(PUBLICAS)}),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) ${DE(PUBLICAS)}),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) ${DE(PUBLICAS)}),
     (select count(*) ${DE(INTERNAS)}),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) ${DE(INTERNAS)}),
     (select bool_and(array_to_string(p.proconfig, ',') like '%search_path%') ${DE(INTERNAS)}));`,
  "5,t,t,f,7,f,t"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
