#!/usr/bin/env node
/**
 * Qué hay por COLOR y TALLA en la tienda online (ADR-0512, actividad 1) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261026145000_tienda_filtros.sql`: `retail.tienda_filtros(p_sede)`, que dice qué variantes (prenda, color, talla) se
 * pueden separar hoy en la tienda elegida o, con «Todas», en alguna de la web. La unidad del filtro es la VARIANTE: «Negro y M» exige
 * una negra en M, no «alguna negra y alguna M».
 *   1. Permisos: security definer con su search_path y solo de `tienda_web`; como `tienda_web` responde.
 *   2. LA REGLA DE «HAY» es la de toda la tienda (`fn_tienda_disponible`, ADR-0270), sin copiarla: lo libre de cada talla en Trujillo,
 *      en Lima y con «Todas», sin Cuarentena, sin lo apartado, sin el Taller. Y SIEMPRE coincide con lo que dice el catálogo: una prenda
 *      tiene variantes ⇔ su nivel en esa tienda no es 0 (Trujillo, Lima y «Todas», con prendas que hay en una sola tienda).
 *   3. Cambia al instante: vender la última unidad de una talla (registrar_venta) y apartarla (apartar_stock) la sacan.
 *   4. Lo que no se ofrece no cuenta: una talla retirada; una talla a S/ 0 (ADR-0384), que con precio propio de Trujillo se ofrece en
 *      Trujillo y con «Todas» y no en Lima (la misma regla del precio de toda la tienda); una prenda que no está publicada, la
 *      descontinuada y la de prueba.
 *   5. Las tiendas: una escondida o cualquiera (incluido el Taller) no se puede elegir (es «Todas») y no suma; sin tiendas en la web
 *      no hay nada.
 *   6. La cifra NUNCA sale: con 37 unidades, ningún número en la respuesta, ni nivel; cada variante son tres textos.
 *   7. Los colores que salen son los de las variantes que hay, con su `familia_color` del ERP (o null); una variante sin color sale
 *      con color null y no se pierde.
 *   8. Orden estable por prenda; la migración se puede volver a correr.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder): nunca se commitea nada en el Postgres local que
 * comparten los worktrees. Cada uno parte con la vitrina vacía, sin campañas, con Trujillo y Lima en la web, el umbral en 3 y el
 * stock de «Blusa Emma» en cero en todas partes; después pone exactamente lo que mira (`poner`).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261026145000_tienda_filtros.sql` mete la migración dentro de cada
 * transacción. Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * MUTANTES. `--mutantes` corre todo otra vez con versiones ROTAS a propósito de la migración (ignorar la tienda elegida, ofrecer lo
 * que no se ofrece, contar lo no publicado, contar el Taller y lo escondido, dejar salir la cifra, contar el físico y no lo libre,
 * devolver todos los colores, perder el color nulo, aceptar cualquier tienda…) y exige que cada una haga fallar al menos un
 * escenario: una prueba que no mata a ningún mutante no está probando nada.
 *
 * DA POR SENTADO: el seed (Felipe líder; «Blusa Emma» CMS en BEI y NEG, tallas S/M/L a S/ 79.90; «Falda Renata» a S/ 74.90; Tienda
 * Trujillo y Tienda Lima con piso, almacén y Cuarentena; el Taller), el rol `tienda_web` (20261014220000), las tiendas de la web
 * (20261014231000), la Vitrina (20261014225000), la ficha y sus piezas (20261015012000) y el precio por tienda (`poner_precio_sede`).
 *
 * USO
 *   pnpm pruebas:tienda-filtros                     → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-filtros -- --mutantes       → además, la prueba contra los mutantes (con la migración del repo)
 *   pnpm pruebas:tienda-filtros -- --contenedor supabase_db_<mi-pila>
 *   pnpm pruebas:tienda-filtros -- --mostrar 4      → imprime el SQL del escenario 4 para correrlo a mano (depurar uno que falla)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261026145000_tienda_filtros.sql";
const CON_MUTANTES = process.argv.includes("--mutantes");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Arma los escenarios con la migración que se quiera meter antes (la del repo, una mutante o ninguna). */
function escenarios(aplicarAntes) {
  const lista = [];
  const valor = (nombre, sql, esperado) => lista.push({ nombre, sql, esperado });
  const error = (nombre, sql, contiene) => lista.push({ nombre, sql, contiene });

  // ---- El punto de partida: vitrina vacía, sin campañas, Trujillo y Lima en la web, umbral 3, Emma sin stock en ningún lado ----
  const PREPARAR = `
begin;
${aplicarAntes}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.vitrina_productos set publicado = false where publicado;
update retail.etiquetas set activo = false where activo and descuento_pct is not null;
update retail.ubicacion_datos_web set mostrar = false where mostrar;
update retail.configuracion_tienda_web set quedan_pocas_desde = 3 where id;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
select id as tru_piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as tru_alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as tru_cua from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena' \\gset
select id as lim_piso from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
select id as lim_alm from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' \\gset
${["NEG", "BEI"]
  .flatMap((c) =>
    ["S", "M", "L"].map(
      (t) =>
        `select v.id as ${c.toLowerCase()}_${t.toLowerCase()} from retail.variantes v join retail.tallas ta on ta.id = v.talla_id where v.producto_id = :'emma' and v.color_codigo = '${c}' and ta.valor = '${t}' \\gset`,
    ),
  )
  .join("\n")}
select v.id as falda_neg_m from retail.variantes v join retail.tallas ta on ta.id = v.talla_id where v.producto_id = :'falda' and v.color_codigo = 'NEG' and ta.valor = 'M' \\gset
update retail.stock set cantidad = 0, cantidad_apartada = 0
 where variante_id in (select id from retail.variantes where producto_id in (:'emma', :'falda')) and (cantidad <> 0 or cantidad_apartada <> 0);
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
select retail.vitrina_mostrar(array[:'emma']::uuid[], true) \\gset
`;
  /** Deja EXACTAMENTE `cantidad` (y `apartada`) de una talla en un lugar (`lugar`: una variable de psql, o null = sin lugar). */
  const poner = (variante, sede, lugar, cantidad, apartada = 0) =>
    `insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
     values (:'${variante}', :'${sede}', ${lugar ? `:'${lugar}'` : "null"}, ${cantidad}, ${apartada})
     on conflict on constraint stock_variante_ubicacion_sububicacion_key
     do update set cantidad = excluded.cantidad, cantidad_apartada = excluded.cantidad_apartada;\n`;
  // El stock de la mayoría de escenarios: en Trujillo, NEG M 5 (hay) · NEG S 2+1 (3) · NEG L 2 · BEI S 1 (Última) · BEI M 3 con 3
  // apartadas (0) · BEI L 4 en Cuarentena (0); en Lima, NEG M 4 con 2 apartadas (2); en el Taller, NEG M 84 (no es tienda).
  // Lo que se espera de ahí: Trujillo = BEI/S, NEG/S, NEG/M, NEG/L · Lima = NEG/M · «Todas» = lo de Trujillo.
  const STOCK = [
    poner("neg_m", "tru", "tru_piso", 5),
    poner("neg_s", "tru", "tru_alm", 2),
    poner("neg_s", "tru", "tru_piso", 1),
    poner("neg_l", "tru", "tru_piso", 2),
    poner("bei_s", "tru", "tru_alm", 1),
    poner("bei_m", "tru", "tru_piso", 3, 3),
    poner("bei_l", "tru", "tru_cua", 4),
    poner("neg_m", "lim", "lim_piso", 4, 2),
    poner("neg_m", "taller", null, 84),
  ].join("");
  const TRU = "BEI/S,NEG/S,NEG/M,NEG/L";
  const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
  const SEDE = (sede) => (sede ? `:'${sede}'` : "null");
  /** Las variantes de una prenda en una tienda (o «Todas»), una línea: «COLOR/TALLA,…» (color null = «-»), en orden; «∅» si no hay. */
  const VARS = (prod, sede = null) =>
    `(select coalesce(string_agg(coalesce(x ->> 1, '-') || '/' || (x ->> 2), ',' order by x ->> 1 nulls first, retail.fn_actividad_peso_talla(x ->> 2)), '∅')
        from jsonb_array_elements(retail.tienda_filtros(${SEDE(sede)}) -> 'variantes') x where x ->> 0 = :'${prod}')`;
  const COLORES = `(select coalesce(string_agg(k || '=' || coalesce(v, 'null'), ',' order by k), '∅') from jsonb_each_text(retail.tienda_filtros() -> 'colores') as t (k, v))`;
  /** Vende una unidad en Lima (registrar_venta) con una caja abierta de prueba. */
  const VENDER_EN_LIMA = (variante) =>
    `select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'lim' and estado = 'abierta') c) as _cerro \\gset
      select retail.abrir_caja(:'lim', 100.00, 'prueba de los filtros de la tienda') as _caja \\gset
      select retail.registrar_venta(:'lim',
        jsonb_build_array(jsonb_build_object('variante_id', :'${variante}', 'cantidad', 1, 'precio_unitario', retail.fn_precio_en_sede(:'${variante}', :'lim'), 'descuento_unitario', 0)),
        jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', retail.fn_precio_en_sede(:'${variante}', :'lim'))),
        null, gen_random_uuid()) as _venta \\gset\n`;

  // ---------------------------------------------------------------- 1. Permisos
  valor(
    "tienda_filtros: security definer con su search_path, y solo de tienda_web",
    `begin;\n${aplicarAntes}\nselect concat_ws('|', p.prosecdef, exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'),
        has_function_privilege('public', p.oid, 'EXECUTE'), has_function_privilege('anon', p.oid, 'EXECUTE'),
        has_function_privilege('authenticated', p.oid, 'EXECUTE'), has_function_privilege('tienda_web', p.oid, 'EXECUTE'))
      from pg_proc p where p.oid = 'retail.tienda_filtros(uuid)'::regprocedure;\nrollback;`,
    "t|t|f|f|f|t",
  );
  valor(
    "como tienda_web: responde, con las tres llaves y lo mismo que el dueño de la función",
    `${PREPARAR}${STOCK}select retail.tienda_filtros(:'tru') as como_dueno \\gset
      ${COMO_TIENDA}select concat_ws('|', (select string_agg(k, ',' order by k) from jsonb_object_keys(retail.tienda_filtros(:'tru')) k),
          retail.tienda_filtros(:'tru') = :'como_dueno'::jsonb);\nrollback;`,
    "colores,sede,variantes|t",
  );
  error(
    "como tienda_web, leer el stock directo sigue negado (la función no abre la puerta a más)",
    `${PREPARAR}${COMO_TIENDA}select count(*) from retail.stock;\nrollback;`,
    "permission denied",
  );

  // ---------------------------------------------------------------- 2. LA regla de «hay»
  valor(
    "lo libre de cada talla, por tienda: sin Cuarentena, sin lo apartado, sin el Taller (Trujillo | Lima | Todas)",
    `${PREPARAR}${STOCK}select concat_ws('|', ${VARS("emma", "tru")}, ${VARS("emma", "lim")}, ${VARS("emma")});\nrollback;`,
    `${TRU}|NEG/M|${TRU}`,
  );
  valor(
    "con «Todas», lo de cualquier tienda de la web suma: BEI L solo en Lima aparece (y NEG M, que está en las dos, una sola vez)",
    `${PREPARAR}${STOCK}${poner("bei_l", "lim", "lim_piso", 3)}select concat_ws('|', ${VARS("emma")}, ${VARS("emma", "lim")}, ${VARS("emma", "tru")});\nrollback;`,
    `BEI/S,BEI/L,NEG/S,NEG/M,NEG/L|BEI/L,NEG/M|${TRU}`,
  );
  valor(
    "lo que no tiene lugar (una tienda que no separa piso y almacén) también cuenta, como en el catálogo",
    `${PREPARAR}${STOCK}${poner("bei_m", "lim", null, 2)}select ${VARS("emma", "lim")};\nrollback;`,
    "BEI/M,NEG/M",
  );
  valor(
    // La tienda no tiene dos reglas de «hay»: lo que dice el catálogo y lo que dicen los filtros son lo mismo, en cada tienda.
    "paridad con el catálogo: una prenda tiene variantes ⇔ su nivel en esa tienda no es 0 (Emma en las dos tiendas; la falda solo en Lima)",
    `${PREPARAR}${STOCK}select retail.vitrina_mostrar(array[:'falda']::uuid[], true) \\gset
      ${poner("falda_neg_m", "lim", "lim_piso", 3)}
      create function pg_temp.cat(p_prod uuid, p_sede uuid) returns int language sql as $f$
        select coalesce((select (coalesce(case when p_sede is null then x -> 'stock' ->> 'total' else x -> 'stock' -> 'sedes' ->> p_sede::text end, '0') <> '0')::int
                           from jsonb_array_elements(retail.tienda_catalogo(p_sede) -> 'prendas') x where x ->> 'id' = p_prod::text), 0)
      $f$;
      create function pg_temp.fil(p_prod uuid, p_sede uuid) returns int language sql as $f$
        select exists (select 1 from jsonb_array_elements(retail.tienda_filtros(p_sede) -> 'variantes') x where x ->> 0 = p_prod::text)::int
      $f$;
      select s.n || ': emma ' || pg_temp.cat(:'emma', s.id) || '/' || pg_temp.fil(:'emma', s.id)
                 || ' falda ' || pg_temp.cat(:'falda', s.id) || '/' || pg_temp.fil(:'falda', s.id)
        from (values (1, 'tru', :'tru'::uuid), (2, 'lim', :'lim'::uuid), (3, 'todas', null::uuid)) as s (o, n, id) order by s.o;
      rollback;`,
    "tru: emma 1/1 falda 0/0\nlim: emma 1/1 falda 1/1\ntodas: emma 1/1 falda 1/1",
  );

  // ---------------------------------------------------------------- 3. Cambia al instante
  valor(
    "vender la última unidad de una talla (registrar_venta) la saca al instante: Lima NEG M 1 → ∅",
    `${PREPARAR}${poner("neg_m", "lim", "lim_piso", 1)}select ${VARS("emma", "lim")};
      ${VENDER_EN_LIMA("neg_m")}select ${VARS("emma", "lim")};
      rollback;`,
    "NEG/M\n∅",
  );
  valor(
    "apartar la última unidad (Apartados) también la saca: Trujillo BEI S 1 → fuera",
    `${PREPARAR}${STOCK}select ${VARS("emma", "tru")};
      select retail.apartar_stock(:'bei_s', :'tru', 1, 'Cliente de prueba', '999999999', retail.fn_hoy_lima() + 3, null, :'tru_alm') \\gset
      select ${VARS("emma", "tru")};
      rollback;`,
    `${TRU}\nNEG/S,NEG/M,NEG/L`,
  );

  // ---------------------------------------------------------------- 4. Lo que no se ofrece no cuenta
  valor(
    // Una talla con prendas no se puede retirar (ADR-0270, decisión 13): se retira una VACÍA y, aunque después le llegue stock por un
    // dato que no debería existir, no sale: lo retirado no se ofrece.
    "una talla retirada no sale, aunque le quede stock",
    `${PREPARAR}update retail.variantes set activo = false where id = :'neg_m';
      ${STOCK}select ${VARS("emma", "tru")};
      rollback;`,
    "BEI/S,NEG/S,NEG/L",
  );
  valor(
    "una talla a S/ 0 (ADR-0384) no sale; con precio propio en Trujillo sale en Trujillo y con «Todas» (el mayor) y no en Lima",
    `${PREPARAR}${STOCK}${poner("neg_l", "tru", "tru_piso", 3)}${poner("neg_l", "lim", "lim_piso", 2)}update retail.variantes set precio = 0 where id = :'neg_l';
      select concat_ws('|', ${VARS("emma", "tru")}, ${VARS("emma")}, ${VARS("emma", "lim")});
      select retail.poner_precio_sede(:'emma', :'tru', 99.90, 'Prueba de los filtros') \\gset
      select concat_ws('|', ${VARS("emma", "tru")}, ${VARS("emma")}, ${VARS("emma", "lim")});
      rollback;`,
    "BEI/S,NEG/S,NEG/M|BEI/S,NEG/S,NEG/M|NEG/M\n" + `${TRU}|${TRU}|NEG/M`,
  );
  valor(
    "lo no publicado no sale: oculto en la Vitrina, descontinuado o de prueba",
    `${PREPARAR}${STOCK}select ${VARS("emma", "tru")};
      select retail.vitrina_mostrar(array[:'emma']::uuid[], false) \\gset
      select ${VARS("emma", "tru")};
      select retail.vitrina_mostrar(array[:'emma']::uuid[], true) \\gset
      update retail.productos set estado = 'descontinuado' where id = :'emma';
      select ${VARS("emma", "tru")};
      update retail.productos set estado = 'activo', es_prueba = true where id = :'emma';
      select ${VARS("emma", "tru")};
      rollback;`,
    `${TRU}\n∅\n∅\n∅`,
  );

  // ---------------------------------------------------------------- 5. Las tiendas
  valor(
    "una tienda escondida no suma y elegirla es «Todas»; con Lima visible, la elegida es la que se pidió",
    `${PREPARAR}${STOCK}${poner("bei_l", "lim", "lim_piso", 3)}
      select concat_ws('|', ${VARS("emma")}, (retail.tienda_filtros(:'lim') ->> 'sede') = :'lim');
      update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';
      select concat_ws('|', ${VARS("emma")}, coalesce(retail.tienda_filtros(:'lim') ->> 'sede', 'todas'), ${VARS("emma", "lim")});
      rollback;`,
    `BEI/S,BEI/L,NEG/S,NEG/M,NEG/L|t\n${TRU}|todas|${TRU}`,
  );
  valor(
    "el Taller no es una tienda: lo que hay solo ahí no suma, y elegirlo es «Todas»",
    `${PREPARAR}${poner("neg_m", "taller", null, 84)}select concat_ws('|', ${VARS("emma")}, ${VARS("emma", "taller")}, coalesce(retail.tienda_filtros(:'taller') ->> 'sede', 'todas'));\nrollback;`,
    "∅|∅|todas",
  );
  valor(
    "una tienda que no existe es «Todas»: la misma respuesta",
    `${PREPARAR}${STOCK}select retail.tienda_filtros(gen_random_uuid()) = retail.tienda_filtros(), (retail.tienda_filtros(gen_random_uuid()) ->> 'sede') is null;\nrollback;`,
    "t|t",
  );
  valor(
    "sin ninguna tienda en la web no hay nada: ni variantes ni colores",
    `${PREPARAR}${STOCK}update retail.ubicacion_datos_web set mostrar = false where mostrar;
      select concat_ws('|', ${VARS("emma")}, jsonb_array_length(retail.tienda_filtros() -> 'variantes'), retail.tienda_filtros() -> 'colores');
      rollback;`,
    "∅|0|{}",
  );
  valor(
    "sin nada publicado: variantes [] y colores {}",
    `begin;\n${aplicarAntes}\nupdate retail.vitrina_productos set publicado = false where publicado;
      select retail.tienda_filtros() -> 'variantes', retail.tienda_filtros() -> 'colores';\nrollback;`,
    "[]|{}",
  );

  // ---------------------------------------------------------------- 6. La cifra nunca sale
  valor(
    "con 37 unidades en una talla: ningún número en la respuesta (ni cifra ni nivel) y cada variante son tres textos",
    `${PREPARAR}${STOCK}${poner("neg_m", "tru", "tru_piso", 37)}
      select concat_ws('|', (select string_agg(k, ',' order by k) from jsonb_object_keys(retail.tienda_filtros(:'tru')) k),
          (select count(*) from jsonb_array_elements(retail.tienda_filtros(:'tru') -> 'variantes') x
            where jsonb_typeof(x) <> 'array' or jsonb_array_length(x) <> 3 or jsonb_typeof(x -> 0) <> 'string' or jsonb_typeof(x -> 1) <> 'string' or jsonb_typeof(x -> 2) <> 'string'),
          (select count(*) from jsonb_path_query(retail.tienda_filtros(:'tru'), 'lax $.**') v where jsonb_typeof(v) = 'number'));
      rollback;`,
    "colores,sede,variantes|0|0",
  );

  // ---------------------------------------------------------------- 7. Los colores
  valor(
    "los colores son los de las variantes que hay, con su familia del ERP; si un color se queda sin nada, sale de la lista; una familia sin dato es null",
    `${PREPARAR}${STOCK}select ${COLORES};
      update retail.stock set cantidad = 0, cantidad_apartada = 0 where variante_id in (select id from retail.variantes where producto_id = :'emma' and color_codigo = 'BEI');
      select ${COLORES};
      update retail.colores set familia_color = null where codigo = 'NEG';
      select ${COLORES};
      rollback;`,
    "BEI=tierra,NEG=neutro\nNEG=neutro\nNEG=null",
  );
  valor(
    // Una prenda no puede mezclar variantes «sin color» con otras con color: la falda queda entera sin color.
    "una prenda sin color no se pierde: sale con color null (y no aparece entre los colores)",
    `${PREPARAR}${STOCK}select retail.vitrina_mostrar(array[:'falda']::uuid[], true) \\gset
      update retail.variantes set activo = false where producto_id = :'falda' and color_codigo = 'BEI';
      update retail.variantes set color_codigo = null where producto_id = :'falda' and activo;
      ${poner("falda_neg_m", "tru", "tru_piso", 2)}
      select concat_ws('|', ${VARS("falda", "tru")}, ${COLORES});
      rollback;`,
    "-/M|BEI=tierra,NEG=neutro",
  );

  // ---------------------------------------------------------------- 8. Estable y repetible
  valor(
    "el orden es estable (por prenda, color y talla) y dos llamadas seguidas dicen lo mismo",
    `${PREPARAR}${STOCK}select retail.vitrina_mostrar(array[:'falda']::uuid[], true) \\gset
      ${poner("falda_neg_m", "tru", "tru_piso", 2)}
      select concat_ws('|', retail.tienda_filtros(:'tru') = retail.tienda_filtros(:'tru'),
          (select array_agg(x ->> 0 order by o) = array_agg(x ->> 0 order by x ->> 0) from jsonb_array_elements(retail.tienda_filtros(:'tru') -> 'variantes') with ordinality t (x, o)));
      rollback;`,
    "t|t",
  );
  valor(
    "la migración se puede volver a correr",
    `${PREPARAR}${STOCK}${aplicarAntes}select ${VARS("emma", "tru")};\nrollback;`,
    TRU,
  );

  return lista;
}

