#!/usr/bin/env node
/**
 * Una prenda de CLAURE solo se ve en la tienda online donde CLAURE opera (ADR-0463, ADR-0465) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261021000000_tienda_empresa_solo_en_sus_sedes.sql`:
 *   A. El catálogo (`tienda_catalogo`): con Lima (donde CLAURE opera) salen las prendas de CAYLA y de CLAURE; con Trujillo, con una
 *      tienda que no es de la web y sin tienda, solo las de CAYLA.
 *   B. La ficha (`tienda_ficha`): la de una prenda de CLAURE responde `null` con otra tienda y sin tienda (como una sin publicar) y se
 *      abre con Lima; la de una prenda de CAYLA se abre en todas.
 *   C. El probador (`tienda_probador`): lo mismo que el catálogo.
 *   D. La regla única: una sede nueva que nadie sumó a `empresa_sedes` es solo-CAYLA (`fn_empresas_de_sede`), y la prueba lo comprueba
 *      sumándole CLAURE a Trujillo: la prenda aparece ahí sin tocar ninguna función de la tienda.
 *   E. La puerta: `tienda_web` no ejecuta el ayudante `fn_tienda_empresa_se_ve`.
 *   F. Las migraciones se pueden pegar dos veces.
 *   H. «Separar», la bolsa y «separadas por otros» (`20261021002000_tienda_separar_y_bolsa_empresa_por_tienda.sql`): la bolsa de
 *      Trujillo dice que una prenda de CLAURE «no se vende» ahí (y que sí en Lima); «Separar» para recoger en Trujillo la rechaza con
 *      `tienda_separar_no_se_vende` y, para recoger en Lima, no por la empresa; la ficha no cuenta separadas de una prenda que esa
 *      tienda no muestra.
 *   I. Los looks (`20261021003000_vitrina_looks_con_claure_solo_en_lima.sql`): el editor de la Vitrina ofrece las prendas de CLAURE y deja
 *      publicar un look que lleve una; ese look sale en Lima (lista y enlace) y NO en Trujillo; un look solo de CAYLA sale en las dos.
 *      Y cada prenda del look dice su empresa (`20261021014000_tienda_looks_trae_la_empresa_de_cada_prenda.sql`) con la misma regla del
 *      catálogo: en Lima sí, en Trujillo no.
 *   J. La bolsa (`20261021011000_tienda_bolsa_trae_la_empresa_de_cada_prenda.sql`): cada línea dice la empresa de su prenda con la misma regla
 *      del catálogo: en Lima sí; en Trujillo no.
 *   K. El pedido (`20261021013000_tienda_pedidos_traen_la_empresa_de_cada_prenda.sql`): cada prenda del pedido separado dice su empresa si la
 *      tienda del pedido tiene dos o más empresas (Lima); un pedido a Trujillo no dice empresa. Lo leen «Separado» y «Mis pedidos».
 *   G. El catálogo dice la empresa de cada prenda (`20261021001000_tienda_catalogo_trae_la_empresa.sql`): `empresa.clave` y
 *      `empresa.nombre` de CAYLA y de CLAURE, que es lo que dibuja la insignia de la tarjeta, SOLO con una tienda donde operan dos o
 *      más empresas (Lima): con Trujillo, sin tienda o con una inventada, ninguna prenda trae `empresa` y no hay insignia.
 *
 * CÓMO. Cada escenario corre en su transacción y termina en ROLLBACK: nunca se commitea nada en el Postgres local que comparten los
 * worktrees. Cada uno arma su punto de partida: Emma (CAYLA) y Carla (CLAURE) publicadas, con su foto, su recorte y su largo; Trujillo y
 * Lima en la web.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivos.sql separados por coma>` mete las migraciones dentro de cada transacción (que se
 * revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * USO
 *   pnpm pruebas:tienda-empresas                       → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-empresas -- --contenedor supabase_db_<mi-pila>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACIONES = [
  "supabase/migrations/20261021000000_tienda_empresa_solo_en_sus_sedes.sql",
  "supabase/migrations/20261021001000_tienda_catalogo_trae_la_empresa.sql",
  "supabase/migrations/20261021002000_tienda_separar_y_bolsa_empresa_por_tienda.sql",
  "supabase/migrations/20261021003000_vitrina_looks_con_claure_solo_en_lima.sql",
  "supabase/migrations/20261021014000_tienda_looks_trae_la_empresa_de_cada_prenda.sql",
  "supabase/migrations/20261021011000_tienda_bolsa_trae_la_empresa_de_cada_prenda.sql",
  "supabase/migrations/20261021013000_tienda_pedidos_traen_la_empresa_de_cada_prenda.sql",
];
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",")
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n")
  : "";
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

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}

const BASE = "http://127.0.0.1:54421/storage/v1/object/public/retail-productos-fotos/";
const FOTO_E = "fotos/eeeeeeee-0000-4000-8000-000000000001.jpg"; // de Emma (CAYLA)
const FOTO_C = "fotos/eeeeeeee-0000-4000-8000-000000000002.jpg"; // de Carla (CLAURE)
const recorte = (foto) => foto.replace(/^fotos\//, "recortes/").replace(/\.jpg$/, "-1.png");

// ---- El punto de partida: Emma es de CAYLA; Carla, de CLAURE; las dos publicadas, con foto, recorte y largo; Trujillo y Lima en la web ----
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.vitrina_productos set publicado = false where publicado;
update retail.ubicacion_datos_web set mostrar = false where mostrar;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as carla from retail.productos where referencia = 'Pantalón Carla' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as claure from retail.empresas where clave = 'claure' \\gset
select id as cayla from retail.empresas where clave = 'cayla' \\gset
update retail.productos set empresa_id = :'cayla' where id = :'emma';
update retail.productos set empresa_id = :'claure' where id = :'carla';
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
select retail.vitrina_mostrar(array[:'emma', :'carla']::uuid[], true) \\gset
update retail.vitrina_productos set largo_cm = 70 where producto_id in (:'emma', :'carla');
delete from retail.producto_fotos where producto_id in (:'emma', :'carla');
insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo) values
  (:'emma', '${BASE}${FOTO_E}', 0, true, null),
  (:'carla', '${BASE}${FOTO_C}', 0, true, null);
insert into retail.foto_recortes (foto, recorte, proporcion, estado, motivo) values
  ('${FOTO_E}', '${recorte(FOTO_E)}', 0.8, 'listo', null),
  ('${FOTO_C}', '${recorte(FOTO_C)}', 0.8, 'listo', null)
on conflict (foto) do update set estado = 'listo', recorte = excluded.recorte;
`;

const CIERRE = "\nrollback;\n";
const escenario = (cuerpo) => correr(PREPARAR + cuerpo + CIERRE);

// «Esta prenda sale en esta lista»: sí/no de la lista de prendas de una función.
const enCatalogo = (prenda, sede) =>
  `select exists (select 1 from jsonb_array_elements(retail.tienda_catalogo(${sede}) -> 'prendas') x where (x ->> 'id')::uuid = :'${prenda}');`;
const enProbador = (prenda, sede) =>
  `select exists (select 1 from jsonb_array_elements(retail.tienda_probador(${sede}) -> 'prendas') x where (x ->> 'id')::uuid = :'${prenda}');`;
const ficha = (prenda, sede) => `select retail.tienda_ficha(:'${prenda}', ${sede}) is not null;`;

const LIMA = ":'lim'";
const TRU = ":'tru'";
const SIN_SEDE = "null";
const SEDE_INVENTADA = "'00000000-0000-4000-8000-0000000000aa'::uuid";

console.log("A. El catálogo");
esperarValor("Lima: sale la prenda de CLAURE", escenario(enCatalogo("carla", LIMA)), "t");
esperarValor("Lima: sale la prenda de CAYLA", escenario(enCatalogo("emma", LIMA)), "t");
esperarValor("Trujillo: NO sale la prenda de CLAURE", escenario(enCatalogo("carla", TRU)), "f");
esperarValor("Trujillo: sale la prenda de CAYLA", escenario(enCatalogo("emma", TRU)), "t");
esperarValor("sin tienda: NO sale la prenda de CLAURE", escenario(enCatalogo("carla", SIN_SEDE)), "f");
esperarValor("una tienda inventada: NO sale la prenda de CLAURE", escenario(enCatalogo("carla", SEDE_INVENTADA)), "f");

console.log("B. La ficha");
esperarValor("Lima: se abre la ficha de CLAURE", escenario(ficha("carla", LIMA)), "t");
esperarValor("Trujillo: la ficha de CLAURE no existe", escenario(ficha("carla", TRU)), "f");
esperarValor("sin tienda: la ficha de CLAURE no existe", escenario(ficha("carla", SIN_SEDE)), "f");
esperarValor("Trujillo: se abre la ficha de CAYLA", escenario(ficha("emma", TRU)), "t");
esperarValor("sin tienda: se abre la ficha de CAYLA", escenario(ficha("emma", SIN_SEDE)), "t");

console.log("C. El probador");
esperarValor("Lima: el probador ofrece la prenda de CLAURE", escenario(enProbador("carla", LIMA)), "t");
esperarValor("Trujillo: el probador NO ofrece la prenda de CLAURE", escenario(enProbador("carla", TRU)), "f");
esperarValor("Trujillo: el probador ofrece la prenda de CAYLA", escenario(enProbador("emma", TRU)), "t");

console.log("D. Una sola regla: la lee `empresa_sedes`");
esperarValor(
  "si CLAURE abre en Trujillo (una fila en empresa_sedes), su prenda aparece ahí sin tocar la tienda",
  escenario(`insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'claure', :'tru');\n${enCatalogo("carla", TRU)}`),
  "t",
);
esperarValor(
  "y su ficha se abre en Trujillo",
  escenario(`insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'claure', :'tru');\n${ficha("carla", TRU)}`),
  "t",
);

console.log("E. La puerta");
esperarValor(
  "tienda_web no ejecuta el ayudante",
  correr(`select has_function_privilege('tienda_web', 'retail.fn_tienda_empresa_se_ve(uuid, uuid)', 'execute');`),
  "f",
);

console.log("F. Las migraciones se pueden pegar dos veces");
{
  const sql = MIGRACIONES.map((f) => readFileSync(f, "utf8")).join("\n");
  const dos = correr(`begin;\n${sql}\n${sql}\nrollback;`);
  esperar("pegadas dos veces no fallan", dos.ok, dos.mensaje);
}

console.log("G. El catálogo dice la empresa de cada prenda");
const empresaDe = (prenda, sede) =>
  `select coalesce((x -> 'empresa' ->> 'clave') || '/' || (x -> 'empresa' ->> 'nombre'), 'sin') from jsonb_array_elements(retail.tienda_catalogo(${sede}) -> 'prendas') x where (x ->> 'id')::uuid = :'${prenda}';`;
esperarValor("Lima: la prenda de CAYLA trae cayla/CAYLA", escenario(empresaDe("emma", LIMA)), "cayla/CAYLA");
esperarValor("Lima: la prenda de CLAURE trae claure/CLAURE", escenario(empresaDe("carla", LIMA)), "claure/CLAURE");
esperarValor("Trujillo: la prenda de CAYLA NO trae empresa (no hay insignia)", escenario(empresaDe("emma", TRU)), "sin");
esperarValor("sin tienda: la prenda de CAYLA NO trae empresa", escenario(empresaDe("emma", SIN_SEDE)), "sin");
esperarValor(
  "si CLAURE abre en Trujillo (dos empresas), las prendas de Trujillo traen su empresa",
  escenario(`insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'claure', :'tru');\n${empresaDe("emma", TRU)}`),
  "cayla/CAYLA",
);

console.log("H. «Separar», la bolsa y «separadas por otros»");
// Una cuenta web de prueba (su usuario del proyecto de clientes es un id cualquiera) y una variante de cada prenda.
const CUENTA = `
insert into retail.clientas (nombre, telefono_whatsapp, documento_tipo, documento_numero, club_desde, codigo_club)
values ('ZZ Cliente empresas', '999888779', 'dni', '09997009', now(), retail.fn_club_codigo_nuevo()) returning id as cli \\gset
select gen_random_uuid() as usr \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados) values (:'usr', :'cli', 'zz-e@prueba-tienda.test', 'prueba');
select id as v_carla from retail.variantes where producto_id = :'carla' and activo order by id limit 1 \\gset
select id as v_emma from retail.variantes where producto_id = :'emma' and activo order by id limit 1 \\gset
create function pg_temp.hint(p_sql text) returns text language plpgsql as $f$
declare v_hint text;
begin
  begin
    execute p_sql;
    raise exception 'PROBAR_OK';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    if sqlerrm = 'PROBAR_OK' then return 'ok'; end if;
    return coalesce(v_hint, 'sin-hint:' || sqlerrm);
  end;
end $f$;
`;
const linea = (v) => `jsonb_build_array(jsonb_build_object('variante_id', :'${v}'::uuid, 'cantidad', 1))`;
const seVende = (v, sede) =>
  `select retail.tienda_bolsa(${linea(v)}, ${sede}) -> 'lineas' -> 0 -> 'en_sedes' -> (${sede})::text ->> 'se_vende';`;
const separarHint = (v, sede) =>
  `select pg_temp.hint(format('select retail.tienda_separar(%L, %L, %L, %L)', :'usr', ${sede}, jsonb_build_array(jsonb_build_object('variante_id', :'${v}'::uuid, 'cantidad', 1, 'precio', 1)), gen_random_uuid()));`;

esperarValor("la bolsa de Lima dice que CLAURE se vende en Lima", escenario(CUENTA + seVende("v_carla", LIMA)), "true");
esperarValor("la bolsa de Trujillo dice que CLAURE NO se vende en Trujillo", escenario(CUENTA + seVende("v_carla", TRU)), "false");
esperarValor("la bolsa de Trujillo dice que CAYLA sí se vende en Trujillo", escenario(CUENTA + seVende("v_emma", TRU)), "true");
esperarValor("«Separar» para recoger en Trujillo rechaza CLAURE: no se vende en esa tienda", escenario(CUENTA + separarHint("v_carla", TRU)), "tienda_separar_no_se_vende");
esperar(
  "«Separar» para recoger en Lima no rechaza CLAURE por la empresa",
  (() => {
    const r = escenario(CUENTA + separarHint("v_carla", LIMA));
    return r.ok && r.salida !== "tienda_separar_no_se_vende" && r.salida !== "tienda_separar_no_publicada";
  })(),
  "rechazó por la empresa en Lima",
);
esperarValor(
  "la ficha no cuenta separadas de CLAURE en Trujillo (no la muestra)",
  escenario(CUENTA + `select retail.tienda_separadas_por_otros(:'usr', :'carla', ${TRU}) is null;`),
  "t",
);
esperarValor(
  "y en Lima sí responde (la muestra)",
  escenario(CUENTA + `select retail.tienda_separadas_por_otros(:'usr', :'carla', ${LIMA}) is not null;`),
  "t",
);

console.log("K. El pedido dice la empresa de cada prenda");
// El piso de partida con «hay»: desde 20261021010000 (ADR-0468) un look sale en una tienda solo si cada prenda, en su color, tiene algo LIBRE ahí.
// Un colchón en el piso de la tienda, por el libro (una «entrada»), como las demás pruebas de la tienda.
const COLCHON = `
select id as lim_piso from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
select id as tru_piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
insert into retail.configuracion_tienda_web (id) values (true) on conflict (id) do nothing;
update retail.configuracion_tienda_web set horas_para_confirmar = 24, horas_aviso_sin_pagar = 48, dias_aviso_sin_recoger = 7 where id;
create function pg_temp.dejar(p_v uuid, p_u uuid, p_sub uuid, p_n integer) returns void language plpgsql as $f$
declare v_mov uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, nota)
    values (p_v, p_u, p_sub, 'entrada', p_n, 'prueba', 'prueba tienda empresas: colchón') returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end $f$;
`;
const DEJAR = `${COLCHON}
select pg_temp.dejar(:'v_emma', :'lim', :'lim_piso', 5), pg_temp.dejar(:'v_carla', :'lim', :'lim_piso', 5), pg_temp.dejar(:'v_emma', :'tru', :'tru_piso', 5);
`;
// Separa en una tienda las prendas dadas (al precio que dice la bolsa) y devuelve la empresa de cada línea del pedido, por nombre.
const pedidoEn = (sede, ...variantes) => `
select retail.tienda_separar(:'usr', ${sede},
  (select jsonb_agg(jsonb_build_object('variante_id', x ->> 'variante_id', 'cantidad', (x ->> 'cantidad')::int, 'precio', (x ->> 'precio')::numeric))
     from jsonb_array_elements(retail.tienda_bolsa(jsonb_build_array(${variantes.map((v) => `jsonb_build_object('variante_id', :'${v}'::uuid, 'cantidad', 1)`).join(", ")}), ${sede}) -> 'lineas') x),
  gen_random_uuid()) ->> 'codigo' as codigo \\gset
select string_agg(coalesce(l -> 'empresa' ->> 'nombre', 'sin'), ',' order by l ->> 'nombre')
  from jsonb_array_elements(retail.tienda_pedido(:'usr', :'codigo') -> 'pedido' -> 'lineas') l;
`;
// Las líneas de `\\gset` imprimen separadores vacíos: el veredicto es la ÚLTIMA línea de la salida.
const ultima = (r) => (r.ok ? { ...r, salida: r.salida.split("\n").pop() } : r);
esperarValor("Lima: el pedido dice CAYLA para Emma y CLAURE para Carla", ultima(escenario(CUENTA + DEJAR + pedidoEn(LIMA, "v_emma", "v_carla"))), "CAYLA,CLAURE");
esperarValor("Trujillo: el pedido no dice empresa", ultima(escenario(CUENTA + DEJAR + pedidoEn(TRU, "v_emma"))), "sin");

console.log("J. La bolsa dice la empresa de cada prenda");
const empresasDeLaBolsa = (sede) =>
  `select string_agg(coalesce(l -> 'empresa' ->> 'nombre', 'sin'), ',' order by (l ->> 'cantidad')::int, l ->> 'nombre') from jsonb_array_elements(retail.tienda_bolsa(jsonb_build_array(jsonb_build_object('variante_id', :'v_emma'::uuid, 'cantidad', 1), jsonb_build_object('variante_id', :'v_carla'::uuid, 'cantidad', 2)), ${sede}) -> 'lineas') l;`;
const VARIANTES_BOLSA = `
select id as v_carla from retail.variantes where producto_id = :'carla' and activo order by id limit 1 \\gset
select id as v_emma from retail.variantes where producto_id = :'emma' and activo order by id limit 1 \\gset
`;
esperarValor("Lima: la bolsa dice CAYLA para Emma y CLAURE para Carla", escenario(VARIANTES_BOLSA + empresasDeLaBolsa(LIMA)), "CAYLA,CLAURE");
esperarValor("Trujillo: la bolsa no dice empresa", escenario(VARIANTES_BOLSA + empresasDeLaBolsa(TRU)), "sin,sin");

console.log("I. Los looks");
// Un look solo de CAYLA (Emma + Falda) y uno con CLAURE (Emma + Carla). Las piezas llevan su color, como en el editor.
const LOOKS = `${COLCHON}
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select pg_temp.dejar(v.id, :'lim', :'lim_piso', 5) from retail.variantes v where v.producto_id in (:'emma', :'falda', :'carla') and v.activo;
select pg_temp.dejar(v.id, :'tru', :'tru_piso', 5) from retail.variantes v where v.producto_id in (:'emma', :'falda') and v.activo;
select retail.vitrina_mostrar(array[:'falda']::uuid[], true) \\gset
select retail.vitrina_guardar_look(null, 'ZZ Look solo CAYLA', null, true,
         jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'color', 'NEG'), jsonb_build_object('producto_id', :'falda', 'color', 'NEG')),
         null, null) ->> 'id' as look_cayla \\gset
select retail.vitrina_guardar_look(null, 'ZZ Look con CLAURE', null, true,
         jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'color', 'NEG'), jsonb_build_object('producto_id', :'carla', 'color', 'NEG')),
         null, null) ->> 'id' as look_claure \\gset
`;
const listaTrae = (nombre, sede) => `select retail.tienda_looks(${sede})::text like '%${nombre}%';`;
const lookAbre = (id, sede) => `select (retail.tienda_look(:'${id}'::uuid, ${sede}) -> 'look') is not null and (retail.tienda_look(:'${id}'::uuid, ${sede}) -> 'look') <> 'null'::jsonb;`;
esperarValor("el editor deja publicar un look con una prenda de CLAURE (y dice que se ve)", escenario(LOOKS + `select (retail.fn_vitrina_looks() -> 'looks') @> jsonb_build_array(jsonb_build_object('id', :'look_claure', 'se_ve', true));`), "t");
esperarValor("el editor ofrece la prenda de CLAURE para elegirla", escenario(`select jsonb_path_exists(retail.fn_vitrina_looks() -> 'modelos', ('$[*] ? (@.id == "' || :'carla' || '")')::jsonpath);`), "t");
esperarValor("Lima: la lista de looks trae el look con CLAURE", escenario(LOOKS + listaTrae("ZZ Look con CLAURE", LIMA)), "t");
esperarValor("Trujillo: la lista de looks NO trae el look con CLAURE", escenario(LOOKS + listaTrae("ZZ Look con CLAURE", TRU)), "f");
esperarValor("Lima: el look con CLAURE se abre por su enlace", escenario(LOOKS + lookAbre("look_claure", LIMA)), "t");
esperarValor("Trujillo: el look con CLAURE no se abre por su enlace", escenario(LOOKS + lookAbre("look_claure", TRU)), "f");
const empresasDelLook = (id, sede) =>
  `select string_agg(coalesce(p -> 'prenda' -> 'empresa' ->> 'nombre', 'sin'), ',' order by (p ->> 'posicion')::int) from jsonb_array_elements(retail.tienda_look(:'${id}'::uuid, ${sede}) -> 'look' -> 'piezas') p;`;
esperarValor("Lima: cada prenda del look con CLAURE dice su empresa (Emma, CAYLA; Carla, CLAURE)", escenario(LOOKS + empresasDelLook("look_claure", LIMA)), "CAYLA,CLAURE");
esperarValor("Lima: el look solo de CAYLA dice CAYLA en cada prenda", escenario(LOOKS + empresasDelLook("look_cayla", LIMA)), "CAYLA,CAYLA");
esperarValor("Trujillo: las prendas del look de CAYLA no dicen empresa (no hay insignia)", escenario(LOOKS + empresasDelLook("look_cayla", TRU)), "sin,sin");
esperarValor("Trujillo: el look solo de CAYLA sigue saliendo", escenario(LOOKS + listaTrae("ZZ Look solo CAYLA", TRU)), "t");
esperarValor("Lima: el look solo de CAYLA sigue saliendo", escenario(LOOKS + listaTrae("ZZ Look solo CAYLA", LIMA)), "t");

console.log(fallos === 0 ? `\nTodo bien: ${total} comprobaciones.` : `\n${fallos} de ${total} comprobaciones fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
