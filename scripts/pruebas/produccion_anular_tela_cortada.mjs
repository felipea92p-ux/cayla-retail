#!/usr/bin/env node
/**
 * Pruebas de «anular con tela cortada» (ADR-0614, actividad 10) — migración `20261105233000_anular_con_tela_cortada.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que la puerta de siempre frene una orden con tela cortada; que cada destino deje el libro de insumos como corresponde; que los avíos vuelvan siempre; y que una orden sin
 * cortar se siga anulando como siempre.
 *
 * USO: node scripts/pruebas/produccion_anular_tela_cortada.mjs [--contenedor supabase_db_x] [--base otra]
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
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261105233000_anular_con_tela_cortada.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;


const ENVOLTURAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return coalesce(nullif(v_hint, ''), v_estado || ':' || v_msg);
end;
$f$;
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb) returns text language plpgsql as $f$
declare v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, null) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK';
  end loop;
  return 'SIN_FILA';
end;
$f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Costura Prueba Por Pagar', 'maquila') returning id as maquila \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(*) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 1
  order by p.created_at limit 1 \\gset
select v.id as v1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.id limit 1 \\gset
update retail.variantes set costo = 8.00 where id = :'v1';
${como(FELIPE)}
`;

const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const COSTURA = FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_id: `:'maquila'`, tarifa_prenda: `'5.00'` });
const COSTURA_SIN_NOMBRE = FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_pendiente: "true", tarifa_prenda: `'5.00'` });
const APERTURA = `jsonb_build_object('ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '20')))`;
const L = (n) => `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '${n}'))`;
const VUELTA = (n) => `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'buenas', '${n}'))`;

/** Una orden con Corte hecho y la costura afuera: deja :oid y :f_cost. */
const ABRIR = (costura = COSTURA) => `select pg_temp.abre(${APERTURA}, jsonb_build_array(${TALLER("corte")}, ${costura}, ${TALLER("acabado")})) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
   select id as f_acab from retail.produccion_fases where produccion_id = :'oid' and clave = 'acabado' \\gset
   select retail.registrar_avance(:'f_corte', ${L(20)}, null) as _a \\gset`;
const SALE_Y_VUELVE = (n) => `select retail.registrar_salida(:'f_cost', ${L(n)}, null, null) as _s \\gset
   select retail.registrar_vuelta(:'f_cost', ${VUELTA(n)}, null, null) as _v \\gset`;
const CERRAR = `select retail.registrar_avance(:'f_acab', ${L(20)}, null) as _ac \\gset
   select retail.cerrar_produccion_con_motivo(:'oid', ${L(20)}, 0, 0, null, true, 'motivo de prueba') as _c \\gset`;
const FILA = `(select concat_ws('/', s.devengado, s.documentado, s.falta) from retail.fn_servicios_por_pagar() s where s.fase_id = :'f_cost')`;
/** Una factura, con su línea apuntando a la fase. */
const FACTURA = (subtotal, igv) => `insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, fecha_vencimiento, subtotal, igv, total)
     values (:'maquila', 'factura', 'F001', '77', 'credito', retail.fn_hoy_lima() + 7, ${subtotal}, ${igv}, ${subtotal + igv}) returning id as comp \\gset
   insert into retail.comprobantes_produccion_items (comprobante_id, descripcion, cantidad, costo_unitario, fase_id) values (:'comp', 'Costura', 1, ${subtotal}, :'f_cost');`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  if (obtenido === esperado) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  }
}