function evaluar(caso) {
  const r = correr(caso.sql);
  if ("contiene" in caso) {
    return { ok: !r.ok && r.mensaje.includes(caso.contiene), detalle: r.ok ? `no falló: ${r.salida}` : `falló distinto: ${r.mensaje}` };
  }
  return { ok: r.ok && r.salida === caso.esperado, detalle: r.ok ? `dio «${r.salida}», se esperaba «${caso.esperado}»` : r.mensaje };
}

// Versiones rotas a propósito: cada una tiene que hacer fallar al menos un escenario. Cada cambio es [texto, reemplazo].
const MUTANTES = [
  ["ignora la tienda elegida (siempre «Todas»)", [["case when v_sede is null then v_sedes else array[v_sede] end", "v_sedes"]]],
  ["acepta cualquier tienda como elegida", [["v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);", "v_sede := p_sede;"]]],
  [
    "ofrece lo que la tienda no ofrece (sin fn_tienda_precios: una talla a S/ 0 cuenta)",
    [["from retail.fn_tienda_precios(v_ids, v_sede) pv", "from (select v.id as variante_id, v.producto_id, v.color_codigo, v.talla_id from retail.variantes v where v.producto_id = any (v_ids) and v.activo) pv"]],
  ],
  ["cuenta lo no publicado", [["where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id));", "where true);"]]],
  ["cuenta el Taller y las tiendas escondidas", [["v_sedes uuid[] := retail.fn_tienda_sedes_web();", "v_sedes uuid[] := array(select u.id from retail.ubicaciones u);"]]],
  ["deja salir una cifra en cada variante", [["jsonb_build_array(x.producto_id, x.color_codigo, x.talla)", "jsonb_build_array(x.producto_id, x.color_codigo, x.talla, 1)"]]],
  [
    "cuenta el físico y no lo libre (Cuarentena y apartado cuentan)",
    [
      [
        "from retail.fn_tienda_disponible(v_ids, case when v_sede is null then v_sedes else array[v_sede] end) d",
        "from retail.fn_existencias_base(null, v_ids) d where d.ubicacion_id = any (case when v_sede is null then v_sedes else array[v_sede] end) and d.fisico > 0",
      ],
    ],
  ],
  ["devuelve todos los colores del ERP y no los de lo que hay", [["where c.codigo in (select x.color_codigo from variantes x)", "where true"]]],
  ["pierde la variante sin color", [["join retail.tallas ta on ta.id = o.talla_id", "join retail.tallas ta on ta.id = o.talla_id and o.color_codigo is not null"]]],
  ["se la abre a anon", [["grant execute on function retail.tienda_filtros(uuid) to tienda_web;", "grant execute on function retail.tienda_filtros(uuid) to tienda_web, anon;"]]],
];

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  const aplicarAntes = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
  if (!aplicarAntes) {
    const hay = correr("select to_regprocedure('retail.tienda_filtros(uuid)') is not null;");
    if (hay.salida !== "t") {
      console.error(`Falta tienda_filtros: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }

  let fallos = 0;
  const casos = escenarios(aplicarAntes);
  // `--mostrar N` imprime el SQL del escenario N (desde 1) para correrlo a mano; sirve para depurar uno que falla.
  const MOSTRAR = process.argv.indexOf("--mostrar");
  if (MOSTRAR > 0) {
    console.log(casos[Number(process.argv[MOSTRAR + 1]) - 1]?.sql ?? "(no hay ese escenario)");
    return;
  }
  for (const caso of casos) {
    const { ok, detalle } = evaluar(caso);
    console.log(`${ok ? "✓" : "✗"} ${caso.nombre}`);
    if (!ok) {
      fallos++;
      console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
    }
  }
  console.log(`\n${casos.length - fallos}/${casos.length} escenarios en verde.`);

  if (CON_MUTANTES) {
    console.log("\n— Mutantes: cada versión rota tiene que hacer fallar al menos un escenario —");
    const original = readFileSync(MIGRACION, "utf8");
    let vivos = 0;
    for (const [nombre, cambios] of MUTANTES) {
      const falta = cambios.find(([de]) => !original.includes(de));
      if (falta) {
        console.log(`✗ ${nombre}: el texto a mutar ya no está en la migración (actualiza el mutante): ${falta[0].trim()}`);
        vivos++;
        continue;
      }
      const mutada = cambios.reduce((sql, [de, a]) => sql.split(de).join(a), original);
      const muertos = escenarios(mutada).filter((c) => !evaluar(c).ok).length;
      console.log(`${muertos > 0 ? "✓" : "✗"} ${nombre}: ${muertos > 0 ? `lo detectan ${muertos} escenario(s)` : "VIVO, ningún escenario lo detecta"}`);
      if (muertos === 0) vivos++;
    }
    if (vivos > 0) fallos++;
  }
  if (fallos > 0) process.exit(1);
}

main();
