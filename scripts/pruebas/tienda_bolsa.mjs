#!/usr/bin/env node
/**
 * La bolsa, «Separar», «Mis pedidos» y el cierre de las 24 h de la tienda online (ADR-0408, actividad 7) contra el Postgres
 * local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015021000_tienda_bolsa_y_separar.sql`, `20261015022000_tienda_mis_pedidos.sql` y
 * `20261015023000_pedidos_web_cierre_programado.sql`:
 *   A. La bolsa (`tienda_bolsa`): el precio de la tienda elegida o, sin tienda, el mayor de la web, con la campaña de la caja
 *      encima; en cada tienda de la web, si alcanza, si hay y si se vende ahí, siempre como sí/no (nunca la cifra), y lo MISMO que
 *      dice la ficha (la regla única de «hay», 20261015012000: ni la Cuarentena, ni lo apartado, ni el Taller); lo que ya no se puede
 *      separar vuelve sin nombre ni foto; la entrada torcida (de la cookie) no la rompe.
 *   B. «Separar» (`tienda_separar`): crea el pedido «por confirmar» con el precio de la tienda de recojo y su campaña, SIN
 *      tocar el stock ni el libro; dos toques con la misma marca dan el mismo pedido (aunque entretanto cambie el precio); la
 *      marca de otro no devuelve su pedido; un precio que no cuadra, lo que ya no está en la Vitrina, lo que no se vende en esa
 *      tienda, lo agotado (también lo que solo está en el Taller o en una tienda escondida: la regla de la ficha), una tienda
 *      escondida, sin cuenta o una bolsa torcida no separan NADA. A lo sumo 3 separaciones «por confirmar» a la vez por cliente
 *      (`tienda_separar_tope`, decisión de Felipe 2026-10-14): la marca se mira antes que el tope, y lo confirmado o vencido no
 *      cuenta. Que «Separar» cierre las esperas de «Avísame» lo prueba `pnpm pruebas:tienda-club` (S).
 *   C. «Mis pedidos» (`tienda_mis_pedidos`, `tienda_pedido`): cada cliente ve SOLO lo suyo (el número de otro responde igual
 *      que uno que no existe); el código de 4 cifras sale solo cuando está listo para recoger; los plazos son los de
 *      Configuración ▸ Tienda web; cada prenda trae cómo se ve y la tienda su nombre web y su WhatsApp.
 *   D. El cierre programado (`fn_cerrar_pedidos_web_sin_confirmar`): pasadas las horas de Configuración se cierra; lo que no
 *      llega a su plazo y lo confirmado, no; solo lo ejecuta `service_role`.
 *   E. La puerta: solo `tienda_web` ejecuta las `tienda_*` nuevas (y de verdad, con su rol) y no llega al motor por fuera.
 *   F. Las migraciones se pueden pegar dos veces.
 *
 * CÓMO. Cada escenario corre en su transacción y termina en ROLLBACK: nunca se commitea nada en el Postgres local que
 * comparten los worktrees. Cada uno arma su piso de partida: Trujillo y Lima en la web («ZZ …»), sin campañas, los plazos de
 * fábrica, dos prendas de dos modelos distintos (las únicas en la Vitrina), su stock vaciado DENTRO de la transacción (con un
 * «apartado» del libro, que mueve el stock y el libro juntos) y dos clientes con cuenta web. Los errores esperados se prueban
 * con `pg_temp.probar` (corre la llamada y deshace lo que hizo) y se reconocen por su HINT. El paso del tiempo (24 h) se
 * prueba apagando, solo en esa transacción, el disparador que protege la fecha del pedido y corriéndola hacia atrás.
 *
 * MUTANTES. `--mutantes` corre todos los escenarios contra versiones rotas a propósito de las tres migraciones (cada mutante
 * es un cambio chico: no comparar el precio, cerrar con 24 h fijas, ver los pedidos de otro…) y falla si algún mutante
 * sobrevive (ningún escenario se puso rojo). Prueba que estas pruebas de verdad miran lo que dicen mirar. No va en el CI
 * (tarda): se corre a mano al tocar estas funciones.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivos.sql separados por coma>` mete las migraciones dentro de cada transacción
 * (que se revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: `Tienda Trujillo` y `Tienda Lima` con su piso y su almacén, al menos dos prendas de dos modelos activos que
 * se venden en las dos sin precio propio de tienda, Felipe como líder (el seed), el motor del pedido web (20261014235000 y
 * 20261015000000), las tiendas de la web (20261014231000) y la Vitrina (20261014225000).
 *
 * USO
 *   pnpm pruebas:tienda-bolsa                         → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-bolsa -- --mutantes           → además, los mutantes (a mano, ~3 min)
 *   pnpm pruebas:tienda-bolsa -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const CON_MUTANTES = process.argv.includes("--mutantes");
const MIGRACIONES = [
  "supabase/migrations/20261015021000_tienda_bolsa_y_separar.sql",
  "supabase/migrations/20261015022000_tienda_mis_pedidos.sql",
  "supabase/migrations/20261015023000_pedidos_web_cierre_programado.sql",
];
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",").map((f) => readFileSync(f.trim(), "utf8")).join("\n")
  : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: confirma y cobra en cualquier tienda (para llegar a «listo»)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// ---- El piso de partida de cada escenario ----------------------------------------------------------------------------------

const lugares = (nombre, sufijo) => `
select id as ${sufijo} from retail.ubicaciones where nombre = '${nombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${sufijo}', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${sufijo}', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'almacen_tienda');
select id as ${sufijo}_piso from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'piso_venta' \\gset
select id as ${sufijo}_alm from retail.sububicaciones where ubicacion_id = :'${sufijo}' and tipo = 'almacen_tienda' \\gset
`;

// Una prenda que se puede mostrar en la web, que se vende en las dos tiendas y que no tiene precio propio en ninguna (así su
// precio de tienda es el de la grilla, en las dos, hasta que el escenario le ponga uno).
const elegirPrenda = (alias, excluir = "") => `
select v.id as ${alias}, v.producto_id as prod_${alias}, v.precio::text as p_${alias}
  from retail.variantes v
  join retail.productos p on p.id = v.producto_id
 where v.activo and v.precio > 0 and p.estado = 'activo' and p.estado_alta <> 'rechazado' and not p.es_prueba
   and p.id <> '11111111-1111-4111-8111-111111111111'
   and retail.fn_variante_permitida_en_sede(v.id, :'tru') and retail.fn_variante_permitida_en_sede(v.id, :'lim')
   and not exists (select 1 from retail.precios_sede_prenda ps where ps.producto_id = v.producto_id and ps.archivado_en is null)
   ${excluir}
 order by v.id limit 1 \\gset
`;

const AYUDAS = `
-- Corre una llamada y DESHACE todo lo que hizo (éxito o error): 'ok' o 'error|<hint>|<mensaje>|<detail>'.
create function pg_temp.probar(p_sql text) returns text language plpgsql as $f$
declare v_hint text; v_msg text; v_det text;
begin
  begin
    execute p_sql;
    raise exception 'PROBAR_OK';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text, v_det = pg_exception_detail;
    if v_msg = 'PROBAR_OK' then return 'ok'; end if;
    return 'error|' || coalesce(v_hint, '') || '|' || v_msg || '|' || coalesce(v_det, '');
  end;
end $f$;
-- Deja n unidades más en una fila (una «entrada» del libro).
create function pg_temp.dejar(p_v uuid, p_u uuid, p_sub uuid, p_n integer) returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
    values (p_v, p_u, p_sub, 'entrada', p_n, 'prueba', 'prueba tienda bolsa: colchón') returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end $f$;
-- Deja SIN disponible la prenda en una tienda: aparta (en el libro) todo lo libre de cada fila.
create function pg_temp.vaciar(p_v uuid, p_u uuid) returns void language plpgsql as $f$
declare r record; v_mov uuid;
begin
  for r in select st.sububicacion_id, st.cantidad - st.cantidad_apartada as libres
             from retail.stock st left join retail.sububicaciones s on s.id = st.sububicacion_id
            where st.variante_id = p_v and st.ubicacion_id = p_u and st.cantidad - st.cantidad_apartada > 0
              and (s.id is null or s.tipo <> 'cuarentena')
  loop
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
      values (p_v, p_u, r.sububicacion_id, 'apartado', r.libres, 'apartado', 'prueba tienda bolsa: piso de partida') returning id into v_mov;
    perform retail.fn_aplicar_movimiento(v_mov);
  end loop;
end $f$;
-- La huella del stock de una prenda (todas sus filas): igual antes y después = nada se movió.
create function pg_temp.huella(p_v uuid) returns text language sql as $f$
  select md5(coalesce(string_agg(format('%s/%s:%s/%s', ubicacion_id, sububicacion_id, cantidad, cantidad_apartada), ';'
                                 order by ubicacion_id, sububicacion_id), '')) from retail.stock where variante_id = p_v
$f$;
-- Todas las prendas de un pedido con la misma decisión (para confirmarlo como lo haría la sede).
create function pg_temp.todas(p_pedido uuid, p_decision text) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object('linea_id', l.id, 'decision', p_decision) order by l.posicion)
    from retail.pedido_web_lineas l where l.pedido_id = p_pedido
$f$;
-- Una línea de la bolsa como la manda la tienda: la prenda, cuántas y el precio que el cliente vio.
create function pg_temp.linea(p_v uuid, p_n integer, p_precio numeric) returns jsonb language sql as $f$
  select jsonb_build_object('variante_id', p_v, 'cantidad', p_n, 'precio', p_precio)
$f$;
`;

const preparar = (aplicar) => `
begin;
${aplicar}
set local request.jwt.claim.sub = '${FELIPE}';
${lugares("Tienda Trujillo", "tru")}
${lugares("Tienda Lima", "lim")}
-- Las tiendas de la web: Trujillo y Lima, como las encendería Configuración ▸ Tienda web; ninguna otra.
update retail.ubicacion_datos_web set mostrar = false where mostrar;
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
-- Sin campañas (cada caso pone la suya) y los plazos de fábrica.
update retail.etiquetas set activo = false where activo and descuento_pct is not null;
insert into retail.configuracion_tienda_web (id) values (true) on conflict (id) do nothing;
update retail.configuracion_tienda_web set horas_para_confirmar = 24, horas_aviso_sin_pagar = 48, dias_aviso_sin_recoger = 7 where id;
${elegirPrenda("v")}
${elegirPrenda("v2", "and v.producto_id <> :'prod_v'")}
-- La Vitrina: solo los modelos de esas dos prendas.
update retail.vitrina_productos set publicado = false where publicado;
insert into retail.vitrina_productos (producto_id, publicado, publicado_en)
values (:'prod_v', true, now()), (:'prod_v2', true, now())
on conflict (producto_id) do update set publicado = true, publicado_en = now();
${AYUDAS}
select pg_temp.vaciar(:'v', :'tru'), pg_temp.vaciar(:'v', :'lim'), pg_temp.vaciar(:'v2', :'tru'), pg_temp.vaciar(:'v2', :'lim');
-- Dos clientes con cuenta web (su usuario del proyecto de clientes es un id cualquiera: aquí no se entra a ningún lado).
insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Cliente A tienda web', '999888771') returning id as cli_a \\gset
insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Cliente B tienda web', '999888772') returning id as cli_b \\gset
select gen_random_uuid() as usr_a, gen_random_uuid() as usr_b, gen_random_uuid() as tok \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados)
values (:'usr_a', :'cli_a', 'zz-a@prueba-tienda.test', 'prueba'), (:'usr_b', :'cli_b', 'zz-b@prueba-tienda.test', 'prueba');
`;

// «Separar» de un cliente (A por defecto) en una tienda (Trujillo por defecto), con una marca nueva salvo que se diga otra.
const separar = (alias, lineas, { usr = "usr_a", sede = "tru", token = "gen_random_uuid()" } = {}) =>
  `select retail.tienda_separar(:'${usr}', :'${sede}', ${lineas}, ${token}) ->> 'codigo' as ${alias} \\gset\n`;
const L = (prenda, n = 1, precio = null) => `pg_temp.linea(:'${prenda}', ${n}, ${precio ?? `:'p_${prenda}'::numeric`})`;
const bolsa = (...lineas) => `jsonb_build_array(${lineas.join(", ")})`;
const separarTexto = (lineas, { usr = "usr_a", sede = "tru", token = "gen_random_uuid()" } = {}) =>
  `format('select retail.tienda_separar(%L, %L, %L, %L)', :'${usr}', :'${sede}', ${lineas}, ${token})`;
const hint = (llamada) => `split_part(pg_temp.probar(${llamada}), '|', 2)`;
// El paso del tiempo, solo en esta transacción: se vacían los controles diferidos pendientes (con eventos pendientes Postgres no
// deja tocar la tabla), se apaga el disparador que protege la fecha, se corre hacia atrás y se vuelve a lo normal.
const VIAJAR = (sql) => `
set constraints all immediate;
alter table retail.pedidos_web disable trigger pedidos_web_reglas;
${sql}
alter table retail.pedidos_web enable trigger pedidos_web_reglas;
set constraints all deferred;
`;
const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
const mis = (usr = "usr_a") => `retail.tienda_mis_pedidos(:'${usr}')`;
const pedidoDe = (usr, codigo) => `(retail.tienda_pedido(:'${usr}', ${codigo}) -> 'pedido')`;

// ---- Los escenarios ---------------------------------------------------------------------------------------------------------

/** [sección, nombre, cuerpo, esperado]: la ÚLTIMA línea de la salida es el veredicto. */
const ESCENARIOS = [];
const seccion = (titulo) => ESCENARIOS.push([titulo]);
const escenario = (nombre, cuerpo, esperado) => ESCENARIOS.push([null, nombre, cuerpo, esperado]);

