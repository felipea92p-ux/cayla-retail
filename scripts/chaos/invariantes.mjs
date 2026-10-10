#!/usr/bin/env node
/**
 * Invariantes de la base — el detector de `/chaos`, no el razonamiento.
 *
 * EL PROBLEMA QUE RESUELVE. Un ataque de caos (doble clic en «Cobrar», dos cajeras vendiendo la última prenda, recargar a mitad de
 * un guardado) casi nunca tira la pantalla: lo que deja es un estado que NADIE ve —un stock que ya no cuadra con `movimientos`,
 * una venta cuyos pagos no suman, un comprobante duplicado—. «No se cayó» no prueba nada; hay que MIRAR LA BASE. Este script es
 * ese mirar: una batería de consultas de solo lectura, cada una con el nombre del estado imposible que busca (principio 2 de
 * CLAUDE.md: «si el inventario puede quedar en un estado imposible, el diseño está mal»).
 *
 * QUÉ ES UNA INVARIANTE AQUÍ. Un estado que el negocio declara imposible y que la base NO impide por sí sola (`docs/datos/01-INVARIANTES.md`
 * §2: «lo que solo sostiene la costumbre»). Lo que ya impide un `check` o un índice único no se vigila: el ataque recibe el error
 * de Postgres y listo. Lo valioso es lo que cruza tablas: stock contra movimientos, venta contra pagos, venta contra salidas.
 *
 * CÓMO SE USA CON UN ATAQUE (la «foto de violaciones», no la foto de datos de `estado.mjs`):
 *   1. `--guardar <nombre>`   antes del ataque: anota las violaciones que YA había (el seed y la historia traen algunas).
 *   2. el ataque.
 *   3. `--contra <nombre>`    después: solo cuenta las violaciones NUEVAS. Eso es lo que el ataque rompió.
 *
 * `--autoprueba` — EL DETECTOR TAMBIÉN SE PRUEBA. Un detector que siempre dice «limpio» es peor que ninguno: da calma falsa.
 * Por cada invariante, dentro de una transacción que SIEMPRE termina en ROLLBACK, se corrompe a propósito el dato que vigila y
 * se exige que el detector grite. Si no grita, la invariante está ciega y se dice. Si no hay un dato con qué probarla (tabla
 * vacía), se dice «sin datos»: nunca se cuenta como aprobada.
 *
 * QUÉ NO PROMETE. No arregla nada y no escribe nunca (el modo normal corre en `read only`; la autoprueba, en una transacción
 * revertida). No ve lo que el ERP guarda fuera de `retail` ni lo que vive solo en la pantalla. Una consulta que no pudo
 * evaluarse (la tabla no existe en esta base) sale como `error`, nunca como `limpia`. Solo habla con el contenedor LOCAL
 * (`CONTENEDOR_LOCAL`): no hay forma de apuntarlo a otra base, igual que `flujo-de-negocio/estado.mjs`.
 *
 * USO
 *   node scripts/chaos/invariantes.mjs [--solo INV-01,INV-02] [--json]
 *   node scripts/chaos/invariantes.mjs --guardar <nombre> [--reemplazar]
 *   node scripts/chaos/invariantes.mjs --contra <nombre> [--json]
 *   node scripts/chaos/invariantes.mjs --autoprueba [--solo INV-01]
 *   node scripts/chaos/invariantes.mjs --listar
 * Salida: 0 todo limpio · 1 hay violaciones (con `--contra`, nuevas) o una invariante ciega · 2 no se pudo mirar.
 * La foto vive en `.chaos/` (fuera de git: tiene filas de la base local y el repo es público).
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const DIR = join(RAIZ, ".chaos");
export const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const MAX = 64 * 1024 * 1024;

/**
 * Gravedad (la misma escala que el informe de `/chaos`, de peor a menos mala):
 *   1 estado imposible        inventario, dinero o comprobante que no cuadra
 *   2 dato malo en silencio   se guardó algo dudoso y nadie avisó (una sospecha de doble cobro, un movimiento sin autor)
 * Las gravedades 3 (pantalla caída) y 4 (error feo pero seguro) se ven en el navegador, no en la base.
 *
 * `nivel`: `cruzada` = la base NO lo impide (solo este script lo ve) · `sospecha` = heurística, puede ser legítima: se confirma mirando.
 * `sql`: devuelve UNA FILA POR VIOLACIÓN (vacío = limpia). `corrompe`: SQL que rompe a propósito el dato que vigila (solo para la
 * autoprueba, siempre revertido). `sinAutoprueba`: por qué no se puede corromper (se dice en voz alta).
 */
