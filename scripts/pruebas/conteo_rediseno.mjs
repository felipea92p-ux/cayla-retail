#!/usr/bin/env node
/**
 * Pruebas del rediseño de Inventario > Conteo (migraciones `20260930010000_conteo_rediseno_columnas.sql` y
 * `20260930010100_conteo_rediseno_funciones.sql`) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA (todo en la BASE, no en la pantalla):
 *   · la FOTO al abrir: una línea pendiente por cada variante con stock > 0 en el lugar del conteo (nunca stock 0, ni
 *     otra sububicación, ni la cuarentena, ni la pieza del sistema; con alcance de categoría, solo esa categoría);
 *   · piso y almacén no se mezclan, y un solo conteo abierto por ubicación;
 *   · vacío ≠ 0: una línea sin contar sigue pendiente; un 0 explícito es «verificada en cero»; NULL la des-cuenta;
 *   · la diferencia es contado − «debe haber»: esperado 11 / contado 9 → −2; 5 / 6 → +1; 6 / 0 → −6;
 *   · una variante que no estaba en la foto se registra (foto 0); en un conteo de categoría pide confirmación; si solo se le
 *     borra la cantidad se ignora, pero si se mandó a recontar sigue visible «en reconteo» y cuenta como pendiente (borde de la
 *     regla D3: el ayudante de líneas, `cerrar_conteo` y `fn_conteos_resumen` tienen que coincidir, cada uno con su control);
 *   · cerrar: sin verificadas (`conteo_vacio`), con pendientes sin cierre parcial (`conteo_pendientes`), con diferencias
 *     sin confirmar (`diferencias_sin_confirmar`), y el orden de esos errores;
 *   · cierre parcial (las pendientes NO se tocan: sin ajuste, `diferencia` NULL) y «parcial» derivado;
 *   · reconteo, reconfirmación automática (sale la misma cifra) y confirmación idempotente;
 *   · CASO P: una salida legítima (venta) ANTES de verificar y DESPUÉS de verificar no da falso faltante, y el ajuste va
 *     como delta sobre el stock ACTUAL (contado − debe haber), sin resucitar la venta. El orden se fija con
 *     `clock_timestamp()` (dentro de una transacción `now()` es siempre el mismo instante);
 *   · trazabilidad: el ajuste es `tipo = 'ajuste'`, `motivo = 'conteo'`, con `conteo_item_id`, y la línea guarda su
 *     `movimiento_id` (Finanzas y Movimientos lo leen así);
 *   · `fn_conteos_resumen` NO cuenta pendientes en `lineas` (la exactitud no se infla) y no trae `soles_diferencia`;
 *   · sububicación obligatoria en tiendas con piso/almacén, y el Taller (sin sububicación) sigue contando;
 *   · `fn_conteo_alcance` (la cifra «cuántas variantes» de la tarjeta de abrir, migración `20260930040000`): coincide fila por
 *     fila con la foto de `abrir_conteo` (piso, almacén, categoría y Taller), no ofrece la cuarentena, no la ve quien no opera la
 *     sede, y sus controles (mutada, dan otra cifra que la foto) demuestran que la prueba muerde;
 *   · permisos (una colaboradora de otra sede no opera el conteo), anular sin cambios, CHECKs de la tabla, grants, marcas
 *     de parche una sola vez y firmas sin sobrecargas viejas;
 *   · el simulacro de re-pegado de las migraciones viejas y de las nuevas;
 *   · los CONTROLES: la misma escena corrida contra una versión mutada de la función (una que se equivoca a propósito
 *     como lo haría la alternativa descartada) TIENE que dar otro resultado. Si un control «pasa» sin diferencia, la
 *     prueba no muerde.
 *
 * CÓMO. Mismo patrón que `conteo_vacio_no_se_cierra.mjs`: cada escenario corre en su propia transacción con ROLLBACK
 * (nunca se commitea nada), como Felipe (líder) con `set local request.jwt.claim.sub`. Cada escena arma su PROPIA tienda
 * («ZZ Conteo rediseño», con piso, almacén y cuarentena) y su propio stock con movimientos reales: no depende del stock
 * que otras sesiones dejen en el local, y el ROLLBACK la deshace.
 *
 * `--en-seco`: carga las dos migraciones DENTRO de cada escenario, sin aplicarlas a la base compartida.
 *
 * USO
 *   pnpm pruebas:conteo-rediseno            → migraciones ya aplicadas en el local
 *   pnpm pruebas:conteo-rediseno --en-seco  → las carga en cada escenario, sin aplicarlas
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora de Trujillo — no opera otras sedes

const EN_SECO = process.argv.includes("--en-seco");
const leer = (archivo) => readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8");
const MIGRACIONES_NUEVAS = `${leer("20260930010000_conteo_rediseno_columnas.sql")}\n${leer("20260930010100_conteo_rediseno_funciones.sql")}\n${leer("20260930040000_conteo_alcance_por_lugar.sql")}`;
const PRELUDIO = EN_SECO ? MIGRACIONES_NUEVAS : "";
const MIG_ADR_0189 = leer("20260924120000_concurrencia_cambios_devoluciones_conteo.sql");
const MIG_VACIO = leer("20260923120000_conteo_vacio_no_se_cierra.sql");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** `pg_temp.intento(sql)`: ejecuta la sentencia en un sub-bloque y devuelve «SQLSTATE|hint|mensaje», o «SIN_ERROR». */
const INTENTO = `
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
`;

/**
 * Ayudantes de la escena (todos en pg_temp: desaparecen con la transacción).
 *   mover(variante, ubicación, sububicación, tipo, cantidad, motivo, cuándo): un movimiento REAL del libro más su efecto
 *     en el stock (`fn_aplicar_movimiento`), con `created_at` explícito si se pasa (para ordenar con clock_timestamp()).
 *   poner(variante, ubicación, sububicación, cantidad): una entrada, para dejar stock conocido.
 *   stock(variante, ubicación, sububicación): lo que hay ahora (sububicación NULL = toda la ubicación).
 *   linea(conteo, variante): la línea tal como la ve la pantalla (`fn_conteo_detalle`), o NULL si no se muestra.
 */
const FUNCIONES = `
create function pg_temp.mover(p_var uuid, p_ubic uuid, p_sub uuid, p_tipo text, p_cant integer,
                              p_motivo text default 'prueba conteo', p_ts timestamptz default null) returns uuid
language plpgsql as $f$
declare v_id uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
    values (p_var, p_ubic, p_sub, p_tipo, p_cant, p_motivo, coalesce(p_ts, now())) returning id into v_id;
  perform retail.fn_aplicar_movimiento(v_id);
  return v_id;
end;
$f$;
create function pg_temp.poner(p_var uuid, p_ubic uuid, p_sub uuid, p_cant integer) returns void
language plpgsql as $f$
begin
  perform pg_temp.mover(p_var, p_ubic, p_sub, 'entrada', p_cant, 'prueba conteo: stock');
end;
$f$;
create function pg_temp.stock(p_var uuid, p_ubic uuid, p_sub uuid) returns integer
language sql as $f$
  select coalesce(sum(cantidad), 0)::integer from retail.stock
   where variante_id = p_var and ubicacion_id = p_ubic and (p_sub is null or sububicacion_id = p_sub);
$f$;
create function pg_temp.linea(p_conteo uuid, p_var uuid) returns jsonb
language sql as $f$
  select l from jsonb_array_elements(retail.fn_conteo_detalle(p_conteo) -> 'lineas') l where l ->> 'variante_id' = p_var::text;
$f$;
`;

const comoFelipe = (sql) => `
begin;
${PRELUDIO}
set local request.jwt.claim.sub = '${FELIPE}';
${INTENTO}
${FUNCIONES}
${sql}
rollback;
`;

/**
 * La escena: una tienda propia con piso, almacén y cuarentena, y este stock (todo con movimientos reales):
 *   piso:       va (blusa, Camisas y Blusas) 11 · vb (blusa, Camisas y Blusas) 5 · vc (casaca) 6 · la pieza del sistema 4
 *               · ve (pantalón) con una fila en 0 (entró 2 y salió 2)
 *   almacén:    vd (vestido) 7 · va 3
 *   cuarentena: ve 2
 * Deja `:u`, `:piso`, `:alm`, `:cua`, `:va` … `:ve`, `:pieza`, `:cat_camisas`.
 */
