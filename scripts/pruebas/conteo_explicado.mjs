#!/usr/bin/env node
/**
 * Prueba de `20261107001000_conteo_cruces_y_vendidas_sin_registrar.sql` — lo que falta en un conteo no siempre es merma.
 *
 * QUÉ CUBRE
 *   · LA PRENDA CRUZADA: un faltante y un sobrante de conteo del mismo modelo, sede y día no son merma ni sobrante; solo su
 *     diferencia de costo se asienta (sobrante_cruce / merma_cruce).
 *   · LA VENDIDA SIN REGISTRAR: un faltante que coincide con una venta sin prenda cerrada (misma sede, categoría, talla y color,
 *     vendida ANTES del conteo) deja de ser merma; solo se ajusta el costo de venta a lo real (691 | 201 por real − estimado).
 *   · Lo que no se explica sigue igual: un faltante sin pareja es merma; una venta POSTERIOR al conteo no lo explica.
 *   · Todo asiento cuadra, el emparejamiento no depende del rango pedido, la comprobación de la 201 no gana nada «sin explicar»,
 *     nadie de afuera llama a las funciones internas y pegar la migración dos veces no cambia nada.
 *
 * LA ESCENA es la del Balance (`balance.mjs`, marzo de 2024 con su arranque) más un modelo propio con dos variantes:
 *   VA (talla 1, color 1) cuesta 40 · VB (talla 2, color 1) cuesta 50. Entran 5 de cada una por carga inicial el 2-mar.
 *   20-mar 15:00  conteo: falta 1 VA y sobra 1 VB                → cruce: no es merma ni sobrante; +10 (50 − 40) a la 201.
 *   21-mar        conteo: falta 1 VA                              → merma de 40 (sin pareja).
 *   22-mar        venta sin prenda (talla 2, color 1), estimado 30, cerrada sin prenda.
 *   23-mar        conteo: falta 1 VB                              → vendida sin registrar: no es merma; 691 +20 (50 − 30).
 *   24-mar        conteo: falta 1 VA                              → merma de 40: la venta de talla 1 es del 25, DESPUÉS.
 *   25-mar        venta sin prenda (talla 1, color 1), estimado 30, cerrada sin prenda.
 *
 * USO
 *   pnpm pruebas:conteo-explicado    → con las migraciones ya aplicadas en el local
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESCENA, FELIPE, psql } from "./balance.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261107001000_conteo_cruces_y_vendidas_sin_registrar.sql"), "utf8");

function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1500)}`);
  }
}
function verificar(titulo, r, esperados) {
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
  for (const caso of esperados)
    esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-900) });
}
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

// Lo que ya había en la base que aparece en conteos (otras escenas, otras sesiones) no debe tocar estas cifras: cada caso
// filtra por los movimientos de la escena.
const MUNDO = `
${ESCENA}
-- Los sobrantes también asientan desde siempre en este mundo de 2024 (en producción, desde el 1-nov-2026).
update retail.parametros_finanzas set sobrantes_asientan_desde = '2000-01-01' where id;
-- La 201 de la comprobación antes de esta escena: lo que quede «sin explicar» no puede crecer.
select coalesce((select sum((c ->> 'monto')::numeric) from retail.fn_conciliacion_contable('2024-03-31'), jsonb_array_elements(causas) c
                  where clave = '201' and c ->> 'clave' = 'sin_explicar'), 0) as sin_explicar0 \\gset
select id as cat from retail.categorias order by created_at limit 1 \\gset
select id as t1 from retail.tallas order by id limit 1 \\gset
select id as t2 from retail.tallas order by id offset 1 limit 1 \\gset
select codigo as c1 from retail.colores order by codigo limit 1 \\gset
insert into retail.productos (id, referencia, marca_id, proveedor_id, categoria_id) values (pg_temp.k('PX'), 'CONTEO-EXPLICADO', :'marca', :'prov', :'cat');
insert into retail.variantes (id, producto_id, precio, costo, talla_id, color_codigo) values
  (pg_temp.k('VA'), pg_temp.k('PX'), 100, 40, :'t1', :'c1'),
  (pg_temp.k('VB'), pg_temp.k('PX'), 100, 50, :'t2', :'c1');
select pg_temp.entrada_con_costo('CIa', pg_temp.k('VA'), :'tru', 5, 40, 'carga_inicial', '2024-03-02 09:00-05');
select pg_temp.entrada_con_costo('CIb', pg_temp.k('VB'), :'tru', 5, 50, 'carga_inicial', '2024-03-02 09:00-05');
-- El cruce del 20.
select pg_temp.mov('XF', pg_temp.k('VA'), :'tru', 'ajuste', -1, 'conteo_fisico', '2024-03-20 15:00-05') as _3 \\gset
select pg_temp.mov('XS', pg_temp.k('VB'), :'tru', 'ajuste', 1, 'conteo_fisico', '2024-03-20 15:00-05') as _4 \\gset
-- La merma de verdad del 21.
select pg_temp.mov('MF', pg_temp.k('VA'), :'tru', 'ajuste', -1, 'conteo_fisico', '2024-03-21 15:00-05') as _5 \\gset
-- Las dos ventas sin prenda (cerradas sin prenda; el cierre de la cola no importa aquí: sin llaves foráneas).
set local session_replication_role = replica;
insert into retail.ventas (id, ubicacion_id, caja_id, estado, created_at) values
  (pg_temp.k('S1'), :'tru', pg_temp.k('C1'), 'completada', '2024-03-22 10:00-05'),
  (pg_temp.k('S2'), :'tru', pg_temp.k('C1'), 'completada', '2024-03-25 10:00-05');
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario) values
  (pg_temp.k('S1i'), pg_temp.k('S1'), '22222222-2222-4222-8222-222222222222', 1, 100, 0, 30),
  (pg_temp.k('S2i'), pg_temp.k('S2'), '22222222-2222-4222-8222-222222222222', 1, 100, 0, 30);
insert into retail.venta_pagos (venta_id, metodo, monto) values (pg_temp.k('S1'), 'yape', 100), (pg_temp.k('S2'), 'yape', 100);
insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, vendido_en, estado, cierre_id) values
  (pg_temp.k('S1i'), :'tru', 'Prenda de la escena', :'cat', :'t2', :'c1', 100, '2024-03-22 10:00-05', 'cerrada_sin_prenda', gen_random_uuid()),
  (pg_temp.k('S2i'), :'tru', 'Prenda de la escena', :'cat', :'t1', :'c1', 100, '2024-03-25 10:00-05', 'cerrada_sin_prenda', gen_random_uuid());
set local session_replication_role = origin;
-- La vendida sin registrar del 23 y el faltante del 24 (su venta es del 25).
select pg_temp.mov('VF', pg_temp.k('VB'), :'tru', 'ajuste', -1, 'conteo_fisico', '2024-03-23 15:00-05') as _6 \\gset
select pg_temp.mov('TF', pg_temp.k('VA'), :'tru', 'ajuste', -1, 'conteo_fisico', '2024-03-24 15:00-05') as _7 \\gset
create temp table d as select * from retail.fn_asientos('2024-03-01', '2024-03-31');
`;

const CASOS_CRUCE = `
select 'C1 la prenda cruzada no es merma', (select count(*) = 0 from d where regla like 'merma%' and regla <> 'merma_cruce' and origen_id = pg_temp.k('XF'));
select 'C2 ni la que apareció es sobrante', (select count(*) = 0 from d where regla = 'sobrante' and origen_id = pg_temp.k('XS'));
select 'C3 solo su diferencia (50 − 40 = 10) entra a la 201 contra 6959', (select sum(debe) filter (where cuenta = '201') = 10 and sum(haber) filter (where cuenta = '6959') = 10 and count(*) = 2
  from d where regla = 'sobrante_cruce' and asiento = 'conteo_cruce:' || pg_temp.k('XF') || ':' || pg_temp.k('XS'));
select 'C4 fn_conteo_explicado la marca como cruce de los dos lados', (select count(*) = 2 and bool_and(explicacion = 'cruce') from retail.fn_conteo_explicado() where movimiento_id in (pg_temp.k('XF'), pg_temp.k('XS')));
`;

const CASOS_MERMA = `
select 'M1 el faltante sin pareja sigue siendo merma de 40', (select sum(debe) = 40 from d where regla = 'merma_conteo' and cuenta = '6951' and origen_id = pg_temp.k('MF'));
select 'M2 una venta POSTERIOR al conteo no lo explica: sigue la merma de 40', (select sum(debe) = 40 from d where regla = 'merma_conteo' and cuenta = '6951' and origen_id = pg_temp.k('TF'));
select 'M3 ninguno de los dos aparece como explicado', (select count(*) = 0 from retail.fn_conteo_explicado() where movimiento_id in (pg_temp.k('MF'), pg_temp.k('TF')));
`;

const CASOS_VENDIDA = `
select 'V1 la vendida sin registrar no es merma', (select count(*) = 0 from d where regla like 'merma%' and origen_id = pg_temp.k('VF'));
select 'V2 solo se ajusta el costo de venta a lo real: 691 +20 (50 − 30) contra la 201', (select sum(debe) filter (where cuenta = '691') = 20 and sum(haber) filter (where cuenta = '201') = 20 and count(*) = 2
  from d where regla = 'venta_sin_registrar' and origen_id = pg_temp.k('VF'));
select 'V3 su pareja es la línea de la venta del 22', (select pareja_id = pg_temp.k('S1i') and costo_pareja = 30 from retail.fn_conteo_explicado() where movimiento_id = pg_temp.k('VF'));
select 'V4 la venta del 22 sigue sacando su estimado (30) en su día', (select sum(debe) filter (where cuenta = '691') = 30 from d where regla = 'venta' and origen_id = pg_temp.k('S1'));
`;

const CASOS_LIBRO = `
select 'L1 cada asiento cuadra', (select count(*) = 0 from retail.fn_asientos_descuadrados('2024-03-01', '2024-03-31'));
select 'L2 el emparejamiento no depende del rango: el 23 solo da lo mismo', (select sum(debe) filter (where cuenta = '691') = 20 from retail.fn_asientos('2024-03-23', '2024-03-23') where regla = 'venta_sin_registrar');
select 'L3 la comprobación de la 201 no gana nada «sin explicar»', (select coalesce(sum((c ->> 'monto')::numeric), 0) = :'sin_explicar0'::numeric
  from retail.fn_conciliacion_contable('2024-03-31'), jsonb_array_elements(causas) c where clave = '201' and c ->> 'clave' = 'sin_explicar');
select 'L4 la causa venta_sin_prenda ya no cuenta la venta ubicada (solo la del 25: −30)', (select (c ->> 'monto')::numeric = -30 from retail.fn_conciliacion_contable('2024-03-31'), jsonb_array_elements(causas) c
  where clave = '201' and c ->> 'clave' = 'venta_sin_prenda');
`;

const CASOS_PERMISOS = `
select 'P1 nadie de afuera llama a las funciones internas', (select not has_function_privilege('authenticated', 'retail.fn_conteo_explicado()', 'execute')
  and not has_function_privilege('anon', 'retail.fn_conteo_explicado()', 'execute')
  and not has_function_privilege('authenticated', 'retail.fn_asientos_conteo_explicado(date,date,boolean,uuid[])', 'execute'));
`;

const CASOS_REPEGAR = `
create temp table antes as select pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure) a,
  pg_get_functiondef('retail.fn_bal_causas_mercaderia(date,date)'::regprocedure) b;
${MIGRACION}
select 'R1 pegarla dos veces no cambia el diario ni la comprobación', (select a = pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure)
  and b = pg_get_functiondef('retail.fn_bal_causas_mercaderia(date,date)'::regprocedure) from antes);
`;

function main() {
  console.log("Conteo explicado · prendas cruzadas y vendidas sin registrar (20261107001000)\n");
  const base = `${MUNDO}\n${cambiaA(FELIPE)}`;
  verificar("La prenda cruzada", correr(base + CASOS_CRUCE), casosDe(CASOS_CRUCE));
  verificar("Lo que sigue siendo merma", correr(base + CASOS_MERMA), casosDe(CASOS_MERMA));
  verificar("La vendida sin registrar", correr(base + CASOS_VENDIDA), casosDe(CASOS_VENDIDA));
  verificar("El libro", correr(base + CASOS_LIBRO), casosDe(CASOS_LIBRO));
  verificar("Permisos", correr(base + CASOS_PERMISOS), casosDe(CASOS_PERMISOS));
  verificar("Pegar dos veces", correr(base + CASOS_REPEGAR), casosDe(CASOS_REPEGAR));
  console.log(`\n${casos - fallos}/${casos} casos en verde`);
  if (fallos) process.exit(1);
}
main();