seccion("— A. La bolsa —");
escenario(
  "con la tienda elegida, el precio de ESA tienda; sin tienda, el mayor de la web (la regla de «Todas» del catálogo)",
  `select retail.poner_precio_sede(:'prod_v', :'lim', :'p_v'::numeric + 30, 'Prueba de la bolsa') is not null as _p \\gset
select concat_ws(',',
  (retail.tienda_bolsa(${bolsa(`jsonb_build_object('variante_id', :'v', 'cantidad', 1)`)}, :'tru') -> 'lineas' -> 0 ->> 'precio')::numeric = :'p_v'::numeric,
  (retail.tienda_bolsa(${bolsa(`jsonb_build_object('variante_id', :'v', 'cantidad', 1)`)}, :'lim') -> 'lineas' -> 0 ->> 'precio')::numeric = :'p_v'::numeric + 30,
  (retail.tienda_bolsa(${bolsa(`jsonb_build_object('variante_id', :'v', 'cantidad', 1)`)}, null) -> 'lineas' -> 0 ->> 'precio')::numeric = :'p_v'::numeric + 30,
  retail.tienda_bolsa('[]', :'tru') ->> 'sede' = :'tru');`,
  "t,t,t,t",
);
escenario(
  "la campaña de la caja va encima (el mismo descuento de la caja) y se nombra; el precio de lista se ve aparte",
  `insert into retail.etiquetas (nombre, estilo, activo, descuento_pct) values ('ZZ Campaña de la bolsa', 'campana', true, 20) returning id as camp \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v', :'camp');
select retail.tienda_bolsa(${bolsa(`jsonb_build_object('variante_id', :'v', 'cantidad', 1)`)}, :'tru') -> 'lineas' -> 0 as l \\gset
select concat_ws(',',
  ((:'l')::jsonb ->> 'precio_lista')::numeric = :'p_v'::numeric,
  ((:'l')::jsonb ->> 'precio')::numeric = :'p_v'::numeric - retail.fn_descuento_campana(:'p_v'::numeric, 20),
  (:'l')::jsonb -> 'campana' = jsonb_build_object('nombre', 'ZZ Campaña de la bolsa', 'pct', 20));`,
  "t,t,t",
);
escenario(
  "en cada tienda de la web: si alcanza para lo que lleva, si hay alguna y si se vende ahí; siempre sí/no, nunca la cifra",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1), pg_temp.dejar(:'v', :'lim', :'lim_alm', 5);
