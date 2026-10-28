#!/usr/bin/env node
/**
 * Prueba de `20261028072000_produccion_proveedor_pendiente_de_registrar.sql` (Producción, ADR-0551 act. «pendiente de registrar»).
 *
 * EL PROBLEMA QUE PRUEBA. Una fase que sale afuera exigía proveedor y tarifa; para registrar una orden ya hecha con un servicio que todavía no está
 * cargado no había salida. Ahora una fase de servicio puede quedar PENDIENTE DE REGISTRAR (sin proveedor, tarifa ni fijo: no cobra) y se registra
 * quién después, aunque la fase ya haya empezado. Aquí: el CHECK (los estados imposibles siguen imposibles), la apertura con una fase pendiente,
 * que un olvido NO se vuelve un pendiente, el devengado en 0 y su recálculo al registrar quién, y las puertas.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK (con la migración cargada dentro: así corre con la base al día o sin ella).
 * USO: node scripts/pruebas/produccion_proveedor_pendiente.mjs [--contenedor supabase_db_x]
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
const migracion = (archivo) => readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8").replace(/^set lock_timeout.*$/gm, "");
// Las migraciones de main que esta toca por debajo (cinco pasos, ojales y botones, fecha prometida pasada): idempotentes, así corre con la base al día o sin ella.
const ANTES = ["20261028052000_produccion_cinco_pasos_fijos.sql", "20261028053000_producto_taller_ojales_y_botones.sql", "20261028064000_produccion_fecha_prometida_pasada_vale.sql"].map(migracion).join("\n");
const PENDIENTE = migracion("20261028072000_produccion_proveedor_pendiente_de_registrar.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

const ARGS = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ANTES}
${PENDIENTE}
set local search_path = retail, public, extensions;
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
-- Corre una sentencia y devuelve «OK» o «<sqlstate>|<hint>» (nunca aborta el caso).
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text;
begin
  execute p_sql;
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(v_hint, '');
end;
$f$;
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, null) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK';
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(v_hint, '');
end;
$f$;
insert into retail.proveedores_produccion (nombre, rubro) values ('Confecciones Pendiente Prueba', 'maquila') returning id as maquila \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
${como(FELIPE)}
`;
const APERTURA = `jsonb_build_object('ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 14)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const PENDIENTE_FASE = (clave, extra = {}) => FASE({ clave: `'${clave}'`, quien: `'servicio'`, proveedor_pendiente: "true", ...extra });
const COSTURA_COMPLETA = FASE({ clave: "'costura'", quien: "'servicio'", proveedor_id: ":'maquila'", tarifa_prenda: "'4.50'" });
const ESPINA = (costura) => `jsonb_build_array(${TALLER("corte")}, ${costura}, ${TALLER("acabado")})`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) fallas++;
  console.log(`${bien ? "✓" : "✗"} ${nombre}${bien ? "" : `\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`}`);
}

// Una orden abierta con la costura pendiente, para los casos que siguen.
const ABRIR_PENDIENTE = `select pg_temp.abre(${APERTURA}, ${ESPINA(PENDIENTE_FASE("costura"))}) as r \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'costura' \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'corte' \\gset`;

caso(
  "C1 el CHECK: un pendiente vale (servicio sin proveedor, sin tarifa, fijo 0); tarifa sin proveedor, un pendiente que cobra o un servicio con proveedor sin tarifa NO",
  `${ABRIR_PENDIENTE}
   select concat_ws(',', :'r',
     pg_temp.eh(pg_temp.intento(format('update retail.produccion_fases set tarifa_prenda = 4.5 where id = %L', :'f_cost'))),
     pg_temp.eh(pg_temp.intento(format('update retail.produccion_fases set fijo_orden = 10 where id = %L', :'f_cost'))),
     pg_temp.eh(pg_temp.intento(format('update retail.produccion_fases set proveedor_id = %L where id = %L', :'maquila', :'f_cost'))));`,
  "OK,23514|,23514|,23514|"
);
caso(
  "C2 una fase de servicio SIN la marca y sin proveedor sigue rechazada (fase_sin_proveedor): un olvido no se vuelve un pendiente",
  `select pg_temp.eh(pg_temp.abre(${APERTURA}, ${ESPINA(FASE({ clave: "'costura'", quien: "'servicio'" }))}));`,
  "P0001|fase_sin_proveedor"
);
caso(
  "A1 abrir con la costura pendiente: queda servicio sin proveedor ni tarifa, con su fecha de entrega; el devengado es 0 aunque vuelvan prendas",
  `${ABRIR_PENDIENTE}
   insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, hecho_por) values (:'f_corte', :'v1', 30, 'taller', :'felipe_p'), (:'f_corte', :'v2', 20, 'taller', :'felipe_p');
   insert into retail.produccion_salidas (fase_id, hecho_por) values (:'f_cost', :'felipe_p') returning id as sal \\gset
   insert into retail.produccion_salida_lineas (salida_id, variante_id, cantidad) values (:'sal', :'v1', 30);
   insert into retail.produccion_vueltas (fase_id, hecho_por) values (:'f_cost', :'felipe_p') returning id as vue \\gset
   insert into retail.produccion_vuelta_lineas (vuelta_id, variante_id, buenas) values (:'vue', :'v1', 30);
   insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, vuelta_id, hecho_por) values (:'f_cost', :'v1', 30, 'vuelta', :'vue', :'felipe_p');
   select concat_ws(',', :'r',
     (select (quien = 'servicio' and proveedor_id is null and tarifa_prenda is null and fijo_orden = 0) from retail.produccion_fases where id = :'f_cost'),
     (select f ->> 'devengado' from jsonb_array_elements(retail.fn_fases_de_orden((select id from pg_temp.ultima))) f where f ->> 'clave' = 'costura'));`,
  "OK,t,0.00"
);
caso(
  "R1 registrar quién DESPUÉS de que la fase empezó: el devengado se recalcula solo (30 × 4.50 = 135)",
  `${ABRIR_PENDIENTE}
   insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, hecho_por) values (:'f_corte', :'v1', 30, 'taller', :'felipe_p');
   insert into retail.produccion_salidas (fase_id, hecho_por) values (:'f_cost', :'felipe_p') returning id as sal \\gset
   insert into retail.produccion_salida_lineas (salida_id, variante_id, cantidad) values (:'sal', :'v1', 30);
   insert into retail.produccion_vueltas (fase_id, hecho_por) values (:'f_cost', :'felipe_p') returning id as vue \\gset
   insert into retail.produccion_vuelta_lineas (vuelta_id, variante_id, buenas) values (:'vue', :'v1', 30);
   insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, vuelta_id, hecho_por) values (:'f_cost', :'v1', 30, 'vuelta', :'vue', :'felipe_p');
   select retail.registrar_proveedor_de_fase(:'f_cost', :'maquila', 4.50) as x \\gset
   select concat_ws(',',
     (select (proveedor_id = :'maquila' and tarifa_prenda = 4.50) from retail.produccion_fases where id = :'f_cost'),
     (select f ->> 'devengado' from jsonb_array_elements(retail.fn_fases_de_orden((select id from pg_temp.ultima))) f where f ->> 'clave' = 'costura'));`,
  "t,135.00"
);
caso(
  "R2 registrar quién pide lo de siempre: sin proveedor (fase_sin_proveedor), sin tarifa (fase_sin_tarifa); una fase que NO está pendiente se rechaza (fase_no_pendiente)",
  `${ABRIR_PENDIENTE}
   select concat_ws(',',
     pg_temp.eh(pg_temp.intento(format('select retail.registrar_proveedor_de_fase(%L, null, 4.5)', :'f_cost'))),
     pg_temp.eh(pg_temp.intento(format('select retail.registrar_proveedor_de_fase(%L, %L, null)', :'f_cost', :'maquila'))),
     pg_temp.eh(pg_temp.intento(format('select retail.registrar_proveedor_de_fase(%L, %L, 4.5)', :'f_corte', :'maquila'))));`,
  "P0001|fase_sin_proveedor,P0001|fase_sin_tarifa,P0001|fase_no_pendiente"
);
caso(
  "D1 dejar pendiente una fase del Taller que no empezó: pasa; una que ya empezó no (fase_empezada); repetirlo en una ya pendiente no falla",
  `select pg_temp.abre(${APERTURA}, ${ESPINA(COSTURA_COMPLETA)}) as r \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'costura' \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'corte' \\gset
   select id as f_acab from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'acabado' \\gset
   select pg_temp.intento(format('select retail.dejar_fase_pendiente_de_registrar(%L)', :'f_cost')) as a \\gset
   select (quien = 'servicio' and proveedor_id is null and tarifa_prenda is null) as q from retail.produccion_fases where id = :'f_cost' \\gset
   select pg_temp.intento(format('select retail.dejar_fase_pendiente_de_registrar(%L)', :'f_cost')) as b \\gset
   insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, hecho_por) values (:'f_corte', :'v1', 5, 'taller', :'felipe_p');
   select concat_ws(',', :'a', :'q', :'b', pg_temp.eh(pg_temp.intento(format('select retail.dejar_fase_pendiente_de_registrar(%L)', :'f_corte'))));`,
  "OK,t,OK,P0001|fase_empezada"
);
caso(
  "P1 las puertas: una integrante de Trujillo (sin acceso al Taller) no deja pendiente ni registra; anon no ejecuta; authenticated sí",
  `${ABRIR_PENDIENTE}
   ${como(MICAELA)}
   select pg_temp.eh(pg_temp.intento(format('select retail.registrar_proveedor_de_fase(%L, %L, 4.5)', :'f_cost', :'maquila'))) as a \\gset
   select pg_temp.eh(pg_temp.intento(format('select retail.dejar_fase_pendiente_de_registrar(%L)', :'f_corte'))) as b \\gset
   reset role;
   select concat_ws(',', :'a', :'b',
     has_function_privilege('anon', 'retail.registrar_proveedor_de_fase(uuid, uuid, numeric, numeric, integer, date)', 'execute'),
     has_function_privilege('authenticated', 'retail.registrar_proveedor_de_fase(uuid, uuid, numeric, numeric, integer, date)', 'execute'),
     has_function_privilege('anon', 'retail.dejar_fase_pendiente_de_registrar(uuid, date)', 'execute'),
     has_function_privilege('authenticated', 'retail.dejar_fase_pendiente_de_registrar(uuid, date)', 'execute'));`,
  (o) => /^(42501|P0001)\|[a-z_]*,(42501|P0001)\|[a-z_]*,f,t,f,t$/.test(o)
);
caso(
  "M1 la migración se pega dos veces sin error y las funciones quedan con el pendiente (una sola vez)",
  `${PENDIENTE}
   set local search_path = retail, public, extensions;
   select (length(d) - length(replace(d, 'proveedor_pendiente', ''))) / length('proveedor_pendiente')
     from (select pg_get_functiondef('retail.fn_produccion_fases_normalizar(jsonb)'::regprocedure) d) x;`,
  (o) => Number(o) >= 1 && Number(o) <= 3
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
