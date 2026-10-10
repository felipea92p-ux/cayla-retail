#!/usr/bin/env node
/**
 * Pruebas de las órdenes de compra (ADR-0362, fase 1) — migraciones `20261010214500_ordenes_compra_modulo_y_tablas.sql` (el módulo
 * `ordenes_compra`, las tablas `ordenes_compra` / `orden_compra_items` y la lista `retail.fn_ordenes_compra`) y
 * `20261010223500_ordenes_compra_crear.sql` (`crear_orden_compra` y `fn_ordenes_compra_siguiente`). CAYLA V2.
 *
 * LO QUE VIGILA. Que una orden no pueda quedar en un estado imposible (un descuento mayor que lo que cuesta la línea, un porcentaje
 * que no cuadra con los soles descontados, una anulación sin motivo, un número repetido); que solo quien tiene el módulo la vea, y
 * que quien lo tiene vea las de TODAS las sedes (decisiones 34 y 37); que la lista sume bien y filtre lo que dice filtrar; y que
 * crear una orden no deje dos por un doble clic, no gaste números en lo que rechaza y siempre diga quién la creó (decisión 39).
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK).
 *   M  EL MÓDULO: existe en Compras, orden 145, delegable, y nace SIN rol (ningún `rol_modulos`). La migración se vuelve a cargar
 *      sin error (idempotente: así se pega en producción).
 *   P  PUERTAS: Felipe (líder) lee; Micaela, sin el módulo, recibe 42501; con el módulo en su rol, ve también las órdenes de otra
 *      sede; nadie lee las tablas directo (RLS sin políticas) y `anon` no ejecuta la lista.
 *   L  LA LISTA: de la más nueva a la más vieja, con líneas, unidades y total (descuento incluido); filtra por «por repartir», por
 *      tienda, por estado, por proveedor y por texto (número «OC-000012» o proveedor sin tildes); pagina; un destino raro se rechaza.
 *   C  CANDADOS DEL ESQUEMA: descuento mayor que la línea, porcentaje que no cuadra, cantidad 0, posición repetida, anulada sin
 *      motivo, generada con datos de anulación, entrega antes de la emisión, estado desconocido y número repetido.
 *   CR CREAR: guarda cabecera y líneas (el descuento en % se convierte a soles en la base) con el número que anunciaba la vista
 *      previa; el mismo `p_id` dos veces devuelve la misma orden; cada regla rechaza con su motivo SIN gastar número; firma una persona
 *      sin combo con `orden_compra_crear` (también sin ser Admin y con el responsable obligatorio encendido), pero una terminal no
 *      puede crearla sin elegir a alguien; sin el módulo, 42501; anon no la ejecuta.
 *   D  VER Y CONTAR (`20261010231500`): el detalle trae cabecera, quién la creó, las líneas con el nombre de categoría y marca, las
 *      unidades y el total; NULL si no existe; el resumen cuenta por destino (cada tienda y «por repartir») las generadas, su monto y
 *      las anuladas; las dos exigen el módulo y anon no las ejecuta.
 *   E  EDITAR (`20261010235000`): cambia cabecera y líneas, sube la versión, archiva lo de antes (con precios) y anota en Actividad
 *      SIN montos; con la versión vieja responde PT409 / version_cambiada sin escribir nada; el mismo pedido repetido (doble clic) no
 *      choca ni sube la versión; sin cambios no escribe; una anulada no se edita; la versión no se fija a mano; lo que no se tocó no
 *      se vuelve a juzgar (proveedor, categoría o marca desactivados, entrega vencida) pero elegir de nuevo algo inactivo sí; las
 *      reglas son las de crear; una persona firma con «orden_compra_editar», una terminal no edita sin elegir a alguien; sin el
 *      módulo, 42501; el archivo no se lee directo, ni se edita ni se borra; crear también anota su línea en Actividad.
 *   A  ANULAR (`20261010235500`): deja la orden anulada con quién, cuándo y el motivo, sube la versión, no libera el número y anota en
 *      Actividad; el motivo es obligatorio y va hasta 300 letras; con la versión vieja, PT409; el mismo pedido repetido no da error,
 *      pero anular otra vez con otro motivo sí; una persona firma con «orden_compra_anular» y una terminal no anula sin elegir a
 *      alguien; sin el módulo, 42501.
 *
 * USO
 *   pnpm pruebas:ordenes-compra                         → contra la base `postgres` del stack local
 *   pnpm pruebas:ordenes-compra --base otra             → contra otra base del mismo contenedor
 *   pnpm pruebas:ordenes-compra --contenedor supabase_db_x → contra otro stack (un banco de pruebas propio)
 * La migración se carga dentro de cada caso (idempotente): corre igual con la base al día o sin ella.
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
// En orden: cada actividad de la fase 1 suma la suya.
const MIGRACION = [
  "20261010214500_ordenes_compra_modulo_y_tablas.sql",
  "20261010223500_ordenes_compra_crear.sql",
  "20261010231500_ordenes_compra_detalle_y_resumen.sql",
  "20261010235000_ordenes_compra_editar.sql",
  "20261010235500_ordenes_compra_anular.sql",
]
  .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8"))
  .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
// Una terminal de prueba (se crea dentro de cada caso y se va con el ROLLBACK).
const T_VENTAS = "33333333-3333-4333-8333-0000000000c1";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "");

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${sinCandadosDePegado(MIGRACION)}
set local search_path = retail, public, extensions;

create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;

create function pg_temp.crea(p_id uuid, p_prov uuid, p_dest uuid, p_ent date, p_nota text, p_lineas jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_num integer;
begin
  for v_num in select r.numero from retail.crear_orden_compra(p_id, p_prov, p_dest, p_ent, p_nota, p_lineas) r loop
    return 'OK:' || v_num;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;

create function pg_temp.edita(p_id uuid, p_version integer, p_prov uuid, p_dest uuid, p_ent date, p_nota text, p_lineas jsonb) returns text
language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.numero, r.version from retail.editar_orden_compra(p_id, p_version, p_prov, p_dest, p_ent, p_nota, p_lineas) r loop
    return 'OK:' || v_fila.numero || ':' || v_fila.version;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;

create function pg_temp.anula(p_id uuid, p_version integer, p_motivo text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.numero, r.version from retail.anular_orden_compra(p_id, p_version, p_motivo) r loop
    return 'OK:' || v_fila.version;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;

-- Datos propios de la prueba: dos proveedores (uno con tilde, para buscar sin ella), una marca y una categoría.
insert into retail.proveedores (nombre) values ('Confecciones Peña OC Prueba') returning id as prov \\gset
insert into retail.proveedores (nombre) values ('Textiles Norte OC Prueba') returning id as prov2 \\gset
insert into retail.marcas (nombre) values ('OC Marca Prueba') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('OC Polos Prueba', 'indumentaria') returning id as cat \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
-- Como en producción (20260923160000): el responsable obligatorio encendido. Sin él, una persona firmaría igual sin combo y la
-- prueba de «orden_compra_crear» no probaría nada.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
${como(FELIPE)}
`;

// Una línea para \`p_lineas\`, con los números como TEXTO, igual que los manda la pantalla.
const linea = (o) =>
  JSON.stringify({ categoria_id: ":CAT", marca_id: ":MARCA", cantidad: "1", precio_unitario: "10.00", ...o })
    .replace('":CAT"', `"' || :'cat' || '"`)
    .replace('":MARCA"', `"' || :'marca' || '"`);
const lineas = (...ls) => `('[' || ${ls.map((l) => `'${linea(l)}'`).join(" || ',' || ")} || ']')::jsonb`;
// Los argumentos de crear_orden_compra con lo de siempre (proveedor activo, a Trujillo, sin entrega ni nota, una línea) y lo que
// cambie cada caso. `crea(...)` intenta y devuelve «OK:<número>» o «<sqlstate>|<hint>|<mensaje>».
const args = ({ id = "gen_random_uuid()", prov = ":'prov'", destino = ":'tru'", entrega = "null::date", nota = "null::text", ls = lineas({}) } = {}) =>
  `${id}, ${prov}, ${destino}, ${entrega}, ${nota}, ${ls}`;
const crea = (o) => `pg_temp.crea(${args(o)})`;
const encabezados = (obj) => `select set_config('request.headers', '${JSON.stringify(obj)}', true) \\g /dev/null\n`;
// La terminal de ventas de Trujillo, con el módulo en su rol (para llegar al candado del responsable y no al del módulo).
const TERMINAL = `
reset role;
insert into auth.users (id, aud, role, email) values ('${T_VENTAS}', 'authenticated', 'authenticated', 'oc-terminal@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  values (:'tru', 'Terminal OC Prueba', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS}');
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('terminal_ventas'), 'ordenes_compra') on conflict do nothing;
`;

// Tres órdenes, en este orden: O1 a Trujillo (2 líneas, una con 10 % de descuento), O2 por repartir (otro proveedor) y O3 a
// Trujillo, anulada. Totales: O1 = 10 × 25.50 + (4 × 100 − 40) = 255 + 360 = 615.00; O2 = 3 × 50 = 150.00.
const TRES_ORDENES = `
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'felipe_p')
  returning id as o1, numero as n1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario) values
  (:'o1', 1, :'cat', :'marca', 'Polo básico', 10, 25.50);
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento, descuento_pct) values
  (:'o1', 2, :'cat', :'marca', 4, 100, 40, 10);
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov2', null, :'felipe_p')
  returning id as o2, numero as n2 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario) values
  (:'o2', 1, :'cat', :'marca', 3, 50);
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por, estado, anulada_por, anulada_en, motivo_anulacion)
  values (:'prov', :'tru', :'felipe_p', 'anulada', :'felipe_p', now(), 'Se pidió dos veces') returning id as o3, numero as n3 \\gset
`;

// Solo las órdenes de esta prueba (la base puede tener otras), como «n1,n2,…» en el orden en que vienen.
const MIAS = (llamada) => `(select string_agg(case f.id when :'o1' then 'O1' when :'o2' then 'O2' when :'o3' then 'O3' end, ',')
  from ${llamada} f where f.id in (:'o1', :'o2', :'o3'))`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// M. MÓDULO ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 el módulo está en Compras (orden 145, delegable, no «solo líder») y nace SIN rol",
  `reset role;
   select concat_ws(',', (select grupo || ':' || orden || ':' || delegable || ':' || solo_lider from retail.modulos where clave = 'ordenes_compra'),
     (select count(*) from retail.rol_modulos where modulo = 'ordenes_compra'));`,
  "Compras:145:true:false,0"
);
caso(
  "M2 la migración se vuelve a cargar sin error (idempotente) y no duplica el módulo",
  `${sinCandadosDePegado(MIGRACION)}
   set local search_path = retail, public, extensions;
   select count(*) from retail.modulos where clave = 'ordenes_compra';`,
  "1"
);

// P. PUERTAS --------------------------------------------------------------------------------------------------------------
caso(
  "P1 Felipe (líder) lee la lista; Micaela, sin el módulo, recibe 42501",
  `select pg_temp.intento('select * from retail.fn_ordenes_compra()') as felipe \\gset
   ${como(MICAELA)}
   select :'felipe' || ',' || split_part(pg_temp.intento('select * from retail.fn_ordenes_compra()'), '|', 1);`,
  "SIN_ERROR,42501"
);
caso(
  "P2 con el módulo en su rol, Micaela ve las órdenes de TODAS las sedes (también la por repartir), no solo la suya",
  `${TRES_ORDENES}
   reset role;
   insert into retail.rol_modulos (rol_id, modulo)
     select c.rol_id, 'ordenes_compra' from retail.colaboradores c join public.personas p on p.id = c.persona_id
      where p.auth_user_id = '${MICAELA}';
   ${como(MICAELA)}
   select ${MIAS("retail.fn_ordenes_compra()")};`,
  "O3,O2,O1"
);
caso(
  "P3 nadie lee las tablas directo (RLS sin políticas) y anon no ejecuta la lista",
  `${TRES_ORDENES}
   set local role authenticated;
   select concat_ws(',', (select count(*) from retail.ordenes_compra), (select count(*) from retail.orden_compra_items)) as directo \\gset
   reset role;
   select :'directo' || ',' || has_function_privilege('anon', 'retail.fn_ordenes_compra(text,text,uuid,text,integer,integer)', 'execute');`,
  "0,0,false"
);

// L. LA LISTA -------------------------------------------------------------------------------------------------------------
caso(
  "L1 de la más nueva a la más vieja, con líneas, unidades y total (el 10 % de descuento ya restado)",
  `${TRES_ORDENES}
   select ${MIAS("retail.fn_ordenes_compra()")} || ' / ' ||
     (select lineas || ':' || unidades || ':' || total || ':' || estado || ':' || coalesce(destino_nombre, '-') || ':' || proveedor_nombre
        from retail.fn_ordenes_compra() where id = :'o1') || ' / ' ||
     (select lineas || ':' || unidades || ':' || total || ':' || coalesce(destino_nombre, 'por repartir')
        from retail.fn_ordenes_compra() where id = :'o2');`,
  "O3,O2,O1 / 2:14:615.00:generada:Tienda Trujillo:Confecciones Peña OC Prueba / 1:3:150.00:por repartir"
);
caso(
  "L2 filtra por «por repartir», por tienda, por estado y por proveedor",
  `${TRES_ORDENES}
   select concat_ws(' / ',
     ${MIAS("retail.fn_ordenes_compra(p_destino => 'por_repartir')")},
     ${MIAS("retail.fn_ordenes_compra(p_destino => :'tru')")},
     coalesce(${MIAS("retail.fn_ordenes_compra(p_destino => :'lima')")}, 'ninguna'),
     ${MIAS("retail.fn_ordenes_compra(p_estado => 'generada')")},
     ${MIAS("retail.fn_ordenes_compra(p_estado => 'anulada')")},
     ${MIAS("retail.fn_ordenes_compra(p_proveedor_id => :'prov2')")});`,
  "O2 / O3,O1 / ninguna / O2,O1 / O3 / O2"
);
caso(
  "L3 busca por número («OC-000012», «oc 12», «12») y por proveedor sin tildes ni mayúsculas",
  `${TRES_ORDENES}
   select concat_ws(' / ',
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => format('OC-%s', lpad(:'n2', 6, '0')))")},
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => format('oc %s', :'n2'))")},
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => :'n1')")},
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => 'pena oc prueba')")},
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => 'PEÑA OC PRUEBA')")},
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => 'textiles norte oc')")});`,
  "O2 / O2 / O1 / O3,O1 / O3,O1 / O2"
);
caso(
  "L4 pagina: de a 2 trae las dos más nuevas, y «antes de» la segunda trae la que sigue",
  `${TRES_ORDENES}
   select concat_ws(' / ',
     (select string_agg(case f.id when :'o1' then 'O1' when :'o2' then 'O2' when :'o3' then 'O3' else 'otra' end, ',')
        from retail.fn_ordenes_compra(p_busqueda => 'oc prueba', p_limite => 2) f),
     ${MIAS("retail.fn_ordenes_compra(p_busqueda => 'oc prueba', p_antes_de => :'n2')")});`,
  "O3,O2 / O1"
);
caso(
  "L5 un destino que no es «por_repartir» ni un id se rechaza con su motivo",
  `select split_part(pg_temp.intento($$select * from retail.fn_ordenes_compra(p_destino => 'lima')$$), '|', 2);`,
  "Ese destino no se entiende"
);

// C. CANDADOS DEL ESQUEMA -------------------------------------------------------------------------------------------------
caso(
  "C1 lo imposible no se guarda: descuento mayor que la línea, % que no cuadra, cantidad 0, posición repetida",
  `${TRES_ORDENES}
   reset role;
   select concat_ws(',',
     split_part(pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento) values (%L, 9, %L, %L, 2, 10, 20.01)', :'o2', :'cat', :'marca')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento, descuento_pct) values (%L, 9, %L, %L, 1, 100, 5, 10)', :'o2', :'cat', :'marca')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario) values (%L, 9, %L, %L, 0, 10)', :'o2', :'cat', :'marca')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario) values (%L, 1, %L, %L, 1, 10)', :'o2', :'cat', :'marca')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento, descuento_pct) values (%L, 9, %L, %L, 3, 33.33, 10.00, 10)', :'o2', :'cat', :'marca')), '|', 1));`,
  "23514,23514,23514,23505,SIN_ERROR"
);
caso(
  "C2 la cabecera tampoco: anulada sin motivo, generada con datos de anulación, entrega antes de la emisión, estado raro, número repetido",
  `${TRES_ORDENES}
   reset role;
   select concat_ws(',',
     split_part(pg_temp.intento(format('update retail.ordenes_compra set estado = %L, anulada_por = %L, anulada_en = now() where id = %L', 'anulada', :'felipe_p', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_compra set anulada_en = now() where id = %L', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_compra set fecha_entrega_estimada = fecha_emision - 1 where id = %L', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_compra set estado = %L where id = %L', 'perdida', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_compra set numero = %s where id = %L', :'n2', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_compra set fecha_entrega_estimada = fecha_emision where id = %L', :'o1')), '|', 1));`,
  "23514,23514,23514,23514,23505,SIN_ERROR"
);

// CR. CREAR ---------------------------------------------------------------------------------------------------------------
const si = (cond, a, b) => `case when ${cond} then '${a}' else '${b}' end`;
caso(
  "CR1 guarda cabecera y líneas con el número que anunciaba la vista previa; el 10 % se vuelve soles en la base",
  `select retail.fn_ordenes_compra_siguiente() as antes \\gset
   select id as oc, numero as num from retail.crear_orden_compra(${args({
     entrega: "retail.fn_hoy_lima() + 3",
     nota: "'Llega en fardo'",
     ls: lineas(
       { descripcion: "Polo basico", cantidad: "10", precio_unitario: "25.50" },
       { cantidad: "4", precio_unitario: "100", descuento_pct: "10", descuento: "1.00" },
       { cantidad: "2", precio_unitario: "30", descuento: "5.50" }
     ),
   })}) \\gset
   select concat_ws(' / ',
     ${si(":'num'::int = :'antes'::int", "numero anunciado", "otro numero")},
     (select o.estado || ':' || coalesce(u.nombre, '-') || ':' || (o.fecha_entrega_estimada - o.fecha_emision) || ':' || o.nota || ':'
             || ${si("o.creada_por = :'felipe_p'", "felipe", "otra")}
        from retail.ordenes_compra o left join retail.ubicaciones u on u.id = o.ubicacion_destino_id where o.id = :'oc'),
     (select string_agg(i.posicion || ':' || i.cantidad || 'x' || i.precio_unitario || '-' || i.descuento
                        || coalesce('(' || i.descuento_pct::numeric(7, 2) || '%)', '') || '=' || i.subtotal, ' ' order by i.posicion)
        from retail.orden_compra_items i where i.orden_compra_id = :'oc'),
     (select f.total from retail.fn_ordenes_compra() f where f.id = :'oc'));`,
  "numero anunciado / generada:Tienda Trujillo:3:Llega en fardo:felipe / 1:10x25.50-0.00=255.00 2:4x100.00-40.00(10.00%)=360.00 3:2x30.00-5.50=54.50 / 669.50"
);
caso(
  "CR2 el mismo p_id dos veces (doble clic, reintento) devuelve la misma orden: una sola, con una línea, y un solo número gastado",
  `select gen_random_uuid() as pid \\gset
   select id as a, numero as na from retail.crear_orden_compra(${args({ id: ":'pid'" })}) \\gset
   select id as b, numero as nb from retail.crear_orden_compra(${args({ id: ":'pid'", ls: lineas({ cantidad: "99" }) })}) \\gset
   select concat_ws(',', ${si(":'a' = :'b' and :'na' = :'nb'", "misma", "otra")},
     (select count(*) from retail.ordenes_compra where id = :'pid'),
     (select string_agg(cantidad::text, '+') from retail.orden_compra_items where orden_compra_id = :'pid'),
     ${si("retail.fn_ordenes_compra_siguiente() = :'na'::int + 1", "un numero", "gasto de mas")});`,
  "misma,1,1,un numero"
);
caso(
  "CR3 cada regla rechaza con su motivo y SIN gastar número: proveedor, destino (nunca el Taller), entrega, nota, líneas y sus números",
  `reset role;
   insert into retail.proveedores (nombre, activo) values ('OC Proveedor Inactivo', false) returning id as prov_off \\gset
   ${como(FELIPE)}
   select retail.fn_ordenes_compra_siguiente() as antes \\gset
   select concat_ws(',',
     split_part(${crea({ prov: "null::uuid" })}, '|', 2),
     split_part(${crea({ prov: ":'prov_off'" })}, '|', 2),
     split_part(${crea({ destino: ":'taller'" })}, '|', 2),
     split_part(${crea({ entrega: "retail.fn_hoy_lima() - 1" })}, '|', 2),
     split_part(${crea({ entrega: "retail.fn_hoy_lima() + 400" })}, '|', 2),
     split_part(${crea({ nota: "repeat('a', 501)" })}, '|', 2),
     split_part(${crea({ ls: "'[]'::jsonb" })}, '|', 2),
     split_part(${crea({ ls: `(select jsonb_agg(jsonb_build_object('categoria_id', :'cat', 'marca_id', :'marca', 'cantidad', '1', 'precio_unitario', '1')) from generate_series(1, 101))` })}, '|', 2),
     split_part(${crea({ ls: lineas({ marca_id: "" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ cantidad: "1.5" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ cantidad: "0" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ precio_unitario: "10.555" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ precio_unitario: "diez" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ cantidad: "2", precio_unitario: "10", descuento: "20.01" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ descuento_pct: "101" }) })}, '|', 2),
     ${si("retail.fn_ordenes_compra_siguiente() = :'antes'::int", "sin gastar", "gasto numeros")});`,
  [
    "orden_compra_proveedor", "orden_compra_proveedor", "orden_compra_destino", "orden_compra_entrega", "orden_compra_entrega",
    "orden_compra_nota", "orden_compra_sin_lineas", "orden_compra_muchas_lineas", "orden_compra_marca", "orden_compra_cantidad",
    "orden_compra_cantidad", "orden_compra_precio", "orden_compra_linea", "orden_compra_descuento", "orden_compra_descuento", "sin gastar",
  ].join(",")
);
caso(
  "CR4 una persona que no es Admin, con el responsable obligatorio encendido: sin la clave le pide el combo; con «orden_compra_crear» firma ella",
  `reset role;
   insert into retail.rol_modulos (rol_id, modulo)
     select c.rol_id, 'ordenes_compra' from retail.colaboradores c where c.persona_id = :'micaela_p';
   ${como(MICAELA)}
   select ${crea()} as sin_clave \\gset
   ${encabezados({ "x-responsable-omitido": "orden_compra_crear" })}
   select id as oc from retail.crear_orden_compra(${args()}) \\gset
   select split_part(:'sin_clave', '|', 2) || ',' ||
     (select ${si("creada_por = :'micaela_p'", "micaela", "otra")} from retail.ordenes_compra where id = :'oc');`,
  "responsable_requerido,micaela"
);
caso(
  "CR5 una terminal no crea una orden sin elegir a alguien: ni mandando la clave (la base no deja una orden sin autor) ni sin nada",
  `${TERMINAL}
   ${como(T_VENTAS)}
   ${encabezados({ "x-responsable-omitido": "orden_compra_crear" })}
   select ${crea()} as con_clave \\gset
   ${encabezados({})}
   select ${crea()} as sin_nada \\gset
   select split_part(:'con_clave', '|', 1) || '|' || split_part(:'con_clave', '|', 2) || ',' || split_part(:'sin_nada', '|', 2);`,
  "42501|responsable_requerido,responsable_requerido"
);
caso(
  "CR6 sin el módulo no se crea ni se mira el número que sigue (42501); anon no ejecuta ninguna de las dos",
  `${como(MICAELA)}
   ${encabezados({ "x-responsable-omitido": "orden_compra_crear" })}
   select split_part(${crea()}, '|', 1) || ',' || split_part(pg_temp.intento('select retail.fn_ordenes_compra_siguiente()'), '|', 1) as micaela \\gset
   reset role;
   select :'micaela' || ',' ||
     has_function_privilege('anon', 'retail.crear_orden_compra(uuid,uuid,uuid,date,text,jsonb)', 'execute') || ',' ||
     has_function_privilege('anon', 'retail.fn_ordenes_compra_siguiente()', 'execute');`,
  "42501,42501,false,false"
);

// D. VER Y CONTAR ---------------------------------------------------------------------------------------------------------
caso(
  "D1 el detalle trae la cabecera, quién la creó, las líneas con sus nombres en orden, las unidades y el total",
  `${TRES_ORDENES}
   select retail.fn_orden_compra_detalle(:'o1') as d \\gset
   select concat_ws(' / ',
     (:'d'::jsonb ->> 'estado') || ':' || (:'d'::jsonb -> 'proveedor' ->> 'nombre') || ':' || (:'d'::jsonb -> 'destino' ->> 'nombre')
       || ':' || ${si("(:'d'::jsonb ->> 'creada_por') like 'Felipe%'", "felipe", "otra")},
     (select string_agg((l ->> 'posicion') || ':' || (l ->> 'categoria') || ':' || (l ->> 'marca') || ':' || (l ->> 'cantidad') || 'x'
                        || (l ->> 'precio_unitario') || '-' || (l ->> 'descuento') || '=' || (l ->> 'subtotal'), ' ')
        from jsonb_array_elements(:'d'::jsonb -> 'lineas') l),
     (:'d'::jsonb ->> 'unidades') || ':' || (:'d'::jsonb ->> 'total'),
     coalesce(retail.fn_orden_compra_detalle(:'o2') ->> 'destino', 'por repartir'),
     coalesce(retail.fn_orden_compra_detalle(gen_random_uuid())::text, 'no existe'));`,
  "generada:Confecciones Peña OC Prueba:Tienda Trujillo:felipe / 1:OC Polos Prueba:OC Marca Prueba:10x25.50-0.00=255.00 2:OC Polos Prueba:OC Marca Prueba:4x100.00-40.00=360.00 / 14:615.00 / por repartir / no existe"
);
caso(
  "D2 el resumen cuenta por destino: generadas, su monto y anuladas (Trujillo y «por repartir» de la prueba)",
  `${TRES_ORDENES}
   select concat_ws(' / ',
     (select generadas || ':' || monto_generadas || ':' || anuladas from retail.fn_ordenes_compra_resumen() where ubicacion_destino_id = :'tru'),
     (select generadas || ':' || monto_generadas || ':' || anuladas from retail.fn_ordenes_compra_resumen() where ubicacion_destino_id is null));`,
  (obtenido) => {
    // La base puede tener otras órdenes: se exige AL MENOS lo de la prueba (Trujillo: 1 generada de 615, 1 anulada; por repartir: 1 de 150).
    const [tru, rep] = obtenido.split(" / ").map((s) => s.split(":").map(Number));
    return !!tru && !!rep && tru[0] >= 1 && tru[1] >= 615 && tru[2] >= 1 && rep[0] >= 1 && rep[1] >= 150;
  }
);
caso(
  "D3 sin el módulo, ni el detalle ni el resumen (42501); anon no ejecuta ninguno",
  `${TRES_ORDENES}
   ${como(MICAELA)}
   select split_part(pg_temp.intento(format('select retail.fn_orden_compra_detalle(%L)', :'o1')), '|', 1) || ',' ||
          split_part(pg_temp.intento('select * from retail.fn_ordenes_compra_resumen()'), '|', 1) as micaela \\gset
   reset role;
   select :'micaela' || ',' ||
     has_function_privilege('anon', 'retail.fn_orden_compra_detalle(uuid)', 'execute') || ',' ||
     has_function_privilege('anon', 'retail.fn_ordenes_compra_resumen()', 'execute');`,
  "42501,42501,false,false"
);

// E. EDITAR ------------------------------------------------------------------------------------------------------------------
// Una orden recién creada por Felipe para editar: a Trujillo, con nota, dos líneas (10 × 25.50 y 4 × 100 con 10 %): 14 unidades,
// S/ 615.00. `v` es su versión (1).
const L1 = { cantidad: "10", precio_unitario: "25.50" };
const L2 = { cantidad: "4", precio_unitario: "100", descuento_pct: "10" };
const UNA_ORDEN = `
select id as oc, numero as n from retail.crear_orden_compra(gen_random_uuid(), :'prov', :'tru', null::date, 'Nota inicial', ${lineas(L1, L2)}) \\gset
select version as v from retail.ordenes_compra where id = :'oc' \\gset
`;
const argsE = ({ version = ":'v'", prov = ":'prov'", destino = ":'tru'", entrega = "null::date", nota = "'Nota inicial'", ls = lineas(L1, L2) } = {}) =>
  `:'oc', ${version}, ${prov}, ${destino}, ${entrega}, ${nota}, ${ls}`;
const edita = (o) => `pg_temp.edita(${argsE(o)})`;
const enActividad = (accion) => `(select count(*) from retail.actividad a where a.tabla = 'ordenes_compra' and a.registro_id = :'oc' and a.accion = '${accion}')`;

caso(
  "E1 editar cambia cabecera y líneas, sube la versión, archiva lo de antes (con precios) y anota en Actividad sin montos",
  `${UNA_ORDEN}
   select ${edita({ destino: "null::uuid", entrega: "retail.fn_hoy_lima() + 5", nota: "'Nota nueva'", ls: lineas({ ...L1, cantidad: "12" }, L2, { cantidad: "2", precio_unitario: "30" }) })} as r \\gset
   reset role;
   select concat_ws(' / ',
     split_part(:'r', ':', 1) || ':' || split_part(:'r', ':', 3),
     (select version || ':' || coalesce(ubicacion_destino_id::text, 'por repartir') || ':' || (fecha_entrega_estimada - retail.fn_hoy_lima()) || ':' || nota
             || ':' || ${si("actualizada_por = :'felipe_p'", "felipe", "otra")} from retail.ordenes_compra where id = :'oc'),
     (select string_agg(cantidad::text || 'x' || precio_unitario, ' ' order by posicion) from retail.orden_compra_items where orden_compra_id = :'oc'),
     (select version || ':' || jsonb_array_length(datos -> 'lineas') || ':' || (datos ->> 'total') || ':' || (datos ->> 'nota')
        from retail.orden_compra_versiones where orden_compra_id = :'oc'),
     ${enActividad("orden_compra_creada")} || '+' || ${enActividad("orden_compra_editada")},
     (select replace(descripcion, retail.fn_orden_compra_numero_texto(:'n'::int), 'OC-N') from retail.actividad a
       where a.tabla = 'ordenes_compra' and a.registro_id = :'oc' and a.accion = 'orden_compra_editada'),
     (select ${si("descripcion like '%S/%' or detalle::text like '%25.5%'", "con montos", "sin montos")} from retail.actividad a
       where a.tabla = 'ordenes_compra' and a.registro_id = :'oc' and a.accion = 'orden_compra_editada'));`,
  (obtenido) => {
    const partes = obtenido.split(" / ");
    return (
      partes[0] === "OK:2" &&
      partes[1] === "2:por repartir:5:Nota nueva:felipe" &&
      partes[2] === "12x25.50 4x100.00 2x30.00" &&
      partes[3] === "1:2:615.00:Nota inicial" &&
      partes[4] === "1+1" &&
      partes[5]?.startsWith("editó la OC-N: ") &&
      partes[5]?.includes("llega a Tienda Trujillo → por repartir") &&
      partes[5]?.includes("la nota") &&
      partes[5]?.includes("1 línea agregada") &&
      partes[5]?.includes("1 línea cambiada") &&
      partes[5]?.includes("14 → 18 unidades") &&
      partes[6] === "sin montos"
    );
  }
);
caso(
  "E2 con la versión vieja (otra persona guardó antes): PT409 / version_cambiada y no escribe nada",
  `${UNA_ORDEN}
   select ${edita({ nota: "'Primera'" })} as primera \\gset
   select ${edita({ nota: "'Segunda'" })} as segunda \\gset
   reset role;
   select concat_ws(',', split_part(:'primera', ':', 3), split_part(:'segunda', '|', 1), split_part(:'segunda', '|', 2),
     (select nota || ':' || version from retail.ordenes_compra where id = :'oc'),
     (select count(*) from retail.orden_compra_versiones where orden_compra_id = :'oc'));`,
  "2,PT409,version_cambiada,Primera:2,1"
);
caso(
  "E3 un doble clic (el mismo pedido otra vez, con la versión que ya no es) no choca: devuelve la orden sin subir la versión",
  `${UNA_ORDEN}
   select ${edita({ nota: "'Una sola vez'" })} as primera \\gset
   select ${edita({ nota: "'Una sola vez'" })} as repetida \\gset
   reset role;
   select concat_ws(',', split_part(:'primera', ':', 3), split_part(:'repetida', ':', 1), split_part(:'repetida', ':', 3),
     (select count(*) from retail.orden_compra_versiones where orden_compra_id = :'oc'), ${enActividad("orden_compra_editada")});`,
  "2,OK,2,1,1"
);
caso(
  "E4 sin cambios no escribe: ni versión nueva, ni archivo, ni línea de Actividad (el % de antes y el de ahora calzan)",
  `${UNA_ORDEN}
   select ${edita({ nota: "'  Nota inicial  '", ls: lineas({ ...L1, precio_unitario: "25.5" }, { ...L2, descuento_pct: "10.0" }) })} as r \\gset
   reset role;
   select concat_ws(',', split_part(:'r', ':', 3),
     (select count(*) from retail.orden_compra_versiones where orden_compra_id = :'oc'), ${enActividad("orden_compra_editada")});`,
  "1,0,0"
);
caso(
  "E5 una anulada no se edita (y anularla subió la versión: la pantalla que la tenía abierta recibe el aviso de choque)",
  `${UNA_ORDEN}
   reset role;
   update retail.ordenes_compra set estado = 'anulada', anulada_por = :'felipe_p', anulada_en = now(), motivo_anulacion = 'Prueba'
    where id = :'oc';
   ${como(FELIPE)}
   select concat_ws(',', split_part(${edita({ version: "2", nota: "'x'" })}, '|', 2), split_part(${edita({ nota: "'x'" })}, '|', 2));`,
  "orden_compra_anulada,version_cambiada"
);
caso(
  "E6 la versión sube sola en cada escritura y no se fija a mano",
  `${UNA_ORDEN}
   reset role;
   update retail.ordenes_compra set version = 999, nota = 'directo' where id = :'oc';
   update retail.ordenes_compra set nota = 'otra vez' where id = :'oc';
   select version from retail.ordenes_compra where id = :'oc';`,
  "3"
);
caso(
  "E7 lo que no se tocó no se vuelve a juzgar (proveedor, categoría y marca desactivados, entrega vencida); elegir algo inactivo de nuevo, sí",
  `${UNA_ORDEN}
   reset role;
   insert into retail.proveedores (nombre, activo) values ('OC Otro Inactivo', false) returning id as prov_off \\gset
   update retail.ordenes_compra set fecha_emision = retail.fn_hoy_lima() - 10, fecha_entrega_estimada = retail.fn_hoy_lima() - 3 where id = :'oc';
   update retail.proveedores set activo = false where id = :'prov';
   update retail.categorias set activo = false where id = :'cat';
   update retail.marcas set activo = false where id = :'marca';
   select version as v from retail.ordenes_compra where id = :'oc' \\gset
   ${como(FELIPE)}
   select concat_ws(',',
     split_part(${edita({ entrega: "retail.fn_hoy_lima() - 3", nota: "'Solo la nota'" })}, ':', 1),
     split_part(${edita({ version: ":'v'::int + 1", prov: ":'prov_off'", entrega: "retail.fn_hoy_lima() - 3" })}, '|', 2),
     split_part(${edita({ version: ":'v'::int + 1", entrega: "retail.fn_hoy_lima() - 2" })}, '|', 2));`,
  "OK,orden_compra_proveedor,orden_compra_entrega"
);
caso(
  "E8 las reglas son las de crear: una línea mal escrita se rechaza con su motivo y la orden queda como estaba",
  `${UNA_ORDEN}
   select concat_ws(',',
     split_part(${edita({ ls: lineas({ ...L1, cantidad: "0" }) })}, '|', 2),
     split_part(${edita({ ls: "'[]'::jsonb" })}, '|', 2),
     split_part(${edita({ destino: ":'taller'" })}, '|', 2),
     split_part(${edita({ version: "null::int" })}, '|', 2),
     (select version || ':' || (select count(*) from retail.orden_compra_items i where i.orden_compra_id = :'oc') from retail.ordenes_compra where id = :'oc'));`,
  "orden_compra_cantidad,orden_compra_sin_lineas,orden_compra_destino,orden_compra_sin_version,1:2"
);
caso(
  "E9 una persona que no es Admin firma con «orden_compra_editar» (sin la clave le pide el combo); una terminal no edita sin elegir a alguien",
  `${UNA_ORDEN}
   reset role;
   insert into retail.rol_modulos (rol_id, modulo)
     select c.rol_id, 'ordenes_compra' from retail.colaboradores c where c.persona_id = :'micaela_p';
   ${como(MICAELA)}
   select ${edita({ nota: "'Micaela'" })} as sin_clave \\gset
   ${encabezados({ "x-responsable-omitido": "orden_compra_editar" })}
   select ${edita({ nota: "'Micaela'" })} as con_clave \\gset
   ${TERMINAL}
   ${como(T_VENTAS)}
   ${encabezados({ "x-responsable-omitido": "orden_compra_editar" })}
   select ${edita({ version: "2", nota: "'Terminal'" })} as terminal \\gset
   reset role;
   select concat_ws(',', split_part(:'sin_clave', '|', 2), split_part(:'con_clave', ':', 1),
     (select ${si("actualizada_por = :'micaela_p'", "micaela", "otra")} || ':' || nota from retail.ordenes_compra where id = :'oc'),
     split_part(:'terminal', '|', 2));`,
  "responsable_requerido,OK,micaela:Micaela,responsable_requerido"
);
caso(
  "E10 sin el módulo, 42501; anon no ejecuta editar; nadie lee el archivo directo, ni lo edita ni lo borra",
  `${UNA_ORDEN}
   select ${edita({ nota: "'Archivo'" })} \\g /dev/null
   ${como(MICAELA)}
   ${encabezados({ "x-responsable-omitido": "orden_compra_editar" })}
   select split_part(${edita({ version: "2", nota: "'x'" })}, '|', 1) as micaela \\gset
   reset role;
   select concat_ws(',', :'micaela',
     has_function_privilege('anon', 'retail.editar_orden_compra(uuid,integer,uuid,uuid,date,text,jsonb)', 'execute'),
     has_table_privilege('authenticated', 'retail.orden_compra_versiones', 'select'),
     split_part(pg_temp.intento(format('update retail.orden_compra_versiones set datos = %L where orden_compra_id = %L', '{}', :'oc')), '|', 1),
     split_part(pg_temp.intento(format('delete from retail.orden_compra_versiones where orden_compra_id = %L', :'oc')), '|', 1));`,
  "42501,f,f,42501,42501"
);
caso(
  "E11 crear anota su línea en Actividad: quién, cuántas líneas y unidades y a dónde llega, sin montos",
  `${UNA_ORDEN}
   reset role;
   select concat_ws(' / ',
     (select replace(descripcion, retail.fn_orden_compra_numero_texto(:'n'::int), 'OC-N') from retail.actividad a
       where a.tabla = 'ordenes_compra' and a.registro_id = :'oc' and a.accion = 'orden_compra_creada'),
     (select ${si("a.persona_id = :'felipe_p' and a.ubicacion_destino_id = :'tru' and a.modulo = 'ordenes_compra'", "firmada y con destino", "mal")}
        from retail.actividad a where a.tabla = 'ordenes_compra' and a.registro_id = :'oc' and a.accion = 'orden_compra_creada'));`,
  "creó la OC-N para Confecciones Peña OC Prueba: 2 líneas, 14 unidades · llega a Tienda Trujillo / firmada y con destino"
);

// A. ANULAR -----------------------------------------------------------------------------------------------------------------
const anula = (version = ":'v'", motivo = "'El proveedor no tenía la tela'") => `pg_temp.anula(:'oc', ${version}, ${motivo})`;

caso(
  "A1 anular deja la orden anulada con quién, cuándo y el motivo, sube la versión, no libera el número y anota en Actividad",
  `${UNA_ORDEN}
   select ${anula()} as r \\gset
   select id as otra, numero as n2 from retail.crear_orden_compra(gen_random_uuid(), :'prov', :'tru', null::date, null::text, ${lineas(L1)}) \\gset
   reset role;
   select concat_ws(' / ', :'r',
     (select estado || ':' || ${si("anulada_por = :'felipe_p'", "felipe", "otra")} || ':' || ${si("anulada_en is not null", "con hora", "sin hora")}
             || ':' || motivo_anulacion from retail.ordenes_compra where id = :'oc'),
     ${si(":'n2'::int > :'n'::int", "número nuevo", "repitió número")},
     (select replace(descripcion, retail.fn_orden_compra_numero_texto(:'n'::int), 'OC-N') from retail.actividad a
       where a.tabla = 'ordenes_compra' and a.registro_id = :'oc' and a.accion = 'orden_compra_anulada'));`,
  "OK:2 / anulada:felipe:con hora:El proveedor no tenía la tela / número nuevo / anuló la OC-N para Confecciones Peña OC Prueba: «El proveedor no tenía la tela»"
);
caso(
  "A2 el motivo es obligatorio (vacío o solo espacios) y va hasta 300 letras; sin él la orden sigue generada",
  `${UNA_ORDEN}
   select concat_ws(',',
     split_part(${anula(":'v'", "null::text")}, '|', 2),
     split_part(${anula(":'v'", "'   '")}, '|', 2),
     split_part(${anula(":'v'", "repeat('a', 301)")}, '|', 2),
     (select estado from retail.ordenes_compra where id = :'oc'));`,
  "orden_compra_motivo,orden_compra_motivo,orden_compra_motivo,generada"
);
caso(
  "A3 con la versión vieja (otra persona la editó antes): PT409 / version_cambiada y no la anula",
  `${UNA_ORDEN}
   select ${edita({ nota: "'Otra persona'" })} \\g /dev/null
   select concat_ws(',', split_part(${anula()}, '|', 1), split_part(${anula()}, '|', 2),
     (select estado from retail.ordenes_compra where id = :'oc'));`,
  "PT409,version_cambiada,generada"
);
caso(
  "A4 el mismo pedido repetido (doble clic) no da error y no cambia nada; anular otra vez con otro motivo, sí",
  `${UNA_ORDEN}
   select ${anula()} as primera \\gset
   select ${anula()} as repetida \\gset
   select ${anula(":'v'::int + 1", "'Otro motivo'")} as otra \\gset
   reset role;
   select concat_ws(',', :'primera', :'repetida', split_part(:'otra', '|', 2),
     (select motivo_anulacion || ':' || version from retail.ordenes_compra where id = :'oc'),
     (select count(*) from retail.actividad a where a.tabla = 'ordenes_compra' and a.registro_id = :'oc' and a.accion = 'orden_compra_anulada'));`,
  "OK:2,OK:2,orden_compra_ya_anulada,El proveedor no tenía la tela:2,1"
);
caso(
  "A5 una persona que no es Admin firma con «orden_compra_anular» (sin la clave le pide el combo); una terminal no anula sin elegir a alguien",
  `${UNA_ORDEN}
   reset role;
   insert into retail.rol_modulos (rol_id, modulo)
     select c.rol_id, 'ordenes_compra' from retail.colaboradores c where c.persona_id = :'micaela_p';
   ${TERMINAL}
   ${como(T_VENTAS)}
   ${encabezados({ "x-responsable-omitido": "orden_compra_anular" })}
   select ${anula()} as terminal \\gset
   ${como(MICAELA)}
   ${encabezados({})}
   select ${anula()} as sin_clave \\gset
   ${encabezados({ "x-responsable-omitido": "orden_compra_anular" })}
   select ${anula()} as con_clave \\gset
   reset role;
   select concat_ws(',', split_part(:'terminal', '|', 2), split_part(:'sin_clave', '|', 2), :'con_clave',
     (select ${si("anulada_por = :'micaela_p'", "micaela", "otra")} from retail.ordenes_compra where id = :'oc'));`,
  "responsable_requerido,responsable_requerido,OK:2,micaela"
);
caso(
  "A6 sin el módulo, 42501; anon no ejecuta anular",
  `${UNA_ORDEN}
   ${como(MICAELA)}
   ${encabezados({ "x-responsable-omitido": "orden_compra_anular" })}
   select split_part(${anula()}, '|', 1) as micaela \\gset
   reset role;
   select :'micaela' || ',' || has_function_privilege('anon', 'retail.anular_orden_compra(uuid,integer,text)', 'execute');`,
  "42501,false"
);

console.log(`\n${casos - fallas}/${casos} casos bien`);
if (fallas > 0) process.exit(1);