const ESCENA = `
insert into retail.ubicaciones (nombre, tipo) values ('ZZ Conteo rediseño', 'tienda') returning id as u \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'u', 'Piso de venta', 'piso_venta') returning id as piso \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'u', 'Almacén de tienda', 'almacen_tienda') returning id as alm \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'u', 'Cuarentena', 'cuarentena') returning id as cua \\gset
select id as va from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as vb from retail.variantes where sku = 'BLU-VALE-ROS-L' \\gset
select id as vc from retail.variantes where sku = 'CAS-LUCI-BEI-L' \\gset
select id as vd from retail.variantes where sku = 'VES-SOFI-NEG-M' \\gset
select id as ve from retail.variantes where sku = 'PAN-CARL-NEG-30' \\gset
select id as pieza from retail.variantes where sku = 'CARGO-ESPECIAL-01' \\gset
select p.categoria_id as cat_camisas from retail.variantes v join retail.productos p on p.id = v.producto_id where v.id = :'va' \\gset
select pg_temp.poner(:'va', :'u', :'piso', 11) \\gset
select pg_temp.poner(:'vb', :'u', :'piso', 5) \\gset
select pg_temp.poner(:'vc', :'u', :'piso', 6) \\gset
select pg_temp.poner(:'pieza', :'u', :'piso', 4) \\gset
select pg_temp.poner(:'ve', :'u', :'piso', 2) \\gset
select pg_temp.mover(:'ve', :'u', :'piso', 'salida', 2, 'prueba conteo: salida') as _s \\gset
select pg_temp.poner(:'vd', :'u', :'alm', 7) \\gset
select pg_temp.poner(:'va', :'u', :'alm', 3) \\gset
select pg_temp.poner(:'ve', :'u', :'cua', 2) \\gset
`;

const ABRIR_PISO = `select retail.abrir_conteo(:'u', :'piso') as conteo \\gset`;
const CONTAR = (v, n, confirmo = "") => `select retail.conteo_contar(:'conteo', :'${v}', ${n}${confirmo ? `, ${confirmo}` : ""}) as _c \\gset`;
const CONFIRMAR = (v) => `select retail.conteo_confirmar_diferencia(:'conteo', :'${v}') as _f \\gset`;
const RECONTAR = (v) => `select retail.conteo_recontar(:'conteo', :'${v}') as _r \\gset`;
const CERRAR_INTENTO = (nombre, parcial = "") =>
  `select pg_temp.intento(format('select * from retail.cerrar_conteo(%L${parcial ? ", true" : ""})', :'conteo')) as ${nombre} \\gset`;
const INTENTO_CONTEO = (nombre, funcion, v, extra = "") =>
  `select pg_temp.intento(format('select retail.${funcion}(%L, %L${extra})', :'conteo', :'${v}')) as ${nombre} \\gset`;
const LINEA = (v) => `pg_temp.linea(:'conteo', :'${v}')`;
const CAMPO = (v, k) => `(${LINEA(v)} ->> '${k}')`;
const N_MOVS_DEL_CONTEO = `(select count(*) from retail.movimientos where conteo_item_id in (select id from retail.conteo_items where conteo_id = :'conteo'))`;

/** Reescribe una función viva cambiando un texto (la «alternativa descartada»). Falla si el texto no está: una mutación que no aplica no controla nada. */
const MUTAR = (firma, desde, hacia) => `
do $mut$
declare v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef('${firma}'::regprocedure);
  v_nueva := replace(v_def, $a$${desde}$a$, $b$${hacia}$b$);
  if v_nueva = v_def then raise exception 'la mutación no aplicó: no se encontró el texto a cambiar'; end if;
  execute v_nueva;
end;
$mut$;
`;

const CASOS = [];
/** `esperado`: arreglo de columnas exactas, o función sobre la última línea. */
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, sql, esperado });
/** Control: la misma escena con una función mutada TIENE que fallar o dar otro resultado que `esperado`. */
const control = (nombre, sql, esperado) => CASOS.push({ nombre, sql, esperado, muerde: true });

// ---------------------------------------------------------------------------
// 1. La foto al abrir
// ---------------------------------------------------------------------------
exito(
  "foto al abrir (piso): una línea pendiente por variante con stock > 0 del piso; sin almacén, sin cuarentena, sin stock 0 y sin la pieza del sistema",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
select concat_ws(',',
  jsonb_array_length(d -> 'lineas'),
  d -> 'resumen' ->> 'variantes', d -> 'resumen' ->> 'pendientes', d -> 'resumen' ->> 'verificadas',
  (select string_agg(l ->> 'foto', '/' order by (l ->> 'foto')::int) from jsonb_array_elements(d -> 'lineas') l),
  (select bool_and(l ->> 'estado' = 'pendiente' and l -> 'contada' = 'null'::jsonb and l ->> 'debe_haber' = l ->> 'foto') from jsonb_array_elements(d -> 'lineas') l),
  (select count(*) from retail.conteo_items where conteo_id = :'conteo' and variante_id in (:'vd', :'ve', :'pieza')),
  (select foto_en > created_at from retail.conteos where id = :'conteo'),
  (select bool_and(cantidad_contada is null and verificado_en is null and cantidad_sistema = cantidad_foto) from retail.conteo_items where conteo_id = :'conteo'))
from (select retail.fn_conteo_detalle(:'conteo') as d) x;`),
  ["3", "3", "3", "0", "5/6/11", "t", "0", "t", "t"]
);

exito(
  "foto con alcance de categoría: solo las variantes de esa categoría (Camisas y Blusas: va y vb; la casaca queda fuera)",
  comoFelipe(`${ESCENA}
select retail.abrir_conteo(:'u', :'piso', 'categoria', :'cat_camisas') as conteo \\gset
select concat_ws(',',
  (select count(*) from retail.conteo_items where conteo_id = :'conteo'),
  (select string_agg(cantidad_foto::text, '/' order by cantidad_foto) from retail.conteo_items where conteo_id = :'conteo'),
  (select count(*) from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'vc'));`),
  ["2", "5/11", "0"]
);

exito(
  "piso y almacén no se mezclan: el almacén trae SU stock (va = 3, no 14), un solo conteo abierto por ubicación, y al cancelar el otro se abre",
  comoFelipe(`${ESCENA}
select retail.abrir_conteo(:'u', :'alm') as conteo \\gset
select retail.fn_conteo_detalle(:'conteo') as d_alm \\gset
select pg_temp.intento(format('select retail.abrir_conteo(%L, %L)', :'u', :'piso')) as r_dup \\gset
select retail.anular_conteo(:'conteo') as _a \\gset
select retail.abrir_conteo(:'u', :'piso') as conteo2 \\gset
select concat_ws(',',
  jsonb_array_length(:'d_alm'::jsonb -> 'lineas'),
  (select string_agg(l ->> 'foto', '/' order by (l ->> 'foto')::int) from jsonb_array_elements(:'d_alm'::jsonb -> 'lineas') l),
  (select l ->> 'foto' from jsonb_array_elements(:'d_alm'::jsonb -> 'lineas') l where l ->> 'variante_id' = :'va'),
  split_part(:'r_dup', '|', 3) like 'Ya hay un conteo abierto en esta ubicación%',
  jsonb_array_length(retail.fn_conteo_detalle(:'conteo2') -> 'lineas'));`),
  ["2", "3/7", "3", "t", "3"]
);

// ---------------------------------------------------------------------------
// 2. Verificar: vacío ≠ 0, diferencias, inesperadas, fuera de alcance
// ---------------------------------------------------------------------------
exito(
  "vacío ≠ 0: una línea sin contar sigue pendiente (no es 0); un 0 explícito la verifica en cero; NULL la vuelve a dejar pendiente",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("vb", 0)}
select l ->> 'estado' as e0, l ->> 'contada' as c0, l ->> 'diferencia' as d0 from (select ${LINEA("vb")} as l) x \\gset
${CONTAR("vb", "null")}
select concat_ws(',', :'e0', :'c0', :'d0', ${CAMPO("vb", "estado")}, coalesce(${CAMPO("vb", "contada")}, 'NULL'),
  retail.fn_conteo_detalle(:'conteo') -> 'resumen' ->> 'pendientes',
  retail.fn_conteo_detalle(:'conteo') -> 'resumen' ->> 'verificadas',
  (select count(*) from retail.conteo_items where conteo_id = :'conteo' and cantidad_contada is null));`),
  ["con_diferencia", "0", "-5", "pendiente", "NULL", "3", "0", "3"]
);

exito(
  "la diferencia es contado − debe haber: 11→9 da −2, 5→6 da +1, 6→0 da −6; y el resumen suma 1 sobrante y 8 faltantes",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("va", 9)}
