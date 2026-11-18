#!/usr/bin/env node
/**
 * Pruebas de «quien solo tiene Recibir mira lo que llega a SU sede» (ADR-0387, actualización 2026-11-03; Felipe) — migración
 * `20261103172000_recibir_lee_su_sede.sql`.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga DOS veces dentro de cada caso, así se prueba que se puede
 * pegar dos veces). Felipe (líder) hace las órdenes y los envíos: uno a Trujillo y otro a Lima, cada orden con su papel y su foto. Micaela es
 * de Tienda Trujillo y no es líder; su rol de prueba cambia en cada caso.
 *   R  SOLO RECIBIR: lee lo de su sede y lo de la otra responde como si no existiera (detalle, conteos, observaciones y las tres listas).
 *   C  COMPRAS: con Órdenes de compra, o con el dinero de Compras, ve todas; el líder también.
 *   M  EL MÓDULO: sin Recibir ni Órdenes de compra, 42501 como siempre, también con el dinero de Compras.
 *   F  LA FOTO: la del papel de su sede sí; la de otra no; la de un papel sin envío no; la que se está subiendo sí; otra carpeta no.
 *   S  LA FORMA: las piezas internas son de la base.
 *
 * USO
 *   node scripts/pruebas/recibir_lee_su_sede.mjs                              → contra el stack local compartido
 *   node scripts/pruebas/recibir_lee_su_sede.mjs --contenedor supabase_db_x   → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/recibir_lee_su_sede.mjs --sin-migracion              → sin cargar la migración: contra una base sin el cambio,
 *                                                                               la prueba tiene que FALLAR
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
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const MIGRACION = SIN_MIGRACION
  ? ""
  : readFileSync(join(RAIZ, "supabase", "migrations", "20261103172000_recibir_lee_su_sede.sql"), "utf8")
      .replace(/^set lock_timeout.*$/m, "")
      .replace(/^reset lock_timeout;$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth) =>
  `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;

// Una orden directa a una sede, con su papel y su foto. El papel y la orden de :sin_envio no salen en ningún envío.
const ORDEN = (nombre, sede) => `
insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, fecha, foto_ruta, huella, registrado_por, pagado)
  values (gen_random_uuid(), :'felipe_p', :'prov', 'boleta', 200, retail.fn_hoy_lima(), 'papeles/${nombre}.jpg', md5('lee-su-sede-${nombre}'), :'felipe_p', 0)
  returning id as papel_${nombre} \\gset
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, fecha_entrega_estimada, creada_por, papel_id)
  values (:'prov', :'${sede}', retail.fn_hoy_lima() + 7, :'felipe_p', :'papel_${nombre}') returning id as o_${nombre} \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario)
  values (:'o_${nombre}', 1, :'cat', :'marca', 'Chompa ${nombre}', 10, 30) returning id as l_${nombre} \\gset
`;
const ENVIA = (nombre, sede) => `
${como(FELIPE)}
select (retail.crear_envio(:'${sede}', jsonb_build_array(jsonb_build_object('orden_compra_item_id', :'l_${nombre}', 'cantidad', 4)), 'T001-${nombre}', null, null) ->> 'despacho_id') as d_${nombre} \\gset
reset role;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
select set_config('request.jwt.claim.sub', '${FELIPE}', true) \\g /dev/null
select set_config('request.jwt.claims', '{"sub":"${FELIPE}","role":"authenticated"}', true) \\g /dev/null
-- Devuelve la respuesta o «sqlstate|hint»: la lectura sin módulo se tiene que poder mirar sin tumbar el caso.
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_r text; v_estado text; v_hint text;
begin
  execute p_sql into v_r;
  return coalesce(v_r, 'null');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint;
  return v_estado || '|' || v_hint;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
insert into retail.proveedores (nombre) values ('Proveedor Lee Su Sede') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Lee Su Sede') returning id as marca \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
insert into retail.categorias (nombre, familia) values ('Chompas Lee Su Sede', 'accesorios') returning id as cat \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
-- Anotar un papel exige la ronda de compras abierta de quien compra (en una base armada desde cero, CI, nadie la tiene).
insert into retail.compra_rondas (persona_id, abierta_por)
  select :'felipe_p', :'felipe_p'
   where not exists (select 1 from retail.compra_rondas r where r.persona_id = :'felipe_p' and r.cerrada_en is null);
${ORDEN("tru", "tru")}
${ORDEN("lim", "lim")}
${ORDEN("sin", "lim")}
select set_config('request.jwt.claim.sub', '', true) \\g /dev/null
select set_config('request.jwt.claims', '', true) \\g /dev/null
${ENVIA("tru", "tru")}
${ENVIA("lim", "lim")}
`;

// El rol de prueba de Micaela, con estos módulos. Se va con el ROLLBACK.
const MICAELA_CON = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba lee su sede ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
${como(MICAELA)}`;

// ¿Responde algo (una fila con su número) o nada? Lee las seis funciones sobre un envío y una sede.
const SI_NO = (expr) => `(case when ${expr} then 'sí' else 'no' end)`;
const LECTURAS = (nombre, sede) => `concat_ws(':',
  ${SI_NO(`retail.fn_envio_detalle(:'d_${nombre}') is not null`)},
  ${SI_NO(`retail.fn_envio_conteos(:'d_${nombre}') is not null`)},
  ${SI_NO(`retail.fn_envio_observaciones(:'d_${nombre}') is not null`)},
  ${SI_NO(`exists (select 1 from jsonb_array_elements(retail.fn_envios_por_recibir(:'${sede}')) e where (e ->> 'id')::uuid = :'d_${nombre}')`)},
  ${SI_NO(`exists (select 1 from retail.fn_envios_por_abrir(:'${sede}') e where e.id = :'d_${nombre}')`)})`;
const DIRECTAS = (sede) => `jsonb_array_length(retail.fn_ordenes_directas_por_recibir(:'${sede}'))`;

const TODO = "sí:sí:sí:sí:sí";
const NADA = "no:no:no:no:no";

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL|HINT|CONTEXT|LINE/.test(l)).slice(0, 4).join(" ")}`;
  }
  if (obtenido === esperado) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  }
}

// R. SOLO RECIBIR ----------------------------------------------------------------------------------------------------------
caso(
  "R1 solo Recibir, en Trujillo: lee su envío; el de Lima responde como si no existiera, en las cinco lecturas",
  `${MICAELA_CON("recibir")}
   select concat_ws(' / ', ${LECTURAS("tru", "tru")}, ${LECTURAS("lim", "lim")});`,
  `${TODO} / ${NADA}`,
);
caso(
  "R2 solo Recibir: las órdenes directas de la otra sede salen vacías, no con error (la del papel sin envío va a Lima)",
  `${MICAELA_CON("recibir")}
   select ${DIRECTAS("lim")};`,
  "0",
);
caso(
  "R3 un envío de otra sede no se distingue de uno que no existe",
  `${MICAELA_CON("recibir")}
   select concat_ws(' / ', retail.fn_envio_detalle(:'d_lim') is null, retail.fn_envio_detalle('00000000-0000-4000-8000-000000000000') is null);`,
  "t / t",
);

// C. COMPRAS ---------------------------------------------------------------------------------------------------------------
caso(
  "C1 con Órdenes de compra, sin Recibir: ve todas las sedes (decisión 37)",
  `${MICAELA_CON("ordenes_compra")}
   select concat_ws(' / ', ${LECTURAS("tru", "tru")}, ${LECTURAS("lim", "lim")});`,
  `${TODO} / ${TODO}`,
);
caso(
  "C2 con Recibir y el dinero de Compras: ve todas las sedes (decisión 41)",
  `${MICAELA_CON("recibir", "facturas_compra")}
   select concat_ws(' / ', ${LECTURAS("tru", "tru")}, ${LECTURAS("lim", "lim")});`,
  `${TODO} / ${TODO}`,
);
caso(
  "C3 el líder ve todas las sedes",
  `${como(FELIPE)}
   select concat_ws(' / ', ${LECTURAS("tru", "tru")}, ${LECTURAS("lim", "lim")});`,
  `${TODO} / ${TODO}`,
);

// M. EL MÓDULO -------------------------------------------------------------------------------------------------------------
caso(
  "M1 sin Recibir ni Órdenes de compra: 42501 como siempre, también con el dinero de Compras y también en su propia sede",
  `${MICAELA_CON("facturas_compra")}
   select concat_ws(' / ',
     pg_temp.intento(format('select retail.fn_envio_detalle(%L)', :'d_tru')),
     pg_temp.intento(format('select retail.fn_envios_por_recibir(%L)', :'tru')));`,
  "42501|envios_sin_modulo / 42501|envios_sin_modulo",
);

// F. LA FOTO ---------------------------------------------------------------------------------------------------------------
const FOTOS = `concat_ws(':',
  retail.fn_puede_ver_foto_gasto_viaje('papeles/tru.jpg'),
  retail.fn_puede_ver_foto_gasto_viaje('papeles/lim.jpg'),
  retail.fn_puede_ver_foto_gasto_viaje('papeles/sin.jpg'),
  retail.fn_puede_ver_foto_gasto_viaje('papeles/recien-subida.jpg'),
  retail.fn_puede_ver_foto_gasto_viaje('gastos/otra.jpg'))`;
caso(
  "F1 solo Recibir: la foto del papel de su sede sí; de otra sede no; de un papel sin envío no; la que se está subiendo sí; otra carpeta no",
  `${MICAELA_CON("recibir")}
   select ${FOTOS};`,
  "t:f:f:t:f",
);
caso(
  "F2 con Órdenes de compra, todas las fotos; con Recibir y el dinero de Compras, todas las de la carpeta de papeles",
  `${MICAELA_CON("ordenes_compra")}
   select ${FOTOS} as oc \\gset
   ${MICAELA_CON("recibir", "por_pagar")}
   select concat_ws(' / ', :'oc', ${FOTOS});`,
  "t:t:t:t:t / t:t:t:t:f",
);

// S. LA FORMA --------------------------------------------------------------------------------------------------------------
caso(
  "S1 las piezas internas son de la base: security definer, ni authenticated ni anon las ejecutan",
  `reset role;
   select string_agg(p.proname || ':' || p.prosecdef || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':' || has_function_privilege('anon', p.oid, 'execute'),
                     ',' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('fn_recepcion_puede_leer_sede', 'fn_recepcion_puede_ver_foto_papel');`,
  "fn_recepcion_puede_leer_sede:true:false:false,fn_recepcion_puede_ver_foto_papel:true:false:false",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
