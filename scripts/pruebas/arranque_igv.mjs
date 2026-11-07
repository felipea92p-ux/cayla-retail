#!/usr/bin/env node
/**
 * Prueba de `20261107035000_arranque_igv_contra_el_credito.sql` (ADR-0620): el arranque del Balance resta los 62,035 de saldo a favor
 * contra los 20,157 de IGV por pagar.
 *
 * QUÉ PROMETE
 *   · Agrega dos correcciones con reemplaza_id y motivo: 4011 debe 41,878.00 y 50 haber 201,758.78. Debe = haber = 224,321.08.
 *   · El Balance muestra la 4011 como activo y el patrimonio sube de 110,423.63 a 172,458.63. Si las ventas gastan el crédito, vuelve a pasivo.
 *   · La fila 4011 de la Comprobación conserva diferencia y estado: el arranque está en sus dos lados.
 *   · Impuestos no cambia ni una fila: el crédito no se cuenta dos veces.
 *   · La propuesta devuelve la 4011 una sola vez, en −41,878.00.
 *   · Repetirla no agrega filas. Con otros saldos u otro saldo a favor, avisa y no toca nada; sin arranque, tampoco.
 *   · Si el arranque no cuadra después de corregir, se niega con error.
 *   · El DOWN de su comentario devuelve las cifras de antes.
 *
 * LOS NÚMEROS ESPERADOS ESTÁN CALCULADOS A MANO. Debe de la escena: 182,443.08 (la foto del arranque de producción del 2026-11-07).
 *
 * CÓMO. Cada escena en su transacción con ROLLBACK (la base la comparten otras sesiones): vacía `saldos_iniciales`, arma el arranque y
 * corre el archivo de la migración tal como se pega. Sesión simulada con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:arranque-igv
 *   RETAIL_CONTENEDOR_PG=<contenedor> pnpm pruebas:arranque-igv   → contra otra pila local
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261107035000_arranque_igv_contra_el_credito.sql"), "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);
function verificar(titulo, sql) {
  const r = correr(sql);
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  const lineas = new Map(
    r.salida
      .split("\n")
      .filter((l) => l.includes("|"))
      .map((l) => {
        const i = l.lastIndexOf("|");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
  for (const caso of casosDe(sql)) {
    esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-600) });
  }
}

/** El arranque vigente de producción al 2026-11-07. `igv` y `capital` se cambian para probar las guardas; `sobra` lo descuadra. */
const arranque = ({ fecha = "2026-11-01", igv = 20157, capital = 139723.78, sobra = 0 } = {}) => `
insert into retail.saldos_iniciales (fecha, cuenta, debe, haber, origen, registrado_por) values
  ('${fecha}', '101',  2682.44 + ${sobra}, 0, 'sistema', :'felipe'), ('${fecha}', '104',  5305.24, 0, 'sistema', :'felipe'), ('${fecha}', '1413', 5700, 0, 'sistema', :'felipe'),
  ('${fecha}', '201', 82168.11, 0, 'sistema', :'felipe'), ('${fecha}', '231', 1238.93, 0, 'manual', :'felipe'), ('${fecha}', '241', 197.93, 0, 'manual', :'felipe'),
  ('${fecha}', '332', 581.70, 0, 'sistema', :'felipe'), ('${fecha}', '333', 15327.10, 0, 'sistema', :'felipe'), ('${fecha}', '335', 920, 0, 'sistema', :'felipe'),
  ('${fecha}', '336', 39021.48, 0, 'sistema', :'felipe'), ('${fecha}', '591', 29300.15, 0, 'manual', :'felipe'),
  ('${fecha}', '122', 0, 11.78, 'sistema', :'felipe'), ('${fecha}', '391', 0, 11979.45, 'sistema', :'felipe'), ('${fecha}', '41', 0, 10571.07, 'manual', :'felipe'),
  ('${fecha}', '4011', 0, ${igv}, 'manual', :'felipe'), ('${fecha}', '50', 0, ${capital}, 'manual', :'felipe');
`;
const saldoFavor = (valor = 62035, desde = "2026-10-01") => `
insert into retail.parametros_tributarios (nombre, vigente_desde, valor, nota) values ('saldo_favor_igv', '${desde}', ${valor}, 'Escena de la prueba');
`;

const BASE = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
update retail.parametros_finanzas set inicio_finanzas = null where id;
truncate retail.saldos_iniciales;
select p.id as felipe from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select v.id as va from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' order by v.id limit 1 \\gset
create function pg_temp.vender(p_ubic uuid, p_cuando timestamptz, p_var uuid, p_precio numeric) returns void language plpgsql as $f$
declare v_venta uuid := gen_random_uuid();
begin
  insert into retail.ventas (id, ubicacion_id, estado, created_at) values (v_venta, p_ubic, 'completada', p_cuando);
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario) values (v_venta, p_var, 1, p_precio, 0, 40);
  insert into retail.venta_pagos (venta_id, metodo, monto) values (v_venta, 'efectivo', p_precio);