insert into retail.etiquetas (nombre, estilo, activo, sedes_permitidas) values ('ZZ Solo Lima', 'neutral', true, array[:'lim'::uuid]) returning id as solo \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v', :'solo');
select retail.tienda_bolsa(${bolsa(`jsonb_build_object('variante_id', :'v', 'cantidad', 2)`)}, :'tru') -> 'lineas' -> 0 as l \\gset
select concat_ws(',',
  (:'l')::jsonb -> 'en_sedes' -> (:'tru') = '{"alcanza": false, "hay": true, "se_vende": false}'::jsonb,
  (:'l')::jsonb -> 'en_sedes' -> (:'lim') = '{"alcanza": true, "hay": true, "se_vende": true}'::jsonb,
  (:'l')::jsonb ->> 'alcanza_en_total',
  (select bool_and(jsonb_typeof(x.value) = 'boolean') from jsonb_each((:'l')::jsonb -> 'en_sedes') s, jsonb_each(s.value) x),
  jsonb_typeof((:'l')::jsonb -> 'alcanza_en_total'));`,
  "t,t,true,t,boolean",
);
escenario(
  // La regla única de «hay» (20261015012000): la bolsa lee la misma pieza que la ficha. Lo cruzado con «Avísame», el look, «Mi cuenta»
  // y el ERP vive en pruebas:tienda-club (R); aquí, la bolsa contra la ficha de la misma prenda, tienda por tienda.
  "la bolsa dice lo mismo que la ficha, tienda por tienda: ni la Cuarentena, ni lo apartado, ni el Taller cuentan (v: 1 libre en Trujillo; v2: solo en el Taller)",
  `select id as tru_cua from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena' order by id limit 1 \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1), pg_temp.dejar(:'v', :'tru', :'tru_cua', 2), pg_temp.dejar(:'v', :'lim', :'lim_piso', 1);
select pg_temp.vaciar(:'v', :'lim');
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
values (:'v', :'taller', null, 5, 0), (:'v2', :'taller', null, 3, 0)
on conflict on constraint stock_variante_ubicacion_sububicacion_key do update set cantidad = excluded.cantidad, cantidad_apartada = 0;
select string_agg(t.linea, ' | ' order by t.n) from (
  select p.n, string_agg(concat_ws('/', coalesce(b.l -> 'en_sedes' -> s.id::text ->> 'hay', '·'), coalesce(f.x -> 'stock' ->> s.id::text, '·')), ' '
                         order by s.o) || ' total ' || concat_ws('/', b.l ->> 'alcanza_en_total', f.x ->> 'total') as linea
    from (values (1, :'v'::uuid, :'prod_v'::uuid), (2, :'v2'::uuid, :'prod_v2'::uuid)) p (n, v, prod)
    cross join lateral (select retail.tienda_bolsa(jsonb_build_array(jsonb_build_object('variante_id', p.v, 'cantidad', 1)), null) -> 'lineas' -> 0 as l) b
    cross join lateral (select x from jsonb_array_elements(retail.tienda_ficha(p.prod) -> 'prenda' -> 'variantes') x where x ->> 'id' = p.v::text) f
    cross join (values (1, :'tru'::uuid), (2, :'lim'::uuid)) s (o, id)
   group by p.n, b.l, f.x) t;`,
  "true/1 false/0 total true/1 | false/0 false/0 total false/0",
);
escenario(
  "lo que ya no se puede separar (oculto en la Vitrina, descontinuado o que no existe) vuelve SIN nombre ni foto",
  `update retail.vitrina_productos set publicado = false where producto_id = :'prod_v2';