const ESPINA = `jsonb_build_array(${TALLER("corte")}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const ABRE = (id) => `select pg_temp.abre(${APERTURA}, ${ESPINA}) as r \\gset
   select id as ${id} from pg_temp.ultima \\gset`;
/** Tela con 100 m, un avío con 50, y la orden :oid consumió 30 m y 10 unidades. */
const INSUMOS = `insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('AT-T', 'Tela anular prueba', 'tela', 'metro') returning id as tela \\gset
   insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('AT-A', 'Botón anular prueba', 'avio', 'unidad') returning id as avio \\gset
   select retail.recibir_insumo(:'tela', :'taller', 100::numeric, 500::numeric, p_origen => 'saldo_inicial') as _t \\gset
   select retail.recibir_insumo(:'avio', :'taller', 50::numeric, 25::numeric, p_origen => 'saldo_inicial') as _a \\gset
   select id as lote_t from retail.insumo_lotes where insumo_id = :'tela' \\gset
   select id as lote_a from retail.insumo_lotes where insumo_id = :'avio' \\gset`;
const CONSUME = `insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id) values (:'tela', :'lote_t', :'taller', 'consumo', 30, 5, :'oid'), (:'avio', :'lote_a', :'taller', 'consumo', 10, 0.5, :'oid');
   select retail.fn_recalcular_costo_insumos_produccion(:'oid') as _c \\gset`;
const CORTA = `select retail.registrar_avance((select id from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte'), ${L(20)}, null) as _av \\gset`;
const SALDO = (ins) => `(select sum(case m.tipo when 'compra' then m.cantidad when 'devolucion' then m.cantidad when 'consumo' then -m.cantidad when 'merma' then -m.cantidad else m.cantidad end) from retail.movimientos_insumo m where m.insumo_id = :'${ins}')`;
const ANULA = (destino, motivo = "pedido cancelado", otra = "null") => `pg_temp.intento(format('select retail.anular_orden_con_tela_cortada(%L, %L, %L, ${otra === "null" ? "null" : "%L"})', :'oid', '${motivo}', '${destino}'${otra === "null" ? "" : `, :'${otra}'`}))`;
const SIEMPRE = `pg_temp.intento(format('select retail.anular_produccion(%L, %L)', :'oid', 'prueba'))`;
const ESTADO = (o = "oid") => `(select estado from retail.producciones where id = :'${o}')`;
const COSTO_TELA = (o = "oid") => `(select costo_tela from retail.producciones where id = :'${o}')`;
const LISTA = `${INSUMOS}
   ${ABRE("oid")}
   ${CONSUME}
   ${CORTA}`;

caso(
  "F1 la puerta de siempre frena una orden con tela cortada, y no queda nada escrito",
  `${LISTA}
   select ${SIEMPRE} as r \\gset
   select concat_ws(',', :'r', ${ESTADO()}, ${SALDO("tela")});`,
  "anular_con_tela_cortada,en_proceso,70.000"
);
caso(
  "F2 sin cortar, se anula como siempre y todo vuelve al estante",
  `${INSUMOS}
   ${ABRE("oid")}
   ${CONSUME}
   select ${SIEMPRE} as r \\gset
   select concat_ws(',', :'r', ${ESTADO()}, ${SALDO("tela")}, ${SALDO("avio")});`,
  "OK,anulada,100.000,50.000"
);
caso(
  "F3 cortado sin tela usada, también como siempre: no hay qué decidir",
  `${ABRE("oid")}
   ${CORTA}
   select ${SIEMPRE} as r \\gset
   select concat_ws(',', :'r', ${ESTADO()});`,
  "OK,anulada"
);
caso(
  "B1 botar: la tela no vuelve, su costo queda a la vista en la orden, y los avíos sí vuelven",
  `${LISTA}
   select ${ANULA("botar")} as r \\gset
   select concat_ws(',', :'r', ${ESTADO()}, ${SALDO("tela")}, ${SALDO("avio")}, ${COSTO_TELA()},
     (select nota like '%Lo cortado se bota: pedido cancelado%' from retail.producciones where id = :'oid'));`,
  "OK,anulada,70.000,50.000,150.00,t"
);
caso(
  "L1 liquidar: igual que botar, con su propia frase",
  `${LISTA}
   select ${ANULA("liquidar")} as r \\gset
   select concat_ws(',', :'r', ${SALDO("tela")}, (select nota like '%Lo cortado se liquida%' from retail.producciones where id = :'oid'));`,
  "OK,70.000,t"
);
caso(
  "O1 otra orden: la tela y su costo pasan a esa orden, el estante no cambia y la anulada queda en cero",
  `${LISTA}
   ${ABRE("otra")}
   select ${ANULA("otra_orden", "cambio de modelo", "otra")} as r \\gset
   select concat_ws(',', :'r', ${ESTADO()}, ${SALDO("tela")}, ${SALDO("avio")}, ${COSTO_TELA()}, ${COSTO_TELA("otra")},
     (select es_complemento from retail.produccion_insumos where produccion_id = :'otra' and insumo_id = :'tela'));`,
  "OK,anulada,70.000,50.000,0.00,150.00,t"
);
caso(
  "O2 no vale ella misma, ni una orden cerrada, ni sin elegir; y no queda nada escrito",
  `${LISTA}
   select ${ANULA("otra_orden", "x", "oid")} as a \\gset
   select pg_temp.intento(format('select retail.anular_orden_con_tela_cortada(%L, %L, %L, null)', :'oid', 'x', 'otra_orden')) as b \\gset
   select concat_ws(',', :'a', :'b', ${ESTADO()}, ${SALDO("tela")});`,
  "orden_destino_invalida,orden_destino_invalida,en_proceso,70.000"
);
caso(
  "E1 sin motivo o con un destino inventado se rechaza",
  `${LISTA}
   select ${ANULA("botar", "  ")} as a \\gset
   select ${ANULA("regalar")} as b \\gset
   select concat_ws(',', :'a', :'b', ${ESTADO()});`,
  "anular_sin_motivo,destino_invalido,en_proceso"
);
caso(
  "E2 una orden sin tela cortada no usa esta puerta",
  `${ABRE("oid")}
   select ${ANULA("botar")};`,
  "sin_tela_cortada"
);
caso(
  "E3 con prendas afuera sigue el rechazo de siempre",
  `${INSUMOS}
   select pg_temp.abre(${APERTURA}, jsonb_build_array(${TALLER("corte")}, ${COSTURA}, ${TALLER("acabado")})) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   ${CONSUME}
   ${CORTA}
   select retail.registrar_salida((select id from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura'), ${L(5)}, null, null) as _s \\gset
   select ${ANULA("botar")};`,
  "anular_con_prendas_afuera"
);
caso(
  "S1 después de anular con destino, la puerta de siempre vuelve a frenar a otra orden en la misma sesión",
  `${LISTA}
   select ${ANULA("botar")} as a \\gset
   select concat_ws(',', :'a', coalesce(current_setting('retail.anular_tela_decidida', true), ''));`,
  "OK,off"
);
caso(
  "M1 la migración se vuelve a cargar sin error; la cuenta la llama, quien no entró no",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws(',', has_function_privilege('authenticated', 'retail.anular_orden_con_tela_cortada(uuid,text,text,uuid)', 'execute'), has_function_privilege('anon', 'retail.anular_orden_con_tela_cortada(uuid,text,text,uuid)', 'execute'));`,
  "t,f"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR}, base: ${BASE})`);
process.exit(fallas ? 1 : 0);