end $f$;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  return sqlerrm;
end $f$;
`;

// Una venta de 118 el 2-nov, sin comprobante: el diario tiene 18 de IGV e Impuestos no. Así la fila 4011 no está en cero y el caso prueba algo.
const CORRE_BIEN = `
${BASE}
${saldoFavor()}
${arranque()}
select pg_temp.vender(:'tru', '2026-11-02 12:00-05', :'va', 118);
select id as igv_viejo from retail.saldos_iniciales where cuenta = '4011' \\gset
select id as cap_viejo from retail.saldos_iniciales where cuenta = '50' \\gset
create temp table bal_antes as select * from retail.fn_balance_general('2026-10-31');
create temp table con_antes as select * from retail.fn_conciliacion_contable('2026-11-05');
create temp table imp_antes as select * from retail.fn_impuestos_igv_meses('2026-10-01', '2026-11-30');
select 'A0 la escena arranca con 20,157 por pagar y debe = haber = 182,443.08',
  (select sum(debe) = 182443.08 and sum(haber) = 182443.08 from retail.fn_saldos_iniciales_vigentes())
  and (select seccion = 'pasivo' and monto = 20157 from bal_antes where cuenta = '4011');

${MIGRACION}

set local request.jwt.claim.sub = '${FELIPE}';
create temp table v as select * from retail.fn_saldos_iniciales_vigentes();
create temp table bal as select * from retail.fn_balance_general('2026-10-31');
create temp table con as select * from retail.fn_conciliacion_contable('2026-11-05');
create temp table imp as select * from retail.fn_impuestos_igv_meses('2026-10-01', '2026-11-30');
create temp table prop as select * from retail.fn_saldos_iniciales_propuesta('2026-11-01');

select 'A1 agrega dos filas y no borra ninguna', (select count(*) = 18 from retail.saldos_iniciales);
select 'A2 la 4011 queda con 41,878.00 al debe y reemplaza a la de 20,157',
  (select s.debe = 41878 and s.haber = 0 and s.reemplaza_id = :'igv_viejo' and s.origen = 'manual' and s.registrado_por = :'felipe' and s.motivo like '%20261107035000%'
     from retail.saldos_iniciales s join v on v.id = s.id where s.cuenta = '4011');
select 'A3 la 50 queda en 201,758.78 y reemplaza a la de 139,723.78',
  (select s.debe = 0 and s.haber = 201758.78 and s.reemplaza_id = :'cap_viejo' and s.motivo like '%20261107035000%'
     from retail.saldos_iniciales s join v on v.id = s.id where s.cuenta = '50');
select 'A4 cuadra: debe = haber = 224,321.08', (select sum(debe) = 224321.08 and sum(haber) = 224321.08 from v);
select 'A5 las filas anteriores quedan a la vista como no vigentes',
  (select count(*) = 2 from retail.fn_saldos_iniciales() s where s.cuenta in ('4011', '50') and not s.vigente);
select 'A6 no toca otra cuenta', (select count(*) = 16 and count(*) filter (where cuenta = '591' and debe = 29300.15) = 1 from v);

select 'B1 el Balance muestra la 4011 como activo, sin deuda', (select count(*) = 1 and bool_and(seccion = 'activo' and monto = 41878) from bal where cuenta = '4011');
select 'B2 el capital es 201,758.78 y el patrimonio pasa de 110,423.63 a 172,458.63',
  (select monto = 201758.78 from bal where cuenta = '50')
  and (select sum(monto) = 110423.63 from bal_antes where seccion = 'patrimonio')
  and (select sum(monto) = 172458.63 from bal where seccion = 'patrimonio');
select 'B3 tiene = debe + patrimonio', (select sum(monto) filter (where seccion = 'activo') = sum(monto) filter (where seccion <> 'activo') from bal);
select 'B4 tiene sube 41,878 y debe baja 20,157',
  (select sum(monto) filter (where seccion = 'activo') from bal) = (select sum(monto) filter (where seccion = 'activo') + 41878 from bal_antes)
  and (select sum(monto) filter (where seccion = 'pasivo') from bal) = (select sum(monto) filter (where seccion = 'pasivo') - 20157 from bal_antes);