select retail.tienda_bolsa(${bolsa(
    `jsonb_build_object('variante_id', :'v', 'cantidad', 1)`,
    `jsonb_build_object('variante_id', :'v2', 'cantidad', 1)`,
    `jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1)`,
  )}, null) -> 'lineas' as ls \\gset
select concat_ws(',',
  (:'ls')::jsonb -> 0 ->> 'disponible', (:'ls')::jsonb -> 0 ? 'nombre',
  (:'ls')::jsonb -> 1 ->> 'disponible', (select count(*) from jsonb_object_keys((:'ls')::jsonb -> 1)),
  (:'ls')::jsonb -> 2 ->> 'disponible', (select count(*) from jsonb_object_keys((:'ls')::jsonb -> 2)));`,
  "true,t,false,3,false,3",
);
escenario(
  "lo que llega torcido de la cookie no la rompe: se ignora lo mal escrito, la misma prenda se suma y una tienda escondida es «Todas»",
  `update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';
select retail.tienda_bolsa(jsonb_build_array(
  jsonb_build_object('variante_id', :'v', 'cantidad', 1), jsonb_build_object('variante_id', 'no-es-un-id', 'cantidad', 1),
  jsonb_build_object('variante_id', :'v', 'cantidad', 2), jsonb_build_object('variante_id', :'v2', 'cantidad', 0),
  jsonb_build_object('variante_id', :'v2', 'cantidad', '3'), '"texto"'::jsonb, jsonb_build_object('variante_id', :'v2', 'cantidad', 1.5)), :'lim') as b \\gset
select concat_ws(',', jsonb_array_length((:'b')::jsonb -> 'lineas'), (:'b')::jsonb -> 'lineas' -> 0 ->> 'cantidad',
  coalesce((:'b')::jsonb ->> 'sede', 'todas'), jsonb_array_length((:'b')::jsonb -> 'sedes'),
  jsonb_array_length(retail.tienda_bolsa('"no soy una lista"'::jsonb, null) -> 'lineas'));`,
  "1,3,todas,1,0",
);

seccion("— B. «Separar» —");
escenario(
  "crea el pedido «por confirmar» con el precio de la tienda de recojo y su campaña, y NO toca el stock ni el libro",
  `select pg_temp.dejar(:'v', :'lim', :'lim_alm', 3), pg_temp.dejar(:'v2', :'tru', :'tru_piso', 2);
select retail.poner_precio_sede(:'prod_v', :'lim', :'p_v'::numeric + 30, 'Prueba de la bolsa') is not null as _p \\gset
insert into retail.etiquetas (nombre, estilo, activo, descuento_pct) values ('ZZ Campaña de la bolsa', 'campana', true, 20) returning id as camp \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v2', :'camp');
select pg_temp.huella(:'v') as h_v, pg_temp.huella(:'v2') as h_v2, (select count(*) from retail.movimientos) as movs \\gset
${separar("cod", bolsa(L("v", 2), L("v2", 1, `:'p_v2'::numeric - retail.fn_descuento_campana(:'p_v2'::numeric, 20)`)))}
select concat_ws(',', w.estado, w.ubicacion_id = :'tru', w.clienta_id = :'cli_a', w.pagado = 0,
  w.total = 2 * :'p_v'::numeric + :'p_v2'::numeric - retail.fn_descuento_campana(:'p_v2'::numeric, 20),
  (select count(*) from retail.pedido_web_lineas l where l.pedido_id = w.id and l.estado = 'pendiente' and l.apartado_id is null),
  (select count(*) from retail.pedido_web_lineas l where l.pedido_id = w.id and l.variante_id = :'v' and l.precio_lista = :'p_v'::numeric and l.descuento = 0),
  (select count(*) from retail.pedido_web_lineas l where l.pedido_id = w.id and l.variante_id = :'v2' and l.descuento_etiqueta_id = :'camp'),
  pg_temp.huella(:'v') = :'h_v' and pg_temp.huella(:'v2') = :'h_v2' and (select count(*) from retail.movimientos) = :'movs'::bigint)
  from retail.pedidos_web w where w.codigo = :'cod';`,
  "por_confirmar,t,t,t,t,3,2,1,t",
);
escenario(
  "dos toques con la misma marca dan el MISMO pedido, aunque entre uno y otro haya cambiado el precio",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 2);
${separar("c1", bolsa(L("v")), { token: ":'tok'" })}
select retail.poner_precio_sede(:'prod_v', :'tru', :'p_v'::numeric + 10, 'Prueba de la bolsa') is not null as _p \\gset
select retail.tienda_separar(:'usr_a', :'tru', ${bolsa(L("v"))}, :'tok') as r2 \\gset
select concat_ws(',', (:'r2')::jsonb ->> 'codigo' = :'c1', (:'r2')::jsonb ->> 'ya_estaba',
  (select count(*) from retail.pedidos_web where token_cliente = :'tok'));`,
  "t,true,1",
);
escenario(
  "la marca de otro cliente no devuelve su pedido",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 2);
${separar("c1", bolsa(L("v")), { token: ":'tok'" })}
select ${hint(separarTexto(bolsa(L("v")), { usr: "usr_b", token: ":'tok'" }))};`,
  "pedido_web_token",
);
escenario(
  "un precio que no cuadra con el de la base (más alto o más bajo) no separa NADA, y dice qué prenda",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 2), pg_temp.dejar(:'v2', :'tru', :'tru_piso', 2);
select (select count(*) from retail.pedidos_web) as antes \\gset
select pg_temp.probar(${separarTexto(bolsa(L("v2"), L("v", 1, `:'p_v'::numeric - 1`)))}) as r \\gset
select concat_ws(',', split_part(:'r', '|', 2), split_part(:'r', '|', 4) = :'v',
  ${hint(separarTexto(bolsa(L("v", 1, `:'p_v'::numeric + 0.01`))))},
  (select count(*) from retail.pedidos_web) = :'antes'::bigint);`,
  "tienda_separar_precio,t,tienda_separar_precio,t",
);
escenario(
  "lo que está solo en OTRA tienda de la web sí se separa: la tienda de recojo la trae (y el stock no se mueve)",
  `select pg_temp.dejar(:'v', :'lim', :'lim_alm', 1);
select pg_temp.huella(:'v') as h \\gset
${separar("c1", bolsa(L("v")))}
select concat_ws(',', (select estado from retail.pedidos_web where codigo = :'c1'), pg_temp.huella(:'v') = :'h');`,
  "por_confirmar,t",
);
escenario(
  // Decisión de Felipe (2026-10-14): a lo sumo 3 separaciones «por confirmar» a la vez por cliente. La marca se mira ANTES que el tope.
  "el tope de 3 por confirmar: la cuarta se rechaza (tienda_separar_tope, con el tope en el detalle); el reintento con la MISMA marca devuelve su pedido; lo de otro cliente no cuenta; al confirmarse una o al vencer otra, se separa de nuevo",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 10);
