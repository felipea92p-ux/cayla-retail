#!/usr/bin/env node
/**
 * Prueba de `20261127152000_compra_sin_marca_pasa_al_libro.sql`: una compra de «Mis compras» con prendas SIN MARCA pasa al libro.
 *
 * LO QUE VIGILA. Que la marca opcional de «Algo nuevo» (ADR-0646) llegue hasta el comprobante: la compra rápida con una línea sin marca,
 * recibida en la tienda, pasa sola al libro con esa línea sin marca. Que la línea sin prenda siga necesitando su categoría. Y que un
 * papel que se atascó con el candado viejo (`pasa_sola_error` = «violates check constraint …») se destraba con `fn_papel_pasa_solo`
 * corrido sin sesión, como desde el SQL Editor: es la receta del PR para los papeles atascados en producción.
 *
 * CÓMO. Cada caso corre en su transacción con ROLLBACK (nada queda escrito). Primero REBOBINA el candado al de antes (el que producción
 * tiene hasta que se pegue la migración), así la prueba mide lo mismo en una base con o sin la migración aplicada; después carga la
 * migración dos veces (es re-pegable). El recorrido es el de producción: la compradora anota la compra en Gamarra, la tienda abre una
 * recepción «sin aviso», cuenta, cierra y la une con su compra (`unir_recepcion_con_compra` → `fn_papel_pasa_solo` →
 * `completar_papel_compra`). Las personas son las de la semilla (`compras_pagadas_hacia.mjs`).
 *
 * USO
 *   pnpm pruebas:compra-sin-marca-pasa-al-libro                                    → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compra_sin_marca_pasa_al_libro.mjs --contenedor <otro>    → otro stack
 *   node scripts/pruebas/compra_sin_marca_pasa_al_libro.mjs --sin-migracion        → con el candado viejo: S1, S2 y S4 tienen que FALLAR
 *   node scripts/pruebas/compra_sin_marca_pasa_al_libro.mjs --ver                  → imprime lo obtenido de cada caso
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
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG || "supabase_db_cayla-retail");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const VER_TODO = process.argv.includes("--ver");
const MIGRACION = SIN_MIGRACION
  ? ""
  : readFileSync(join(RAIZ, "supabase/migrations/20261127152000_compra_sin_marca_pasa_al_libro.sql"), "utf8")
      .replace(/^set lock_timeout.*$/gm, "")
      .replace(/^reset lock_timeout;$/gm, "");

const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo: recibe y une
const SANDRA = "22222222-2222-4222-8222-000000000005"; // líder: compra en Gamarra

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
const como = (auth, clave = null) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n` +
  `select set_config('request.headers', '${JSON.stringify(clave ? { "x-responsable-omitido": clave } : {})}', true) \\g /dev/null\nset local role authenticated;\n`;
// Micaela elige en el combo «Responsable» a ella misma, en Trujillo.
const MICAELA_AQUI = `${como(MICAELA)}select set_config('request.headers', json_build_object('x-responsable', :'micaela_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null\n`;
// Como el SQL Editor de producción: el dueño de la base, sin sesión ni encabezados.
const SIN_SESION = `reset role;\nset local request.jwt.claim.sub = '';\nset local request.jwt.claims = '';\nselect set_config('request.headers', '', true) \\g /dev/null\n`;

const J = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const A = (...xs) => `jsonb_build_array(${xs.join(", ")})`;

// «OK» o el error con su pista, para las funciones que se llaman desde la pantalla.
const atrapa = (nombre, firma, llamada) => `
create function pg_temp.${nombre}(${firma}) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  return (${llamada})::jsonb;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('error', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
grant execute on function pg_temp.${nombre}(${firma.replace(/p_\w+ /g, "")}) to authenticated;`;

// El candado de antes, tal como está en producción hasta que se pegue la migración (20261012205000).
const CANDADO_VIEJO = `
alter table retail.compra_items drop constraint if exists compra_items_prenda_o_categoria;
alter table retail.compra_items drop constraint if exists compra_items_prenda_o_categoria_marca;
alter table retail.compra_items add constraint compra_items_prenda_o_categoria_marca
  check (producto_id is not null or (categoria_id is not null and marca_id is not null));`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
${CANDADO_VIEJO}
set local search_path = retail, public, extensions;
${atrapa("sinaviso", "p_u uuid, p_prov uuid, p_guia text, p_nota text, p_token uuid", "retail.abrir_envio_sin_aviso(p_u, p_prov, p_guia, p_nota, p_token)")}
${atrapa("guarda", "p_d uuid, p_item uuid, p_cont integer, p_sep jsonb, p_ver integer, p_extra integer, p_prov uuid, p_cat uuid, p_marca uuid", "retail.guardar_conteo_envio(p_d, p_item, p_cont, p_sep, p_ver, p_extra, p_prov, p_cat, p_marca)")}
${atrapa("cierra", "p_d uuid, p_version integer, p_lineas jsonb, p_nota text, p_token uuid", "retail.cerrar_conteo_envio(p_d, p_version, p_lineas, p_nota, p_token)")}
${atrapa("une", "p_d uuid, p_papel uuid, p_token uuid", "retail.unir_recepcion_con_compra(p_d, p_papel, p_token)")}

-- Como en producción: responsable obligatorio; Micaela marcó su entrada en Trujillo.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values (:'micaela_p', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
insert into retail.compra_rondas (persona_id, abierta_por)
select distinct c.persona_id, c.persona_id from retail.colaboradores c
 where not exists (select 1 from retail.compra_rondas r where r.persona_id = c.persona_id and r.cerrada_en is null);
insert into retail.proveedores (nombre) values ('Proveedor Sin Marca Prueba') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Sin Marca Prueba') returning id as marca \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
insert into retail.categorias (nombre, familia) values ('Pantalones Sin Marca', 'accesorios') returning id as cat \\gset
select id as t_s from retail.tallas where valor = 'S' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat', :'t_s');
select codigo as c1 from retail.colores where activo order by orden, codigo limit 1 \\gset
-- La prenda que la tienda cuenta: sin marca, como la compró la compradora.
insert into retail.productos (categoria_id, referencia, marca_id, proveedor_id) values (:'cat', 'Pantalón Sin Marca', null, :'prov') returning id as prod \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo) values (:'prod', :'t_s', :'c1', 59.90, 10) returning id as var \\gset
select set_config('t.tru', :'tru', true), set_config('t.prov', :'prov', true), set_config('t.cat', :'cat', true),
       set_config('t.marca', :'marca', true) \\g /dev/null
insert into retail.roles (nombre) values ('ZZ Sin marca recibe') returning id as rol_recibe \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol_recibe', 'recibir');
update retail.colaboradores set rol_id = :'rol_recibe' where persona_id = :'micaela_p';
`;

// La compradora anota en Gamarra una nota de venta de S/ 80: 5 pantalones con la marca de prueba y 3 SIN MARCA (como dos de los
// papeles atascados: una línea con marca y otra sin). Con \`todas_sin_marca\`, las dos líneas van sin marca.
const SIN_MARCA = "null::uuid";
const COMPRA = (token, { todasSinMarca = false } = {}) => `
${como(SANDRA, "compra_rapida")}
select retail.registrar_compra_rapida('${token}', current_setting('t.prov')::uuid, 'nota_venta', 80, 'papeles/prueba-sin-marca.jpg', jsonb_build_array(
  jsonb_build_object('descripcion', 'Pantalón con marca', 'categoria_id', current_setting('t.cat')::uuid,
                     'marca_id', ${todasSinMarca ? SIN_MARCA : "current_setting('t.marca')::uuid"}, 'cantidad', 5, 'costo', 10, 'destino_id', current_setting('t.tru')::uuid),
  jsonb_build_object('descripcion', 'Pantalón sin marca', 'categoria_id', current_setting('t.cat')::uuid,
                     'marca_id', ${SIN_MARCA}, 'cantidad', 3, 'costo', 10, 'destino_id', current_setting('t.tru')::uuid))) \\g /dev/null
reset role;
select '${token}'::uuid as papel \\gset
`;
// La tienda abre una recepción «sin aviso», cuenta las 8 prendas sin marca, cierra y la une con la compra (ahí intenta pasar al libro).
const LLEGA_Y_SE_UNE = `
${MICAELA_AQUI}
select pg_temp.sinaviso(:'tru', :'prov', 'G-90', null, gen_random_uuid()) as sa \\gset
select (:'sa'::jsonb ->> 'despacho_id') as rec \\gset
select pg_temp.guarda(:'rec', null, 8, ${J({ prendas: A(J({ producto_id: ":'prod'", cantidad: 8, variantes: A(J({ variante_id: ":'var'", cantidad: 8, danadas: 0, danada_solucion: "null::text" })) })), nuevas: A() })},
  null::int, null::int, null::uuid, :'cat', null::uuid) \\g /dev/null
reset role;
select version as k_rec from retail.despacho_conteos where despacho_id = :'rec' and extra_posicion = 1 \\gset
select version as v_rec from retail.despachos where id = :'rec' \\gset
${MICAELA_AQUI}
select pg_temp.cierra(:'rec', :v_rec, ${A(J({ extra_posicion: "1", version: ":k_rec", costo_unitario: "null::numeric", confirma_costo: "false", faltante_causa: "null::text", sobrante_causa: "null::text", nota: "null::text" }))}, null::text, null::uuid) as cierre \\gset
select pg_temp.une(:'rec', :'papel', null) as u \\gset
reset role;
`;
// unido:paso_al_libro:error
const RESP = `concat_ws(':', :'u'::jsonb ->> 'unido', :'u'::jsonb ->> 'paso_al_libro', coalesce(:'u'::jsonb ->> 'hint', :'u'::jsonb ->> 'error', ''))`;
// estado del papel : ¿el error es el del candado? : líneas del comprobante (cantidad x marca, «-» = sin marca) : lo del papel = lo del comprobante
const PAPEL = `concat_ws(':',
  (select estado from retail.compra_papeles where id = :'papel'),
  coalesce((select (pasa_sola_error like '%compra_items_prenda_o_categoria_marca%')::text from retail.compra_papeles where id = :'papel'), 'sin_error'),
  coalesce((select string_agg(ci.cantidad || 'x' || case when ci.marca_id is null then '-' else 'marca' end, ',' order by ci.cantidad desc)
              from retail.compras c join retail.compra_items ci on ci.compra_id = c.id where c.token_cliente = :'papel'), 'sin_comprobante'),
  coalesce((select (c.total = p.monto)::text from retail.compras c join retail.compra_papeles p on p.id = c.token_cliente where c.token_cliente = :'papel'), '-'))`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nset constraints all immediate;\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL|HINT|CONTEXT|LINE/.test(l)).slice(0, 4).join(" ")}`;
  }
  if (VER_TODO) console.log(`▶ ${nombre}\n    ${obtenido}`);
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

caso(
  "S1 una compra con una línea sin marca llega a la tienda y pasa sola al libro, con esa línea sin marca",
  `${MIGRACION}${MIGRACION}
   ${COMPRA("aaaaaaaa-0646-4000-8000-0000000001a1")}
   ${LLEGA_Y_SE_UNE}
   select concat_ws(' / ', ${RESP}, ${PAPEL});`,
  "true:true: / completado:sin_error:5xmarca,3x-:true",
);

caso(
  "S2 con todas sus líneas sin marca, también",
  `${MIGRACION}${MIGRACION}
   ${COMPRA("aaaaaaaa-0646-4000-8000-0000000001a2", { todasSinMarca: true })}
   ${LLEGA_Y_SE_UNE}
   select concat_ws(' / ', ${RESP}, ${PAPEL});`,
  "true:true: / completado:sin_error:5x-,3x-:true",
);

caso(
  "S3 una línea sin prenda sigue necesitando su categoría (sin prenda, sin categoría y sin marca: rechazada)",
  `${MIGRACION}${MIGRACION}
   ${COMPRA("aaaaaaaa-0646-4000-8000-0000000001a3")}
   ${LLEGA_Y_SE_UNE}
   create function pg_temp.sin_categoria(p uuid) returns text language plpgsql as $f$
   begin
     update retail.compra_items ci set categoria_id = null, marca_id = null
       from retail.compras c where c.id = ci.compra_id and c.token_cliente = p and ci.marca_id is null;
     return 'ACEPTADA';
   exception when check_violation then
     return 'RECHAZADA';
   end $f$;
   select pg_temp.sin_categoria(:'papel');`,
  "RECHAZADA",
);

caso(
  "S4 el papel que se atascó con el candado viejo: tras la migración, fn_papel_pasa_solo sin sesión lo pasa al libro y borra el error",
  `${COMPRA("aaaaaaaa-0646-4000-8000-0000000001a4")}
   ${LLEGA_Y_SE_UNE}
   select ${RESP} || ' / ' || ${PAPEL} as atascado \\gset
   ${MIGRACION}${MIGRACION}
   ${SIN_SESION}
   select retail.fn_papel_pasa_solo(:'papel') as reintento \\gset
   select retail.fn_papel_pasa_solo(:'papel') as otra_vez \\gset
   select concat_ws(' / ', :'atascado', :'reintento', :'otra_vez', ${PAPEL});`,
  "true:false: / por_completar:true:sin_comprobante:- / t / f / completado:sin_error:5xmarca,3x-:true",
);

console.log(`\n${casos - fallas}/${casos} casos en verde.`);
process.exit(fallas ? 1 : 0);