select 'C1 la fila 4011 de la Comprobación no estaba en cero: 18 de una venta sin comprobante', (select diferencia = 18 and estado = 'revisar' from con_antes where clave = '4011');
select 'C2 conserva diferencia y estado', (select c.diferencia = a.diferencia and c.estado = a.estado from con c join con_antes a using (clave) where clave = '4011');
select 'C3 sus dos lados bajan 62,035', (select c.diario = a.diario - 62035 and c.otro = a.otro - 62035 from con c join con_antes a using (clave) where clave = '4011');
select 'C4 ninguna otra fila de la Comprobación cambia de estado',
  not exists (select 1 from con c join con_antes a using (orden, clave) where c.estado <> a.estado);

select 'D1 Impuestos no cambia ni una fila: arranca en 62,035, una sola vez',
  not exists (select * from imp except select * from imp_antes) and not exists (select * from imp_antes except select * from imp)
  and (select saldo_anterior = 62035 from imp where mes = '2026-10-01');

select 'E1 la propuesta trae la 4011 una vez, en −41,878, sin sumar el saldo a favor',
  (select count(*) = 1 and bool_and(monto = -41878 and vigente = -41878 and origen = 'manual') from prop where cuenta = '4011');
select 'E2 la propuesta trae el capital vigente', (select monto = 201758.78 and vigente = 201758.78 from prop where cuenta = '50');

${MIGRACION}

select 'F1 repetirla no agrega filas', (select count(*) = 18 from retail.saldos_iniciales);

-- Una venta de 354,000 lleva 54,000 de IGV: gasta el crédito y la 4011 vuelve a ser deuda.
create temp table bal_nov as select * from retail.fn_balance_general('2026-11-05');
select pg_temp.vender(:'tru', '2026-11-03 12:00-05', :'va', 354000);
create temp table bal_gastado as select * from retail.fn_balance_general('2026-11-05');
select 'G1 mientras queda crédito sigue en activo', (select seccion = 'activo' from bal_nov where cuenta = '4011');
select 'G2 cuando las ventas lo gastan vuelve a pasivo',
  (select g.seccion = 'pasivo' and g.monto = 54000 - n.monto from bal_gastado g, bal_nov n where g.cuenta = '4011' and n.cuenta = '4011');
`;

const guarda = (titulo, escena) => `
${BASE}
${escena}
create temp table antes as select count(*) as n from retail.saldos_iniciales;
${MIGRACION}
select '${titulo}', (select count(*) from retail.saldos_iniciales) = (select n from antes);
`;

// Se quita la diferencia de la 4011 o de la 50 de otra cuenta, para que el arranque siga cuadrando y sea la guarda la que frene.
const GUARDAS = [
  guarda("H1 con otra 4011 no toca nada", `${saldoFavor()}\n${arranque({ igv: 20000, capital: 139880.78 })}`),
  guarda("H2 con otro capital no toca nada", `${saldoFavor()}\n${arranque({ capital: 139723.79 })}`),
  guarda("H3 con otro saldo a favor no toca nada", `${saldoFavor(60000)}\n${arranque()}`),
  guarda("H4 con el saldo a favor de otro mes no toca nada", `${saldoFavor(62035, "2026-11-01")}\n${arranque()}`),
  guarda("H5 sin saldo a favor no toca nada", arranque()),
  guarda("H6 sin arranque no toca nada", saldoFavor()),
  guarda("H7 con otro día de arranque no toca nada", `${saldoFavor()}\n${arranque({ fecha: "2026-10-01" })}`),
];

// Lo vigente ya no cuadraba por 5: la migración no lo arregla ni lo esconde.
const NO_CUADRA = `
${BASE}
${saldoFavor()}
${arranque({ sobra: 5 })}
${MIGRACION}
`;

const DOWN = `
${BASE}
${saldoFavor()}
${arranque()}
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.registrar_saldo_inicial('2026-11-01', '[{"cuenta":"4011","monto":20157},{"cuenta":"50","monto":139723.78}]'::jsonb, 'Deshacer la migración 20261107035000') as filas \\gset
create temp table v as select * from retail.fn_saldos_iniciales_vigentes();
select 'I1 el DOWN agrega dos filas', :filas = 2;
select 'I2 el DOWN deja 20,157 al haber y 139,723.78',
  (select debe = 0 and haber = 20157 from v where cuenta = '4011') and (select debe = 0 and haber = 139723.78 from v where cuenta = '50');
select 'I3 el DOWN cuadra', (select sum(debe) = 182443.08 and sum(haber) = 182443.08 from v);
`;

verificar("La corrección", CORRE_BIEN);
for (const g of GUARDAS) verificar("Las guardas", g);
verificar("El DOWN", DOWN);

const r = correr(NO_CUADRA);
esperar("J1 si el arranque no cuadra después de corregir, se niega", !r.ok && r.mensaje.includes("no cuadran después de corregir"), r);

console.log(`\n${casos - fallos} de ${casos}`);
process.exit(fallos ? 1 : 0);