select gen_random_uuid() as tok1 \\gset
${separar("c1", bolsa(L("v")), { token: ":'tok1'" })}
${separar("c2", bolsa(L("v")))}
${separar("c3", bolsa(L("v")))}
select pg_temp.probar(${separarTexto(bolsa(L("v")))}) as cuarta \\gset
select retail.tienda_separar(:'usr_a', :'tru', ${bolsa(L("v"))}, :'tok1') as otra_vez \\gset
${separar("cb", bolsa(L("v")), { usr: "usr_b" })}
select id as p1 from retail.pedidos_web where codigo = :'c1' \\gset
select retail.confirmar_pedido_web(:'p1', pg_temp.todas(:'p1', 'reservar')) is not null as _c \\gset
${separar("c4", bolsa(L("v")))}
select pg_temp.probar(${separarTexto(bolsa(L("v")))}) as quinta \\gset
${VIAJAR(`update retail.pedidos_web set creado_en = now() - interval '25 hours' where codigo = :'c2';`)}
${separar("c5", bolsa(L("v")))}
select concat_ws(',', split_part(:'cuarta', '|', 2), split_part(:'cuarta', '|', 4),
  (:'otra_vez')::jsonb ->> 'codigo' = :'c1', (:'otra_vez')::jsonb ->> 'ya_estaba', length(:'cb') > 0, length(:'c4') > 0,
  split_part(:'quinta', '|', 2), length(:'c5') > 0, (select count(*) from retail.pedidos_web where clienta_id = :'cli_a'));`,
  "tienda_separar_tope,3,t,true,t,t,tienda_separar_tope,t,5",
);
escenario(
  "lo que solo está en el Taller o en una tienda escondida no se separa: «Separar» lee la regla de la ficha, que dice que no hay",
  `select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada) values (:'v2', :'taller', null, 3, 0)
on conflict on constraint stock_variante_ubicacion_sububicacion_key do update set cantidad = excluded.cantidad, cantidad_apartada = 0;
select pg_temp.dejar(:'v2', :'lim', :'lim_piso', 2);
update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';
select concat_ws(',', (select x ->> 'total' from jsonb_array_elements(retail.tienda_ficha(:'prod_v2') -> 'prenda' -> 'variantes') x where x ->> 'id' = :'v2'),
  ${hint(separarTexto(bolsa(L("v2"))))});`,
  "0,tienda_separar_agotada",
);
escenario(
  "no separa: oculta en la Vitrina, no se vende en esa tienda, agotada en la web, tienda escondida, sin cuenta, sin marca",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1), pg_temp.dejar(:'v2', :'tru', :'tru_piso', 1);
insert into retail.etiquetas (nombre, estilo, activo, sedes_permitidas) values ('ZZ Solo Lima', 'neutral', true, array[:'lim'::uuid]) returning id as solo \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v2', :'solo');
select string_agg(x.h, ',' order by x.n) from (values
  (1, (select ${hint(`format('update retail.vitrina_productos set publicado = false where producto_id = %L; select retail.tienda_separar(%L, %L, %L, %L)', :'prod_v', :'usr_a', :'tru', ${bolsa(L("v"))}, gen_random_uuid())`)})),
  (2, (select ${hint(separarTexto(bolsa(L("v2"))))})),
  (3, (select ${hint(separarTexto(bolsa(L("v", 2))))})),
  (4, (select ${hint(`format('update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = %L; select retail.tienda_separar(%L, %L, %L, %L)', :'tru', :'usr_a', :'tru', ${bolsa(L("v"))}, gen_random_uuid())`)})),
  (5, (select ${hint(separarTexto(bolsa(L("v")), { usr: "tok" }))})),
  (6, (select ${hint(`format('select retail.tienda_separar(%L, %L, %L, null)', :'usr_a', :'tru', ${bolsa(L("v"))})`)})),
  (7, (select ${hint(separarTexto(bolsa(L("v")), { sede: "lim_alm" }))}))
) x(n, h);`,
  "tienda_separar_no_publicada,tienda_separar_no_se_vende,tienda_separar_agotada,tienda_separar_tienda,tienda_sin_cuenta,tienda_separar_marca,tienda_separar_tienda",
);
escenario(
  "una bolsa torcida no separa: vacía, mal escrita, cantidad 0, precio con 3 decimales, la misma prenda dos veces o más de 20",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 25);
select string_agg(x.h, ',' order by x.n) from (values
  (1, (select ${hint(separarTexto("'[]'::jsonb"))})),
  (2, (select ${hint(separarTexto(bolsa(`jsonb_build_object('variante_id', 'no-es-un-id', 'cantidad', 1, 'precio', 10)`)))})),
  (3, (select ${hint(separarTexto(bolsa(L("v", 0))))})),
  (4, (select ${hint(separarTexto(bolsa(L("v", 1, `:'p_v'::numeric + 0.001`))))})),
  (5, (select ${hint(separarTexto(bolsa(L("v"), L("v"))))})),
  (6, (select ${hint(separarTexto(bolsa(L("v", 21))))})),
  (7, (select ${hint(separarTexto(`(select jsonb_agg(${L("v")}) from generate_series(1, 21))`))}))
) x(n, h);`,
  "pedido_web_bolsa_vacia,pedido_web_linea_invalida,pedido_web_linea_invalida,pedido_web_linea_invalida,pedido_web_linea_invalida,pedido_web_linea_invalida,pedido_web_muchas_prendas",
);

seccion("— C. «Mis pedidos» —");
escenario(
  "cada cliente ve SOLO lo suyo; el número de otro responde igual que uno que no existe; sin cuenta, nada",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 3);
${separar("ca", bolsa(L("v")))}
${separar("cb", bolsa(L("v")), { usr: "usr_b" })}
select concat_ws(',',
  (select string_agg(p ->> 'codigo', ' ') from jsonb_array_elements(${mis()} -> 'pedidos') p) = :'ca',
  (select string_agg(p ->> 'codigo', ' ') from jsonb_array_elements(${mis("usr_b")} -> 'pedidos') p) = :'cb',
  ${pedidoDe("usr_a", ":'ca'")} ->> 'codigo' = :'ca',
  ${pedidoDe("usr_a", "lower(:'ca')")} ->> 'codigo' = :'ca',
  coalesce(jsonb_typeof(${pedidoDe("usr_a", ":'cb'")}), 'null'),
  coalesce(jsonb_typeof(${pedidoDe("usr_a", "'W-999999'")}), 'null'),
  coalesce(retail.tienda_mis_pedidos(gen_random_uuid())::text, 'sin cuenta'));`,
  "t,t,t,t,null,null,sin cuenta",
);
escenario(
  "cada prenda trae cómo se ve (nombre, color, talla, foto) y la tienda de recojo su nombre web y su WhatsApp",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("ca", bolsa(L("v")))}
