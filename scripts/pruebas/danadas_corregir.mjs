#!/usr/bin/env node
/**
 * Prueba de ADR-0640 — Dañadas: «Me equivoqué de prenda» (`20261110172000_danadas_corregir_la_prenda.sql`) y «No estaba dañada»
 * (`20261110173000_danadas_no_estaba_danada.sql`).
 *
 * QUÉ CUBRE
 *   C1 forma: una sola versión de cada función con su firma; anon no, authenticated sí; security definer con el search_path de la casa.
 *   C2 el caso de Trujillo: la 28 reportada por error vuelve a su lugar, la 30 pasa a la cuarentena, la fila dice la 30 y anota que
 *      decía la 28; dos traslados internos (nunca un ajuste); el total de cada prenda no cambia.
 *   C3 lo que no se corrige: sin Existencias (42501); otro modelo; la misma prenda; la correcta sin nada libre (lo apartado no
 *      cuenta) y entonces NO se mueve nada; una dañada ya resuelta; una que no se reportó en la tienda.
 *   C4 reintento: misma marca y mismos datos → ya_registrada sin mover más; la misma marca con otros datos se rechaza.
 *   C5 dos correcciones seguidas (28 → 30 → 32): cada una vuelve a su lugar.
 *   N1 «No estaba dañada»: vuelve al lugar de donde salió, estado `no_estaba_danada`, un traslado interno, no es pérdida.
 *   N2 lo que no: ya salió a arreglar; no se reportó en la tienda; sin Existencias; ya resuelta. Reintento → ya_registrada.
 *
 * CÓMO. Igual que `danadas_reportar_arreglar.mjs`: cada caso en su transacción con ROLLBACK (nunca se commitea nada), sesión simulada
 * con `request.jwt.claim.sub`. Las prendas son NUEVAS en cada caso (un modelo con 3 tallas y otro modelo aparte).
 *
 * USO
 *   pnpm pruebas:danadas-corregir    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, lineas: psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim().split("\n") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Envuelve una llamada para que devuelva {ok, res} o {ok:false, estado, hint, msg} en vez de abortar la transacción. */
const envolver = (nombre, firma, llamada) => `create function pg_temp.${nombre}(${firma}) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  return jsonb_build_object('ok', true, 'res', ${llamada});
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;`;

const PRELUDIO = `
begin;
${envolver("reportar", "p_v uuid, p_n integer, p_desde text, p_token uuid", "retail.reportar_danada((select id from retail.ubicaciones where nombre = 'Tienda Trujillo'), p_v, p_n, p_desde, null, p_token, 'mancha')")}
${envolver("corregir", "p_id uuid, p_v uuid, p_desde text, p_token uuid", "retail.corregir_prenda_danada(p_id, p_v, p_desde, p_token)")}
${envolver("sin_dano", "p_id uuid, p_nota text, p_token uuid", "retail.devolver_danada_sin_dano(p_id, p_nota, p_token)")}
${envolver("sacar", "p_id uuid", "retail.sacar_danada_a_arreglar(p_id, 'cerca', null)")}
${envolver("botar", "p_id uuid", "retail.resolver_prenda_danada(p_id, 'se_boto', 'prueba')")}
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', x.nombre, x.tipo from (values ('Piso de venta', 'piso_venta'), ('Almacén de tienda', 'almacen_tienda'), ('Cuarentena', 'cuarentena')) x(nombre, tipo)
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = x.tipo);
select id as piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as cua from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena' \\gset
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Vestido Corrige Prueba', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod \\gset
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Otra Prueba', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod2 \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod', t.id, :'color', 'COR-PRUEBA-' || t.n, 99
    from (select id, row_number() over (order by valor, id) as n from retail.tallas) t where t.n <= 3;
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod2', t.id, :'color', 'OTRA-PRUEBA-1', 50 from retail.tallas t order by valor, id limit 1;
select id as v28 from retail.variantes where sku = 'COR-PRUEBA-1' \\gset
select id as v30 from retail.variantes where sku = 'COR-PRUEBA-2' \\gset
select id as v32 from retail.variantes where sku = 'COR-PRUEBA-3' \\gset
select id as votra from retail.variantes where sku = 'OTRA-PRUEBA-1' \\gset
-- Como en Trujillo: una 28 y una 30 en el almacén; además una 32 en el piso y una de otro modelo en el almacén.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x.v, :'tru', x.s, 'entrada', x.n, 'prueba corregir: colchón'
    from (values (:'v28'::uuid, :'alm'::uuid, 1), (:'v30', :'alm', 1), (:'v32', :'piso', 1), (:'votra', :'alm', 1)) x(v, s, n);
select count(*) as _colchon from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.variante_id in (:'v28', :'v30', :'v32', :'votra') and m.tipo = 'entrada') x \\gset
select gen_random_uuid() as tok1 \\gset
select gen_random_uuid() as tok2 \\gset
select gen_random_uuid() as tok3 \\gset
select gen_random_uuid() as tok4 \\gset
`;

