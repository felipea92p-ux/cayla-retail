#!/usr/bin/env node
/**
 * La ficha de la prenda y cuánto hay en cada tienda (ADR-0408, actividad 4) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015012000_tienda_ficha_y_niveles_por_tienda.sql`:
 *   1. Permisos: `tienda_ficha` es security definer, con su search_path, y solo de `tienda_web`; las piezas internas
 *      (`fn_tienda_*`) no las llama nadie de afuera, tampoco la tienda.
 *   2. La regla del nivel (`fn_tienda_nivel`): 0, el número hasta el umbral (1 = «Última»), «hay» desde ahí; el umbral se acota a
 *      1–3 aunque llegue otro.
 *   3. Lo que se cuenta: piso + almacén + lo sin lugar de cada tienda de la web, sin Cuarentena, sin lo apartado, sin el Taller y
 *      sin las tallas retiradas. Vender una unidad (registrar_venta) y apartarla (apartar_stock) bajan el nivel al instante.
 *      `fn_tienda_libre` (la misma cifra para UNA prenda, la que leen «Separar» y «Avísame») dice lo mismo que la ficha. Que TODA la
 *      tienda use esta regla (bolsa, looks, «Avísame», «Mi cuenta», «Esperan una talla») lo prueba `pnpm pruebas:tienda-club` (R).
 *   4. La cifra exacta de 4 o más NUNCA sale: cada nivel de la ficha y del catálogo, con 37 unidades en una talla y con el umbral
 *      en 3, 2 y 1, es 0, un número hasta el umbral o «hay».
 *   5. Una tienda que no se ve en la web no aparece ni cuenta, y elegirla es «Todas».
 *   6. La ficha: null para lo que no se ve en la web; tallas en el orden de la tienda; la descripción de la Vitrina; las fotos del
 *      almacén público con su color; el precio de cada talla en la tienda elegida (o el mayor) y la campaña de esa talla; y el
 *      resumen del modelo idéntico al de la tarjeta del catálogo.
 *   7. El catálogo: cada prenda suma `stock` (`total` y `sedes`) y su campaña trae id y último día; nada más.
 *   8. La migración se puede volver a correr.
 *   9. UN SOLO PRECIO (`fn_tienda_precio_talla`, integración de la tienda 2026-10-15): la ficha, la bolsa, el catálogo y el look dicen
 *      EXACTAMENTE el mismo precio de la misma prenda, en la misma tienda y en el mismo momento —sin y con precio propio de la tienda,
 *      con campaña del modelo, de la categoría y las dos, con «Todas» y sin tiendas en la web—, y es el que se espera de la caja
 *      (`fn_precio_en_sede` + `fn_descuento_campana`). La prenda de un look vale lo de SU color (una campaña solo en el negro no le
 *      pone «Desde» a la beige). Romper la pieza común a propósito cambia a las cuatro JUNTAS.
 *  10. LO QUE SE OFRECE: una talla a S/ 0 (ADR-0384) no la ofrece la ficha, ni el look, ni la bolsa; «Separar» no la separa y «Avísame»
 *      no la anota. La tienda elegida es una sola regla (`fn_tienda_sede_elegida`): una escondida es «Todas» en las cuatro.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder): nunca se commitea nada en el Postgres local que
 * comparten los worktrees. Cada uno parte con la vitrina vacía, sin campañas, con Trujillo y Lima en la web, el umbral en 3 y el
 * stock de «Blusa Emma» en cero en todas partes; después pone exactamente lo que mira (`poner`).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261015012000_tienda_ficha_y_niveles_por_tienda.sql` mete la
 * migración dentro de cada transacción. Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * MUTANTES. `--mutantes` corre todo otra vez con versiones ROTAS a propósito de la migración (la cifra exacta, la Cuarentena que
 * cuenta, lo apartado que cuenta, el Taller que cuenta, el umbral ignorado, la ficha de un oculto, el precio menor con «Todas»…) y
 * exige que cada una haga fallar al menos un escenario: una prueba que no mata a ningún mutante no está probando nada.
 *
 * DA POR SENTADO: el seed (Felipe líder; «Blusa Emma» CMS en BEI y NEG, tallas S/M/L a S/ 79.90; «Pantalón Carla» 28–34; «Falda
 * Renata»; Tienda Trujillo y Tienda Lima con piso, almacén y Cuarentena; el Taller), el rol `tienda_web` (20261014220000), las tiendas
 * de la web (20261014231000), la Vitrina (20261014225000), el precio por tienda (`poner_precio_sede`, 20261011100000) y, para las
 * secciones 9 y 10, la bolsa y «Separar» (20261015021000), «Avísame» (20261015024000) y los looks (20261015031000 y 032000).
 *
 * USO
 *   pnpm pruebas:tienda-ficha                     → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-ficha -- --mutantes       → además, la prueba contra los mutantes (con la migración del repo)
 *   pnpm pruebas:tienda-ficha -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261015012000_tienda_ficha_y_niveles_por_tienda.sql";
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
select id as carla from retail.productos where referencia = 'Pantalón Carla' \\gset
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
update retail.stock set cantidad = 0, cantidad_apartada = 0
 where variante_id in (select id from retail.variantes where producto_id = :'emma') and (cantidad <> 0 or cantidad_apartada <> 0);
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
  const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
  /** La ficha (con «Todas» o la tienda `sede`) y una línea por talla: «NEG/M=tru|lim|total». */
  const FICHA = (sede = null) => `retail.tienda_ficha(:'emma', ${sede ? `:'${sede}'` : "null"})`;
  const CELDAS = (sede = null) => `(select string_agg(x ->> 'color' || '/' || t.valor || '=' || coalesce(x -> 'stock' ->> :'tru', '·') || '|'
        || coalesce(x -> 'stock' ->> :'lim', '·') || '|' || (x ->> 'total'), ',' order by x ->> 'color' desc, retail.fn_actividad_peso_talla(t.valor))
      from jsonb_array_elements(${FICHA(sede)} -> 'prenda' -> 'variantes') x join retail.tallas t on t.id = (x ->> 'talla')::uuid)`;
  const EN_CATALOGO = (prod, sede = null) =>
    `(select x from jsonb_array_elements(retail.tienda_catalogo(${sede ? `:'${sede}'` : "null"}) -> 'prendas') x where x ->> 'id' = :'${prod}')`;
  /** Todo nivel de la ficha y del catálogo es 0, un número de 1 a `umbral` o "hay": si no, lo cuenta. */
  const NIVELES_FUERA = (umbral) => `(select count(*) from (
        select v from jsonb_path_query(${FICHA()}, 'lax $.prenda.variantes[*].stock.*') v
        union all select v from jsonb_path_query(${FICHA()}, 'lax $.prenda.variantes[*].total') v
        union all select v from jsonb_path_query(${FICHA("tru")}, 'lax $.prenda.variantes[*].stock.*') v
        union all select v from jsonb_path_query(retail.tienda_catalogo(), 'lax $.prendas[*].stock.total') v
        union all select v from jsonb_path_query(retail.tienda_catalogo(), 'lax $.prendas[*].stock.sedes.*') v
        union all select v from jsonb_path_query(retail.tienda_catalogo(:'tru'), 'lax $.prendas[*].stock.*.*') v
      ) n where not (n.v = to_jsonb('hay'::text) or (jsonb_typeof(n.v) = 'number' and (n.v #>> '{}')::numeric in (${Array.from({ length: umbral + 1 }, (_, i) => i).join(", ")}))))`;

  // ---------------------------------------------------------------- 1. Permisos
  valor(
    "tienda_ficha: security definer con su search_path, y solo de tienda_web",
    `begin;\n${aplicarAntes}\nselect concat_ws('|', p.prosecdef, exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'),
        has_function_privilege('public', p.oid, 'EXECUTE'), has_function_privilege('anon', p.oid, 'EXECUTE'),
        has_function_privilege('authenticated', p.oid, 'EXECUTE'), has_function_privilege('tienda_web', p.oid, 'EXECUTE'))
      from pg_proc p where p.oid = 'retail.tienda_ficha(uuid, uuid)'::regprocedure;\nrollback;`,
    "t|t|f|f|f|t",
  );
  valor(
    "las piezas internas (fn_tienda_*) no las llama nadie de afuera, tampoco la tienda",
    `begin;\n${aplicarAntes}\nselect concat_ws('|', count(*), count(*) filter (where has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('tienda_web', p.oid, 'EXECUTE')))
      from pg_proc p where p.pronamespace = 'retail'::regnamespace
        and p.proname in ('fn_tienda_nivel', 'fn_tienda_umbral', 'fn_tienda_sedes_web', 'fn_tienda_disponible', 'fn_tienda_libre', 'fn_tienda_precios',
                          'fn_tienda_precio_talla', 'fn_tienda_sede_elegida');\nrollback;`,
    "8|0",
  );
  valor(
    "como tienda_web: la ficha y el catálogo responden",
    `${PREPARAR}${STOCK}${COMO_TIENDA}select concat_ws('|', ${FICHA("tru")} -> 'prenda' ->> 'nombre', jsonb_array_length(retail.tienda_catalogo() -> 'prendas'));\nrollback;`,
    "Blusa Emma|1",
  );
  error(
    "como tienda_web, contar el stock con una pieza interna se niega",
    `${PREPARAR}${COMO_TIENDA}select count(*) from retail.fn_tienda_disponible(array[:'emma']::uuid[], array[:'tru']::uuid[]);\nrollback;`,
    "permission denied",
  );
  error("como tienda_web, leer el stock directo se niega", `${PREPARAR}${COMO_TIENDA}select count(*) from retail.stock;\nrollback;`, "permission denied");

  // ---------------------------------------------------------------- 2. La regla del nivel
  valor(
    "el nivel: 0 sin stock, el número hasta el umbral (1 = «Última»), «hay» desde ahí; el umbral se acota a 1–3",
    `begin;\n${aplicarAntes}\nselect string_agg(retail.fn_tienda_nivel(x.n, x.u)::text, ' ' order by x.o)
      from (values (1, 0, 3), (2, -2, 3), (3, null, 3), (4, 1, 3), (5, 2, 3), (6, 3, 3), (7, 4, 3), (8, 7, 3),
                   (9, 3, 2), (10, 2, 1), (11, 1, 1), (12, 3, 9), (13, 4, 9), (14, 2, null), (15, 2, 0)) as x (o, n, u);\nrollback;`,
    `0 0 0 1 2 3 "hay" "hay" "hay" "hay" 1 3 "hay" 2 "hay"`,
  );

  // ---------------------------------------------------------------- 3. Lo que se cuenta
  valor(
    "la ficha, talla por talla: piso + almacén, sin lo apartado, sin Cuarentena y sin el Taller (Trujillo | Lima | total)",
    `${PREPARAR}${STOCK}select ${CELDAS()};\nrollback;`,
    "NEG/S=3|0|3,NEG/M=hay|2|hay,NEG/L=2|0|2,BEI/S=1|0|1,BEI/M=0|0|0,BEI/L=0|0|0",
  );
  valor(
    // La forma corta de la regla para UNA prenda («Separar», «Avísame»): la suma de fn_tienda_disponible en las tiendas pedidas.
    "fn_tienda_libre de cada talla es la misma cifra de la ficha (Trujillo | Lima | las dos): ni la Cuarentena ni lo apartado ni el Taller",
    `${PREPARAR}${STOCK}select string_agg(x.c || '/' || x.t || '=' || concat_ws('|', retail.fn_tienda_libre(x.v, array[:'tru']::uuid[]),
          retail.fn_tienda_libre(x.v, array[:'lim']::uuid[]), retail.fn_tienda_libre(x.v, array[:'tru', :'lim']::uuid[])), ',' order by x.o)
        from (values (1, 'NEG', 'S', :'neg_s'::uuid), (2, 'NEG', 'M', :'neg_m'::uuid), (3, 'NEG', 'L', :'neg_l'::uuid),
                     (4, 'BEI', 'S', :'bei_s'::uuid), (5, 'BEI', 'M', :'bei_m'::uuid), (6, 'BEI', 'L', :'bei_l'::uuid)) as x (o, c, t, v);
      select concat_ws('|', retail.fn_tienda_libre(:'neg_m', null), retail.fn_tienda_libre(gen_random_uuid(), array[:'tru']::uuid[]));
      rollback;`,
    "NEG/S=3|0|3,NEG/M=5|2|7,NEG/L=2|0|2,BEI/S=1|0|1,BEI/M=0|0|0,BEI/L=0|0|0\n0|0",
  );
  valor(
    "lo que no tiene lugar (una tienda que no separa piso y almacén) también cuenta",
    `${PREPARAR}${STOCK}${poner("bei_m", "lim", null, 2)}select ${CELDAS()};\nrollback;`,
    "NEG/S=3|0|3,NEG/M=hay|2|hay,NEG/L=2|0|2,BEI/S=1|0|1,BEI/M=0|2|2,BEI/L=0|0|0",
  );
  valor(
    "el catálogo: el nivel del modelo en cada tienda y en todas (Trujillo 11 → hay, Lima 2); un modelo sin stock, 0",
    `${PREPARAR}${STOCK}select retail.vitrina_mostrar(array[:'falda']::uuid[], true) \\gset
      update retail.stock set cantidad = 0, cantidad_apartada = 0 where variante_id in (select id from retail.variantes where producto_id = :'falda') and (cantidad <> 0 or cantidad_apartada <> 0);
      select concat_ws('|', x -> 'stock' -> 'sedes' ->> :'tru', x -> 'stock' -> 'sedes' ->> :'lim', x -> 'stock' ->> 'total') from ${EN_CATALOGO("emma")} t(x);
      select concat_ws('|', x -> 'stock' -> 'sedes' ->> :'tru', x -> 'stock' -> 'sedes' ->> :'lim', x -> 'stock' ->> 'total') from ${EN_CATALOGO("falda")} t(x);
      rollback;`,
    "hay|2|hay\n0|0|0",
  );
  valor(
    "el catálogo suma las tallas: dos de 1 y una de 2 en Lima son 4 → «hay»; una sola de 3 → 3",
    `${PREPARAR}${poner("neg_s", "lim", "lim_piso", 1)}${poner("bei_s", "lim", "lim_alm", 1)}${poner("neg_l", "lim", "lim_piso", 2)}${poner("bei_l", "tru", "tru_piso", 3)}
      select concat_ws('|', x -> 'stock' -> 'sedes' ->> :'lim', x -> 'stock' -> 'sedes' ->> :'tru', x -> 'stock' ->> 'total') from ${EN_CATALOGO("emma")} t(x);
      rollback;`,
    "hay|3|hay",
  );
  valor(
    // Una talla con prendas no se puede retirar (ADR-0270, decisión 13): se retira una vacía y deja de ofrecerse.
    "una talla retirada no se ofrece: ni en la ficha ni en sus tallas",
    `${PREPARAR}update retail.variantes set activo = false where id = :'neg_m';
      select concat_ws('|', (select count(*) from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'variantes') x where x ->> 'id' = :'neg_m'),
          (select count(*) from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'variantes') x where x ->> 'color' = 'NEG'),
          (select string_agg(t ->> 'nombre', ' ' order by o) from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'tallas') with ordinality x(t, o)));
      rollback;`,
    "0|2|S M L",
  );
  valor(
    "vender una unidad en la tienda (registrar_venta) baja el nivel al instante: Lima 2 → «Última»",
    `${PREPARAR}${poner("neg_m", "lim", "lim_piso", 2)}
      select x -> 'stock' ->> :'lim' from jsonb_array_elements(${FICHA("lim")} -> 'prenda' -> 'variantes') x where x ->> 'id' = :'neg_m';
      select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'lim' and estado = 'abierta') c) as _cerro \\gset
      select retail.abrir_caja(:'lim', 100.00, 'prueba de la ficha de la tienda') as _caja \\gset
      select retail.registrar_venta(:'lim',
        jsonb_build_array(jsonb_build_object('variante_id', :'neg_m', 'cantidad', 1, 'precio_unitario', retail.fn_precio_en_sede(:'neg_m', :'lim'), 'descuento_unitario', 0)),
        jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', retail.fn_precio_en_sede(:'neg_m', :'lim'))),
        null, gen_random_uuid()) as _venta \\gset
      select x -> 'stock' ->> :'lim' from jsonb_array_elements(${FICHA("lim")} -> 'prenda' -> 'variantes') x where x ->> 'id' = :'neg_m';
      rollback;`,
    "2\n1",
  );
  valor(
    "apartar una unidad (Apartados) también la saca: Trujillo NEG L 2 → «Última»",
    `${PREPARAR}${STOCK}select retail.apartar_stock(:'neg_l', :'tru', 1, 'Cliente de prueba', '999999999', retail.fn_hoy_lima() + 3, null, :'tru_piso') \\gset
      select x -> 'stock' ->> :'tru' from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'variantes') x where x ->> 'id' = :'neg_l';
      rollback;`,
    "1",
  );

  // ---------------------------------------------------------------- 4. La cifra exacta nunca sale
  for (const umbral of [3, 2, 1]) {
    valor(
      `con 37 unidades en una talla y el umbral en ${umbral}: todo nivel es 0, un número hasta ${umbral} o «hay»`,
      `${PREPARAR}${STOCK}${poner("neg_m", "tru", "tru_piso", 37)}update retail.configuracion_tienda_web set quedan_pocas_desde = ${umbral} where id;
        select ${NIVELES_FUERA(umbral)};\nrollback;`,
      "0",
    );
  }
  valor(
    "el umbral en 2 y en 1 cambia lo que se ve: con 2, el 3 pasa a «hay»; con 1, el 2 también",
    `${PREPARAR}${STOCK}update retail.configuracion_tienda_web set quedan_pocas_desde = 2 where id;
      select concat_ws('|', ${FICHA()} ->> 'umbral', ${CELDAS()});
      update retail.configuracion_tienda_web set quedan_pocas_desde = 1 where id;
      select concat_ws('|', ${FICHA()} ->> 'umbral', ${CELDAS()});
      rollback;`,
    "2|NEG/S=hay|0|hay,NEG/M=hay|2|hay,NEG/L=2|0|2,BEI/S=1|0|1,BEI/M=0|0|0,BEI/L=0|0|0\n1|NEG/S=hay|0|hay,NEG/M=hay|hay|hay,NEG/L=hay|0|hay,BEI/S=1|0|1,BEI/M=0|0|0,BEI/L=0|0|0",
  );

  // ---------------------------------------------------------------- 5. Las tiendas de la web
  valor(
    "una tienda que no se ve en la web no aparece ni cuenta; elegirla es «Todas»",
    `${PREPARAR}${STOCK}update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';
      select concat_ws('|', coalesce(${FICHA("lim")} ->> 'sede', 'todas'), jsonb_array_length(${FICHA()} -> 'sedes'),
          (select string_agg(k, ',') from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'variantes') x, jsonb_object_keys(x -> 'stock') k where x ->> 'id' = :'neg_m') = :'tru',
          (select x ->> 'total' from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'variantes') x where x ->> 'id' = :'neg_m'),
          (select x -> 'stock' ->> 'total' from ${EN_CATALOGO("emma")} t(x)));
      rollback;`,
    "todas|1|t|hay|hay",
  );
  valor(
    "lo que hay en el Taller o en una tienda escondida no suma: BEI S sigue «Última» con 9 en el Taller y 2 en Lima escondida",
    `${PREPARAR}${STOCK}${poner("bei_s", "taller", null, 9)}${poner("bei_s", "lim", "lim_piso", 2)}update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';
      select concat_ws('|', (select x ->> 'total' from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'variantes') x where x ->> 'id' = :'bei_s'),
          (select x -> 'stock' ->> :'tru' from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'variantes') x where x ->> 'id' = :'bei_s'));
      update retail.stock set cantidad = 0, cantidad_apartada = 0 where ubicacion_id = :'tru' and variante_id in (select id from retail.variantes where producto_id = :'emma');
      select x -> 'stock' ->> 'total' from ${EN_CATALOGO("emma")} t(x);
      rollback;`,
    "1|1\n0",
  );
  valor(
    "las tiendas de la ficha: las de la web, con su nombre web, en el orden de la web; la elegida, la que se pidió",
    `${PREPARAR}select concat_ws('|', (select string_agg(s ->> 'nombre', ',' order by o) from jsonb_array_elements(${FICHA("tru")} -> 'sedes') with ordinality t(s, o)),
          ${FICHA("tru")} ->> 'sede' = :'tru', coalesce(${FICHA()} ->> 'sede', 'todas'), coalesce(retail.tienda_ficha(:'emma', gen_random_uuid()) ->> 'sede', 'todas'));
      rollback;`,
    "ZZ Lima,ZZ Trujillo|t|todas|todas",
  );
  valor(
    "sin ninguna tienda en la web: sin tiendas ni niveles, y el precio de la grilla",
    `${PREPARAR}${STOCK}update retail.ubicacion_datos_web set mostrar = false where mostrar;
      select concat_ws('|', jsonb_array_length(${FICHA()} -> 'sedes'), (select count(*) from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'variantes') x where x -> 'stock' <> '{}'::jsonb),
          ${FICHA()} -> 'prenda' ->> 'precio', (select x -> 'stock' ->> 'total' from ${EN_CATALOGO("emma")} t(x)));
      rollback;`,
    "0|0|79.90|0",
  );

  // ---------------------------------------------------------------- 6. La ficha
  valor(
    "la ficha de lo que no se ve en la web es null: oculto, descontinuado, de prueba, uno cualquiera o sin id",
    `${PREPARAR}select concat_ws('|', ${FICHA()} is null, retail.tienda_ficha(:'falda') is null, retail.tienda_ficha(gen_random_uuid()) is null, retail.tienda_ficha(null) is null);
      select retail.vitrina_mostrar(array[:'emma']::uuid[], false) \\gset
      select ${FICHA()} is null;
      select retail.vitrina_mostrar(array[:'emma']::uuid[], true) \\gset
      update retail.productos set estado = 'descontinuado' where id = :'emma';
      select ${FICHA()} is null;
      update retail.productos set estado = 'activo', es_prueba = true where id = :'emma';
      select ${FICHA()} is null;
      rollback;`,
    "f|t|t|t\nt\nt\nt",
  );
  valor(
    "las tallas en el orden de la tienda (S M L; 28 30 32 34), sus colores y la descripción de la Vitrina sobre la del catálogo",
    `${PREPARAR}select retail.vitrina_mostrar(array[:'carla']::uuid[], true) \\gset
      select concat_ws('|', (select string_agg(t ->> 'nombre', ' ' order by o) from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'tallas') with ordinality x(t, o)),
          (select string_agg(t ->> 'nombre', ' ' order by o) from jsonb_array_elements(retail.tienda_ficha(:'carla') -> 'prenda' -> 'tallas') with ordinality x(t, o)),
          (select string_agg(c ->> 'codigo', ',' order by c ->> 'codigo') from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'colores') c),
          (${FICHA()} -> 'prenda' ->> 'descripcion') = (select descripcion from retail.productos where id = :'emma'));
      select retail.vitrina_guardar_modelo(:'emma', true, 'automatico', 'Lino liviano que cae bien', (select version from retail.vitrina_productos where producto_id = :'emma')) \\gset
      select ${FICHA()} -> 'prenda' ->> 'descripcion';
      rollback;`,
    "S M L|28 30 32 34|BEI,NEG|t\nLino liviano que cae bien",
  );
  valor(
    "las fotos: solo las del almacén público, con su color, la principal primero",
    `${PREPARAR}insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo) values
        (:'emma', 'https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/b.jpg', 2, false, 'BEI'),
        (:'emma', 'https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/a.jpg', 5, true, 'NEG'),
        (:'emma', 'https://x.supabase.co/storage/v1/object/sign/retail-compras-adjuntos/factura.jpg?token=1', 0, false, null),
        (:'emma', 'https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/c.jpg', 9, false, null);
      select string_agg(regexp_replace(f ->> 'url', '^.*/', '') || ':' || coalesce(f ->> 'color', '-'), ',' order by o)
        from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'fotos') with ordinality x(f, o);
      rollback;`,
    "a.jpg:NEG,b.jpg:BEI,c.jpg:-",
  );
  valor(
    "el precio de cada talla: el de la tienda elegida (Trujillo con precio propio) o, con «Todas», el mayor",
    `${PREPARAR}select retail.poner_precio_sede(:'emma', :'tru', 69.90, 'Prueba de la ficha') \\gset
      select concat_ws('|', (select string_agg(distinct x ->> 'precio', ',') from jsonb_array_elements(${FICHA("tru")} -> 'prenda' -> 'variantes') x),
          (select string_agg(distinct x ->> 'precio', ',') from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'variantes') x),
          ${FICHA("tru")} -> 'prenda' ->> 'precio', ${FICHA()} -> 'prenda' ->> 'precio');
      rollback;`,
    "69.90|79.90|69.90|79.90",
  );
  valor(
    "una campaña en un solo color: esas tallas traen su campaña y su precio de la caja; las otras, ninguna; el modelo dice «Desde»",
    `${PREPARAR}insert into retail.etiquetas (nombre, estilo, activo, descuento_pct, vigente_hasta) values ('ZZ Negro', 'campana', true, 20, retail.fn_hoy_lima() + 6) returning id as etq \\gset
      insert into retail.variante_etiquetas (variante_id, etiqueta_id) select v.id, :'etq' from retail.variantes v where v.producto_id = :'emma' and v.activo and v.color_codigo = 'NEG';
      select string_agg(x ->> 'color' || '=' || coalesce(x -> 'campana' ->> 'nombre', '-') || '/' || ((x ->> 'precio_final')::numeric = 79.90 - retail.fn_descuento_campana(79.90, 20))::text, ',' order by x ->> 'color' desc)
        from (select distinct on (x ->> 'color') x from jsonb_array_elements(${FICHA()} -> 'prenda' -> 'variantes') x order by x ->> 'color') d(x);
      select concat_ws('|', ${FICHA()} -> 'prenda' ->> 'desde', ${FICHA()} -> 'prenda' -> 'campana' ->> 'nombre', (${FICHA()} -> 'prenda' -> 'campana' ->> 'hasta')::date = retail.fn_hoy_lima() + 6);
      rollback;`,
    "NEG=ZZ Negro/true,BEI=-/false\ntrue|ZZ Negro|t",
  );
  valor(
    "el resumen del modelo en la ficha es el mismo de su tarjeta del catálogo (con «Todas» y con una tienda, con y sin campaña)",
    `${PREPARAR}select retail.poner_precio_sede(:'emma', :'lim', 89.90, 'Prueba de la ficha') \\gset
      insert into retail.etiquetas (nombre, estilo, activo, descuento_pct) values ('ZZ Beige', 'campana', true, 15) returning id as etq \\gset
      insert into retail.variante_etiquetas (variante_id, etiqueta_id) select v.id, :'etq' from retail.variantes v where v.producto_id = :'emma' and v.activo and v.color_codigo = 'BEI';
      select bool_and(f.r = c.r) from (values (null::uuid), (:'tru'::uuid), (:'lim'::uuid)) s(id)
        cross join lateral (select jsonb_build_object('precio', p -> 'precio', 'final', p -> 'precio_final', 'desde', p -> 'desde', 'campana', p -> 'campana') as r
                              from (select retail.tienda_ficha(:'emma', s.id) -> 'prenda' as p) q) f
        cross join lateral (select jsonb_build_object('precio', x -> 'precio', 'final', x -> 'precio_final', 'desde', x -> 'desde', 'campana', x -> 'campana') as r
                              from jsonb_array_elements(retail.tienda_catalogo(s.id) -> 'prendas') x where x ->> 'id' = :'emma') c;
      rollback;`,
    "t",
  );
  valor(
    "nada del ERP en la ficha: sin costo, cifras, versión ni quién lo cambió",
    `${PREPARAR}select concat_ws('|', (select string_agg(k, ',' order by k) from jsonb_object_keys(${FICHA()}) k),
          (select string_agg(k, ',' order by k) from jsonb_object_keys(${FICHA()} -> 'prenda') k),
          (select string_agg(k, ',' order by k) from jsonb_object_keys(${FICHA()} -> 'prenda' -> 'variantes' -> 0) k));
      rollback;`,
    "prenda,sede,sedes,umbral|campana,categoria,codigo,colores,descripcion,desde,fotos,id,nombre,precio,precio_final,tallas,variantes|campana,color,id,precio,precio_final,stock,talla,total",
  );

  // ---------------------------------------------------------------- 7. El catálogo
  // Lo de la actividad 4 tiene que estar; lo único que puede sumarse es `nuevo` y `vendidos` (la actividad 5, pruebas:tienda-inicio).
  const CLAVES_A4 = "campana,categoria,codigo,colores,desde,fotos,id,nombre,precio,precio_final,stock";
  const CLAVES_PERMITIDAS = `${CLAVES_A4},nuevo,vendidos`;
  valor(
    "el catálogo suma `stock` (total y sedes) y nada del ERP; la campaña trae su id y su último día",
    `${PREPARAR}insert into retail.etiquetas (nombre, estilo, activo, descuento_pct, vigente_hasta) values ('ZZ Todo', 'campana', true, 10, retail.fn_hoy_lima() + 3) returning id as etq \\gset
      insert into retail.variante_etiquetas (variante_id, etiqueta_id) select v.id, :'etq' from retail.variantes v where v.producto_id = :'emma' and v.activo;
      select concat_ws('|',
          'faltan:' || coalesce((select string_agg(c, ',') from unnest(string_to_array('${CLAVES_A4}', ',')) c
                                  where not exists (select 1 from ${EN_CATALOGO("emma")} t(x) where x ? c)), ''),
          'sobran:' || coalesce((select string_agg(k, ',') from ${EN_CATALOGO("emma")} t(x), jsonb_object_keys(x) k
                                  where k <> all (string_to_array('${CLAVES_PERMITIDAS}', ','))), ''),
          (select string_agg(k, ',' order by k) from ${EN_CATALOGO("emma")} t(x), jsonb_object_keys(x -> 'stock') k),
          (select string_agg(k, ',' order by k) from ${EN_CATALOGO("emma")} t(x), jsonb_object_keys(x -> 'campana') k),
          (select (x -> 'campana' ->> 'id') = :'etq' from ${EN_CATALOGO("emma")} t(x)));
      rollback;`,
    "faltan:|sobran:|sedes,total|hasta,id,nombre,pct|t",
  );

  // ---------------------------------------------------------------- 8. La migración
  const sql = aplicarAntes || readFileSync(MIGRACION, "utf8");
  valor(
    "la migración se puede volver a correr (dos veces seguidas, como un segundo pegado)",
    `begin;\n${sql}\n${sql}\nselect count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('tienda_ficha', 'tienda_catalogo');\nrollback;`,
    "2",
  );

  // ---------------------------------------------------------------- 9. Un solo precio
  // La ficha, la bolsa, el catálogo y el look de la MISMA prenda (Blusa Emma negra M), en la misma tienda y el mismo instante. Blusa Emma
  // vale lo mismo en todas sus tallas y colores, así que el resumen del modelo (catálogo) y el de su color (look) son el precio de la talla.
  const CON_LOOK = `select retail.vitrina_mostrar(array[:'falda']::uuid[], true) \\gset
select color_codigo as falda_color from retail.variantes where producto_id = :'falda' and activo order by color_codigo limit 1 \\gset
select retail.vitrina_guardar_look(null, 'ZZ Look del precio', null, true,
         jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'color', 'NEG'), jsonb_build_object('producto_id', :'falda', 'color', :'falda_color')),
         null, null) ->> 'id' as look \\gset
-- Lo que dicen de UNA prenda en UNA tienda (null = «Todas») la ficha, la bolsa, el catálogo y el look: «precio/lo que se paga/campaña».
create function pg_temp.dicen(p_v uuid, p_sede uuid, p_look uuid) returns table (quien text, dice text) language sql as $f$
  with v as (select va.producto_id from retail.variantes va where va.id = p_v)
  select 'ficha', (select concat_ws('/', x ->> 'precio', x ->> 'precio_final', coalesce(x -> 'campana' ->> 'nombre', '-'))
                     from jsonb_array_elements(retail.tienda_ficha((select producto_id from v), p_sede) -> 'prenda' -> 'variantes') x
                    where x ->> 'id' = p_v::text)
  union all
  select 'bolsa', (select concat_ws('/', l ->> 'precio_lista', l ->> 'precio', coalesce(l -> 'campana' ->> 'nombre', '-'))
                     from (select retail.tienda_bolsa(jsonb_build_array(jsonb_build_object('variante_id', p_v, 'cantidad', 1)), p_sede) -> 'lineas' -> 0 as l) b
                    where (l ->> 'disponible')::boolean)
  union all
  select 'catalogo', (select concat_ws('/', c ->> 'precio', c ->> 'precio_final', coalesce(c -> 'campana' ->> 'nombre', '-'))
                        from jsonb_array_elements(retail.tienda_catalogo(p_sede) -> 'prendas') c where c ->> 'id' = (select producto_id from v)::text)
  union all
  select 'look', (select concat_ws('/', pz -> 'prenda' ->> 'precio', pz -> 'prenda' ->> 'precio_final', coalesce(pz -> 'prenda' -> 'campana' ->> 'nombre', '-'))
                    from jsonb_array_elements(retail.tienda_look(p_look, p_sede) -> 'look' -> 'piezas') pz
                   where pz -> 'prenda' ->> 'id' = (select producto_id from v)::text)
$f$;
-- «ok» si las cuatro dicen lo mismo y es lo que cobraría la caja (ese precio de lista con fn_descuento_campana encima); si no, qué dice cada una.
create function pg_temp.un_precio(p_v uuid, p_sede uuid, p_look uuid, p_lista numeric, p_pct numeric, p_campana text) returns text language sql as $f$
  select case when count(d.dice) = 4 and count(distinct d.dice) = 1
               and min(d.dice) = concat_ws('/', p_lista, p_lista - retail.fn_descuento_campana(p_lista, p_pct), coalesce(p_campana, '-'))
         then 'ok' else string_agg(d.quien || '=' || coalesce(d.dice, '·'), ' ' order by d.quien) end
    from pg_temp.dicen(p_v, p_sede, p_look) d
$f$;
-- Lo que dicen las cuatro, en una línea (para los mutantes: que cambien JUNTAS).
create function pg_temp.las_cuatro(p_v uuid, p_sede uuid, p_look uuid) returns text language sql as $f$
  select string_agg(d.quien || '=' || coalesce(d.dice, '·'), ' ' order by d.quien) from pg_temp.dicen(p_v, p_sede, p_look) d
$f$;
`;
  /** Las tres lecturas (con «Todas», en Trujillo y en Lima), cada una con lo que se espera: [lista, % de campaña, nombre de la campaña]. */
  const TRES = (todas, tru, lim) =>
    `select concat_ws(' ', ${[["Todas", "null", todas], ["Trujillo", ":'tru'", tru], ["Lima", ":'lim'", lim]]
      .map(([n, s, [lista, pct, nombre]]) => `'${n}=' || pg_temp.un_precio(:'neg_m', ${s}, :'look', ${lista}, ${pct ?? "null"}, ${nombre ? `'${nombre}'` : "null"})`)
      .join(", ")});\n`;
  /** El precio propio de Trujillo (99.90, el más caro) y de Lima (69.90, el más barato): con «Todas», el mayor. */
  const PRECIOS_PROPIOS = `select retail.poner_precio_sede(:'emma', :'tru', 99.90, 'Prueba de un solo precio') \\gset
select retail.poner_precio_sede(:'emma', :'lim', 69.90, 'Prueba de un solo precio') \\gset\n`;
  const CAMPANA_DEL_MODELO = (pct, nombre = "ZZ Modelo") => `insert into retail.etiquetas (nombre, estilo, activo, descuento_pct) values ('${nombre}', 'campana', true, ${pct}) returning id as etq_modelo \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) select v.id, :'etq_modelo' from retail.variantes v where v.producto_id = :'emma' and v.activo;\n`;
  const CAMPANA_DE_LA_CATEGORIA = (pct, nombre = "ZZ Categoría") => `insert into retail.etiquetas (nombre, estilo, activo, descuento_pct) values ('${nombre}', 'campana', true, ${pct}) returning id as etq_categoria \\gset
insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) select :'etq_categoria', p.categoria_id from retail.productos p where p.id = :'emma';\n`;
  valor(
    "UN SOLO PRECIO sin precio propio ni campaña: la ficha, la bolsa, el catálogo y el look dicen 79.90 con «Todas», en Trujillo y en Lima",
    `${PREPARAR}${CON_LOOK}${TRES(["79.90"], ["79.90"], ["79.90"])}rollback;`,
    "Todas=ok Trujillo=ok Lima=ok",
  );
  valor(
    "UN SOLO PRECIO con precio propio de la tienda: el de esa tienda en las cuatro; con «Todas», el mayor (Trujillo 99.90, Lima 69.90)",
    `${PREPARAR}${CON_LOOK}${PRECIOS_PROPIOS}${TRES(["99.90"], ["99.90"], ["69.90"])}rollback;`,
    "Todas=ok Trujillo=ok Lima=ok",
  );
  valor(
    "UN SOLO PRECIO con campaña del modelo (−20 %): la campaña encima del precio de cada tienda, la de la caja, igual en las cuatro",
    `${PREPARAR}${CON_LOOK}${PRECIOS_PROPIOS}${CAMPANA_DEL_MODELO(20)}${TRES(["99.90", 20, "ZZ Modelo"], ["99.90", 20, "ZZ Modelo"], ["69.90", 20, "ZZ Modelo"])}rollback;`,
    "Todas=ok Trujillo=ok Lima=ok",
  );
  valor(
    "UN SOLO PRECIO con campaña de la categoría (−15 %): igual en las cuatro, sin y con precio propio",
    `${PREPARAR}${CON_LOOK}${CAMPANA_DE_LA_CATEGORIA(15)}${TRES(["79.90", 15, "ZZ Categoría"], ["79.90", 15, "ZZ Categoría"], ["79.90", 15, "ZZ Categoría"])}
      ${PRECIOS_PROPIOS}${TRES(["99.90", 15, "ZZ Categoría"], ["99.90", 15, "ZZ Categoría"], ["69.90", 15, "ZZ Categoría"])}rollback;`,
    "Todas=ok Trujillo=ok Lima=ok\nTodas=ok Trujillo=ok Lima=ok",
  );
  valor(
    "UN SOLO PRECIO con las dos campañas (modelo −10 %, categoría −25 %): gana la de mayor descuento, la misma en las cuatro",
    `${PREPARAR}${CON_LOOK}${PRECIOS_PROPIOS}${CAMPANA_DEL_MODELO(10)}${CAMPANA_DE_LA_CATEGORIA(25)}${TRES(["99.90", 25, "ZZ Categoría"], ["99.90", 25, "ZZ Categoría"], ["69.90", 25, "ZZ Categoría"])}rollback;`,
    "Todas=ok Trujillo=ok Lima=ok",
  );
  valor(
    "UN SOLO PRECIO sin tiendas en la web: «Todas» (y una tienda que ya no se ve) es el precio de la grilla en las cuatro, aunque haya precio propio",
    `${PREPARAR}${CON_LOOK}${PRECIOS_PROPIOS}${CAMPANA_DEL_MODELO(20)}update retail.ubicacion_datos_web set mostrar = false where mostrar;
      select concat_ws(' ', 'Todas=' || pg_temp.un_precio(:'neg_m', null, :'look', 79.90, 20, 'ZZ Modelo'),
                       'Trujillo=' || pg_temp.un_precio(:'neg_m', :'tru', :'look', 79.90, 20, 'ZZ Modelo'));
      rollback;`,
    "Todas=ok Trujillo=ok",
  );
  valor(
    "la prenda de un look vale lo de SU color: con una campaña solo en el negro, la blusa negra del look vale su precio de campaña exacto (sin «Desde») y la beige de otro look vale 79.90 sin campaña, como la ficha y la bolsa de esa talla; la tarjeta del modelo sí dice «Desde»",
    `${PREPARAR}${CON_LOOK}insert into retail.etiquetas (nombre, estilo, activo, descuento_pct) values ('ZZ Negro', 'campana', true, 20) returning id as etq \\gset
      insert into retail.variante_etiquetas (variante_id, etiqueta_id) select v.id, :'etq' from retail.variantes v where v.producto_id = :'emma' and v.activo and v.color_codigo = 'NEG';
      select retail.vitrina_guardar_look(null, 'ZZ Look beige', null, true,
               jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'color', 'BEI'), jsonb_build_object('producto_id', :'falda', 'color', :'falda_color')),
               null, null) ->> 'id' as look_bei \\gset
      -- Lo que cobra la caja con −20 % sobre 79.90 (fn_descuento_campana, ADR-0403) se escribe «C20»: la prueba no copia el redondeo.
      select (79.90 - retail.fn_descuento_campana(79.90, 20))::text as c20 \\gset
      select replace(concat_ws(' ', (select string_agg(quien || '=' || dice, ' ' order by quien) from pg_temp.dicen(:'neg_m', null, :'look') where quien <> 'catalogo'),
                       (select pz -> 'prenda' ->> 'desde' from jsonb_array_elements(retail.tienda_look(:'look') -> 'look' -> 'piezas') pz where pz -> 'prenda' ->> 'id' = :'emma')), :'c20', 'C20');
      select concat_ws(' ', (select string_agg(quien || '=' || dice, ' ' order by quien) from pg_temp.dicen(:'bei_m', null, :'look_bei') where quien <> 'catalogo'),
                       (select pz -> 'prenda' ->> 'desde' from jsonb_array_elements(retail.tienda_look(:'look_bei') -> 'look' -> 'piezas') pz where pz -> 'prenda' ->> 'id' = :'emma'));
      select replace(concat_ws(' ', x ->> 'precio', x ->> 'precio_final', x ->> 'desde', x -> 'campana' ->> 'nombre'), :'c20', 'C20') from ${EN_CATALOGO("emma")} t(x);
      rollback;`,
    "bolsa=79.90/C20/ZZ Negro ficha=79.90/C20/ZZ Negro look=79.90/C20/ZZ Negro false\nbolsa=79.90/79.90/- ficha=79.90/79.90/- look=79.90/79.90/- false\n79.90 C20 true ZZ Negro",
  );
  {
    // Romper la pieza común a propósito (dentro de la transacción): las cuatro cambian JUNTAS, ninguna tiene su propia cuenta.
    const MUTAR = (de, a) => `do $m$
declare d text := pg_get_functiondef('retail.fn_tienda_precio_talla(uuid[], uuid)'::regprocedure);
begin
  if position($q$${de}$q$ in d) = 0 then raise exception 'mutante vacío: fn_tienda_precio_talla no tiene «%»', $q$${de}$q$; end if;
  execute replace(d, $q$${de}$q$, $q$${a}$q$);
end $m$;\n`;
    valor(
      "MUTANTE la pieza común con «Todas» toma el MENOR: las cuatro bajan JUNTAS a 69.90 (ninguna tiene su propio precio)",
      `${PREPARAR}${CON_LOOK}${PRECIOS_PROPIOS}${MUTAR("max(retail.fn_precio_en_sede(v.id, s.id))", "min(retail.fn_precio_en_sede(v.id, s.id))")}
        select pg_temp.las_cuatro(:'neg_m', null, :'look');\nrollback;`,
      "bolsa=69.90/69.90/- catalogo=69.90/69.90/- ficha=69.90/69.90/- look=69.90/69.90/-",
    );
    valor(
      "MUTANTE la pieza común se olvida de la campaña: las cuatro dejan de bajar el precio JUNTAS",
      `${PREPARAR}${CON_LOOK}${CAMPANA_DEL_MODELO(20)}${MUTAR("coalesce(retail.fn_descuento_campana(b.precio_lista, c.descuento_pct), 0) as descuento", "0::numeric as descuento")}
        select pg_temp.las_cuatro(:'neg_m', :'tru', :'look');\nrollback;`,
      "bolsa=79.90/79.90/- catalogo=79.90/79.90/- ficha=79.90/79.90/- look=79.90/79.90/-",
    );
  }

  // ---------------------------------------------------------------- 10. Lo que se ofrece
  // Una cuenta web para «Separar» y «Avísame» (su usuario del proyecto de clientes es un id cualquiera: aquí no se entra a ningún lado).
  const CON_CUENTA = `insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Cliente de la ficha', '999888779') returning id as cli \\gset
select gen_random_uuid() as usr \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados) values (:'usr', :'cli', 'zz-ficha-' || gen_random_uuid() || '@prueba-tienda.test', 'prueba');
create function pg_temp.hint(p_sql text) returns text language plpgsql as $f$
declare v_hint text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
  return coalesce(nullif(v_hint, ''), v_msg);
end $f$;
`;
  /** Las tallas negras que ofrece cada una en una tienda (null = «Todas»): la ficha, el look y la bolsa (la que se puede separar). */
  const OFRECEN = (sede = null) => {
    const s = sede ? `:'${sede}'` : "null";
    return `select concat_ws('|',
        'ficha=' || (select string_agg(t.valor, ',' order by retail.fn_actividad_peso_talla(t.valor))
                       from jsonb_array_elements(retail.tienda_ficha(:'emma', ${s}) -> 'prenda' -> 'variantes') x join retail.tallas t on t.id = (x ->> 'talla')::uuid
                      where x ->> 'color' = 'NEG'),
        'look=' || (select string_agg(ta ->> 'talla', ',' order by o)
                      from jsonb_array_elements(retail.tienda_look(:'look', ${s}) -> 'look' -> 'piezas') pz, jsonb_array_elements(pz -> 'tallas') with ordinality u(ta, o)
                     where pz -> 'prenda' ->> 'id' = :'emma'),
        'bolsa=' || (select string_agg(t.valor, ',' order by retail.fn_actividad_peso_talla(t.valor))
                       from jsonb_array_elements(retail.tienda_bolsa(jsonb_build_array(jsonb_build_object('variante_id', :'neg_s', 'cantidad', 1),
                              jsonb_build_object('variante_id', :'neg_m', 'cantidad', 1), jsonb_build_object('variante_id', :'neg_l', 'cantidad', 1)), ${s}) -> 'lineas') l
                       join retail.variantes v on v.id = (l ->> 'variante_id')::uuid join retail.tallas t on t.id = v.talla_id
                      where (l ->> 'disponible')::boolean));\n`;
  };
  valor(
    "una talla a S/ 0 (ADR-0384) no se ofrece en NINGUNA: ni la ficha, ni el look, ni la bolsa; «Separar» no la separa y «Avísame» no la anota",
    `${PREPARAR}${CON_LOOK}${CON_CUENTA}${poner("neg_l", "tru", "tru_piso", 3)}update retail.variantes set precio = 0 where id = :'neg_l';
      ${OFRECEN()}
      select concat_ws('|',
        pg_temp.hint(format('select retail.tienda_separar(%L, %L, %L, %L)', :'usr', :'tru',
                            jsonb_build_array(jsonb_build_object('variante_id', :'neg_l', 'cantidad', 1, 'precio', 0)), gen_random_uuid())),
        retail.tienda_avisame(:'usr', :'neg_l', null) ->> 'estado', retail.tienda_avisame(:'usr', :'neg_l', :'tru') ->> 'estado');
      rollback;`,
    "ficha=S,M|look=S,M|bolsa=S,M\ntienda_separar_no_publicada|no_disponible|no_disponible",
  );
  valor(
    "con precio propio en Trujillo, esa talla de S/ 0 en la grilla SÍ se ofrece en Trujillo y con «Todas» (el mayor), y no en Lima: igual en la ficha, el look y la bolsa",
    `${PREPARAR}${CON_LOOK}update retail.variantes set precio = 0 where id = :'neg_l';
      select retail.poner_precio_sede(:'emma', :'tru', 99.90, 'Prueba de lo que se ofrece') \\gset
      ${OFRECEN("tru")}${OFRECEN()}${OFRECEN("lim")}rollback;`,
    "ficha=S,M,L|look=S,M,L|bolsa=S,M,L\nficha=S,M,L|look=S,M,L|bolsa=S,M,L\nficha=S,M|look=S,M|bolsa=S,M",
  );
  valor(
    "una tienda escondida se lee como «Todas» en las cuatro (fn_tienda_sede_elegida): elegir Lima, ya fuera de la web, es el precio de Trujillo",
    `${PREPARAR}${CON_LOOK}${PRECIOS_PROPIOS}update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';
      select concat_ws(' ', 'Lima=' || pg_temp.un_precio(:'neg_m', :'lim', :'look', 99.90, null, null),
                       coalesce(retail.tienda_ficha(:'emma', :'lim') ->> 'sede', 'todas'), coalesce(retail.tienda_catalogo(:'lim') ->> 'sede', 'todas'),
                       coalesce(retail.tienda_bolsa('[]', :'lim') ->> 'sede', 'todas'), coalesce(retail.tienda_look(:'look', :'lim') ->> 'sede', 'todas'));
      rollback;`,
    "Lima=ok todas todas todas todas",
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

// Versiones rotas a propósito: cada una tiene que hacer fallar al menos un escenario. Cada cambio es [texto, reemplazo] y se aplica
// a TODAS sus apariciones (el catálogo y la ficha comparten varias líneas).
const LIBRE = "select e.variante_id, e.producto_id, e.ubicacion_id, e.disponible\n";
const CON_ALGO = "and e.disponible > 0";
const MUTANTES = [
  ["la cifra exacta sale (sin «hay»)", [["else to_jsonb('hay'::text)", "else to_jsonb(p_cantidad)"]]],
  ["el umbral no se acota a 3", [["greatest(1, least(3, coalesce(p_umbral, 3)))", "greatest(1, coalesce(p_umbral, 3))"]]],
  ["la Cuarentena cuenta", [[LIBRE, "select e.variante_id, e.producto_id, e.ubicacion_id, e.fisico - e.apartado\n"], [CON_ALGO, "and e.fisico - e.apartado > 0"]]],
  ["lo apartado cuenta", [[LIBRE, "select e.variante_id, e.producto_id, e.ubicacion_id, e.fisico - e.danado\n"], [CON_ALGO, "and e.fisico - e.danado > 0"]]],
  ["lo que no tiene lugar no cuenta", [[LIBRE, "select e.variante_id, e.producto_id, e.ubicacion_id, e.piso_libre + e.almacen_libre\n"], [CON_ALGO, "and e.piso_libre + e.almacen_libre > 0"]]],
  ["el Taller y las tiendas escondidas cuentan", [["where e.ubicacion_id = any (coalesce(p_sedes, '{}'::uuid[]))", "where true"]]],
  ["fn_tienda_libre no suma las tiendas (se queda con la mayor)", [["select coalesce(sum(d.disponible), 0)::integer", "select coalesce(max(d.disponible), 0)::integer"]]],
  ["el umbral de Configuración no se lee", [["select c.quedan_pocas_desde from retail.configuracion_tienda_web c where c.id", "select 3"]]],
  ["la ficha de un modelo oculto se lee", [["where vp.producto_id = p_producto and vp.publicado)", "where vp.producto_id = p_producto)"]]],
  ["una tienda cualquiera se puede elegir (fn_tienda_sede_elegida)", [["select case when p_sede = any (coalesce(p_sedes, '{}'::uuid[])) then p_sede end", "select p_sede"]]],
  ["con «Todas», el precio menor", [["else (select max(retail.fn_precio_en_sede(v.id, s.id))", "else (select min(retail.fn_precio_en_sede(v.id, s.id))"]]],
  ["con «Todas», el precio de la primera tienda de la web y no el mayor", [["else w.sedes end as sedes", "else w.sedes[1:1] end as sedes"]]],
  ["la pieza común se olvida de la campaña", [["coalesce(retail.fn_descuento_campana(b.precio_lista, c.descuento_pct), 0) as descuento", "0::numeric as descuento"]]],
  ["la campaña de MENOR descuento", [["order by x.variante_id, x.descuento_pct desc, x.etiqueta_nombre, x.etiqueta_id", "order by x.variante_id, x.descuento_pct, x.etiqueta_nombre, x.etiqueta_id"]]],
  ["se ofrece una talla a S/ 0", [["x.activo and coalesce(x.precio_lista, 0) > 0,", "x.activo,"]]],
  ["la prenda del look vale lo del modelo y no lo de su color", [["case when p_por_color then t.color_codigo end as color_del_grupo", "null::text as color_del_grupo"]]],
  ["la campaña de una talla no se dice", [["'campana', x.campana,", "'campana', null::jsonb,"]]],
  ["las tallas en orden alfabético", [["order by retail.fn_actividad_peso_talla(ta.valor), ta.valor)", "order by ta.valor)"]]],
];

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  const aplicarAntes = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
  if (!aplicarAntes) {
    const hay = correr("select to_regprocedure('retail.tienda_ficha(uuid, uuid)') is not null;");
    if (hay.salida !== "t") {
      console.error(`Falta la ficha de la tienda: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }

  let fallos = 0;
  const casos = escenarios(aplicarAntes);
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