${CONTAR("vb", 6)}
${CONTAR("vc", 0)}
select concat_ws(',', ${CAMPO("va", "estado")}, ${CAMPO("va", "diferencia")}, ${CAMPO("vb", "diferencia")}, ${CAMPO("vc", "diferencia")},
  retail.fn_conteo_detalle(:'conteo') -> 'resumen' ->> 'con_diferencia',
  retail.fn_conteo_detalle(:'conteo') -> 'resumen' ->> 'verificadas',
  retail.fn_conteo_detalle(:'conteo') -> 'resumen' ->> 'unidades_sobrantes',
  retail.fn_conteo_detalle(:'conteo') -> 'resumen' ->> 'unidades_faltantes');`),
  ["con_diferencia", "-2", "1", "-6", "3", "3", "1", "8"]
);

exito(
  "una variante inesperada (foto 0) se registra con lo encontrado; si se le quita la cantidad deja de mostrarse pero la fila queda",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("vd", 2)}
select l ->> 'foto' as f, l ->> 'debe_haber' as dh, l ->> 'contada' as c, l ->> 'diferencia' as d, l ->> 'estado' as e from (select ${LINEA("vd")} as l) x \\gset
select retail.fn_conteo_detalle(:'conteo') -> 'resumen' ->> 'variantes' as v4 \\gset
${CONTAR("vd", "null")}
select concat_ws(',', :'f', :'dh', :'c', :'d', :'e', :'v4', coalesce(${LINEA("vd")}::text, 'NULL'),
  retail.fn_conteo_detalle(:'conteo') -> 'resumen' ->> 'variantes',
  (select count(*) from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'vd'));`),
  ["0", "0", "2", "2", "con_diferencia", "4", "NULL", "3", "1"]
);

// El borde de la regla D3 (foto 0). Una inesperada a la que SOLO se le borró la cantidad se ignora; pero una inesperada que
// se mandó a recontar (tiene `contada_anterior`) NO se ignora: la persona ya la encontró y no puede desaparecer de la lista.
// Las funciones que viven de esta regla (el ayudante de líneas, `cerrar_conteo` y `fn_conteos_resumen`) tienen que coincidir.
const RESUMEN_DEL_CONTEO = `(select pendientes from retail.fn_conteos_resumen(:'u') where id = :'conteo')`;
const escenaInesperadaRecontada = (mutacion = "") => comoFelipe(`${ESCENA}
${mutacion}
${ABRIR_PISO}
${CONTAR("vd", 2)}
select coalesce(retail.conteo_recontar(:'conteo', :'vd') ->> 'estado', 'NULL') as ret \\gset
${CONTAR("va", 11)}
${CONTAR("vb", 5)}
${CONTAR("vc", 6)}
${CERRAR_INTENTO("r1")}
select concat_ws(',', :'ret', ${CAMPO("vd", "estado")}, ${CAMPO("vd", "anterior")}, coalesce(${CAMPO("vd", "contada")}, 'NULL'), ${CAMPO("vd", "foto")},
  d -> 'resumen' ->> 'variantes', d -> 'resumen' ->> 'verificadas', d -> 'resumen' ->> 'pendientes', d -> 'resumen' ->> 'en_reconteo',
  ${RESUMEN_DEL_CONTEO},
  split_part(:'r1', '|', 2), split_part(:'r1', '|', 3) = 'Falta 1 variante por contar. Vuelve a contar o cierra como conteo parcial.')
from (select retail.fn_conteo_detalle(:'conteo') as d) x;`);
const INESPERADA_RECONTADA_ESPERADO = ["en_reconteo", "en_reconteo", "2", "NULL", "0", "4", "3", "1", "1", "1", "conteo_pendientes", "t"];

exito(
  "una inesperada (foto 0) mandada a recontar sigue visible «en reconteo» (conteo_recontar la devuelve), cuenta como pendiente y exige cierre parcial para cerrar",
  escenaInesperadaRecontada(),
  INESPERADA_RECONTADA_ESPERADO
);

exito(
  "cierre parcial con una inesperada en reconteo: la deja intacta (sin ajuste ni diferencia, su stock igual), la cuenta como pendiente y en el conteo cerrado sigue «en reconteo»",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("vd", 2)}
${RECONTAR("vd")}
${CONTAR("va", 11)}
${CONTAR("vb", 5)}
${CONTAR("vc", 6)}
select lineas_ajustadas as l_aj, lineas_correctas as l_co, lineas_pendientes as l_pe from retail.cerrar_conteo(:'conteo', true) \\gset
select concat_ws(',', :l_aj, :l_co, :l_pe,
  (select cantidad_contada is null and diferencia is null and movimiento_id is null and contada_anterior = 2
     from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'vd'),
  pg_temp.stock(:'vd', :'u', :'piso'), ${N_MOVS_DEL_CONTEO},
  (select parcial::text || '/' || pendientes || '/' || lineas || '/' || estado from retail.fn_conteos_resumen(:'u') where id = :'conteo'),
  ${CAMPO("vd", "estado")}, retail.fn_conteo_detalle(:'conteo') -> 'resumen' ->> 'pendientes');`),
  ["0", "3", "1", "t", "0", "0", "true/1/3/cerrado", "en_reconteo", "1"]
);

exito(
  "una inesperada a la que solo se le borró la cantidad (sin recontar) se ignora también al cerrar: no cuenta como pendiente y el conteo cierra sin cierre parcial",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("vd", 2)}
select retail.conteo_contar(:'conteo', :'vd', null) is null as ret_null \\gset
${CONTAR("va", 11)}
${CONTAR("vb", 5)}
${CONTAR("vc", 6)}
select retail.fn_conteo_detalle(:'conteo') -> 'resumen' as r0 \\gset
select ${RESUMEN_DEL_CONTEO} as pend_resumen \\gset
${CERRAR_INTENTO("r1")}
select concat_ws(',', :'ret_null', :'r0'::jsonb ->> 'variantes', :'r0'::jsonb ->> 'pendientes', :'pend_resumen', :'r1',
  (select estado from retail.conteos where id = :'conteo'),
  (select cantidad_contada is null and diferencia is null and movimiento_id is null and contada_anterior is null
     from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'vd'),
  coalesce(${LINEA("vd")}::text, 'NULL'),
  (select parcial::text || '/' || pendientes from retail.fn_conteos_resumen(:'u') where id = :'conteo'));`),
  ["t", "3", "0", "0", "SIN_ERROR", "cerrado", "t", "NULL", "false/0"]
);

exito(
  "inesperada: contar → recontar → des-contar sigue «en reconteo» (conserva la cifra anterior y cuenta como pendiente); al volver a contar lo mismo queda confirmada sola",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("vd", 2)}
${RECONTAR("vd")}
${CONTAR("vd", "null")}
select ${CAMPO("vd", "estado")} as e1, ${CAMPO("vd", "anterior")} as a1, coalesce(${CAMPO("vd", "contada")}, 'NULL') as c1,
  retail.fn_conteo_detalle(:'conteo') -> 'resumen' ->> 'variantes' as v1, retail.fn_conteo_detalle(:'conteo') -> 'resumen' ->> 'pendientes' as p1,
  ${RESUMEN_DEL_CONTEO} as pr1 \\gset
${CONTAR("vd", 2)}
select concat_ws(',', :'e1', :'a1', :'c1', :'v1', :'p1', :'pr1', ${CAMPO("vd", "estado")}, ${CAMPO("vd", "diferencia")}, ${CAMPO("vd", "anterior")},
  (${CAMPO("vd", "confirmada_en")} is not null)::text);`),
  ["en_reconteo", "2", "NULL", "4", "4", "4", "diferencia_confirmada", "2", "2", "true"]
);

exito(
  "conteo de categoría: una prenda de otra categoría pide confirmación (fuera_de_alcance, sin fila); confirmada se agrega; una de la foto no la pide",
  comoFelipe(`${ESCENA}
select retail.abrir_conteo(:'u', :'piso', 'categoria', :'cat_camisas') as conteo \\gset
select pg_temp.intento(format('select retail.conteo_contar(%L, %L, 4)', :'conteo', :'vc')) as r1 \\gset
select count(*) as filas1 from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'vc' \\gset
${CONTAR("vc", 4, "true")}
${CONTAR("va", 9)}
select concat_ws(',', split_part(:'r1', '|', 1), split_part(:'r1', '|', 2), split_part(:'r1', '|', 3) = 'Esta prenda no pertenece al conteo actual.',
  :'filas1', ${CAMPO("vc", "foto")}, ${CAMPO("vc", "debe_haber")}, ${CAMPO("vc", "contada")}, ${CAMPO("vc", "diferencia")}, ${CAMPO("va", "estado")});`),
  ["P0001", "fuera_de_alcance", "t", "0", "0", "6", "4", "-2", "con_diferencia"]
);

exito(
  "una cantidad negativa se rechaza (cantidad_invalida) y no toca nada",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
select pg_temp.intento(format('select retail.conteo_contar(%L, %L, -1)', :'conteo', :'vb')) as r \\gset
select concat_ws(',', split_part(:'r', '|', 1), split_part(:'r', '|', 2),
  (select count(*) from retail.conteo_items where conteo_id = :'conteo' and cantidad_contada is not null));`),
  ["P0001", "cantidad_invalida", "0"]
);