const COMO_API = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";
const sesion = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
`;
const cant = (v, sub) => `coalesce((select cantidad from retail.stock where variante_id = :'${v}' and ubicacion_id = :'tru' and sububicacion_id = :'${sub}'), 0)`;
/** La foto de las 3 tallas: almacén/piso/cuarentena de cada una. */
const FOTO = `concat_ws(' ', ${["v28", "v30", "v32"].map((v) => `${cant(v, "alm")} || '/' || ${cant(v, "piso")} || '/' || ${cant(v, "cua")}`).join(", ")})`;
/** Reporta la 28 desde el almacén como el líder y guarda el id en :did. */
const REPORTE_28 = `${sesion(FELIPE)}${COMO_API}select pg_temp.reportar(:'v28', 1, 'almacen', :'tok1') as rep \\gset
${COMO_POSTGRES}select (:'rep')::jsonb -> 'res' ->> 'id' as did \\gset
`;

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle = "") {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 2000).replace(/\n/g, "\n    ")}`);
  }
}
function caso(nombre, sql, verificar) {
  const r = correr(sql);
  if (!r.ok) return esperar(nombre, false, r.mensaje);
  let ok = false;
  try {
    ok = typeof verificar === "string" ? r.lineas[r.lineas.length - 1] === verificar : !!verificar(r.lineas);
  } catch {
    ok = false;
  }
  esperar(nombre, ok, typeof verificar === "string" ? `esperaba «${verificar}», salió:\n${r.lineas.join("\n")}` : r.lineas.join("\n"));
}
const json = (linea) => JSON.parse(linea);
const error = (linea, hint, estado = "P0001") => {
  const j = json(linea);
  return j.ok === false && j.estado === estado && j.hint === hint;
};

// C1 · Forma
caso(
  "C1 · una sola versión de cada función, con su firma",
  `select string_agg(proname || '(' || pg_get_function_identity_arguments(oid) || ')', ';' order by proname)
     from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('corregir_prenda_danada', 'devolver_danada_sin_dano');`,
  "corregir_prenda_danada(p_id uuid, p_variante_id uuid, p_desde text, p_token uuid);devolver_danada_sin_dano(p_id uuid, p_nota text, p_token uuid)"
);
caso(
  "C1 · anon no, authenticated sí; security definer con el search_path de la casa",
  `select string_agg(concat_ws(',', has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
                    coalesce(p.proconfig::text like '%search_path=retail, public, extensions%', false), p.prosecdef), ';' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('corregir_prenda_danada', 'devolver_danada_sin_dano');`,
  "f,t,t,t;f,t,t,t"
);

// C2 · El caso de Trujillo
caso(
  "C2 · antes: 28 y 30 en el almacén; reportar la 28 la deja en la cuarentena",
  `${COMO_POSTGRES}select ${FOTO};\n${REPORTE_28}select ${FOTO};`,
  (l) => l[l.length - 2] === "1/0/0 1/0/0 0/1/0" && l[l.length - 1] === "0/0/1 1/0/0 0/1/0"
);
caso(
  "C2 · corregir a la 30: la 28 vuelve al almacén, la 30 pasa a la cuarentena; la fila dice la 30 y que decía la 28",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.corregir(:'did', :'v30', 'almacen', :'tok2') as r \\gset
${COMO_POSTGRES}select (:'r')::jsonb ->> 'ok';
select ${FOTO};
select (variante_id = :'v30')::text || ',' || (corregida_de_variante_id = :'v28')::text || ',' || (corregida_en is not null)::text || ',' || (corregida_por is not null)::text || ',' || estado || ',' || tipo_dano
  from retail.prendas_danadas where id = :'did';`,
  (l) => l[l.length - 3] === "true" && l[l.length - 2] === "1/0/0 0/0/1 0/1/0" && l[l.length - 1] === "true,true,true,true,en_cuarentena,mancha"
);
caso(
  "C2 · son dos traslados internos con su nota, nunca un ajuste, y la entrada nueva es la de la fila",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.corregir(:'did', :'v30', 'almacen', :'tok2') as r \\gset
${COMO_POSTGRES}select string_agg(m.tipo || ':' || coalesce(so.tipo, '') || '>' || coalesce(sd.tipo, '') || ':' || (m.nota like 'Reportada por error%')::text, ';' order by m.created_at, m.variante_id = :'v28' desc)
  from retail.movimientos m left join retail.sububicaciones so on so.id = m.sububicacion_id left join retail.sububicaciones sd on sd.id = m.sububicacion_destino_id
 where m.variante_id in (:'v28', :'v30') and m.motivo = 'movimiento_interno' and m.sububicacion_id = :'cua' or (m.variante_id = :'v30' and m.sububicacion_destino_id = :'cua');
select (movimiento_entrada_id = ((:'r')::jsonb -> 'res' ->> 'movimiento_entrada_id')::uuid)::text from retail.prendas_danadas where id = :'did';
select count(*) from retail.movimientos where variante_id in (:'v28', :'v30') and tipo = 'ajuste';`,
  (l) => l[l.length - 3] === "traslado:cuarentena>almacen_tienda:true;traslado:almacen_tienda>cuarentena:false" && l[l.length - 2] === "true" && l[l.length - 1] === "0"
);

