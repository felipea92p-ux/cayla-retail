#!/usr/bin/env node
/**
 * Prueba de la foto del diario (ADR-0633). Parte 1 (`20261109180000_foto_del_diario_tomar.sql`): tomar la foto de un mes.
 *
 * QUÉ CUBRE
 *   · LA FOTO ES EL DIARIO: las líneas que guarda `tomar_foto_diario(mes)` son EXACTAMENTE las de `fn_asientos(mes)` que ve el líder
 *     (las mismas filas, en las dos direcciones), con ventas reales del mes pasado; y su huella es la de esas líneas.
 *   · SOLO EL TRABAJO PROGRAMADO: una persona (aunque sea líder) no puede tomarla; el mes en curso no tiene foto.
 *   · REHACER reemplaza: tomarla dos veces deja las mismas líneas, no el doble.
 *   · PEGAR DOS VECES no cambia nada.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK, y pega la migración adentro (si la base ya la tiene, no hace nada).
 *
 * USO
 *   pnpm pruebas:foto-diario
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const a = process.argv.indexOf("--contenedor");
const CONTENEDOR = a > 0 ? process.argv[a + 1] : "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACIONES = ["20261109180000_foto_del_diario_tomar.sql"].map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8")).join("\n");

function correr(sql) {
  try {
    const salida = execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
      input: `${sql}\nrollback;\n`,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let casos = 0;
function verificar(titulo, r, esperados) {
  const lineas = r.ok ? Object.fromEntries(r.salida.split("\n").filter((l) => l.includes("|")).map((l) => [l.slice(0, l.indexOf("|")), l.slice(l.indexOf("|") + 1)])) : {};
  for (const [caso, valor] of Object.entries(esperados)) {
    casos++;
    const ok = r.ok && (typeof valor === "function" ? valor(lineas[caso]) : lineas[caso] === valor);
    console.log(`${ok ? "✓" : "✗"} ${titulo}: ${caso}`);
    if (!ok) {
      fallos++;
      console.log(r.ok ? `    esperado ${typeof valor === "function" ? "(condición)" : valor}, salió ${lineas[caso]}` : `    ${r.mensaje.slice(0, 1500)}`);
    }
  }
}

// El aviso «tendría que haber fallado» lleva su propio código (XX999) para que un freno esperado no se lo trague.
const debeFallar = (nombre, sql, codigo) => `
do $$
begin
  ${sql};
  raise exception '${nombre}: tendría que haber fallado' using errcode = 'XX999';
exception when others then
  if sqlstate <> '${codigo}' then raise; end if;
end $$;
select '${nombre}|ok';`;

const comoLider = `set local request.jwt.claim.sub = '${FELIPE}'; set local request.jwt.claim.role = 'authenticated';`;
const comoServicio = `set local request.jwt.claim.sub = ''; set local request.jwt.claim.role = 'service_role';`;

// Tres ventas del mes pasado en Trujillo (dos medios), para que la foto tenga ventas, costo, IGV y cobros.
const venta = (nombre, dia, pagos) => {
  const total = pagos.reduce((x, [, m]) => x + m, 0);
  return `
update retail.variantes set precio = ${total} where id = :'v';
select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', ${total}, 'descuento_unitario', 0)),
  jsonb_build_array(${pagos.map(([m, monto]) => `jsonb_build_object('metodo', '${m}', 'monto', ${monto})`).join(", ")}),
  null, gen_random_uuid(), p_descuento_pct => 0) as ${nombre} \\gset
update retail.ventas set created_at = ((:'mes'::date + ${dia - 1}) + time '12:00') at time zone 'America/Lima' where id = :'${nombre}';
`;
};

const ESCENA = `
begin;
${comoLider}
${MIGRACIONES}
update retail.parametros_finanzas set inicio_finanzas = '2019-01-01';
select (date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date as mes \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = 'piso_venta');
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT98' when 'factura' then 'FT98' else serie end, siguiente_numero = 1 where ubicacion_id = :'tru' and tipo in ('boleta', 'factura');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'tru', retail.fn_sububicacion_por_defecto(:'tru', 'venta'), 'entrada', 50, 'colchón de prueba');
select count(*) as _st from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m where m.variante_id = :'v' and m.motivo = 'colchón de prueba' and m.created_at = now()) x \\gset
${venta("v1", 5, [["efectivo", 120]])}
${venta("v2", 12, [["tarjeta", 89.9]])}
${venta("v3", 20, [["efectivo", 50], ["yape", 30]])}
`;

const FIN = `(:'mes'::date + interval '1 month - 1 day')::date`;
const LINEAS_FOTO = `select fecha, ubicacion_id, asiento, regla, cuenta, debe, haber, origen_tabla, origen_id, glosa from retail.diario_foto_lineas where mes = :'mes'::date`;
const DIARIO_LIDER = `select fecha, ubicacion_id, asiento, regla, cuenta, debe, haber, origen_tabla, origen_id, glosa from retail.fn_asientos(:'mes'::date, ${FIN}, null)`;

verificar("la foto es el diario", correr(`${ESCENA}
${comoServicio}
select 'tomada|' || ((retail.tomar_foto_diario(:'mes') ->> 'lineas')::int > 0);
${comoLider}
create temp table lider as ${DIARIO_LIDER};
select 'ventas_en_el_diario|' || ((select count(*) from lider where regla ilike '%venta%') > 0);
select 'solo_en_la_foto|' || count(*) from ((${LINEAS_FOTO}) except all (select * from lider)) x;
select 'solo_en_el_diario|' || count(*) from ((select * from lider) except all (${LINEAS_FOTO})) x;
select 'cuenta_las_lineas|' || ((select lineas from retail.diario_fotos where mes = :'mes'::date) = (select count(*) from lider));
select 'huella|' || ((select huella from retail.diario_fotos where mes = :'mes'::date) =
  (select encode(sha256(convert_to(coalesce(string_agg(t, E'\\n' order by t), ''), 'UTF8')), 'hex')
     from (select retail.fn_diario_linea_texto(fecha, ubicacion_id, asiento, regla, cuenta, debe, haber, origen_tabla, origen_id, glosa) t from lider) z));
${comoServicio}
select retail.tomar_foto_diario(:'mes') as _otra \\gset
select 'rehacer_no_duplica|' || ((select count(*) from retail.diario_foto_lineas where mes = :'mes'::date) = (select count(*) from lider));
`), {
  tomada: "true",
  ventas_en_el_diario: "true",
  solo_en_la_foto: "0",
  solo_en_el_diario: "0",
  cuenta_las_lineas: "true",
  huella: "true",
  rehacer_no_duplica: "true",
});

verificar("solo el trabajo programado, solo meses que terminaron", correr(`${ESCENA}
${debeFallar("el_lider_no_la_toma", "perform retail.tomar_foto_diario((date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date)", "42501")}
${comoServicio}
${debeFallar("el_mes_en_curso_no", "perform retail.tomar_foto_diario(retail.fn_hoy_lima())", "P0001")}
select 'nadie_desde_la_web|' || (not has_function_privilege('authenticated', 'retail.tomar_foto_diario(date)', 'execute') and not has_function_privilege('anon', 'retail.tomar_foto_diario(date)', 'execute'));
`), { el_lider_no_la_toma: "ok", el_mes_en_curso_no: "ok", nadie_desde_la_web: "true" });

verificar("pegar dos veces", correr(`begin;
${MIGRACIONES}
create temp table antes as select md5(pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure)) a, md5(pg_get_functiondef('retail.fn_planilla_periodos(date,date)'::regprocedure)) p;
${MIGRACIONES}
select 'igual|' || (x.a = md5(pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure)) and x.p = md5(pg_get_functiondef('retail.fn_planilla_periodos(date,date)'::regprocedure))) from antes x;
`), { igual: "true" });

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
process.exit(fallos ? 1 : 0);