export const INVARIANTES = [
  {
    id: "INV-01",
    nombre: "stock_igual_a_movimientos",
    gravedad: 1,
    nivel: "cruzada",
    dice: "`stock` es un snapshot derivado: debe ser exactamente lo que sale de sumar `movimientos` (la misma cuenta de `retail.recalcular_stock()`), por prenda, sede y sububicación, en cantidad y en apartado (principio 4).",
    sql: `
with rec as (
  select variante_id, ubicacion_id, sububicacion_id, sum(c) as c, sum(a) as a from (
    select variante_id, ubicacion_id, sububicacion_id, cantidad as c, 0 as a from retail.movimientos where tipo in ('entrada','ajuste')
    union all select variante_id, ubicacion_id, sububicacion_id, -cantidad, 0 from retail.movimientos where tipo in ('salida','traslado')
    union all select variante_id, ubicacion_destino_id, sububicacion_destino_id, cantidad, 0 from retail.movimientos where tipo = 'traslado'
    union all select variante_id, ubicacion_id, sububicacion_id, 0, cantidad from retail.movimientos where tipo = 'apartado'
    union all select variante_id, ubicacion_id, sububicacion_id, 0, -cantidad from retail.movimientos where tipo = 'liberacion_apartado'
  ) t group by 1, 2, 3
)
select coalesce(r.variante_id, s.variante_id) as variante_id,
       coalesce(r.ubicacion_id, s.ubicacion_id) as ubicacion_id,
       coalesce(r.sububicacion_id, s.sububicacion_id) as sububicacion_id,
       coalesce(s.cantidad, 0) as stock, coalesce(r.c, 0) as segun_movimientos,
       coalesce(s.cantidad_apartada, 0) as apartado_stock, coalesce(r.a, 0) as apartado_movimientos
  from rec r
  full join retail.stock s on s.variante_id = r.variante_id and s.ubicacion_id = r.ubicacion_id
                          and s.sububicacion_id is not distinct from r.sububicacion_id
 where coalesce(s.cantidad, 0) <> coalesce(r.c, 0) or coalesce(s.cantidad_apartada, 0) <> coalesce(r.a, 0)`,
    corrompe: `update retail.stock set cantidad = cantidad + 1 where ctid = (select ctid from retail.stock limit 1);`,
  },
  {
    id: "INV-02",
    nombre: "venta_cuadra_con_sus_pagos",
    gravedad: 1,
    nivel: "cruzada",
    dice: "Una venta completada cobra exactamente lo que suman sus líneas: Σ `venta_items.subtotal` = Σ `venta_pagos.monto` (el redondeo es un pago más).",
    sql: `
select v.id as venta_id, v.ubicacion_id, round(coalesce(i.t, 0), 2) as lineas, round(coalesce(p.t, 0), 2) as pagos
  from retail.ventas v
  left join (select venta_id, sum(subtotal) as t from retail.venta_items group by 1) i on i.venta_id = v.id
  left join (select venta_id, sum(monto) as t from retail.venta_pagos group by 1) p on p.venta_id = v.id
 where v.estado = 'completada' and abs(coalesce(i.t, 0) - coalesce(p.t, 0)) > 0.011`,
    // `subtotal` es una columna generada (cantidad × (precio − descuento)): se rompe por el precio, no por ella.
    corrompe: `update retail.venta_items set precio_unitario = precio_unitario + 5 where ctid = (select ctid from retail.venta_items limit 1);`,
  },
  {
    id: "INV-03",
    nombre: "venta_descuenta_lo_que_vendio",
    gravedad: 1,
    nivel: "cruzada",
    dice: "Cada línea de una venta completada tiene salidas de stock por exactamente su cantidad: lo vendido y lo descontado no se separan (ni dobles ni faltantes).",
    sql: `
select i.id as venta_item_id, i.venta_id, i.variante_id, i.cantidad as vendido, coalesce(m.t, 0) as salido
  from retail.venta_items i
  join retail.ventas v on v.id = i.venta_id and v.estado = 'completada'
  left join (select venta_item_id, sum(cantidad) as t from retail.movimientos
              where tipo = 'salida' and venta_item_id is not null group by 1) m on m.venta_item_id = i.id
 where coalesce(m.t, 0) <> i.cantidad
   -- ADR-0375: una pieza de liquidación nunca estuvo en el stock, así que su línea no descuenta nada a propósito. Lo que la
   -- cuida es INV-13 (la pieza vendida cuadra con su línea), no esta.
   and not exists (select 1 from retail.piezas_liquidacion pl where pl.venta_item_id = i.id)`,
    corrompe: `update retail.venta_items set cantidad = cantidad + 1 where ctid = (select ctid from retail.venta_items limit 1);`,
  },
  {
    id: "INV-04",
    nombre: "venta_en_su_caja_y_su_hora",
    gravedad: 1,
    nivel: "cruzada",
    dice: "Toda venta cae en una caja de SU sede y dentro del tiempo en que esa caja estuvo abierta: nunca en la de otra sede ni en el día de ayer, ya contado y depositado.",
    sql: `
select v.id as venta_id, v.caja_id, v.ubicacion_id as sede_venta, c.ubicacion_id as sede_caja, v.created_at, c.abierta_en, c.cerrada_en
  from retail.ventas v
  left join retail.cajas c on c.id = v.caja_id
 where not coalesce(v.es_prueba, false)
   and (v.caja_id is null
        or c.ubicacion_id <> v.ubicacion_id
        or v.created_at < c.abierta_en - interval '2 seconds'
        or (c.cerrada_en is not null and v.created_at > c.cerrada_en + interval '2 seconds'))`,
    corrompe: `update retail.ventas set created_at = created_at - interval '400 days' where ctid = (select ctid from retail.ventas where caja_id is not null limit 1);`,
  },
  {
    id: "INV-05",
    nombre: "caja_cerrada_cuadra_su_diferencia",
    gravedad: 1,
    nivel: "cruzada",
    dice: "Una caja cerrada tiene fecha de cierre y monto contado, una abierta no tiene ninguno, y la diferencia es exactamente lo contado menos lo que el sistema esperaba.",
    sql: `
select id as caja_id, ubicacion_id, estado, cerrada_en, monto_cierre_sistema, monto_cierre_real, diferencia
  from retail.cajas
 where (estado = 'cerrada' and (cerrada_en is null or monto_cierre_real is null))
    or (estado = 'abierta' and (cerrada_en is not null or monto_cierre_real is not null))
    or (estado = 'cerrada' and monto_cierre_real is not null and monto_cierre_sistema is not null
        and abs(coalesce(diferencia, 0) - (monto_cierre_real - monto_cierre_sistema)) > 0.011)`,
    corrompe: `update retail.cajas set cerrada_en = null where ctid = (select ctid from retail.cajas where estado = 'cerrada' limit 1);`,
  },
  {
    id: "INV-06",
    nombre: "un_comprobante_por_venta",
    gravedad: 1,
    nivel: "cruzada",
    dice: "Una venta tiene a lo sumo un comprobante vivo (boleta o factura): dos significa que se cobró y se facturó dos veces. Los anulados y rechazados no cuentan; los anticipos de un apartado tampoco.",
    sql: `
select venta_id, count(*) as comprobantes, array_agg(serie || '-' || numero order by numero) as numeros
  from retail.comprobantes
 where venta_id is not null and tipo in ('boleta', 'factura')
   and estado not in ('anulado', 'rechazado') and not coalesce(es_anticipo, false)
 group by venta_id having count(*) > 1`,
    corrompe: `
create temp table _c on commit drop as select * from retail.comprobantes
 where venta_id is not null and tipo = 'boleta' and estado not in ('anulado', 'rechazado') and not coalesce(es_anticipo, false) limit 1;
update _c set id = gen_random_uuid(), numero = (select max(numero) + 1 from retail.comprobantes), token_cliente = gen_random_uuid();
insert into retail.comprobantes select * from _c;`,
  },
  {
    id: "INV-07",
    nombre: "comprobante_suma_lo_que_la_venta",
    gravedad: 1,
    nivel: "cruzada",
    dice: "El total de la boleta o factura es el de la venta que la originó: lo que SUNAT recibe es lo que la clienta pagó.",
    sql: `
select c.id as comprobante_id, c.venta_id, c.serie || '-' || c.numero as numero, c.total as comprobante, round(i.t, 2) as venta
  from retail.comprobantes c
  join (select venta_id, sum(subtotal) as t from retail.venta_items group by 1) i on i.venta_id = c.venta_id
 where c.tipo in ('boleta', 'factura') and c.estado not in ('anulado', 'rechazado')
   and not coalesce(c.es_anticipo, false) and coalesce(c.anticipo_deducido, 0) = 0
   and abs(c.total - i.t) > 0.011`,
    corrompe: `update retail.comprobantes set total = total + 5 where ctid = (select ctid from retail.comprobantes where tipo = 'boleta' and venta_id is not null and not coalesce(es_anticipo, false) limit 1);`,
  },
  {
    id: "INV-08",
    nombre: "recepcion_no_excede_el_envio",
    gravedad: 1,
    nivel: "cruzada",
    dice: "En un traslado, una sede no puede recibir de una prenda más de lo que se envió: sería stock que apareció sin salir de ninguna parte.",
    sql: `
select i.transferencia_id, i.variante_id, i.cantidad as enviado, coalesce(r.t, 0) as recibido
  from retail.transferencia_items i
  join (select transferencia_id, variante_id, sum(cantidad_recibida) as t from retail.transferencia_recepciones group by 1, 2) r
    on r.transferencia_id = i.transferencia_id and r.variante_id = i.variante_id
 where r.t > i.cantidad`,
    corrompe: `update retail.transferencia_recepciones set cantidad_recibida = cantidad_recibida + 1000 where ctid = (select ctid from retail.transferencia_recepciones limit 1);`,
  },
  {
    id: "INV-09",
    nombre: "asientos_cuadran",
    gravedad: 1,
    nivel: "cruzada",
    dice: "El libro cuadra: ningún asiento tiene Σdebe distinto de Σhaber (usa `retail.fn_asientos_descuadrados`, la misma función que Finanzas).",
    // La función pregunta por el módulo «Reportes financieros» de la sesión: sin una cuenta, falla. Se mira como el líder del seed.
    comoLider: true,
    sql: `select asiento, regla, fecha, debe, haber, diferencia from retail.fn_asientos_descuadrados(date '2000-01-01', date '2100-01-01')`,
    sinAutoprueba: "los asientos se derivan de ventas y gastos con reglas propias: romperlos a mano sin tocar otra invariante no es posible aquí; se prueba con `pnpm pruebas:balance`",
  },
  {
    id: "INV-10",
    nombre: "movimiento_con_responsable",
    gravedad: 2,
    nivel: "cruzada",
    dice: "Todo movimiento de stock lo firma una persona (`usuario_id`): un movimiento sin autor no se puede explicar en el conteo del mes.",
    sql: `
select id as movimiento_id, tipo, variante_id, ubicacion_id, cantidad, created_at
  from retail.movimientos where usuario_id is null`,
    sinAutoprueba: "`movimientos` es un libro inmutable a propósito (dos disparadores ENABLE ALWAYS): ni en una transacción revertida se puede tocar sin apagarlos, y eso es justo lo que no se hace aquí",
  },
  {
    id: "INV-11",
    nombre: "sospecha_de_doble_cobro",
    gravedad: 2,
    nivel: "sospecha",
    dice: "SOSPECHA (se confirma mirando): dos ventas de la misma sede y persona, con las mismas prendas, a menos de 10 segundos y con tokens distintos: el patrón de un doble clic que se coló.",
    sql: `
with firma as (
  select v.id, v.ubicacion_id, v.usuario_id, v.created_at,
         (select string_agg(i.variante_id::text || ':' || i.cantidad, ',' order by i.variante_id, i.cantidad)
            from retail.venta_items i where i.venta_id = v.id) as prendas
    from retail.ventas v where v.estado = 'completada'
)
select a.id as venta_a, b.id as venta_b, a.ubicacion_id, round(extract(epoch from b.created_at - a.created_at)::numeric, 1) as segundos
  from firma a
  join firma b on b.ubicacion_id = a.ubicacion_id and b.usuario_id is not distinct from a.usuario_id
              and b.id <> a.id and b.created_at >= a.created_at and b.created_at - a.created_at < interval '10 seconds'
              and b.prendas = a.prendas and (b.created_at > a.created_at or b.id > a.id)`,
    corrompe: `
create temp table _v on commit drop as select * from retail.ventas where estado = 'completada' order by created_at desc limit 1;
create temp table _i on commit drop as select i.* from retail.venta_items i where i.venta_id = (select id from _v);
update _v set id = gen_random_uuid(), token_cliente = gen_random_uuid(), created_at = created_at + interval '2 seconds';
update _i set venta_id = (select id from _v), id = gen_random_uuid();
insert into retail.ventas select * from _v;
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario, motivo_descuento, motivo_descuento_detalle, argumento_descuento, descuento_etiqueta_id, descuento_club_unitario)
select id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario, motivo_descuento, motivo_descuento_detalle, argumento_descuento, descuento_etiqueta_id, descuento_club_unitario from _i;`,
  },
  {
    id: "INV-12",
    nombre: "sospecha_de_movimiento_repetido",
    gravedad: 2,
    nivel: "sospecha",
    dice: "SOSPECHA (se confirma mirando): dos movimientos idénticos (misma prenda, sede, tipo, cantidad y persona) a menos de 2 segundos y sin venta: el patrón de un «Guardar» pulsado dos veces en Ajustar, Recibir o Traslado.",
    sql: `
select a.id as movimiento_a, b.id as movimiento_b, a.tipo, a.variante_id, a.cantidad, a.ubicacion_id,
       round(extract(epoch from b.created_at - a.created_at)::numeric, 2) as segundos
  from retail.movimientos a
  join retail.movimientos b on b.id <> a.id and b.variante_id = a.variante_id and b.ubicacion_id = a.ubicacion_id
                           and b.sububicacion_id is not distinct from a.sububicacion_id and b.tipo = a.tipo
                           and b.cantidad = a.cantidad and b.usuario_id is not distinct from a.usuario_id
                           and b.created_at >= a.created_at and b.created_at - a.created_at < interval '2 seconds'
                           and (b.created_at > a.created_at or b.id > a.id)
 where a.venta_item_id is null and b.venta_item_id is null
   and a.transferencia_item_id is null and a.compra_item_id is null and a.produccion_id is null`,
    sinAutoprueba: "`movimientos` es un libro inmutable a propósito (dos disparadores ENABLE ALWAYS): no se inserta ni siquiera una copia sin apagarlos, y eso es justo lo que no se hace aquí; se cubre con el ataque DC-03 en el navegador",
  },
  {
    id: "INV-13",
    nombre: "pieza_de_liquidacion_cuadra",
    gravedad: 1,
    nivel: "cruzada",
    dice: "Una pieza de liquidación (ADR-0375) a la venta tiene UNA etiqueta que la caja acepta, y una vendida apunta a una línea de una venta completada, de una sola unidad, cobrada al precio de su etiqueta: nunca vendida dos veces, ni vendida en una venta anulada, ni a otro precio.",
    sql: `
select p.id as pieza_id, p.estado, p.precio, vi.precio_unitario, vi.cantidad, v.estado as venta_estado,
       (select count(*) from retail.piezas_liquidacion_etiquetas e where e.pieza_id = p.id and e.vigente) as vigentes
  from retail.piezas_liquidacion p
  left join retail.venta_items vi on vi.id = p.venta_item_id
  left join retail.ventas v on v.id = vi.venta_id
 where (p.estado = 'disponible' and (select count(*) from retail.piezas_liquidacion_etiquetas e where e.pieza_id = p.id and e.vigente) <> 1)
    or (p.estado = 'vendida' and (v.estado is distinct from 'completada' or vi.cantidad <> 1 or vi.precio_unitario <> p.precio
                                  or vi.descuento_unitario <> 0))
    or (p.estado <> 'disponible' and exists (select 1 from retail.piezas_liquidacion_etiquetas e where e.pieza_id = p.id and e.vigente and p.estado = 'retirada'))`,
    corrompe: `update retail.piezas_liquidacion_etiquetas set vigente = false where ctid = (select e.ctid from retail.piezas_liquidacion_etiquetas e join retail.piezas_liquidacion p on p.id = e.pieza_id where e.vigente and p.estado = 'disponible' limit 1);`,
  },
];

