#!/usr/bin/env node
/**
 * Pruebas del comprobante de la orden de insumos del Taller (ADR-0362, fase 7 parte 2, actividad 1) — migraciones
 * `20261015015000_orden_insumo_comprobante_esquema.sql` (la orden y la línea de la orden en el comprobante del Taller, el tipo
 * «sin comprobante») y `20261015020000_orden_insumo_comprobante_funciones.sql` (`registrar_comprobante_orden_insumo`, su resultado, el
 * candado de editar y anular, la recepción de siempre que ya no toma el papel de una orden y el detalle con lo facturado). Contrato:
 * docs/compras/ordenes-de-compra-2026-10/contrato-ordenes-de-insumos.md (punto 2). CAYLA V2.
 *
 * LO QUE VIGILA. Que quien compra para el Taller con «Órdenes de insumos» (decisión 47) deje el papel ligado a su orden con las reglas de
 * la orden de tienda (fase 2) y las medidas del Taller: los cuatro tipos (decisión 50, el SC- de la secuencia de la empresa), el IGV de la
 * factura de 0 % a 18 %, cantidades con hasta 3 decimales y costos con hasta 4; que lo de más o fuera de la orden se acepte y se avise
 * (decisión 43); que un doble clic no deje dos papeles; que una orden con su papel ya no se edite ni se anule (editar borraría las líneas a
 * las que el papel apunta); y que la recepción de siempre no reciba el papel de una orden (se recibe desde la orden: nada dos veces).
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las dos migraciones se cargan dentro de cada caso: así se prueba que se pueden
 * pegar otra vez).
 *   M  las migraciones se vuelven a cargar y la clave de la firma queda una vez.
 *   P  PUERTAS Y FIRMA: sin el módulo no responde; con el módulo una integrante registra y firma ella; sin la clave, pide el responsable.
 *   T  TIPOS: factura con IGV, boleta y factura con 0 %, IGV fuera de 0–18, sin comprobante con su SC- de la secuencia compartida.
 *   TT EL TOTAL IMPRESO: dentro de la tolerancia manda; fuera, no; sin IGV tiene que ser la suma.
 *   L  LÍNEAS MALAS: de otra orden, insumo archivado, 4 decimales de cantidad, 5 de costo, NaN, cero, sin líneas.
 *   A  AVISOS (decisión 43): de más y fuera de la orden en un papel; de más entre dos papeles.
 *   I  DOBLE ENVÍO: el mismo token y contenido devuelve el mismo papel; con otro contenido, `token_reusado`.
 *   R  EL MISMO PAPEL: repetido no; anulado, sí.
 *   C  CONDICIONES: contado (llega en la actividad 2), vencimiento, emisión futura, pago al crédito, tipo y serie.
 *   K  CANDADO: con papel vigente no se edita ni se anula; anulado el papel, se edita y su línea queda sin enlace. Orden anulada.
 *   V  RECEPCIÓN DE SIEMPRE: rechaza el papel de una orden y no lo lista; el papel suelto sigue.
 *   D  DETALLE: lo facturado por línea y los papeles de la orden.
 *   AC ACTIVIDAD: una línea sin montos.
 *   S  LA FORMA: security definer con search_path; `authenticated` sí, `anon` no; el resultado, cerrado.
 *
 * USO
 *   node scripts/pruebas/comprobante_orden_insumo.mjs                              → contra el stack local compartido
 *   node scripts/pruebas/comprobante_orden_insumo.mjs --contenedor supabase_db_x   → contra otro stack (un banco de pruebas propio)
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
const MIGRACION = sinCandadosDePegado(
  ["20261015015000_orden_insumo_comprobante_esquema.sql", "20261015020000_orden_insumo_comprobante_funciones.sql"]
    .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8"))
    .join("\n"),
);

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo, no es Admin (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const encabezados = (obj) => `select set_config('request.headers', '${JSON.stringify(obj)}', true) \\g /dev/null\n`;
const FIRMA_CREAR = encabezados({ "x-responsable-omitido": "orden_insumo_crear" });
const FIRMA_PAPEL = encabezados({ "x-responsable-omitido": "orden_insumo_comprobante" });
const FIRMA_EDITAR = encabezados({ "x-responsable-omitido": "orden_insumo_editar" });

// Envolturas que nunca abortan el caso: «OK:<resultado>» o «<sqlstate>|<hint>|<mensaje>».
const ENVOLTURAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
create function pg_temp.registra(p_orden uuid, p_tipo text, p_serie text, p_numero text, p_lineas jsonb,
  p_condicion text default 'credito', p_venc date default retail.fn_hoy_lima() + 30, p_igv numeric default 18, p_total numeric default null,
  p_pago jsonb default null, p_token uuid default null, p_emision date default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_r jsonb;
begin
  v_r := retail.registrar_comprobante_orden_insumo(p_orden, p_tipo, p_serie, p_numero, p_lineas, p_emision, p_condicion, p_venc, p_igv,
                                                   p_total, p_pago, null, p_token);
  return 'OK:' || v_r::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
-- El resultado de «registra» como jsonb (o null si fue un error).
create function pg_temp.j(p text) returns jsonb language sql as $f$ select case when p like 'OK:%' then substr(p, 4)::jsonb end $f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Telas Peña CI Prueba', 'tela') returning id as prov \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('CIP-LINO', 'Lino Crudo CI Prueba', 'tela', 'metro') returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('CIP-HILO', 'Hilo Algodón CI Prueba', 'avio', 'cono') returning id as hilo \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('CIP-BOTON', 'Botón Nácar CI Prueba', 'avio', 'unidad') returning id as boton \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, archivado_at) values ('CIP-VIEJO', 'Cierre Viejo CI Prueba', 'avio', 'unidad', now())
  returning id as viejo \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
${como(FELIPE)}
${FIRMA_CREAR}
-- La orden de Felipe: 12.5 m de lino a 10 (S/ 125.00) y 4 conos de hilo a 3.50 (S/ 14.00).
select id as oc, numero as n from retail.crear_orden_insumo(gen_random_uuid(), :'prov', :'taller', null::date, null,
  jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'cantidad', '12.5', 'precio_unitario', '10'),
                    jsonb_build_object('insumo_id', :'hilo', 'cantidad', '4', 'precio_unitario', '3.5'))) \\gset
select id as i1 from retail.orden_insumo_items where orden_insumo_id = :'oc' and posicion = 1 \\gset
select id as i2 from retail.orden_insumo_items where orden_insumo_id = :'oc' and posicion = 2 \\gset
${FIRMA_PAPEL}
`;

// Las líneas de siempre: lo pedido tal cual (12.5 m a 10 y 4 conos a 3.50 → S/ 139.00).
const LINEAS = `jsonb_build_array(jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '12.5', 'costo_unitario', '10'),
                  jsonb_build_object('orden_insumo_item_id', :'i2', 'cantidad', '4', 'costo_unitario', '3.5'))`;
const una = (o) => `jsonb_build_array(${o})`;
const MICAELA_CON_MODULO = `
reset role;
insert into retail.rol_modulos (rol_id, modulo)
  select c.rol_id, 'ordenes_insumos' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
`;
const ANULA_PAPEL = (variable) => `${como(FELIPE)}select retail.anular_comprobante_produccion(:'${variable}', 'Prueba: el papel tenía otro número') \\g /dev/null
${FIRMA_PAPEL}`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  casos++;
  if (obtenido !== esperado) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

caso(
  "M1 las dos migraciones se vuelven a cargar sin error y la clave de la firma queda una vez",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select count(*) from retail.acciones_sin_responsable where clave = 'orden_insumo_comprobante';`,
  "1"
);

caso(
  "P1 sin el módulo no responde (42501 / ordenes_insumos_sin_modulo), aunque mande la clave de la firma",
  `${como(MICAELA)}${FIRMA_PAPEL}
   select pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '777', ${LINEAS}));`,
  "42501|ordenes_insumos_sin_modulo"
);
caso(
  "P2 con el módulo, una integrante registra la factura al crédito: firma ella, ligada a la orden y a sus líneas, S/ 139 + 18 % = S/ 164.02",
  `${MICAELA_CON_MODULO}${como(MICAELA)}${FIRMA_PAPEL}
   select pg_temp.registra(:'oc', 'factura', 'f001', ' 777 ', ${LINEAS}) as r \\gset
   select concat_ws('|', pg_temp.j(:'r') ->> 'documento', pg_temp.j(:'r') ->> 'condicion', pg_temp.j(:'r') -> 'avisos',
     (select c.subtotal || ':' || c.igv || ':' || c.total || ':' || (c.orden_insumo_id = :'oc') || ':' || (c.usuario_id = :'micaela_p')
             || ':' || (c.proveedor_id = :'prov')
        from retail.comprobantes_produccion c where c.id = (pg_temp.j(:'r') ->> 'comprobante_id')::uuid),
     (select string_agg(coalesce((i.orden_insumo_item_id = :'i1')::text, '-') || ':' || i.cantidad || ':' || i.costo_unitario, ',' order by i.cantidad desc)
        from retail.comprobantes_produccion_items i where i.comprobante_id = (pg_temp.j(:'r') ->> 'comprobante_id')::uuid));`,
  "F001-777|credito|[]|139.00:25.02:164.02:true:true:true|true:12.500:10.0000,false:4.000:3.5000"
);
caso(
  "P3 sin la clave de la firma (con el responsable obligatorio), pide el responsable",
  `${MICAELA_CON_MODULO}${como(MICAELA)}${encabezados({})}
   select pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '777', ${LINEAS}));`,
  "42501|responsable_requerido"
);

caso(
  "T1 boleta sin IGV (S/ 139.00), factura con 0 % (S/ 139.00) e IGV de 19 % rechazado",
  `select concat_ws('|',
     pg_temp.j(pg_temp.registra(:'oc', 'boleta', 'B001', '10', ${LINEAS})) ->> 'total',
     pg_temp.j(pg_temp.registra(:'oc', 'factura', 'F001', '11', ${LINEAS}, p_igv => 0)) ->> 'total',
     pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '12', ${LINEAS}, p_igv => 19)));`,
  "139.00|139.00|P0001|igv_fuera_de_rango"
);
caso(
  "T2 sin comprobante: SC- con seis cifras de la secuencia de la empresa (la de las compras de tienda sigue después), sin IGV",
  `select pg_temp.registra(:'oc', 'sin_comprobante', 'X', 'Y', ${LINEAS}) as r \\gset
   select concat_ws('|',
     ((pg_temp.j(:'r') ->> 'documento') ~ '^SC-[0-9]{6}$')::text,
     pg_temp.j(:'r') ->> 'total',
     (nextval('retail.compras_sin_comprobante_seq') = split_part(pg_temp.j(:'r') ->> 'documento', '-', 2)::bigint + 1)::text);`,
  "true|139.00|true"
);
caso(
  "TT el total impreso: 164.03 entra (manda el papel, IGV 25.03); 165 no cuadra; en una boleta tiene que ser la suma",
  `select pg_temp.registra(:'oc', 'factura', 'F001', '20', ${LINEAS}, p_total => 164.03) as r \\gset
   select concat_ws('|',
     (select c.igv || ':' || c.total from retail.comprobantes_produccion c where c.id = (pg_temp.j(:'r') ->> 'comprobante_id')::uuid),
     pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '21', ${LINEAS}, p_total => 165)),
     pg_temp.eh(pg_temp.registra(:'oc', 'boleta', 'B001', '22', ${LINEAS}, p_total => 140)));`,
  "25.03:164.03|P0001|comprobante_orden_insumo_total|P0001|comprobante_orden_insumo_total"
);

caso(
  "L1 líneas malas: de otra orden, insumo archivado, 4 decimales, 5 decimales de costo, NaN, cero, sin líneas",
  `${FIRMA_CREAR}
   select id as otra from retail.crear_orden_insumo(gen_random_uuid(), :'prov', :'taller', null::date, null,
     jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'cantidad', '1', 'precio_unitario', '1'))) \\gset
   select id as ajena from retail.orden_insumo_items where orden_insumo_id = :'otra' \\gset
   ${FIRMA_PAPEL}
   select concat_ws(',',
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'boleta', 'B9', '1', ${una(`jsonb_build_object('orden_insumo_item_id', :'ajena', 'cantidad', '1', 'costo_unitario', '1')`)})), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'boleta', 'B9', '2', ${una(`jsonb_build_object('insumo_id', :'viejo', 'cantidad', '1', 'costo_unitario', '1')`)})), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'boleta', 'B9', '3', ${una(`jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '1.2345', 'costo_unitario', '1')`)})), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'boleta', 'B9', '4', ${una(`jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '1', 'costo_unitario', '1.23456')`)})), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'boleta', 'B9', '5', ${una(`jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', 'NaN', 'costo_unitario', '1')`)})), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'boleta', 'B9', '6', ${una(`jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '0', 'costo_unitario', '1')`)})), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'boleta', 'B9', '7', '[]'::jsonb)), '|', 2));`,
  [
    "comprobante_orden_insumo_linea_ajena",
    "comprobante_orden_insumo_insumo",
    "comprobante_orden_insumo_cantidad",
    "comprobante_orden_insumo_costo",
    "comprobante_orden_insumo_cantidad",
    "comprobante_orden_insumo_cantidad",
    "comprobante_orden_insumo_sin_lineas",
  ].join(",")
);

caso(
  "A1 se acepta y se avisa (decisión 43): 15 m de los 12.5 pedidos y 10 botones que no estaban en la orden",
  `select pg_temp.registra(:'oc', 'boleta', 'B001', '30', jsonb_build_array(
     jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '15', 'costo_unitario', '10'),
     jsonb_build_object('insumo_id', :'boton', 'cantidad', '10', 'costo_unitario', '0.35'))) as r \\gset
   select (select string_agg(a ->> 'tipo' || ':' || coalesce(a ->> 'pedido', '') || ':' || coalesce(a ->> 'facturado', a ->> 'cantidad'), ',')
             from jsonb_array_elements(pg_temp.j(:'r') -> 'avisos') a) || '|' || (pg_temp.j(:'r') ->> 'total');`,
  "de_mas:12.500:15.000,fuera_de_orden::10.000|153.50"
);
caso(
  "A2 de más entre dos papeles: 10 m (sin aviso) y después 5 m (facturado 15 de 12.5)",
  `select concat_ws('|',
     pg_temp.j(pg_temp.registra(:'oc', 'boleta', 'B001', '31', ${una(`jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '10', 'costo_unitario', '10')`)})) -> 'avisos',
     (select string_agg(a ->> 'tipo' || ':' || (a ->> 'facturado'), ',') from jsonb_array_elements(
        pg_temp.j(pg_temp.registra(:'oc', 'boleta', 'B001', '32', ${una(`jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '5', 'costo_unitario', '10')`)})) -> 'avisos') a));`,
  "[]|de_mas:15.000"
);

caso(
  "I1 doble envío: el mismo token con lo mismo devuelve el mismo papel (repetido); con otro contenido, token_reusado",
  `select gen_random_uuid() as tk \\gset
   select pg_temp.registra(:'oc', 'factura', 'F001', '40', ${LINEAS}, p_token => :'tk') as r1 \\gset
   select pg_temp.registra(:'oc', 'factura', 'F001', '40', ${LINEAS}, p_token => :'tk') as r2 \\gset
   select concat_ws('|',
     (pg_temp.j(:'r1') ->> 'comprobante_id' = pg_temp.j(:'r2') ->> 'comprobante_id')::text,
     pg_temp.j(:'r1') ->> 'repetido', pg_temp.j(:'r2') ->> 'repetido',
     (select count(*) from retail.comprobantes_produccion where orden_insumo_id = :'oc'),
     pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '41', ${LINEAS}, p_token => :'tk')));`,
  "true|false|true|1|P0001|token_reusado"
);
caso(
  "R1 el mismo papel vigente no se registra dos veces; anulado, sí",
  `select pg_temp.registra(:'oc', 'factura', 'F001', '50', ${LINEAS}) as r \\gset
   select (pg_temp.j(:'r') ->> 'comprobante_id') as c1 \\gset
   select pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '50', ${LINEAS})) as segundo \\gset
   ${ANULA_PAPEL("c1")}
   select :'segundo' || '|' || (pg_temp.j(pg_temp.registra(:'oc', 'factura', 'F001', '50', ${LINEAS})) ->> 'documento');`,
  "P0001|comprobante_orden_insumo_repetido|F001-50"
);
caso(
  "C1 al contado (llega en la actividad 2), sin vencimiento, vencimiento antes de la emisión, emisión futura, pago al crédito, tipo y serie",
  `select concat_ws(',',
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '60', ${LINEAS}, p_condicion => 'contado', p_venc => null)), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '61', ${LINEAS}, p_venc => null)), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '62', ${LINEAS}, p_venc => retail.fn_hoy_lima() - 1)), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '63', ${LINEAS}, p_emision => retail.fn_hoy_lima() + 1)), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '64', ${LINEAS}, p_pago => '[{"metodo":"efectivo","monto":"164.02"}]'::jsonb)), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'recibo', 'R1', '65', ${LINEAS})), '|', 2),
     split_part(pg_temp.eh(pg_temp.registra(:'oc', 'factura', ' ', '66', ${LINEAS})), '|', 2));`,
  [
    "comprobante_orden_insumo_contado",
    "comprobante_orden_insumo_vencimiento",
    "comprobante_orden_insumo_vencimiento",
    "comprobante_orden_insumo_emision",
    "comprobante_orden_insumo_pago_credito",
    "comprobante_orden_insumo_tipo",
    "comprobante_orden_insumo_serie",
  ].join(",")
);

caso(
  "K1 con su papel vigente la orden no se edita ni se anula; anulado el papel, se anula pero sigue sin editarse (sus líneas no se tocan)",
  `select (pg_temp.j(pg_temp.registra(:'oc', 'factura', 'F001', '70', ${LINEAS})) ->> 'comprobante_id') as c1 \\gset
   select version as v from retail.ordenes_insumo where id = :'oc' \\gset
   ${FIRMA_EDITAR}
   select split_part(pg_temp.eh(pg_temp.intento(format(
     'select * from retail.editar_orden_insumo(%L, %s, %L, %L, null::date, %L, %L::jsonb)', :'oc', :'v', :'prov', :'taller', 'otra nota',
     jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'cantidad', '12.5', 'precio_unitario', '10'))::text))), '|', 2) as edita \\gset
   ${encabezados({ "x-responsable-omitido": "orden_insumo_anular" })}
   select split_part(pg_temp.eh(pg_temp.intento(format('select * from retail.anular_orden_insumo(%L, %s, %L)', :'oc', :'v', 'ya no'))), '|', 2) as anula \\gset
   ${ANULA_PAPEL("c1")}
   ${FIRMA_EDITAR}
   select split_part(pg_temp.eh(pg_temp.intento(format(
     'select * from retail.editar_orden_insumo(%L, %s, %L, %L, null::date, %L, %L::jsonb)', :'oc', :'v', :'prov', :'taller', 'otra nota',
     jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'cantidad', '12.5', 'precio_unitario', '10'))::text))), '|', 2) as edita2 \\gset
   ${encabezados({ "x-responsable-omitido": "orden_insumo_anular" })}
   select pg_temp.intento(format('select * from retail.anular_orden_insumo(%L, %s, %L)', :'oc', :'v', 'el papel se anuló')) as anula2 \\gset
   select concat_ws('|', :'edita', :'anula', :'edita2', :'anula2');`,
  "orden_insumo_con_comprobante|orden_insumo_con_comprobante|orden_insumo_con_comprobante|SIN_ERROR"
);
caso(
  "K2 una orden anulada no recibe papel",
  `${encabezados({ "x-responsable-omitido": "orden_insumo_anular" })}
   select version as v from retail.ordenes_insumo where id = :'oc' \\gset
   select count(*) from retail.anular_orden_insumo(:'oc', :'v', 'El proveedor no tenía el lino') \\g /dev/null
   ${FIRMA_PAPEL}
   select pg_temp.eh(pg_temp.registra(:'oc', 'factura', 'F001', '80', ${LINEAS}));`,
  "P0001|orden_insumo_anulada"
);

caso(
  "V1 la recepción de siempre rechaza el papel de una orden y no lo lista; el papel suelto del líder sigue listado",
  `select (pg_temp.j(pg_temp.registra(:'oc', 'factura', 'F001', '90', ${LINEAS})) ->> 'comprobante_id') as c1 \\gset
   select id as item1 from retail.comprobantes_produccion_items where comprobante_id = :'c1' order by cantidad desc limit 1 \\gset
   ${como(FELIPE)}
   select retail.registrar_comprobante_produccion(:'prov', 'F002', '91', 'credito',
     jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'cantidad', '2', 'costo_unitario', '10')), 'boleta', null, retail.fn_hoy_lima() + 30)
     as suelto \\gset
   select concat_ws('|',
     pg_temp.eh(pg_temp.intento(format('select retail.recibir_comprobante_produccion(%L, %L, %L::jsonb, null, null, null)', :'c1', :'taller',
       jsonb_build_array(jsonb_build_object('item_id', :'item1', 'cantidad', '1'))::text))),
     (select count(*) from retail.fn_lineas_comprobantes_produccion(:'taller') f where f.comprobante_id = :'c1'),
     (select count(*) from retail.fn_lineas_comprobantes_produccion(:'taller') f where f.comprobante_id = :'suelto'));`,
  "P0001|comprobante_de_orden_insumo|0|1"
);

caso(
  "D1 el detalle: lo facturado de cada línea (con su id), los papeles de la orden y el plazo del proveedor (para sugerir el vencimiento)",
  `select pg_temp.registra(:'oc', 'boleta', 'B001', '95', ${una(`jsonb_build_object('orden_insumo_item_id', :'i1', 'cantidad', '10', 'costo_unitario', '10')`)}) \\g /dev/null
   reset role;
   update retail.proveedores_produccion set plazo_credito_dias = 15 where id = :'prov';
   ${como(FELIPE)}
   select retail.fn_orden_insumo(:'oc') as d \\gset
   select concat_ws('|',
     (select string_agg((f ->> 'posicion') || ':' || (f ->> 'facturado') || ':' || ((f ->> 'item_id') in (:'i1', :'i2')), ',' order by (f ->> 'posicion'))
        from jsonb_array_elements(:'d'::jsonb -> 'facturacion') f),
     (select string_agg((c ->> 'documento') || ':' || (c ->> 'estado'), ',') from jsonb_array_elements(:'d'::jsonb -> 'comprobantes') c),
     :'d'::jsonb ->> 'plazo_credito_dias');`,
  "1:10.000:true,2:0:true|B001-95:vigente|15"
);

caso(
  "AC Actividad anota el papel sin montos, en la orden",
  `select pg_temp.registra(:'oc', 'factura', 'F001', '99', ${LINEAS}) \\g /dev/null
   select replace(a.descripcion, retail.fn_orden_insumo_numero_texto(:'n'::int), 'OI-N') || '|' || a.modulo
     from retail.actividad a where a.tabla = 'ordenes_insumo' and a.registro_id = :'oc' and a.accion = 'orden_insumo_comprobante';`,
  "registró la factura F001-99 de la OI-N (Telas Peña CI Prueba)|ordenes_insumos"
);

caso(
  "S1 la forma: security definer con search_path; authenticated sí, anon no; el resultado, cerrado a authenticated",
  `reset role;
   select concat_ws(',',
     (select p.prosecdef || ':' || (p.proconfig::text like '%search_path%') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname = 'registrar_comprobante_orden_insumo'),
     has_function_privilege('authenticated', 'retail.registrar_comprobante_orden_insumo(uuid, text, text, text, jsonb, date, text, date, numeric, numeric, jsonb, text, uuid)', 'execute')::text,
     has_function_privilege('anon', 'retail.registrar_comprobante_orden_insumo(uuid, text, text, text, jsonb, date, text, date, numeric, numeric, jsonb, text, uuid)', 'execute')::text,
     has_function_privilege('authenticated', 'retail.fn_comprobante_orden_insumo_resultado(uuid, boolean)', 'execute')::text);`,
  "true:true,true,false,false"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