// C3 · Lo que no se corrige
caso(
  "C3 · otro modelo: se rechaza y no se mueve nada",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.corregir(:'did', :'votra', 'almacen', :'tok2');
${COMO_POSTGRES}select ${FOTO};`,
  (l) => error(l[l.length - 2], "correccion_otro_modelo") && l[l.length - 1] === "0/0/1 1/0/0 0/1/0"
);
caso(
  "C3 · la misma prenda: se rechaza",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.corregir(:'did', :'v28', 'almacen', :'tok2');`,
  (l) => error(l[l.length - 1], "correccion_misma_prenda")
);
caso(
  "C3 · la correcta no está donde se dice (la 32 está en el piso, no en el almacén): nada se mueve y lo dice",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.corregir(:'did', :'v32', 'almacen', :'tok2');
${COMO_POSTGRES}select ${FOTO};`,
  (l) => error(l[l.length - 2], "correccion_sin_alcance") && json(l[l.length - 2]).msg.includes("Revisa si está en el piso") && l[l.length - 1] === "0/0/1 1/0/0 0/1/0"
);
caso(
  "C3 · lo apartado para un cliente no cuenta como libre",
  `${REPORTE_28}${COMO_POSTGRES}select retail.apartar_stock(:'v30', :'tru', 1, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 3, null, :'alm', null) as _ap \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.corregir(:'did', :'v30', 'almacen', :'tok2');`,
  (l) => error(l[l.length - 1], "correccion_sin_alcance")
);
caso(
  "C3 · sin el módulo Existencias: 42501 y nada cambia",
  `${REPORTE_28}${COMO_POSTGRES}delete from retail.rol_modulos where modulo = 'existencias';
${sesion(MICAELA)}${COMO_API}select pg_temp.corregir(:'did', :'v30', 'almacen', :'tok2');
${COMO_POSTGRES}select ${FOTO};`,
  (l) => error(l[l.length - 2], "correccion_sin_modulo", "42501") && l[l.length - 1] === "0/0/1 1/0/0 0/1/0"
);
caso(
  "C3 · una ya resuelta (se botó) no se corrige",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.botar(:'did') as _b \\gset
select pg_temp.corregir(:'did', :'v30', 'almacen', :'tok2');`,
  (l) => error(l[l.length - 1], "correccion_ya_resuelta")
);
caso(
  "C3 · una que no se reportó en la tienda (entró directo a la cuarentena) no se corrige",
  `${COMO_POSTGRES}insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v28', :'tru', :'cua', 'entrada', 1, 'recepcion') returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m') as _a \\gset
insert into retail.prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte) values (:'v28', :'tru', 1, :'m', 'Llegó manchada') returning id as did \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.corregir(:'did', :'v30', 'almacen', :'tok2');`,
  (l) => error(l[l.length - 1], "danada_no_se_corrige")
);

// C4 · Reintento
caso(
  "C4 · la misma marca con los mismos datos: ya_registrada, sin mover más",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.corregir(:'did', :'v30', 'almacen', :'tok2') as _r1 \\gset
${COMO_POSTGRES}select count(*) as n1 from retail.movimientos \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.corregir(:'did', :'v30', 'almacen', :'tok2') -> 'res' ->> 'ya_registrada';
${COMO_POSTGRES}select (count(*) = :n1)::text from retail.movimientos;
select ${FOTO};`,
  (l) => l[l.length - 3] === "true" && l[l.length - 2] === "true" && l[l.length - 1] === "1/0/0 0/0/1 0/1/0"
);
caso(
  "C4 · la misma marca con otros datos se rechaza",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.corregir(:'did', :'v30', 'almacen', :'tok2') as _r1 \\gset
select pg_temp.corregir(:'did', :'v32', 'piso', :'tok2');`,
  (l) => error(l[l.length - 1], "token_reusado")
);