// ── Instrumento (Docker + psql) ─────────────────────────────────────────────────────────────────────────────────────────────

const docker = (args, input) =>
  execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, ...args], { input, encoding: "utf8", maxBuffer: MAX, stdio: ["pipe", "pipe", "pipe"] });
/** Como superusuario: un chequeo de integridad no puede dejar que RLS le esconda filas. Solo dentro del contenedor local. */
const psql = (sql) => docker(["psql", "-q", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-f", "-"], sql).trim();

/** Cada fila de una invariante como JSON de una línea: estable para la huella y legible en el informe. */
const comoJson = (sql) => `select row_to_json(x)::text from (${sql.trim().replace(/;\s*$/, "")}) x;`;
const PRELUDIO = "set local statement_timeout = '30s'; set local lock_timeout = '3s';";
/** El líder del seed local (`supabase/seed.sql`, el mismo id que usan las pruebas de `scripts/pruebas/`): para las funciones que miran la sesión. */
const LIDER_DEL_SEED = "22222222-2222-4222-8222-000000000001";
const preludioDe = (inv) => (inv.comoLider ? `${PRELUDIO} select set_config('request.jwt.claim.sub', '${LIDER_DEL_SEED}', true);` : PRELUDIO);

export const huellaDe = (fila) => createHash("sha1").update(JSON.stringify(fila)).digest("hex").slice(0, 12);

/** Evalúa UNA invariante en modo lectura. Devuelve `{ estado: 'limpia' | 'viola' | 'error', filas, mensaje? }`. */
export function evaluar(inv, ejecutar = psql) {
  try {
    const salida = ejecutar(`begin read only; ${preludioDe(inv)}\n${comoJson(inv.sql)}\nrollback;`);
    const filas = salida.split("\n").filter((l) => l.trim().startsWith("{")).map((l) => JSON.parse(l));
    return { estado: filas.length ? "viola" : "limpia", filas };
  } catch (e) {
    return { estado: "error", filas: [], mensaje: String(e.stderr || e.message || e).split("\n").find((l) => /ERROR/.test(l)) ?? String(e.message).slice(0, 200) };
  }
}

/** La autoprueba: corrompe a propósito, exige que el detector grite, y SIEMPRE revierte. */
export function autoprobar(inv, ejecutar = psql) {
  if (inv.sinAutoprueba) return { estado: "sin-autoprueba", mensaje: inv.sinAutoprueba };
  if (!inv.corrompe) return { estado: "sin-autoprueba", mensaje: "sin SQL de corrupción declarado" };
  // `corrompe` y la consulta van en la MISMA transacción: la consulta ve el dato roto, y el rollback lo borra todo.
  const antes = evaluar(inv, ejecutar);
  if (antes.estado === "error") return { estado: "error", mensaje: antes.mensaje };
  try {
    const salida = ejecutar(`begin; ${preludioDe(inv)}\n${inv.corrompe}\n${comoJson(inv.sql)}\nrollback;`);
    const filas = salida.split("\n").filter((l) => l.trim().startsWith("{")).map((l) => JSON.parse(l));
    const nuevas = filas.filter((f) => !antes.filas.some((a) => huellaDe(a) === huellaDe(f)));
    if (nuevas.length) return { estado: "detecta", mensaje: `${nuevas.length} violación(es) nueva(s) tras corromper` };
    return { estado: "ciega", mensaje: "se corrompió el dato y el detector NO gritó" };
  } catch (e) {
    const msg = String(e.stderr || e.message || e);
    // Una tabla vacía no se puede corromper: no es un detector ciego, es una prueba que no se pudo hacer.
    if (/null value|violates|does not exist|no rows|violación|permission/i.test(msg)) {
      return { estado: "sin-datos", mensaje: (msg.split("\n").find((l) => /ERROR/.test(l)) ?? msg).slice(0, 220) };
    }
    return { estado: "error", mensaje: msg.slice(0, 220) };
  }
}

// ── Fotos de violaciones ────────────────────────────────────────────────────────────────────────────────────────────────────

const rutaFoto = (nombre) => join(DIR, `base-${nombre}.json`);
const validarNombre = (n) => {
  if (!n || !/^[a-z0-9-]+$/.test(n)) {
    console.error("Nombre inválido (minúsculas, números y guiones).");
    process.exit(2);
  }
};

/** Lo que cuenta como violación de una invariante, por huella. Una `error` no cuenta como limpia ni como violación. */
export function fotoDe(resultados) {
  return Object.fromEntries(
    resultados.filter((r) => r.estado !== "error").map((r) => [r.id, r.filas.map(huellaDe)]),
  );
}

/** Las violaciones de `ahora` que NO estaban en la foto. Una invariante que no estaba en la foto cuenta entera como nueva. */
export function nuevasContra(foto, resultados) {
  return resultados.map((r) => {
    const antes = new Set(foto[r.id] ?? []);
    const nuevas = r.filas.filter((f) => !antes.has(huellaDe(f)));
    return { ...r, filas: nuevas, estado: r.estado === "error" ? "error" : nuevas.length ? "viola" : "limpia" };
  });
}

// ── Salida ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const GRAVEDAD = { 1: "estado imposible", 2: "dato malo en silencio" };

function imprimir(resultados, titulo) {
  console.log(titulo);
  for (const r of resultados) {
    const marca = r.estado === "limpia" ? "✓" : r.estado === "error" ? "?" : "✗";
    const extra = r.estado === "viola" ? ` — ${r.filas.length} violación(es) · gravedad ${r.gravedad} (${GRAVEDAD[r.gravedad]})` : r.estado === "error" ? ` — NO SE PUDO EVALUAR: ${r.mensaje}` : "";
    console.log(`${marca} ${r.id} ${r.nombre}${r.nivel === "sospecha" ? " [sospecha]" : ""}${extra}`);
    if (r.estado === "viola") for (const f of r.filas.slice(0, 5)) console.log(`    ${JSON.stringify(f)}`);
    if (r.estado === "viola" && r.filas.length > 5) console.log(`    … y ${r.filas.length - 5} más`);
  }
}

function elegir(solo) {
  if (!solo) return INVARIANTES;
  const ids = solo.split(",").map((s) => s.trim().toUpperCase());
  const hay = INVARIANTES.filter((i) => ids.includes(i.id));
  if (hay.length !== ids.length) {
    console.error(`Invariante desconocida en --solo: ${ids.filter((i) => !INVARIANTES.some((x) => x.id === i)).join(", ")}. Mira --listar.`);
    process.exit(2);
  }
  return hay;
}

function verificarContenedor() {
  try {
    const vivo = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split("\n");
    if (!vivo.includes(CONTENEDOR_LOCAL)) throw new Error("sin contenedor");
  } catch {
    console.error(`No pude mirar: el contenedor local «${CONTENEDOR_LOCAL}» no está corriendo (¿Docker apagado o Supabase sin levantar?). Esto NO significa que la base esté limpia.`);
    process.exit(2);
  }
}

function main(argv) {
  const bandera = (n) => argv.includes(n);
  const valor = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const json = bandera("--json");

  if (bandera("--listar")) {
    for (const i of INVARIANTES) console.log(`${i.id}  g${i.gravedad}  ${i.nivel.padEnd(8)}  ${i.nombre}\n         ${i.dice}`);
    return 0;
  }

  const lista = elegir(valor("--solo"));
  verificarContenedor();

  if (bandera("--autoprueba")) {
    const salida = lista.map((i) => ({ id: i.id, nombre: i.nombre, ...autoprobar(i) }));
    if (json) console.log(JSON.stringify(salida, null, 2));
    else {
      console.log("Autoprueba de los detectores (cada corrupción se revierte; nada queda escrito):");
      for (const s of salida) {
        const m = { detecta: "✓ detecta", ciega: "✗ CIEGA", "sin-datos": "· sin datos", "sin-autoprueba": "· sin autoprueba", error: "? error" }[s.estado];
        console.log(`${m.padEnd(18)} ${s.id} ${s.nombre} — ${s.mensaje ?? ""}`);
      }
      const ciegas = salida.filter((s) => s.estado === "ciega" || s.estado === "error").length;
      const detecta = salida.filter((s) => s.estado === "detecta").length;
      console.log(`\n${detecta} de ${salida.length} comprobadas y vivas; ${salida.length - detecta - ciegas} sin poder probarse (dicho arriba, no cuentan como aprobadas); ${ciegas} ciegas o con error.`);
    }
    return salida.some((s) => s.estado === "ciega" || s.estado === "error") ? 1 : 0;
  }

  const resultados = lista.map((i) => ({ id: i.id, nombre: i.nombre, gravedad: i.gravedad, nivel: i.nivel, ...evaluar(i) }));

  if (valor("--guardar") !== undefined) {
    const nombre = valor("--guardar");
    validarNombre(nombre);
    mkdirSync(DIR, { recursive: true });
    if (existsSync(rutaFoto(nombre)) && !bandera("--reemplazar")) {
      console.error(`Ya existe la foto «${nombre}». Usa --reemplazar si quieres sustituirla.`);
      return 2;
    }
    writeFileSync(rutaFoto(nombre), JSON.stringify({ nombre, creada: new Date().toISOString(), violaciones: fotoDe(resultados) }, null, 2));
    const ya = resultados.reduce((s, r) => s + r.filas.length, 0);
    const errores = resultados.filter((r) => r.estado === "error");
    console.log(`Foto «${nombre}» guardada: ${ya} violación(es) que ya existían en ${resultados.filter((r) => r.estado === "viola").length} invariante(s); ${errores.length} sin poder evaluarse.`);
    for (const e of errores) console.log(`  ? ${e.id}: ${e.mensaje}`);
    return 0;
  }

  if (valor("--contra") !== undefined) {
    const nombre = valor("--contra");
    validarNombre(nombre);
    if (!existsSync(rutaFoto(nombre))) {
      console.error(`No hay una foto llamada «${nombre}». Guárdala ANTES del ataque con --guardar ${nombre}.`);
      return 2;
    }
    const nuevas = nuevasContra(JSON.parse(readFileSync(rutaFoto(nombre), "utf8")).violaciones, resultados);
    if (json) console.log(JSON.stringify(nuevas, null, 2));
    else imprimir(nuevas, `Violaciones NUEVAS desde la foto «${nombre}» (lo que el ataque rompió):`);
    return nuevas.some((r) => r.estado === "viola") ? 1 : 0;
  }

  if (json) console.log(JSON.stringify(resultados, null, 2));
  else imprimir(resultados, "Invariantes de la base local (todo lo que hay, incluida la historia):");
  return resultados.some((r) => r.estado === "viola") ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main(process.argv.slice(2)));