select ${pedidoDe("usr_a", ":'ca'")} as p \\gset
select concat_ws(',', (:'p')::jsonb -> 'tienda_web' ->> 'nombre', (:'p')::jsonb -> 'tienda_web' ->> 'whatsapp',
  (:'p')::jsonb -> 'lineas' -> 0 ->> 'nombre' = (select referencia from retail.productos where id = :'prod_v'),
  (:'p')::jsonb -> 'lineas' -> 0 -> 'color' ? 'nombre', (:'p')::jsonb -> 'lineas' -> 0 ? 'talla', (:'p')::jsonb -> 'lineas' -> 0 ? 'foto',
  (:'p')::jsonb -> 'lineas' -> 0 ? 'referencia', (:'p')::jsonb ->> 'estado');`,
  "ZZ Trujillo,987000001,t,t,t,t,f,por_confirmar",
);
escenario(
  "la prenda que la tienda trae de otra dice de dónde viene con el nombre que lee el cliente («ZZ Lima», no el del sistema)",
  `select pg_temp.dejar(:'v', :'lim', :'lim_alm', 1), pg_temp.dejar(:'v2', :'tru', :'tru_alm', 1);
${separar("ca", bolsa(L("v"), L("v2")))}
select id as pid from retail.pedidos_web where codigo = :'ca' \\gset
select retail.confirmar_pedido_web(:'pid', jsonb_build_array(
  jsonb_build_object('linea_id', (select id from retail.pedido_web_lineas where pedido_id = :'pid' and variante_id = :'v'), 'decision', 'reservar', 'ubicacion_id', :'lim'),
  jsonb_build_object('linea_id', (select id from retail.pedido_web_lineas where pedido_id = :'pid' and variante_id = :'v2'), 'decision', 'reservar'))) is not null as _c \\gset
select string_agg(coalesce(l ->> 'viene_de', '-'), ',' order by n)
  from jsonb_array_elements(${pedidoDe("usr_a", ":'ca'")} -> 'lineas') with ordinality as x (l, n);`,
  "ZZ Lima,-",
);
escenario(
  "el código de 4 cifras sale recién cuando el pedido está listo para recoger (confirmado y pagado completo)",
  `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 1);
${separar("ca", bolsa(L("v")))}
select id as pid from retail.pedidos_web where codigo = :'ca' \\gset
select coalesce(${pedidoDe("usr_a", ":'ca'")} ->> 'codigo_recojo', 'sin código') as antes \\gset
select retail.confirmar_pedido_web(:'pid', pg_temp.todas(:'pid', 'reservar')) is not null as _c \\gset
select coalesce(${pedidoDe("usr_a", ":'ca'")} ->> 'codigo_recojo', 'sin código') as confirmado \\gset
select retail.registrar_pago_pedido_web(:'pid', :'p_v'::numeric, 'yape', '77770071') is not null as _g \\gset
select concat_ws(',', :'antes', :'confirmado', ${pedidoDe("usr_a", ":'ca'")} ->> 'estado',
  ${pedidoDe("usr_a", ":'ca'")} ->> 'codigo_recojo' = (select codigo_recojo from retail.pedidos_web where id = :'pid'),
  ${pedidoDe("usr_a", ":'ca'")} ->> 'codigo_recojo' ~ '^[1-9][0-9]{3}$');`,
  "sin código,sin código,pagado,t,t",
);
escenario(
  "los plazos son los de Configuración ▸ Tienda web: con 48 h, uno de hace 25 h sigue por confirmar; con 24 h, se lee vencido",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("ca", bolsa(L("v")))}
${VIAJAR(`update retail.pedidos_web set creado_en = now() - interval '25 hours' where codigo = :'ca';`)}
select ${pedidoDe("usr_a", ":'ca'")} ->> 'estado' as con24 \\gset
update retail.configuracion_tienda_web set horas_para_confirmar = 48 where id;
select concat_ws(',', :'con24', ${pedidoDe("usr_a", ":'ca'")} ->> 'estado',
  (${pedidoDe("usr_a", ":'ca'")} ->> 'vence_en')::timestamptz = (select creado_en + interval '48 hours' from retail.pedidos_web where codigo = :'ca'),
  ${mis()} -> 'plazos' ->> 'horas_para_confirmar');`,
  "vencido,por_confirmar,t,48",
);