// C5 · Dos correcciones seguidas
caso(
  "C5 · 28 → 30 → 32: cada una vuelve a su lugar (la 30 al almacén, la 32 sale del piso)",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.corregir(:'did', :'v30', 'almacen', :'tok2') as _r1 \\gset
select pg_temp.corregir(:'did', :'v32', 'piso', :'tok3') ->> 'ok';
${COMO_POSTGRES}select ${FOTO};
select (corregida_de_variante_id = :'v30')::text from retail.prendas_danadas where id = :'did';`,
  (l) => l[l.length - 3] === "true" && l[l.length - 2] === "1/0/0 1/0/0 0/0/1" && l[l.length - 1] === "true"
);

// N1 · «No estaba dañada»
caso(
  "N1 · vuelve al almacén de donde salió, estado no_estaba_danada, un traslado interno con la nota, sin ajustes",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.sin_dano(:'did', null, :'tok4') ->> 'ok';
${COMO_POSTGRES}select ${FOTO};
select estado || ',' || (resuelto_en is not null)::text || ',' || (resuelto_por is not null)::text || ',' || coalesce(nota, '-') from retail.prendas_danadas where id = :'did';
select string_agg(m.tipo || ':' || so.tipo || '>' || sd.tipo, ';') from retail.prendas_danadas pd join retail.movimientos m on m.id = pd.movimiento_salida_id
  join retail.sububicaciones so on so.id = m.sububicacion_id join retail.sububicaciones sd on sd.id = m.sububicacion_destino_id where pd.id = :'did';`,
  (l) =>
    l[l.length - 4] === "true" &&
    l[l.length - 3] === "1/0/0 1/0/0 0/1/0" &&
    l[l.length - 2] === "no_estaba_danada,true,true,-" &&
    l[l.length - 1] === "traslado:cuarentena>almacen_tienda"
);
caso(
  "N1 · no es pérdida: la definición única de pérdida (fn_es_perdida) no cuenta su movimiento",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.sin_dano(:'did', 'La mancha era del probador', :'tok4') as _r \\gset
${COMO_POSTGRES}select retail.fn_es_perdida(m.tipo, m.motivo, m.cantidad)::text from retail.movimientos m join retail.prendas_danadas pd on pd.movimiento_salida_id = m.id where pd.id = :'did';`,
  "false"
);

// N2 · Lo que no
caso(
  "N2 · ya salió a arreglar: no se marca «No estaba dañada»",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.sacar(:'did') as _s \\gset
select pg_temp.sin_dano(:'did', null, :'tok4');`,
  (l) => error(l[l.length - 1], "sin_dano_en_arreglo")
);
caso(
  "N2 · una que no se reportó en la tienda: se rechaza",
  `${COMO_POSTGRES}insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v28', :'tru', :'cua', 'entrada', 1, 'recepcion') returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m') as _a \\gset
insert into retail.prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte) values (:'v28', :'tru', 1, :'m', 'Llegó manchada') returning id as did \\gset
${sesion(FELIPE)}${COMO_API}select pg_temp.sin_dano(:'did', null, :'tok4');`,
  (l) => error(l[l.length - 1], "danada_no_se_corrige")
);
caso(
  "N2 · sin el módulo Existencias: 42501 y nada cambia",
  `${REPORTE_28}${COMO_POSTGRES}delete from retail.rol_modulos where modulo = 'existencias';
${sesion(MICAELA)}${COMO_API}select pg_temp.sin_dano(:'did', null, :'tok4');
${COMO_POSTGRES}select estado from retail.prendas_danadas where id = :'did';`,
  (l) => error(l[l.length - 2], "sin_dano_sin_modulo", "42501") && l[l.length - 1] === "en_cuarentena"
);
caso(
  "N2 · reintento con la misma marca: ya_registrada; otra marca sobre la ya resuelta se rechaza",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.sin_dano(:'did', null, :'tok4') as _r1 \\gset
select pg_temp.sin_dano(:'did', null, :'tok4') -> 'res' ->> 'ya_registrada';
select pg_temp.sin_dano(:'did', null, :'tok3');`,
  (l) => l[l.length - 2] === "true" && error(l[l.length - 1], "sin_dano_ya_resuelta")
);
caso(
  "N2 · una nota de menos de 3 letras se rechaza",
  `${REPORTE_28}${sesion(FELIPE)}${COMO_API}select pg_temp.sin_dano(:'did', 'ok', :'tok4');`,
  (l) => error(l[l.length - 1], "sin_dano_nota_invalida")
);

console.log(`\n${total - fallos}/${total} casos en verde`);
process.exit(fallos ? 1 : 0);