// ---------------------------------------------------------------------------
// 3. Cerrar: las reglas y su orden
// ---------------------------------------------------------------------------
const escena9b = (mutacion = "") => comoFelipe(`${ESCENA}
${mutacion}
${ABRIR_PISO}
${CONTAR("va", 11)}
${CERRAR_INTENTO("r")}
select concat_ws(',', split_part(:'r', '|', 1), split_part(:'r', '|', 2),
  split_part(:'r', '|', 3) = 'Faltan 2 variantes por contar. Vuelve a contar o cierra como conteo parcial.',
  (select estado from retail.conteos where id = :'conteo'));`);
const ESCENA_9B_ESPERADO = ["P0001", "conteo_pendientes", "t", "abierto"];

exito(
  "cerrar sin ninguna variante verificada: conteo_vacio («cancélalo»), el conteo sigue abierto y sin movimientos",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CERRAR_INTENTO("r")}
select concat_ws(',', split_part(:'r', '|', 1), split_part(:'r', '|', 2),
  split_part(:'r', '|', 3) like 'Este conteo no tiene ninguna variante verificada: no se cierra.%cancélalo.',
  (select estado from retail.conteos where id = :'conteo'), ${N_MOVS_DEL_CONTEO});`),
  ["P0001", "conteo_vacio", "t", "abierto", "0"]
);

exito(
  "cerrar con pendientes y sin cierre parcial: conteo_pendientes, el mensaje dice cuántas faltan y el conteo sigue abierto",
  escena9b(),
  ESCENA_9B_ESPERADO
);

exito(
  "cerrar con una diferencia sin confirmar: diferencias_sin_confirmar (dice cuántas) y el stock no se movió",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("va", 9)}
${CONTAR("vb", 5)}
${CONTAR("vc", 6)}
${CERRAR_INTENTO("r")}
select concat_ws(',', split_part(:'r', '|', 1), split_part(:'r', '|', 2),
  split_part(:'r', '|', 3) = 'Hay 1 variante con diferencia sin confirmar. Confirma o vuelve a contar cada una antes de cerrar.',
  (select estado from retail.conteos where id = :'conteo'), pg_temp.stock(:'va', :'u', :'piso'));`),
  ["P0001", "diferencias_sin_confirmar", "t", "abierto", "11"]
);

exito(
  "el orden de los errores: primero los pendientes; con cierre parcial, las diferencias sin confirmar",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("va", 9)}
${CERRAR_INTENTO("r1")}
${CERRAR_INTENTO("r2", "parcial")}
select concat_ws(',', split_part(:'r1', '|', 2), split_part(:'r2', '|', 2));`),
  ["conteo_pendientes", "diferencias_sin_confirmar"]
);

exito(
  "cierre completo: un ajuste por la variante con diferencia, delta con signo sobre el stock, trazabilidad completa y no se cierra dos veces",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("va", 9)}
${CONTAR("vb", 5)}
${CONTAR("vc", 6)}
${CONFIRMAR("va")}
select lineas_ajustadas as l_aj, unidades_sobrantes as u_so, unidades_faltantes as u_fa, lineas_correctas as l_co, lineas_pendientes as l_pe
  from retail.cerrar_conteo(:'conteo') \\gset
select id as item_va from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'va' \\gset
select id as mov from retail.movimientos where conteo_item_id = :'item_va' \\gset
${CERRAR_INTENTO("r2")}
select concat_ws(',', :l_aj, :u_so, :u_fa, :l_co, :l_pe,
  pg_temp.stock(:'va', :'u', :'piso'),
  (select tipo || '/' || motivo || '/' || cantidad from retail.movimientos where id = :'mov'),
  (select ci.movimiento_id = :'mov' and ci.diferencia = -2 from retail.conteo_items ci where ci.id = :'item_va'),
  (select m.ubicacion_id = c.ubicacion_id and m.sububicacion_id = c.sububicacion_id and m.usuario_id = c.cerrado_por and c.cerrado_por is not null
     from retail.movimientos m, retail.conteos c where m.id = :'mov' and c.id = :'conteo'),
  (select estado || '/' || (cerrado_en is not null)::text from retail.conteos where id = :'conteo'),
  ${N_MOVS_DEL_CONTEO},
  (select count(*) from retail.conteo_items where conteo_id = :'conteo' and diferencia = 0 and movimiento_id is null),
  (${LINEA("va")} ->> 'estado') || '/' || coalesce(${CAMPO("va", "actual")}, 'NULL') || '/' || ((${CAMPO("va", "ajuste_movimiento_id")}) = :'mov')::text,
  split_part(:'r2', '|', 3));`),
  ["1", "0", "2", "2", "0", "9", "ajuste/conteo/-2", "t", "t", "cerrado/true", "1", "2", "diferencia_confirmada/NULL/true", "Ese conteo ya está cerrado"]
);

exito(
  "cierre parcial: con p_parcial las pendientes NO se tocan (sin ajuste, sin diferencia), el stock de esa variante queda igual y 'parcial' se deriva",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("va", 9)}
${CONFIRMAR("va")}
${CONTAR("vb", 5)}
${CERRAR_INTENTO("r1")}
select lineas_ajustadas as l_aj, unidades_sobrantes as u_so, unidades_faltantes as u_fa, lineas_correctas as l_co, lineas_pendientes as l_pe
  from retail.cerrar_conteo(:'conteo', true) \\gset
select concat_ws(',', split_part(:'r1', '|', 2), :l_aj, :u_so, :u_fa, :l_co, :l_pe,
  (select cantidad_contada is null and diferencia is null and movimiento_id is null from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'vc'),
  pg_temp.stock(:'vc', :'u', :'piso'),
  (select count(*) from retail.movimientos where conteo_item_id = (select id from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'vc')),
  ${N_MOVS_DEL_CONTEO},
  (select parcial::text || '/' || pendientes || '/' || lineas || '/' || estado from retail.fn_conteos_resumen(:'u') where id = :'conteo'));`),
  ["conteo_pendientes", "1", "0", "2", "1", "1", "t", "6", "0", "1", "true/1/2/cerrado"]
);

// ---------------------------------------------------------------------------
// 4. Reconteo y confirmación
// ---------------------------------------------------------------------------
exito(
  "reconteo: la variante queda «en reconteo» (sin cifra, con la anterior), solo aplica a una con diferencia, cuenta como pendiente y al volver a contar conserva la anterior",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("va", 9)}
${RECONTAR("va")}
select l ->> 'estado' as e, coalesce(l ->> 'contada', 'NULL') as c, l ->> 'anterior' as a, coalesce(l ->> 'verificado_en', 'NULL') as v, l ->> 'debe_haber' as dh
  from (select ${LINEA("va")} as l) x \\gset
${INTENTO_CONTEO("ra", "conteo_recontar", "va")}
${CONTAR("vb", 5)}
${INTENTO_CONTEO("rb", "conteo_recontar", "vb")}
${INTENTO_CONTEO("rc", "conteo_recontar", "vc")}
${CERRAR_INTENTO("rd")}
${CONTAR("va", 10)}
select concat_ws(',', :'e', :'c', :'a', :'v', :'dh', split_part(:'ra', '|', 2), split_part(:'rb', '|', 2), split_part(:'rc', '|', 2),
  split_part(:'rd', '|', 2), split_part(:'rd', '|', 3) like 'Faltan 2 variantes%',
  ${CAMPO("va", "estado")}, ${CAMPO("va", "diferencia")}, ${CAMPO("va", "anterior")}, coalesce(${CAMPO("va", "confirmada_en")}, 'NULL'));`),
  ["en_reconteo", "NULL", "9", "NULL", "11", "recontar_no_aplica", "recontar_no_aplica", "recontar_no_aplica", "conteo_pendientes", "t", "con_diferencia", "-1", "9", "NULL"]
);

exito(
  "reconfirmación: recontar y que salga la misma cifra confirma sola; confirmar es idempotente, solo aplica a una diferencia y recontar con otra cifra la desconfirma",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("va", 9)}