seccion("— D. El cierre de las 24 h —");
escenario(
  "pasadas las horas de Configuración se cierra solo; lo que no llega a su plazo y lo confirmado, no",
  `select pg_temp.dejar(:'v', :'tru', :'tru_alm', 3);
${separar("c25", bolsa(L("v")))}
${separar("c23", bolsa(L("v")))}
${separar("cok", bolsa(L("v")))}
select id as pok from retail.pedidos_web where codigo = :'cok' \\gset
select retail.confirmar_pedido_web(:'pok', pg_temp.todas(:'pok', 'reservar')) is not null as _c \\gset
${VIAJAR(`update retail.pedidos_web set creado_en = now() - interval '25 hours' where codigo in (:'c25', :'cok');
update retail.pedidos_web set creado_en = now() - interval '23 hours' where codigo = :'c23';`)}
select retail.fn_cerrar_pedidos_web_sin_confirmar() as r \\gset
-- «Cerrados» cuenta los de toda la base (la local es compartida): aquí se mira que estén los de esta prueba.
select concat_ws(',', ((:'r')::jsonb ->> 'cerrados')::integer >= 1, (:'r')::jsonb ->> 'horas_para_confirmar',
  (select string_agg(estado || '/' || coalesce(cierre_motivo, '-'), ' ' order by array_position(array[:'c25', :'c23', :'cok'], codigo))
     from retail.pedidos_web where codigo in (:'c25', :'c23', :'cok')));`,
  "t,24,vencido/sin_confirmar por_confirmar/- confirmado/-",
);
escenario(
  "con el plazo de Configuración en 48 h, uno de hace 25 h NO se cierra (nada escrito a mano)",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${separar("c25", bolsa(L("v")))}
${VIAJAR(`update retail.pedidos_web set creado_en = now() - interval '25 hours' where codigo = :'c25';`)}
update retail.configuracion_tienda_web set horas_para_confirmar = 48 where id;
select retail.fn_cerrar_pedidos_web_sin_confirmar() as r \\gset
select concat_ws(',', (:'r')::jsonb ->> 'horas_para_confirmar', (select estado from retail.pedidos_web where codigo = :'c25'));`,
  "48,por_confirmar",
);

seccion("— E. La puerta —");
escenario(
  "solo tienda_web ejecuta las tienda_* nuevas; el cierre, solo service_role; las piezas internas y el motor, nadie de afuera",
  `select concat_ws(',',
  (select count(*) from unnest(array['retail.tienda_bolsa(jsonb, uuid)', 'retail.tienda_separar(uuid, uuid, jsonb, uuid)',
                                     'retail.tienda_mis_pedidos(uuid)', 'retail.tienda_pedido(uuid, text)']) f
    where has_function_privilege('tienda_web', f, 'EXECUTE') and not has_function_privilege('anon', f, 'EXECUTE')
      and not has_function_privilege('authenticated', f, 'EXECUTE') and not has_function_privilege('public', f, 'EXECUTE')),
  has_function_privilege('service_role', 'retail.fn_cerrar_pedidos_web_sin_confirmar()', 'EXECUTE'),
  (select count(*) from unnest(array['anon', 'authenticated', 'tienda_web']) r
    where has_function_privilege(r, 'retail.fn_cerrar_pedidos_web_sin_confirmar()', 'EXECUTE')
       or has_function_privilege(r, 'retail.fn_bolsa_web_precios(uuid[], uuid[])', 'EXECUTE')
       or has_function_privilege(r, 'retail.fn_bolsa_web_prenda(uuid)', 'EXECUTE')
       or has_function_privilege(r, 'retail.crear_pedido_web(uuid, uuid, jsonb, uuid)', 'EXECUTE')
       or has_function_privilege(r, 'retail.fn_pedidos_web_de_clienta(uuid, integer, integer)', 'EXECUTE')),
  (select bool_and(p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search\\_path=%'))
     from pg_proc p where p.oid in ('retail.tienda_bolsa(jsonb, uuid)'::regprocedure, 'retail.tienda_separar(uuid, uuid, jsonb, uuid)'::regprocedure,
                                    'retail.tienda_mis_pedidos(uuid)'::regprocedure, 'retail.tienda_pedido(uuid, text)'::regprocedure,
                                    'retail.fn_cerrar_pedidos_web_sin_confirmar()'::regprocedure)));`,
  "4,t,0,t",
);
escenario(
  "como tienda_web de verdad (su rol): la bolsa, «Separar» y «Mis pedidos» funcionan, y el motor por fuera se niega",
  `select pg_temp.dejar(:'v', :'tru', :'tru_piso', 1);
${COMO_TIENDA}
select jsonb_array_length(retail.tienda_bolsa(${bolsa(`jsonb_build_object('variante_id', :'v', 'cantidad', 1)`)}, :'tru') -> 'lineas') as nb \\gset
${separar("ca", bolsa(L("v")))}
select concat_ws(',', :'nb', ${pedidoDe("usr_a", ":'ca'")} ->> 'estado',
  split_part(pg_temp.probar(format('select retail.crear_pedido_web(%L, %L, %L)', :'cli_a', :'tru', '[]')), '|', 3) like 'permission denied%');`,
  "1,por_confirmar,t",
);

seccion("— F. Las migraciones —");

// ---- Los mutantes: cada uno rompe UNA promesa; alguna prueba tiene que ponerse roja ------------------------------------------

const MUTANTES = [
  ["no compara el precio que vio el cliente", 0, "if p.precio <> r.precio then", "if false then"],
  ["cobra el precio de «Todas» y no el de la tienda de recojo", 0, "fn_bolsa_web_precios(array[r.variante_id], array[p_ubicacion_id])", "fn_bolsa_web_precios(array[r.variante_id], v_sedes)"],
  ["se olvida de la campaña", 0, "coalesce(retail.fn_descuento_campana(b.precio_lista, c.descuento_pct), 0) as descuento", "0::numeric as descuento"],
  ["separa lo que ya no está en la Vitrina", 0, "where v.id = r.variante_id and v.activo and vp.publicado and retail.fn_vitrina_publicable(v.producto_id)) then", "where v.id = r.variante_id) then"],
  ["separa lo que no se vende en esa tienda", 0, "if not retail.fn_variante_permitida_en_sede(r.variante_id, p_ubicacion_id) then", "if false then"],
  ["separa lo agotado", 0, "if v_libres < r.cantidad then", "if false then"],
  ["sin tope de separaciones por confirmar", 0, "if v_por_confirmar >= c_tope_por_confirmar then", "if false then"],
  ["el tope cuenta también lo ya confirmado", 0, "where x.estado = 'por_confirmar');", "where x.estado in ('por_confirmar', 'confirmado'));"],
  ["el tope cuenta lo vencido (sin el plazo de Configuración)", 0,
    "coalesce((select c.horas_para_confirmar from retail.configuracion_tienda_web c where c.id), 24),", "100000,"],
  ["el tope se mira ANTES de la marca (el reintento de un pedido ya guardado se rechaza)", 0,
    "  perform pg_advisory_xact_lock(hashtextextended('pedidos_web:' || p_token::text, 0));\n  select * into v_existente",
    "  if (select count(*) from retail.pedidos_web w where w.clienta_id = v_clienta and w.estado = 'por_confirmar') >= 3 then\n" +
      "    raise exception 'tope' using hint = 'tienda_separar_tope';\n  end if;\n" +
      "  perform pg_advisory_xact_lock(hashtextextended('pedidos_web:' || p_token::text, 0));\n  select * into v_existente"],
  ["«Separar» con su propia cuenta de «hay» (cuenta el Taller y las tiendas escondidas)", 0,
    "v_libres := retail.fn_tienda_libre(r.variante_id, v_sedes);",
    "v_libres := retail.fn_tienda_libre(r.variante_id, (select array_agg(u.id) from retail.ubicaciones u));"],
  ["la bolsa con su propia cuenta de «hay» (cuenta el Taller y las tiendas escondidas)", 0,
    "where v.id in (select en.variante_id from entrada en)), v_sedes) x",
    "where v.id in (select en.variante_id from entrada en)), (select array_agg(u.id) from retail.ubicaciones u)) x"],
  ["recoge en una tienda escondida", 0, "if p_ubicacion_id is null or not (p_ubicacion_id = any (v_sedes)) then", "if p_ubicacion_id is null then"],
  ["la marca no protege el segundo toque", 0, "  if found then\n    if v_existente.clienta_id <> v_clienta then", "  if false then\n    if v_existente.clienta_id <> v_clienta then"],
  ["la bolsa muestra lo que no se puede separar", 0, "case when not l.se_puede", "case when false"],
  ["la bolsa revela la cifra del stock", 0, "'alcanza', coalesce(li.disponible, 0) >= l.cantidad,", "'alcanza', coalesce(li.disponible, 0),"],
  ["la bolsa no suma la misma prenda", 0, "least(sum(c.cantidad), 20)::integer as cantidad", "least(min(c.cantidad), 20)::integer as cantidad"],
  ["«Mis pedidos» con plazos escritos a mano", 1, "fn_pedidos_web_de_clienta(v_clienta, v_horas, v_dias)", "fn_pedidos_web_de_clienta(v_clienta, 24, 7)"],
  ["«Mis pedidos» de cualquier cuenta", 1, "select w.clienta_id into v_clienta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id;", "select w.clienta_id into v_clienta from retail.cuentas_web w limit 1;"],
  ["un pedido por número sin mirar el número", 1, "where x.p ->> 'codigo' = upper(btrim(coalesce(p_codigo, '')))", "where true"],
  ["la tienda de recojo con el nombre del sistema", 1, "jsonb_build_object('nombre', coalesce(dw.nombre_web, u.nombre), 'whatsapp'", "jsonb_build_object('nombre', u.nombre, 'whatsapp'"],
  ["«viene de» sin el nombre de la tienda", 1, "where pl.pedido_id = (p.x ->> 'pedido_id')::uuid and pl.posicion = l.n) end)", "where false) end)"],
  ["el cierre con 24 h fijas", 2, "retail.fn_cerrar_pedidos_web_vencidos(v_horas)", "retail.fn_cerrar_pedidos_web_vencidos(24)"],
];

function escenariosContra(aplicar) {
  const PREPARAR = preparar(aplicar);
  const resultados = [];
  for (const [titulo, nombre, cuerpo, esperado] of ESCENARIOS) {
    if (titulo) continue;
    const r = correr(`${PREPARAR}${cuerpo}\nrollback;\n`);
    const ultima = r.ok ? r.salida.split("\n").pop() : null;
    resultados.push({ nombre, ok: r.ok && ultima === esperado, detalle: r.ok ? `dio «${ultima}», se esperaba «${esperado}»` : r.mensaje });
  }
  return resultados;
}

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('tienda_bolsa', 'tienda_separar', 'tienda_mis_pedidos', 'fn_cerrar_pedidos_web_sin_confirmar');");
    if (hay.salida !== "4") {
      console.error(`Faltan las funciones de la bolsa: aplica ${MIGRACIONES.join(", ")} o corre con APLICAR_ANTES=${MIGRACIONES.join(",")}`);
      process.exit(2);
    }
  }
  const prep = correr(`${preparar(APLICAR_ANTES)}select coalesce(nullif(:'v', ''), 'sin prenda') || '|' || coalesce(nullif(:'v2', ''), 'sin prenda');\nrollback;\n`);
  if (!prep.ok || prep.salida.includes("sin prenda")) {
    console.error(`No se pudo armar el piso de partida (¿dos prendas de dos modelos que se vendan en Trujillo y Lima?):\n${prep.mensaje ?? prep.salida}`);
    process.exit(2);
  }

  let fallos = 0;
  let total = 0;
  const resultados = escenariosContra(APLICAR_ANTES);
  let i = 0;
  for (const [titulo] of ESCENARIOS) {
    if (titulo) {
      console.log(titulo);
      continue;
    }
    const r = resultados[i++];
    total++;
    console.log(`${r.ok ? "✓" : "✗"} ${r.nombre}`);
    if (!r.ok) {
      fallos++;
      console.log(`    ${String(r.detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
    }
  }

  const textos = MIGRACIONES.map((f) => readFileSync(f, "utf8"));
  total++;
  const dosVeces = correr(`begin;\n${textos.join("\n")}\n${textos.join("\n")}\nselect count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('tienda_bolsa', 'tienda_separar', 'tienda_mis_pedidos', 'tienda_pedido', 'fn_cerrar_pedidos_web_sin_confirmar', 'fn_bolsa_web_precios', 'fn_bolsa_web_prenda');\nrollback;\n`);
  const okDos = dosVeces.ok && dosVeces.salida.split("\n").pop() === "7";
  console.log(`${okDos ? "✓" : "✗"} las tres migraciones se pueden pegar dos veces seguidas (sin duplicar ninguna función)`);
  if (!okDos) {
    fallos++;
    console.log(`    ${dosVeces.ok ? dosVeces.salida : dosVeces.mensaje}`);
  }

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);

  if (!CON_MUTANTES) return;
  console.log("\n— Mutantes (cada uno tiene que poner rojo algún escenario) —");
  let vivos = 0;
  for (const [nombre, archivo, de, a] of MUTANTES) {
    if (!textos[archivo].includes(de)) {
      console.log(`✗ ${nombre}: el texto que muta ya no está en ${MIGRACIONES[archivo]} (actualiza el mutante)`);
      vivos++;
      continue;
    }
    const mutadas = textos.map((t, k) => (k === archivo ? t.replace(de, a) : t)).join("\n");
    const muertos = escenariosContra(`${APLICAR_ANTES}\n${mutadas}`).filter((r) => !r.ok);
    if (muertos.length === 0) vivos++;
    console.log(`${muertos.length > 0 ? "✓" : "✗"} ${nombre}${muertos.length > 0 ? ` — lo frena «${muertos[0].nombre}»` : " — SOBREVIVE: ningún escenario lo vio"}`);
  }
  console.log(`\n${MUTANTES.length - vivos}/${MUTANTES.length} mutantes frenados.`);
  if (vivos > 0) process.exit(1);
}

main();
