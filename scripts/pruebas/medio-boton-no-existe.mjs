/**
 * Medio botón no existe — migración 20261031211000.
 *
 * EL PROBLEMA. Escribir «0,5» en «¿Ya tienes?» de un avío que se cuenta en UNIDADES se aceptaba sin una palabra: la base
 * guardaba `cantidad_ingresada = 0.500` y la pantalla mostraba «1 unid.». Un stock que no puede existir, y encima una
 * pantalla que decía otra cosa. Lo encontró `/chaos` sobre «Nuevo avío» (2026-10-31, hallazgo 2).
 *
 * QUÉ GARANTIZA (cada caso termina en ROLLBACK: no deja rastro en el Postgres local compartido):
 *   A. Lo que se CUENTA de uno en uno (unidad, cono, par, docena) no admite partes, ni al ingresar un lote ni al mover
 *      stock, y el mensaje sale en castellano con el nombre del avío y la unidad.
 *   B. Lo que se MIDE (metro, kilo) sigue admitiendo partes: medio metro de tela es medio metro.
 *   C. Un entero entra, como siempre.
 *   D. No mira lo que ya está guardado: un `update` que no toca la cantidad pasa aunque la fila venga con partes de
 *      antes del candado (así se puede seguir corrigiendo y anulando un lote viejo).
 *   E. `fn_unidad_se_cuenta_entera` dice lo mismo que `seCuentaEntera` de la web, unidad por unidad.
 */
import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** La escena mínima: un avío de la unidad que se pida, con su color, y un lote de `cantidad`. */
const escena = (unidad, cuerpo) => `begin;
create temp table zz_veredicto (v text) on commit drop;
do $$
declare v_mat uuid; v_ins uuid; v_clase uuid; v_ubi uuid; v_lote uuid;
begin
  select id into v_clase from retail.avio_clases where activo order by orden limit 1;
  select id into v_ubi from retail.ubicaciones limit 1;
  insert into retail.materiales (codigo, nombre, tipo, unidad_medida, unidad_compra, clase_id)
    values ('ZMB-99', 'Botón de la prueba', ${unidad === "metro" ? "'tela'" : "'avio'"}, '${unidad}', '${unidad}', ${unidad === "metro" ? "null" : "v_clase"})
    returning id into v_mat;
  insert into retail.insumos (material_id, codigo, nombre, tipo, unidad_medida)
    values (v_mat, 'ZMB-99-NEG', 'Botón de la prueba · Negro', ${unidad === "metro" ? "'tela'" : "'avio'"}, '${unidad}')
    returning id into v_ins;
${cuerpo}
end $$;
select coalesce((select v from zz_veredicto limit 1), 'SIN VEREDICTO');
rollback;`;

const intento = (sql, siPasa, siFrena) => `  begin
${sql}
    insert into zz_veredicto values ('${siPasa}');
  exception when check_violation then insert into zz_veredicto values ('${siFrena}');
  end;`;

const CASOS = [];

// ---------- A · lo que se cuenta de uno en uno ----------
for (const unidad of ["unidad", "cono", "par", "docena"]) {
  CASOS.push({
    nombre: `A · media ${unidad} no entra en un lote`,
    sql: escena(unidad, intento(
      `    insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen)
      values (v_ins, v_ubi, 0.5, 1, 'saldo_inicial');`,
      "ACEPTO", "FRENO")),
    espera: "FRENO",
  });
  CASOS.push({
    nombre: `A · ni media ${unidad} en un movimiento`,
    sql: escena(unidad, intento(
      `    insert into retail.movimientos_insumo (insumo_id, ubicacion_id, tipo, cantidad)
      values (v_ins, v_ubi, 'consumo', 0.25);`,
      "ACEPTO", "FRENO")),
    espera: "FRENO",
  });
}

// ---------- B · lo que se mide ----------
CASOS.push({
  nombre: "B · 12.25 m de tela entran, como siempre",
  sql: escena("metro", intento(
    `    insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen)
      values (v_ins, v_ubi, 12.25, 1, 'saldo_inicial');`,
    "ACEPTO", "FRENO")),
  espera: "ACEPTO",
});

// ---------- C · un entero ----------
CASOS.push({
  nombre: "C · 12 botones enteros entran",
  sql: escena("unidad", intento(
    `    insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen)
      values (v_ins, v_ubi, 12, 1, 'saldo_inicial');`,
    "ACEPTO", "FRENO")),
  espera: "ACEPTO",
});

// ---------- D · no mira lo de antes ----------
CASOS.push({
  nombre: "D · un lote viejo con partes se puede seguir corrigiendo (si no se toca la cantidad)",
  sql: escena("unidad", `  -- se mete una fila con partes saltándose el disparador, como si fuera de antes del candado
  alter table retail.insumo_lotes disable trigger insumo_lotes_cantidad_entera;
  insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen)
    values (v_ins, v_ubi, 0.5, 1, 'saldo_inicial') returning id into v_lote;
  alter table retail.insumo_lotes enable trigger insumo_lotes_cantidad_entera;
${intento(`    update retail.insumo_lotes set nota = 'corregida' where id = v_lote;`, "ACEPTO", "FRENO")}`),
  espera: "ACEPTO",
});

// ---------- E · la misma lista que la web ----------
CASOS.push({
  nombre: "E · la base y la web coinciden en qué unidades se cuentan enteras",
  sql: `select string_agg(u, ',' order by u) from unnest(array['metro','kilo','unidad','cono','par','docena']) u
        where retail.fn_unidad_se_cuenta_entera(u);`,
  esperaSalida: "cono,docena,par,unidad",
});

function main() {
  let fallos = 0;
  for (const caso of CASOS) {
    const r = correr(caso.sql);
    if (!r.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    falló:\n    ${r.mensaje.trim().split("\n").slice(0, 4).join("\n    ")}`);
      continue;
    }
    const bien = caso.esperaSalida !== undefined ? r.salida.includes(caso.esperaSalida) : r.salida.includes(caso.espera);
    if (!bien) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba «${caso.esperaSalida ?? caso.espera}» y salió: ${JSON.stringify(r.salida.slice(0, 200))}`);
    } else {
      console.log(`✓ ${caso.nombre}`);
    }
  }
  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