${RECONTAR("va")}
${CONTAR("va", 9)}
select ${CAMPO("va", "estado")} as e, (${CAMPO("va", "confirmada_en")} is not null)::text as confirmada \\gset
${CONTAR("vb", 5)}
${INTENTO_CONTEO("r1", "conteo_confirmar_diferencia", "vb")}
${INTENTO_CONTEO("r2", "conteo_confirmar_diferencia", "vc")}
${CONTAR("vc", 3)}
${CONFIRMAR("vc")}
select ${CAMPO("vc", "confirmada_en")} as t1 \\gset
${CONFIRMAR("vc")}
select (${CAMPO("vc", "confirmada_en")} = :'t1')::text as igual \\gset
${CONTAR("vc", 2)}
select concat_ws(',', :'e', :'confirmada', split_part(:'r1', '|', 2), split_part(:'r2', '|', 2), :'igual',
  ${CAMPO("vc", "estado")}, coalesce(${CAMPO("vc", "confirmada_en")}, 'NULL'));`),
  ["diferencia_confirmada", "true", "confirmar_no_aplica", "confirmar_no_aplica", "true", "con_diferencia", "NULL"]
);

// ---------------------------------------------------------------------------
// 5. CASO P: movimientos legítimos antes y después de verificar (el orden se fija con clock_timestamp())
// ---------------------------------------------------------------------------
/** Salida por venta con created_at = clock_timestamp(): el instante REAL, que avanza dentro de la transacción. */
const VENTA_AHORA = (nombre, cantidad = 1) =>
  `select pg_temp.mover(:'va', :'u', :'piso', 'salida', ${cantidad}, 'venta', clock_timestamp()) as ${nombre} \\gset`;
const VERIFICAR_LAS_DEMAS = `${CONTAR("vb", 5)}\n${CONTAR("vc", 6)}`;

const escenaP1 = (mutacion = "") => comoFelipe(`${ESCENA}
${mutacion}
${ABRIR_PISO}
select foto_en as foto_en from retail.conteos where id = :'conteo' \\gset
${VENTA_AHORA("m_venta")}
${CONTAR("va", 10)}
${VERIFICAR_LAS_DEMAS}
${CERRAR_INTENTO("cierre")}
select concat_ws(',', ${CAMPO("va", "foto")}, ${CAMPO("va", "debe_haber")}, ${CAMPO("va", "estado")}, ${CAMPO("va", "diferencia")},
  (select coalesce(sum(m.cantidad), 0) from retail.movimientos m
    where m.variante_id = :'va' and m.ubicacion_id = :'u' and m.tipo = 'salida' and m.created_at > :'foto_en'::timestamptz
      and m.created_at <= (select verificado_en from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'va')),
  (select m.created_at < (select verificado_en from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'va') from retail.movimientos m where m.id = :'m_venta'),
  :'cierre',
  pg_temp.stock(:'va', :'u', :'piso'));`);
const P1_ESPERADO = ["11", "10", "correcta", "0", "1", "t", "SIN_ERROR", "10"];

exito(
  "CASO P · venta ANTES de verificar: el debe haber ya la descuenta (foto 11, debe haber 10), sin falso faltante, el libro la explica y el stock final no cambia",
  escenaP1(),
  P1_ESPERADO
);

const escenaP2 = (mutacion = "") => comoFelipe(`${ESCENA}
${mutacion}
${ABRIR_PISO}
${CONTAR("va", 9)}
${CONFIRMAR("va")}
${VENTA_AHORA("m_venta")}
${VERIFICAR_LAS_DEMAS}
select ${CAMPO("va", "actual")} as actual_antes \\gset
${CERRAR_INTENTO("cierre")}
select id as item_va from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'va' \\gset
select concat_ws(',', ${CAMPO("va", "debe_haber")}, :'actual_antes', ${CAMPO("va", "estado")}, :'cierre',
  pg_temp.stock(:'va', :'u', :'piso'),
  (select cantidad from retail.movimientos where conteo_item_id = :'item_va'),
  (select count(*) = 1 and bool_and((select verificado_en from retail.conteo_items where id = :'item_va') < created_at)
     from retail.movimientos where id = :'m_venta'));`);
const P2_ESPERADO = ["11", "10", "diferencia_confirmada", "SIN_ERROR", "8", "-2", "t"];

exito(
  "CASO P · venta DESPUÉS de verificar: el ajuste (contado − debe haber = −2) se aplica sobre el stock ACTUAL (10 → 8) y la venta se conserva; ni «fijar en lo contado» (9) ni falso faltante",
  escenaP2(),
  P2_ESPERADO
);

exito(
  "CASO P · venta antes Y después: foto 11, debe haber 10, contado 9 → ajuste −1; stock final 8 = lo contado menos lo vendido después",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
select foto_en as foto_en from retail.conteos where id = :'conteo' \\gset
${VENTA_AHORA("m_antes")}
${CONTAR("va", 9)}
${CONFIRMAR("va")}
${VENTA_AHORA("m_despues")}
${VERIFICAR_LAS_DEMAS}
${CERRAR_INTENTO("cierre")}
select id as item_va from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'va' \\gset
select concat_ws(',', ${CAMPO("va", "foto")}, ${CAMPO("va", "debe_haber")}, ${CAMPO("va", "diferencia")}, :'cierre',
  pg_temp.stock(:'va', :'u', :'piso'),
  (select cantidad from retail.movimientos where conteo_item_id = :'item_va'),
  (select count(*) from retail.movimientos where id in (:'m_antes', :'m_despues')),
  (select a.created_at < i.verificado_en and i.verificado_en < d.created_at
     from retail.movimientos a, retail.movimientos d, retail.conteo_items i where a.id = :'m_antes' and d.id = :'m_despues' and i.id = :'item_va'));`),
  ["11", "10", "-1", "SIN_ERROR", "8", "-1", "2", "t"]
);

// ---------------------------------------------------------------------------
// 6. CONTROLES: la misma escena con la alternativa descartada TIENE que dar otro resultado
// ---------------------------------------------------------------------------
control(
  "CONTROL · si conteo_contar NO renovara el debe haber (se quedara con la foto), el caso P «venta antes» daría falso faltante: la prueba lo detecta",
  escenaP1(MUTAR("retail.conteo_contar(uuid,uuid,integer,boolean)", "cantidad_sistema = excluded.cantidad_sistema", "cantidad_sistema = conteo_items.cantidad_sistema")),
  P1_ESPERADO
);

control(
  "CONTROL · si cerrar_conteo FIJARA el stock en lo contado, el caso P «venta después» resucitaría la venta (stock 9, no 8): la prueba lo detecta",
  escenaP2(
    MUTAR(
      "retail.cerrar_conteo(uuid,boolean)",
      "v_dif := r.cantidad_contada - r.cantidad_sistema;",
      "v_dif := r.cantidad_contada - (select coalesce(sum(s.cantidad), 0) from stock s where s.variante_id = r.variante_id and s.ubicacion_id = c.ubicacion_id and (c.sububicacion_id is null or s.sububicacion_id = c.sububicacion_id));"
    )
  ),
  P2_ESPERADO
);

control(
  "CONTROL · si cerrar_conteo no exigiera cierre parcial, el cierre con pendientes pasaría sin error: la prueba lo detecta",
  escena9b(MUTAR("retail.cerrar_conteo(uuid,boolean)", "if v_pendientes > 0 and not coalesce(p_parcial, false) then", "if false then")),
  ESCENA_9B_ESPERADO
);

control(
  "CONTROL · si fn_conteos_resumen contara las pendientes como líneas (como antes), la exactitud se inflaría: la prueba lo detecta",
  comoFelipe(`${ESCENA}
${MUTAR("retail.fn_conteos_resumen(uuid,integer)", "count(*) filter (where ci.cantidad_contada is not null)::integer as lineas", "count(*)::integer as lineas")}
${ABRIR_PISO}
${CONTAR("va", 9)}
select concat_ws(',', lineas, lineas_con_diferencia, sistema, contado, diferencia, pendientes, parcial, estado)
  from retail.fn_conteos_resumen(:'u') where id = :'conteo';`),
  ["1", "1", "11", "9", "-2", "2", "f", "abierto"]
);

// Las tres funciones que viven de la regla D3 (foto 0 + sin cantidad + sin cifra anterior = ignorada) tienen su control:
// si CUALQUIERA vuelve a la regla vieja («foto 0 sin cantidad = ignorada, aunque se haya mandado a recontar»), la misma
// escena de la inesperada recontada tiene que dar otro resultado.
control(
  "CONTROL · si el ayudante de líneas ignorara la inesperada aunque tenga cifra anterior (regla vieja), esta desaparecería de la lista al recontarla: la prueba lo detecta",
  escenaInesperadaRecontada(
    MUTAR(
      "retail.fn_conteo_lineas_json(uuid,uuid,boolean)",
      "and not (ci.cantidad_contada is null and coalesce(ci.cantidad_foto, 0) = 0 and ci.contada_anterior is null)",
      "and not (ci.cantidad_contada is null and coalesce(ci.cantidad_foto, 0) = 0)"
    )
  ),
  INESPERADA_RECONTADA_ESPERADO
);

control(
  "CONTROL · si cerrar_conteo no contara como pendiente a la inesperada en reconteo (regla vieja), cerraría sin cierre parcial dejando una prenda encontrada sin verificar: la prueba lo detecta",
  escenaInesperadaRecontada(
    MUTAR(
      "retail.cerrar_conteo(uuid,boolean)",
      "count(*) filter (where cantidad_contada is null and (coalesce(cantidad_foto, 0) > 0 or contada_anterior is not null)),",
      "count(*) filter (where cantidad_contada is null and coalesce(cantidad_foto, 0) > 0),"
    )
  ),
  INESPERADA_RECONTADA_ESPERADO
);

control(
  "CONTROL · si fn_conteos_resumen no contara como pendiente a la inesperada en reconteo (regla vieja), el historial diría «0 pendientes» de un conteo a medias: la prueba lo detecta",
  escenaInesperadaRecontada(
    MUTAR(
      "retail.fn_conteos_resumen(uuid,integer)",
      "count(*) filter (where ci.cantidad_contada is null and (coalesce(ci.cantidad_foto, 0) > 0 or ci.contada_anterior is not null))::integer as pendientes",
      "count(*) filter (where ci.cantidad_contada is null and coalesce(ci.cantidad_foto, 0) > 0)::integer as pendientes"
    )
  ),
  INESPERADA_RECONTADA_ESPERADO
);

// ---------------------------------------------------------------------------
// 7. El historial (fn_conteos_resumen) y la lectura de conteos anteriores al rediseño
// ---------------------------------------------------------------------------
exito(
  "fn_conteos_resumen no cuenta las pendientes como líneas (1 verificada, 2 pendientes); todo pendiente da 0 líneas; sin soles_diferencia y con pendientes/parcial al final",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("va", 9)}
select concat_ws(',', lineas, lineas_con_diferencia, sistema, contado, diferencia, pendientes, parcial, estado) as f1
  from retail.fn_conteos_resumen(:'u') where id = :'conteo' \\gset
select retail.anular_conteo(:'conteo') as _a \\gset
select retail.abrir_conteo(:'u', :'alm') as conteo2 \\gset
select concat_ws(',', lineas, lineas_con_diferencia, sistema, contado, diferencia, pendientes, parcial, estado) as f2
  from retail.fn_conteos_resumen(:'u') where id = :'conteo2' \\gset
select concat_ws(';', :'f1', :'f2',
  (select proargnames::text from pg_proc where oid = 'retail.fn_conteos_resumen(uuid,integer)'::regprocedure),
  (select prosecdef::text from pg_proc where oid = 'retail.fn_conteos_resumen(uuid,integer)'::regprocedure));`),
  [
    "1,1,11,9,-2,2,f,abierto;0,0,0,0,0,2,f,abierto;{p_ubicacion_id,p_limite,id,numero,estado,created_at,cerrado_en,sububicacion_id,sububicacion_nombre,sububicacion_tipo,alcance,alcance_categoria_nombre,abierto_por,cerrado_por,lineas,lineas_con_diferencia,sistema,contado,diferencia,pendientes,parcial};false",
  ]
);

exito(
  "el abierto va primero aunque haya un cerrado más nuevo; un conteo anterior al rediseño (sin foto) se lee con foto = debe haber y sin pendientes",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
insert into retail.conteos (ubicacion_id, sububicacion_id, estado, created_at, cerrado_en)
  values (:'u', :'alm', 'cerrado', now() + interval '1 hour', now()) returning id as leg \\gset
insert into retail.conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada, diferencia) values (:'leg', :'vd', 5, 3, -2);
select (select estado from retail.fn_conteos_resumen(:'u', 1)) as primero \\gset
select concat_ws(',', :'primero',
  (select concat_ws('/', lineas, lineas_con_diferencia, sistema, contado, diferencia, pendientes, parcial) from retail.fn_conteos_resumen(:'u') where id = :'leg'),
  (select l ->> 'foto' || '/' || (l ->> 'estado') || '/' || coalesce(l ->> 'actual', 'NULL')
     from jsonb_array_elements(retail.fn_conteo_detalle(:'leg') -> 'lineas') l limit 1));`),
  ["abierto", "1/1/5/3/-2/0/f", "5/con_diferencia/NULL"]
);

// ---------------------------------------------------------------------------
// 8. Sububicación obligatoria y Taller
// ---------------------------------------------------------------------------
exito(
  "tienda con piso y almacén: abrir sin sububicación (sububicacion_requerida) o con cuarentena / de otra ubicación (sububicacion_invalida) se rechaza sin dejar un conteo; con piso o almacén abre",
  comoFelipe(`${ESCENA}
select id as sub_otra from retail.sububicaciones where tipo = 'piso_venta' and ubicacion_id <> :'u' limit 1 \\gset
select pg_temp.intento(format('select retail.abrir_conteo(%L)', :'u')) as r1 \\gset
select pg_temp.intento(format('select retail.abrir_conteo(%L, %L)', :'u', :'cua')) as r2 \\gset
select pg_temp.intento(format('select retail.abrir_conteo(%L, %L)', :'u', :'sub_otra')) as r3 \\gset
select count(*) as n0 from retail.conteos where ubicacion_id = :'u' \\gset
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
select retail.anular_conteo(:'conteo') as _a \\gset
select retail.abrir_conteo(:'u', :'alm') as conteo2 \\gset
select concat_ws(',', split_part(:'r1', '|', 1) || '/' || split_part(:'r1', '|', 2), split_part(:'r2', '|', 2), split_part(:'r3', '|', 2), :'n0',
  (select count(*) from retail.conteos where ubicacion_id = :'u'));`),
  ["P0001/sububicacion_requerida", "sububicacion_invalida", "sububicacion_invalida", "0", "2"]
);

exito(
  "el Taller (sin piso/almacén, stock sin sububicación) sigue contando toda la ubicación: foto, diferencia y ajuste con sububicación NULL; una sububicación se rechaza",
  comoFelipe(`${ESCENA}
insert into retail.ubicaciones (nombre, tipo) values ('ZZ Taller rediseño', 'taller') returning id as tl \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'tl', 'Rack A', 'rack') returning id as rack \\gset
select pg_temp.poner(:'va', :'tl', null, 4) \\gset
select pg_temp.poner(:'vb', :'tl', null, 2) \\gset
select pg_temp.intento(format('select retail.abrir_conteo(%L, %L)', :'tl', :'rack')) as r1 \\gset
select retail.abrir_conteo(:'tl') as conteo \\gset
select string_agg(cantidad_foto::text, '/' order by cantidad_foto) as fotos from retail.conteo_items where conteo_id = :'conteo' \\gset
${CONTAR("va", 3)}
${CONFIRMAR("va")}
${CONTAR("vb", 2)}
select lineas_ajustadas as l_aj, unidades_faltantes as u_fa from retail.cerrar_conteo(:'conteo') \\gset
select concat_ws(',', split_part(:'r1', '|', 2), (select count(*) from retail.conteo_items where conteo_id = :'conteo'), :'fotos', :l_aj, :u_fa,
  pg_temp.stock(:'va', :'tl', null),
  (select sububicacion_id is null from retail.movimientos where conteo_item_id in (select id from retail.conteo_items where conteo_id = :'conteo')));`),
  ["sububicacion_invalida", "2", "2/4", "1", "1", "3", "t"]
);

// ---------------------------------------------------------------------------
// 8b. La cifra de la tarjeta de abrir (`fn_conteo_alcance`): tiene que ser la de la foto
// ---------------------------------------------------------------------------
/**
 * La cifra previa contra la foto real: para cada alcance se pide la cifra a `fn_conteo_alcance`, se abre el conteo de verdad
 * y se cuentan sus filas (`conteo_items`). Escena: piso = va, vb, vc (ve quedó en 0 y la pieza del sistema no se cuenta) → 3,
 * de Camisas y Blusas → 2; almacén = vd, va → 2; el Taller cuenta a `va` UNA vez aunque esté en dos lugares → 2.
 * Devuelve: piso=foto, camisas=foto, almacén=foto, filas de cuarentena, Taller=foto, y las cuatro cifras.
 */
const PARIDAD_ALCANCE = (mutacion = "") =>
  comoFelipe(`${ESCENA}
${mutacion}
select coalesce(sum(variantes), 0) as a_piso from retail.fn_conteo_alcance(:'u') where sububicacion_id = :'piso' \\gset
select coalesce(sum(variantes), 0) as a_cam from retail.fn_conteo_alcance(:'u') where sububicacion_id = :'piso' and categoria_id = :'cat_camisas' \\gset
select coalesce(sum(variantes), 0) as a_alm from retail.fn_conteo_alcance(:'u') where sububicacion_id = :'alm' \\gset
select count(*) as a_cua from retail.fn_conteo_alcance(:'u') where sububicacion_id = :'cua' \\gset
${ABRIR_PISO}
select count(*) as f_piso from retail.conteo_items where conteo_id = :'conteo' \\gset
select retail.anular_conteo(:'conteo') as _a1 \\gset
select retail.abrir_conteo(:'u', :'piso', 'categoria', :'cat_camisas') as conteo \\gset
select count(*) as f_cam from retail.conteo_items where conteo_id = :'conteo' \\gset
select retail.anular_conteo(:'conteo') as _a2 \\gset
select retail.abrir_conteo(:'u', :'alm') as conteo \\gset
select count(*) as f_alm from retail.conteo_items where conteo_id = :'conteo' \\gset
insert into retail.ubicaciones (nombre, tipo) values ('ZZ Taller alcance', 'taller') returning id as tl \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'tl', 'Rack A', 'rack') returning id as rack \\gset
select pg_temp.poner(:'va', :'tl', null, 4) \\gset
select pg_temp.poner(:'va', :'tl', :'rack', 1) \\gset
select pg_temp.poner(:'vb', :'tl', null, 2) \\gset
select coalesce(sum(variantes), 0) as a_tl from retail.fn_conteo_alcance(:'tl') where sububicacion_id is null \\gset
select retail.abrir_conteo(:'tl') as conteo_tl \\gset
select count(*) as f_tl from retail.conteo_items where conteo_id = :'conteo_tl' \\gset
select concat_ws(',', :a_piso = :f_piso, :a_cam = :f_cam, :a_alm = :f_alm, :a_cua, :a_tl = :f_tl, :a_piso, :a_cam, :a_alm, :a_tl);`);

exito(
  "la cifra de la tarjeta de abrir (fn_conteo_alcance) es la de la foto: piso, categoría, almacén y Taller (una variante en dos lugares cuenta una vez); la cuarentena no se ofrece",
  PARIDAD_ALCANCE(),
  ["t", "t", "t", "0", "t", "3", "2", "2", "2"]
);

control(
  "control: si la cifra contara también las variantes en 0 (el ve del piso), ya no coincide con la foto",
  PARIDAD_ALCANCE(MUTAR("retail.fn_conteo_alcance(uuid)", "where pv.cantidad > 0", "where pv.cantidad >= 0")),
  ["t", "t", "t", "0", "t", "3", "2", "2", "2"]
);

control(
  "control: si la cifra contara la pieza del sistema (el cargo especial no es una prenda), ya no coincide con la foto",
  PARIDAD_ALCANCE(MUTAR("retail.fn_conteo_alcance(uuid)", "and not fn_producto_es_pieza_del_sistema(p.id)", "and true")),
  ["t", "t", "t", "0", "t", "3", "2", "2", "2"]
);

exito(
  "fn_conteo_alcance no se la da a quien no opera la sede: una colaboradora de otra sede recibe vacío (no un error), y el líder sí ve cifras",
  comoFelipe(`${ESCENA}
set local request.jwt.claim.sub = '${MICAELA}';
select count(*) as n_micaela from retail.fn_conteo_alcance(:'u') \\gset
set local request.jwt.claim.sub = '${FELIPE}';
select concat_ws(',', :n_micaela, (select count(*) > 0 from retail.fn_conteo_alcance(:'u')));`),
  ["0", "t"]
);

// ---------------------------------------------------------------------------
// 9. Permisos, anular, CHECKs
// ---------------------------------------------------------------------------
exito(
  "una colaboradora de otra sede no opera el conteo: no lo ve (detalle NULL), no cuenta, no recuenta, no confirma, no abre ni cierra; el conteo sigue abierto",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("va", 9)}
set local request.jwt.claim.sub = '${MICAELA}';
select retail.fn_conteo_detalle(:'conteo') is null as d_null \\gset
${INTENTO_CONTEO("r1", "conteo_contar", "vb", ", 5")}
${INTENTO_CONTEO("r2", "conteo_recontar", "va")}
${INTENTO_CONTEO("r3", "conteo_confirmar_diferencia", "va")}
select pg_temp.intento(format('select retail.abrir_conteo(%L, %L)', :'u', :'piso')) as r4 \\gset
${CERRAR_INTENTO("r5")}
set local request.jwt.claim.sub = '${FELIPE}';
select concat_ws(',', :'d_null',
  split_part(:'r1', '|', 3) = 'No tienes permiso para contar en esa ubicación',
  split_part(:'r2', '|', 3) = 'No tienes permiso para contar en esa ubicación',
  split_part(:'r3', '|', 3) = 'No tienes permiso para contar en esa ubicación',
  split_part(:'r4', '|', 3) = 'No tienes permiso para contar en esa ubicación',
  split_part(:'r5', '|', 3) ~ '^(Solo un líder puede cerrar un conteo|No tienes permiso sobre esa ubicación)',
  (select estado from retail.conteos where id = :'conteo'));`),
  ["t", "t", "t", "t", "t", "t", "abierto"]
);

exito(
  "anular no cambió: pasa a anulado, no toca stock ni movimientos, deja las líneas, ya no se puede contar y se puede abrir otro",
  comoFelipe(`${ESCENA}
${ABRIR_PISO}
${CONTAR("va", 9)}
select retail.anular_conteo(:'conteo') as _a \\gset
select pg_temp.intento(format('select retail.conteo_contar(%L, %L, 5)', :'conteo', :'vb')) as r \\gset
select retail.abrir_conteo(:'u', :'piso') as conteo2 \\gset
select concat_ws(',', (select estado from retail.conteos where id = :'conteo'), pg_temp.stock(:'va', :'u', :'piso'), ${N_MOVS_DEL_CONTEO},
  (select count(*) from retail.conteo_items where conteo_id = :'conteo'), split_part(:'r', '|', 3),
  (select estado from retail.conteos where id = :'conteo2'));`),
  ["anulado", "11", "0", "3", "Ese conteo ya está anulado", "abierto"]
);

exito(
  "la tabla lo hace cumplir: confirmar una línea sin contar es imposible (23514), una línea sin contar es válida, la foto no puede ser negativa",
  comoFelipe(`${ESCENA}
insert into retail.conteos (ubicacion_id, sububicacion_id, estado) values (:'u', :'piso', 'anulado') returning id as cx \\gset
select pg_temp.intento(format('insert into retail.conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada, confirmada_en) values (%L, %L, 1, null, now())', :'cx', :'va')) as r1 \\gset
select pg_temp.intento(format('insert into retail.conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada) values (%L, %L, 1, null)', :'cx', :'va')) as r2 \\gset
select pg_temp.intento(format('insert into retail.conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada, cantidad_foto) values (%L, %L, 1, null, -1)', :'cx', :'vb')) as r3 \\gset
select concat_ws(',', split_part(:'r1', '|', 1), :'r2', split_part(:'r3', '|', 1));`),
  ["23514", "SIN_ERROR", "23514"]
);

// ---------------------------------------------------------------------------
// 10. Estructura: firmas, marcas, firma del responsable, grants
// ---------------------------------------------------------------------------
const CUENTA = (firma, marca) =>
  `(select (length(d) - length(replace(d, '${marca}', ''))) / length('${marca}') from (select pg_get_functiondef('${firma}'::regprocedure) as d) x)`;
const FIRMAS = {
  contar: "retail.conteo_contar(uuid,uuid,integer,boolean)",
  cerrar: "retail.cerrar_conteo(uuid,boolean)",
  recontar: "retail.conteo_recontar(uuid,uuid)",
  confirmar: "retail.conteo_confirmar_diferencia(uuid,uuid)",
  abrir: "retail.abrir_conteo(uuid,uuid,text,uuid)",
};

exito(
  "firmas: una sola por función (sin las viejas), las eliminadas ya no existen, fn_costos_variantes_json sigue y las marcas de parche están UNA vez cada una",
  comoFelipe(`select concat_ws(',',
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace
     and proname in ('abrir_conteo','conteo_contar','conteo_recontar','conteo_confirmar_diferencia','fn_conteo_detalle','fn_conteo_lineas_json','cerrar_conteo','anular_conteo','fn_conteos_resumen')),
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('previsualizar_cierre_conteo','fn_prioridad_conteo','fn_soles_diferencia_conteo')),
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_costos_variantes_json'),
  ${CUENTA(FIRMAS.contar, "ADR-0189 (conteo-foto)")},
  ${CUENTA(FIRMAS.contar, "cantidad_sistema = excluded.cantidad_sistema")},
  ${CUENTA(FIRMAS.cerrar, "ADR-0189 (conteo-orden)")},
  ${CUENTA(FIRMAS.cerrar, "conteo_vacio_no_se_cierra")});`),
  ["9", "0", "1", "1", "1", "1", "1"]
);

exito(
  "firman con el responsable UNA vez (abrir, contar, recontar, confirmar, cerrar), cerrar_conteo no menciona el permiso de líder suelto, y anular sigue igual",
  comoFelipe(`select concat_ws(',',
  ${CUENTA(FIRMAS.abrir, "fn_actor_persona_id(true)")}, ${CUENTA(FIRMAS.contar, "fn_actor_persona_id(true)")},
  ${CUENTA(FIRMAS.recontar, "fn_actor_persona_id(true)")}, ${CUENTA(FIRMAS.confirmar, "fn_actor_persona_id(true)")},
  ${CUENTA(FIRMAS.cerrar, "fn_actor_persona_id(true)")},
  ${CUENTA(FIRMAS.cerrar, "fn_es_lider()")},
  ${CUENTA("retail.anular_conteo(uuid)", "fn_actor_persona_id(true)")},
  (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace
     and p.proname in ('abrir_conteo','conteo_contar','conteo_recontar','conteo_confirmar_diferencia','cerrar_conteo','anular_conteo')
     and pg_get_functiondef(p.oid) ~ 'fn_actor_persona_id\\(false\\)'));`),
  ["1", "1", "1", "1", "1", "0", "1", "0"]
);

exito(
  "grants: las funciones nuevas las ejecuta authenticated y no anon; el ayudante de líneas no lo ejecuta nadie fuera de la base",
  comoFelipe(`select concat_ws(',',
  (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace
     and p.proname in ('conteo_contar','conteo_recontar','conteo_confirmar_diferencia','fn_conteo_detalle','cerrar_conteo','fn_conteos_resumen')
     and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')),
  (select has_function_privilege('authenticated', 'retail.fn_conteo_lineas_json(uuid,uuid,boolean)'::regprocedure, 'execute')
      or has_function_privilege('anon', 'retail.fn_conteo_lineas_json(uuid,uuid,boolean)'::regprocedure, 'execute')));`),
  ["6", "f"]
);

// ---------------------------------------------------------------------------
// 11. Simulacro de re-pegado
// ---------------------------------------------------------------------------
exito(
  "re-pegar 20260924120000 dos veces sobre las funciones nuevas no cambia nada: cada marca sigue UNA vez (ADR-0189)",
  comoFelipe(`${MIG_ADR_0189}
${MIG_ADR_0189}
select concat_ws(',',
  ${CUENTA(FIRMAS.contar, "ADR-0189 (conteo-foto)")}, ${CUENTA(FIRMAS.contar, "cantidad_sistema = excluded.cantidad_sistema")},
  ${CUENTA(FIRMAS.cerrar, "ADR-0189 (conteo-orden)")}, ${CUENTA(FIRMAS.cerrar, "conteo_vacio_no_se_cierra")},
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('conteo_contar','cerrar_conteo')));`),
  ["1", "1", "1", "1", "2"]
);

exito(
  "re-pegar 20260923120000 ya no es posible (busca cerrar_conteo(uuid), que se eliminó): falla con «no existe la función» y NO toca nada; la marca sigue UNA vez",
  comoFelipe(`select pg_temp.intento($m$${MIG_VACIO}$m$) as r \\gset
select concat_ws(',', split_part(:'r', '|', 1),
  ${CUENTA(FIRMAS.cerrar, "conteo_vacio_no_se_cierra")},
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'cerrar_conteo'));`),
  ["42883", "1", "1"]
);

exito(
  "las dos migraciones nuevas se pueden pegar dos veces (idempotentes): mismas firmas, mismas marcas",
  comoFelipe(`${MIGRACIONES_NUEVAS}
${MIGRACIONES_NUEVAS}
select concat_ws(',',
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace
     and proname in ('abrir_conteo','conteo_contar','conteo_recontar','conteo_confirmar_diferencia','fn_conteo_detalle','fn_conteo_lineas_json','cerrar_conteo','anular_conteo','fn_conteos_resumen')),
  ${CUENTA(FIRMAS.contar, "ADR-0189 (conteo-foto)")}, ${CUENTA(FIRMAS.cerrar, "conteo_vacio_no_se_cierra")},
  (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'conteo_items' and column_name in ('cantidad_foto','verificado_en','contada_anterior','confirmada_en')),
  (select count(*) from pg_constraint where conrelid = 'retail.conteo_items'::regclass and conname = 'conteo_items_confirmada_coherente'),
  (select count(*) from pg_indexes where schemaname = 'retail' and tablename = 'conteo_items' and indexname = 'conteo_items_variante_idx'));`),
  ["9", "1", "1", "4", "1", "1"]
);

// ---------------------------------------------------------------------------
// 12. El seed: la misma secuencia que corre `supabase/seed.sql` (Lima, piso) debe cerrar, y sin confirmar no cierra
// ---------------------------------------------------------------------------
const SEED_LIMA = (confirma) => `
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as sub_piso_lima from retail.sububicaciones where ubicacion_id = :'lima' and tipo = 'piso_venta' \\gset
select id as blu from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select (select count(*) from (select retail.anular_conteo(id) from retail.conteos where ubicacion_id = :'lima' and estado = 'abierto') x) as _previo \\gset
select pg_temp.poner(:'blu', :'lima', :'sub_piso_lima', 2) \\gset
select retail.abrir_conteo(:'lima', :'sub_piso_lima') as conteo \\gset
select count(*) as _todas from (
  select retail.conteo_contar(:'conteo', s.variante_id, s.cantidad)
    from retail.stock s where s.ubicacion_id = :'lima' and s.sububicacion_id = :'sub_piso_lima' and s.variante_id <> :'blu') x \\gset
select retail.conteo_contar(:'conteo', :'blu', pg_temp.stock(:'blu', :'lima', :'sub_piso_lima') - 1) as _blu \\gset
${confirma ? `select retail.conteo_confirmar_diferencia(:'conteo', :'blu') as _conf \\gset` : ""}
select pg_temp.intento(format('select * from retail.cerrar_conteo(%L)', :'conteo')) as cierre \\gset
select concat_ws(',', :'cierre' like 'SIN_ERROR', split_part(:'cierre', '|', 2), (select estado from retail.conteos where id = :'conteo'));`;

exito(
  "el conteo del seed (Lima, piso): con la diferencia CONFIRMADA cierra; sin confirmarla `cerrar_conteo` la rechaza (por eso el seed la confirma antes de cerrar)",
  comoFelipe(SEED_LIMA(true)),
  ["t", "", "cerrado"]
);

exito(
  "el conteo del seed sin confirmar la diferencia no cierra: diferencias_sin_confirmar",
  comoFelipe(SEED_LIMA(false)),
  ["f", "diferencias_sin_confirmar", "abierto"]
);

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  if (EN_SECO) console.log("Modo --en-seco: las migraciones nuevas se cargan dentro de cada escenario (no se aplican a la base).\n");

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    // La última línea de salida es la fila de verificación: una sola columna con los valores unidos por comas.
    const ultima = resultado.ok ? (resultado.salida.split("\n").filter(Boolean).pop() ?? "") : "";
    const igual = resultado.ok && ultima === caso.esperado.join(",");

    if (caso.muerde) {
      // El control pasa cuando la versión mutada NO da el resultado bueno (o ni siquiera termina): la prueba muerde.
      if (igual) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    la mutación dio el MISMO resultado que la función buena: esta prueba no muerde`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
      continue;
    }

    if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      continue;
    }
    if (!igual) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    esperado: ${JSON.stringify(caso.esperado.join(","))}\n    salió:    ${JSON.stringify(ultima)}`);
    } else {
      console.log(`✓ ${caso.nombre}`);
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
