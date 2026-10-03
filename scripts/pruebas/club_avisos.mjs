#!/usr/bin/env node
/**
 * Pruebas de Clientas ▸ Avisos, el módulo «Avisos del club» (ADR-0288 G-8, CL-20, CL-21; «Contrato de la tanda 1g»;
 * migraciones `20261001210000…210700_club_paso1g_*`).
 *
 * EL PROBLEMA. La encargada abre la lista de mensajes del club por mandar a las socias de su tienda y toca «Enviar» (abre
 * WhatsApp Web con el texto listo). La lista no puede ofrecerle escribirle a quien no dio la casilla de WhatsApp o pidió
 * BAJA, ni pasarse del tope de 2 promocionales al mes, ni escribirle al grupo testigo; y lo enviado no se repite.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`):
 *   a. Quién aparece: la socia CON publicidad de esa tienda (club_ubicacion_id; sin ella, su sede); quién no: sin la
 *      casilla, con BAJA, de otra tienda, otro mes, con el cupón ya canjeado. El texto sale de la plantilla con su nombre de
 *      pila, el % y la tienda, y termina con «responde BAJA».
 *   b. Enviado no vuelve; deshecho, sí. El aniversario: con el vale disponible, uno por vale.
 *   c. Novedades: lo que LLEGÓ a esa tienda en 14 días (lote) con stock libre; no la carga inicial; una cada 7 días; nunca
 *      al grupo testigo.
 *   d. Rebaja: una prenda en campaña con stock libre aquí en la talla que ella compró (su talla deducida); no en otra talla;
 *      nunca al grupo testigo.
 *   e. El tope CL-21: con 2 promocionales este mes, ninguno más (y registrar lo rechaza); con 1, solo uno (la rebaja primero).
 *   f. registrar_aviso_enviado: idempotente, el teléfono de la ficha, los rechazos (sin publicidad, testigo, sin «responde
 *      BAJA», datos); deshacer dentro de 10 minutos y no después; fn_club_avisos_enviados_hoy.
 *   g. Permisos: sin el módulo → avisos_club_sin_modulo; con él, solo su tienda; la BAJA desde Avisos (registrar_baja_whatsapp
 *      con «Avisos del club» y sin «Clientas»); EXECUTE solo authenticated.
 *   h. Anonimizar borra el teléfono y el texto de sus avisos; la tabla es de solo agregar.
 *
 * USO
 *   pnpm pruebas:club-avisos                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-avisos --base cayla_x    → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const BAJA = "Si no quieres recibir más mensajes, responde BAJA.";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_msg end;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated, anon;

-- Una socia unida desde el cartel de p_ubic, CON la casilla de WhatsApp (salvo p_pub = false), nacida un 15 de p_mes, con
-- un id que es (o no) del grupo testigo (CL-20: fijo por clienta). Como postgres. Devuelve su id.
create function pg_temp.socia(p_dni text, p_cel text, p_ubic uuid, p_mes integer, p_testigo boolean default false,
                              p_pub boolean default true) returns uuid language plpgsql as $f$
declare v uuid;
begin
  v := (select g.id from (select gen_random_uuid() as id from generate_series(1, 200)) g
         where retail.fn_club_es_testigo(g.id) = p_testigo limit 1);
  insert into retail.clientas (id, documento_tipo, documento_numero, nombre) values (v, 'dni', p_dni, 'LUCIA PRUEBA AVISOS');
  perform retail.registrarse_en_el_club(p_ubic, 'dni', p_dni, 'LUCIA PRUEBA AVISOS', p_cel, make_date(1990, p_mes, 15), null,
    true, true, p_pub,
    jsonb_build_object('terminos', (select max(t.version) from retail.club_textos t where t.tipo = 'terminos'),
                       'privacidad', (select max(t.version) from retail.club_textos t where t.tipo = 'privacidad'),
                       'casilla_publicidad', (select max(t.version) from retail.club_textos t where t.tipo = 'casilla_publicidad')), true);
  return v;
end;
$f$;
-- Una compra (completada) de la clienta, de una prenda, hace p_hace.
create function pg_temp.compra(p_cli uuid, p_ubic uuid, p_variante uuid, p_hace interval default interval '10 days') returns uuid
language plpgsql as $f$
declare v uuid;
begin
  insert into retail.ventas (ubicacion_id, cliente_id, created_at, estado) values (p_ubic, p_cli, now() - p_hace, 'completada') returning id into v;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (v, p_variante, 1, 79.90, 30);
  return v;
end;
$f$;
-- Entra stock de una prenda a la tienda: con un lote (una LLEGADA, la de Frescura y Análisis) o, si p_motivo lo dice, sin él.
create function pg_temp.entra(p_variante uuid, p_ubic uuid, p_cant integer, p_llegada boolean, p_motivo text default 'recepcion') returns void
language plpgsql as $f$
declare v_lote uuid; v_mov uuid;
begin
  if p_llegada then
    insert into retail.lotes (ubicacion_id, proveedor_id) values (p_ubic, (select id from retail.proveedores order by nombre limit 1)) returning id into v_lote;
  end if;
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id)
  values (p_variante, p_ubic, retail.fn_sububicacion_por_defecto(p_ubic, 'venta'), 'entrada', p_cant, p_motivo, v_lote)
  returning id into v_mov;
  perform retail.fn_aplicar_movimiento(v_mov);
end;
$f$;

update retail.configuracion_empresa set exige_responsable = false;
insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), 'clientas' on conflict do nothing;
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select extract(month from retail.fn_hoy_lima())::int as mes_hoy, (extract(month from retail.fn_hoy_lima())::int % 12) + 1 as otro_mes,
       extract(year from retail.fn_hoy_lima())::int as anio_hoy \\gset
select id as emma_bei_m from retail.variantes where sku = 'BLU-EMMA-BEI-M' \\gset
select id as emma_neg_l from retail.variantes where sku = 'BLU-EMMA-NEG-L' \\gset
select id as vale_bla_m from retail.variantes where sku = 'BLU-VALE-BLA-M' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'ubic', :'tru']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'piso_venta');
`;
const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);\n`;
const intentoCon = (sql, ...vars) => `select pg_temp.intento(format($q$${sql}$q$, ${vars.join(", ")}));\n`;
const SOCIA = (alias, dni, { ubic = ":'ubic'", mes = ":mes_hoy", testigo = false, pub = true } = {}) =>
  `reset role;\nselect pg_temp.socia('${dni}', '9${dni}', ${ubic}, ${mes}, ${testigo}, ${pub}) as ${alias} \\gset\n`;
/** Las filas de la lista de una tienda, de un tipo, como Felipe: «nombre de pila del texto|referencia» de las socias de la prueba. */
const LISTA = (tipo, ubic = ":'ubic'", ids = []) => `${como(FELIPE)}select coalesce(string_agg(clienta_id::text || ':' || referencia, ',' order by clienta_id::text), 'ninguna')
  from retail.fn_club_avisos_pendientes(${ubic}) where tipo = '${tipo}' and clienta_id in (${ids.map((a) => `:'${a}'`).join(", ")});\n`;
/** Quiénes (de los alias dados) aparecen con ese tipo: sus alias, en orden. */
const QUIENES = (tipo, alias, ubic = ":'ubic'") => `${como(FELIPE)}select coalesce(string_agg(x.a, ',' order by x.a), 'ninguna')
  from (values ${alias.map((a) => `('${a}', :'${a}'::uuid)`).join(", ")}) x(a, id)
 where exists (select 1 from retail.fn_club_avisos_pendientes(${ubic}) p where p.tipo = '${tipo}' and p.clienta_id = x.id);\n`;
/** Deja limpio el pasado de la tienda: las llegadas del seed, a 30 días (dentro de la transacción; se revierte). */
const SIN_LLEGADAS_RECIENTES = `reset role;
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '30 days' where created_at > now() - interval '14 days';
alter table retail.movimientos enable trigger movimientos_inmutables;
`;

let fallas = 0;
let casos = 0;
function registrar(nombre, bien, obtenido, esperadoTexto) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${String(esperadoTexto).split("\n").join("\n              ")}\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperadoCaso) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperadoCaso === "function" ? esperadoCaso(obtenido) : obtenido === esperadoCaso;
  registrar(nombre, bien, obtenido, typeof esperadoCaso === "function" ? "(condición)" : esperadoCaso);
}

try {
  execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"], { stdio: "ignore" });
} catch {
  console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
  process.exit(1);
}

// =====================================================================================================================
// a. Quién aparece (el cumpleaños)
// =====================================================================================================================
caso(
  "(a) cumpleaños: aparece la socia CON publicidad de esta tienda en su mes (también la del grupo testigo: el cumpleaños es una promesa del club); no aparecen la que no marcó WhatsApp, la de otro mes, la que pidió BAJA, la que ya canjeó su cupón este año ni la de otra tienda (que sí sale en la suya)",
  SOCIA("ok", "90770001") + SOCIA("testigo", "90770002", { testigo: true }) + SOCIA("sinpub", "90770003", { pub: false }) +
    SOCIA("otromes", "90770004", { mes: ":otro_mes" }) + SOCIA("baja", "90770005") + SOCIA("canjeo", "90770006") + SOCIA("otra", "90770007", { ubic: ":'tru'" }) +
    `reset role;
insert into retail.ventas (ubicacion_id, cliente_id, estado) values (:'ubic', :'canjeo', 'completada') returning id as vc \\gset
insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, pct, monto) values (:'canjeo', :'vc', 'cumpleanos', :anio_hoy, 10, 5);
` + como(FELIPE) + `select retail.registrar_baja_whatsapp('990770005', :'ubic') as _b \\gset\n` +
    QUIENES("cumpleanos", ["ok", "testigo", "sinpub", "otromes", "baja", "canjeo", "otra"]) +
    QUIENES("cumpleanos", ["ok", "otra"], ":'tru'"),
  "ok,testigo\notra"
);
caso(
  "(a) el texto del cumpleaños: la plantilla con su nombre de pila (Lucia), el % (10) y la tienda, termina con «responde BAJA»; referencia = el año; el teléfono es el de la ficha y el nombre completo para la encargada",
  SOCIA("f", "90770011") + como(FELIPE) +
    `select nombre, telefono, referencia = :anio_hoy::text, texto like '%Lucia%' and texto like '%10 %%' and texto like '%Tienda Lima%' and texto not like '%{%',
       right(texto, ${BAJA.length}) = '${BAJA}', detalle
  from retail.fn_club_avisos_pendientes(:'ubic') where clienta_id = :'f' and tipo = 'cumpleanos';
`,
  "LUCIA PRUEBA AVISOS|990770011|t|t|t|Cupón de cumpleaños: 10 % en una compra este mes"
);
caso(
  "(a) la tienda de una socia sin club_ubicacion_id (unida en caja antes de la 1g) es su sede: la de más compras netas en 12 meses",
  SOCIA("f", "90770021") +
    `reset role;
update retail.clientas set club_ubicacion_id = null where id = :'f';
select pg_temp.compra(:'f', :'tru', :'emma_bei_m') as _1 \\gset
select pg_temp.compra(:'f', :'tru', :'emma_bei_m') as _2 \\gset
` + QUIENES("cumpleanos", ["f"]) + QUIENES("cumpleanos", ["f"], ":'tru'"),
  "ninguna\nf"
);

// =====================================================================================================================
// b. Enviado, deshecho, aniversario
// =====================================================================================================================
caso(
  "(b) enviado ya no sale; deshecho (dentro de 10 minutos), vuelve; fn_club_avisos_enviados_hoy cuenta los no deshechos de hoy por tipo",
  SOCIA("f", "90771001") + como(FELIPE) +
    `select texto as t from retail.fn_club_avisos_pendientes(:'ubic') where clienta_id = :'f' and tipo = 'cumpleanos' \\gset
select retail.registrar_aviso_enviado(:'f', 'cumpleanos', :'anio_hoy', :'t', :'ubic') as aviso \\gset
` + QUIENES("cumpleanos", ["f"]) + `select string_agg(tipo || '=' || enviados, ',') from retail.fn_club_avisos_enviados_hoy(:'ubic') where tipo = 'cumpleanos';
select retail.deshacer_aviso_enviado(:'aviso') as _d \\gset
select retail.deshacer_aviso_enviado(:'aviso') as _d2 \\gset
` + QUIENES("cumpleanos", ["f"]) + `select count(*) from retail.fn_club_avisos_enviados_hoy(:'ubic') where tipo = 'cumpleanos';\n`,
  "ninguna\ncumpleanos=1\nf\n0"
);
caso(
  "(b) aniversario: con el vale disponible aparece (referencia = el año de club, el monto y la fecha en el texto); enviado, no vuelve",
  SOCIA("f", "90771011", { mes: ":otro_mes" }) +
    `reset role;
update retail.clientas set club_desde = now() - interval '1 year' - interval '3 days' where id = :'f';
select pg_temp.compra(:'f', :'ubic', :'emma_bei_m', interval '100 days') from generate_series(1, 6);
` + como(FELIPE) +
    `select referencia, texto like '%S/ 20 %' and texto like '%hasta el %' and texto not like '%{%', detalle like 'Vale de aniversario de S/ 20 (año 1), hasta el %'
  from retail.fn_club_avisos_pendientes(:'ubic') where clienta_id = :'f' and tipo = 'aniversario';
select texto as t from retail.fn_club_avisos_pendientes(:'ubic') where clienta_id = :'f' and tipo = 'aniversario' \\gset
select retail.registrar_aviso_enviado(:'f', 'aniversario', '1', :'t', :'ubic') as _a \\gset
` + QUIENES("aniversario", ["f"]),
  (s) => {
    const l = s.split("\n").filter((x) => x !== "");
    return l.slice(-2).join("\n") === "1|t|t\nninguna";
  }
);

// =====================================================================================================================
// c. Novedades
// =====================================================================================================================
caso(
  "(c) novedades: con una prenda que LLEGÓ por lote a esta tienda y tiene stock libre, aparece (detalle «Llegó: …»; referencia = la semana), menos al grupo testigo; una entrada sin lote o una carga inicial no son llegadas",
  SIN_LLEGADAS_RECIENTES + SOCIA("f", "90772001", { mes: ":otro_mes" }) + SOCIA("t", "90772002", { mes: ":otro_mes", testigo: true }) +
    `reset role;\nselect pg_temp.entra(:'vale_bla_m', :'ubic', 5, false, 'carga_inicial') as _e1 \\gset
select pg_temp.entra(:'vale_bla_m', :'ubic', 5, false, 'ajuste_manual') as _e2 \\gset
` + QUIENES("novedades", ["f", "t"]) +
    `reset role;\nselect pg_temp.entra(:'vale_bla_m', :'ubic', 5, true) as _e3 \\gset\n` +
    QUIENES("novedades", ["f", "t"]) +
    `select detalle, referencia = to_char(retail.fn_hoy_lima(), 'IYYY-"S"IW'), texto like '%Tienda Lima%' and texto not like '%{%'
  from retail.fn_club_avisos_pendientes(:'ubic') where clienta_id = :'f' and tipo = 'novedades';
`,
  "ninguna\nf\nLlegó: Blusa Valentina|t|t"
);
caso(
  "(c) novedades: una cada 7 días (con una enviada hace 3 días, no; hace 8, sí); y lo que llegó hace más de 14 días ya no es novedad",
  SIN_LLEGADAS_RECIENTES + SOCIA("f", "90772011", { mes: ":otro_mes" }) +
    `reset role;\nselect pg_temp.entra(:'vale_bla_m', :'ubic', 5, true) as _e \\gset
insert into retail.club_avisos_enviados (clienta_id, tipo, referencia, telefono, texto, ubicacion_id, enviado_por, creado_en)
  values (:'f', 'novedades', 'vieja', '966772011', 'x responde BAJA.', :'ubic', :'persona_felipe', now() - interval '3 days');
` + QUIENES("novedades", ["f"]) +
    `reset role;
alter table retail.club_avisos_enviados disable trigger club_avisos_enviados_solo_agregar;
update retail.club_avisos_enviados set creado_en = now() - interval '8 days' where referencia = 'vieja';
alter table retail.club_avisos_enviados enable trigger club_avisos_enviados_solo_agregar;
` + QUIENES("novedades", ["f"]) + SIN_LLEGADAS_RECIENTES + QUIENES("novedades", ["f"]),
  "ninguna\nf\nninguna"
);

// =====================================================================================================================
// d. Rebaja en su talla
// =====================================================================================================================
// Con los claims del líder puestos (como postgres): una etiqueta con descuento solo nace aprobada si la crea quien puede.
const CAMPANA = `${como(FELIPE)}reset role;
insert into retail.etiquetas (nombre, estado, activo, descuento_pct, vigente_desde, vigente_hasta)
  values ('ZZ Avisos Rebaja (prueba)', 'aprobado', true, 20, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 5) returning id as etq, vigente_desde as etq_desde \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'vale_bla_m', :'etq');
select pg_temp.entra(:'vale_bla_m', :'ubic', 10, false, 'ajuste_manual') as _st \\gset
`;
caso(
  "(d) rebaja: una blusa en campaña (20 %) con stock libre en la tienda, en la talla M que ella compró (Camisas y Blusas, M), aparece con la campaña de referencia; la que compró talla L, no; la del grupo testigo, no",
  CAMPANA + SOCIA("m", "90773001", { mes: ":otro_mes" }) + SOCIA("l", "90773002", { mes: ":otro_mes" }) + SOCIA("t", "90773003", { mes: ":otro_mes", testigo: true }) +
    `reset role;
select pg_temp.compra(:'m', :'ubic', :'emma_bei_m') as _1 \\gset
select pg_temp.compra(:'l', :'ubic', :'emma_neg_l') as _2 \\gset
select pg_temp.compra(:'t', :'ubic', :'emma_bei_m') as _3 \\gset
` + QUIENES("rebaja", ["m", "l", "t"]) + como(FELIPE) +
    `select referencia = :'etq' || ':' || :'etq_desde', detalle, texto like '%Blusa Valentina está con 20 % de descuento en Tienda Lima%'
  from retail.fn_club_avisos_pendientes(:'ubic') where clienta_id = :'m' and tipo = 'rebaja';
`,
  "m\nt|Blusa Valentina talla M: 20 % menos|t"
);
caso(
  "(d) la talla deducida es la de su compra MÁS RECIENTE de esa categoría (compró M hace un año y L hace un mes → L: ya no le sale la rebaja en M); y en una tienda que no es la suya, nada",
  CAMPANA + SOCIA("f", "90773011", { mes: ":otro_mes" }) + SOCIA("g", "90773012", { mes: ":otro_mes" }) +
    `reset role;
select pg_temp.compra(:'f', :'ubic', :'emma_bei_m', interval '1 year') as _1 \\gset
select pg_temp.compra(:'f', :'ubic', :'emma_neg_l', interval '1 month') as _2 \\gset
select pg_temp.compra(:'g', :'ubic', :'emma_bei_m') as _3 \\gset
` + QUIENES("rebaja", ["f", "g"]) + QUIENES("rebaja", ["f", "g"], ":'tru'"),
  "g\nninguna"
);

// =====================================================================================================================
// e. El tope del mes
// =====================================================================================================================
const PROMO_ENVIADA = (alias, tipo, ref) =>
  `reset role;\ninsert into retail.club_avisos_enviados (clienta_id, tipo, referencia, telefono, texto, ubicacion_id, enviado_por)
  values (:'${alias}', '${tipo}', '${ref}', '9', 'x responde BAJA.', :'ubic', :'persona_felipe');\n`;
caso(
  "(e) CL-21: con rebaja y novedades pendientes, sin nada enviado este mes, salen las dos; con 1 promocional enviado este mes, solo la rebaja; con 2, ninguna (y registrar una tercera → aviso_tope_mes); el cumpleaños no cuenta para el tope",
  CAMPANA + SOCIA("a", "90774001") + SOCIA("b", "90774002") + SOCIA("c", "90774003") +
    `reset role;
select count(pg_temp.compra(x, :'ubic', :'emma_bei_m')) as _n from unnest(array[:'a', :'b', :'c']::uuid[]) x \\gset
select pg_temp.entra(:'emma_bei_m', :'ubic', 3, true) as _ll \\gset
` + PROMO_ENVIADA("b", "rebaja", "otra:1") + PROMO_ENVIADA("c", "rebaja", "otra:2") + PROMO_ENVIADA("c", "rebaja", "otra:3") +
    como(FELIPE) +
    `select string_agg(x.a || '=' || coalesce((select string_agg(p.tipo, '+' order by p.tipo) from retail.fn_club_avisos_pendientes(:'ubic') p where p.clienta_id = x.id), '-'), ' ' order by x.a)
  from (values ('a', :'a'::uuid), ('b', :'b'::uuid), ('c', :'c'::uuid)) x(a, id);
` + intentoCon(`select retail.registrar_aviso_enviado(%L, 'novedades', 'otra-semana', 'Hola ${BAJA}', %L)`, ":'c'", ":'ubic'"),
  "a=cumpleanos+novedades+rebaja b=cumpleanos+rebaja c=cumpleanos\nP0001|aviso_tope_mes"
);

// =====================================================================================================================
// f. registrar_aviso_enviado y deshacer
// =====================================================================================================================
caso(
  "(f) registrar: dos «Enviar» del mismo aviso → el MISMO id y una sola fila; guarda el teléfono de la ficha, el texto, la tienda y quién; la actividad sin datos suyos",
  SOCIA("f", "90775001") + como(FELIPE) +
    `select retail.registrar_aviso_enviado(:'f', 'cumpleanos', :'anio_hoy', 'Hola Lucia. ${BAJA}', :'ubic') as a1 \\gset
select retail.registrar_aviso_enviado(:'f', 'cumpleanos', :'anio_hoy', 'Hola Lucia. ${BAJA}', :'ubic') as a2 \\gset
select :'a1' = :'a2';
reset role;
select count(*), max(telefono), max(ubicacion_id::text) = :'ubic', bool_and(enviado_por = :'persona_felipe') from retail.club_avisos_enviados where clienta_id = :'f';
select a.modulo, a.accion, (a.descripcion || a.detalle::text) !~* '(lucia|90775001|990775001)' from retail.actividad a where a.accion = 'aviso_enviado' and a.registro_id = :'a1';
`,
  "t\n1|990775001|t|t\navisos_club|aviso_enviado|t"
);
caso(
  "(f) registrar rechaza: sin publicidad (aviso_sin_publicidad), novedades o rebaja al grupo testigo (aviso_grupo_testigo; el cumpleaños sí pasa), un texto sin «responde BAJA» (aviso_sin_baja), un tipo o una referencia que no son (aviso_invalido), otra tienda que no es tienda (42501)",
  SOCIA("sp", "90775011", { pub: false }) + SOCIA("t", "90775012", { testigo: true }) + como(FELIPE) +
    intentoCon(`select retail.registrar_aviso_enviado(%L, 'cumpleanos', '2026', 'Hola ${BAJA}', %L)`, ":'sp'", ":'ubic'") +
    intentoCon(`select retail.registrar_aviso_enviado(%L, 'novedades', '2026-S40', 'Hola ${BAJA}', %L)`, ":'t'", ":'ubic'") +
    intentoCon(`select retail.registrar_aviso_enviado(%L, 'rebaja', 'x:y', 'Hola ${BAJA}', %L)`, ":'t'", ":'ubic'") +
    intentoCon(`select retail.registrar_aviso_enviado(%L, 'cumpleanos', '2026', 'Hola ${BAJA}', %L) is not null`, ":'t'", ":'ubic'") +
    intentoCon(`select retail.registrar_aviso_enviado(%L, 'aniversario', '1', 'Hola Lucia, sin baja.', %L)`, ":'t'", ":'ubic'") +
    intentoCon(`select retail.registrar_aviso_enviado(%L, 'otro', '1', 'Hola ${BAJA}', %L)`, ":'t'", ":'ubic'") +
    intentoCon(`select retail.registrar_aviso_enviado(%L, 'aniversario', '  ', 'Hola ${BAJA}', %L)`, ":'t'", ":'ubic'") +
    `reset role;\nselect id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset\n` + como(FELIPE) +
    intentoCon(`select retail.registrar_aviso_enviado(%L, 'aniversario', '1', 'Hola ${BAJA}', %L)`, ":'t'", ":'taller'"),
  "P0001|aviso_sin_publicidad\nP0001|aviso_grupo_testigo\nP0001|aviso_grupo_testigo\nSIN_ERROR\n22023|aviso_sin_baja\n22023|aviso_invalido\n22023|aviso_invalido\n42501|No puedes mandar avisos desde esa tienda."
);
caso(
  "(f) deshacer: pasados 10 minutos → aviso_fuera_de_plazo (queda enviado); uno que no existe → aviso_no_existe",
  SOCIA("f", "90775021") +
    `reset role;
insert into retail.club_avisos_enviados (clienta_id, tipo, referencia, telefono, texto, ubicacion_id, enviado_por, creado_en)
  values (:'f', 'cumpleanos', '2026', '966775021', 'Hola ${BAJA}', :'ubic', :'persona_felipe', now() - interval '11 minutes') returning id as viejo \\gset
` + como(FELIPE) + intentoCon(`select retail.deshacer_aviso_enviado(%L)`, ":'viejo'") + intento(`select retail.deshacer_aviso_enviado(gen_random_uuid())`) +
    `reset role;\nselect deshecho_en is null from retail.club_avisos_enviados where id = :'viejo';\n`,
  "P0001|aviso_fuera_de_plazo\nP0001|aviso_no_existe\nt"
);

// =====================================================================================================================
// g. Permisos
// =====================================================================================================================
caso(
  "(g) sin el módulo «Avisos del club» (Micaela, integrante: nace solo para el líder) → avisos_club_sin_modulo en las cuatro; con el módulo en su rol, ve la lista de SU tienda (Trujillo) y no la de Lima (42501)",
  como(MICAELA) +
    intentoCon(`select count(*) from retail.fn_club_avisos_pendientes(%L)`, ":'tru'") +
    intentoCon(`select count(*) from retail.fn_club_avisos_enviados_hoy(%L)`, ":'tru'") +
    intentoCon(`select retail.registrar_aviso_enviado(gen_random_uuid(), 'cumpleanos', '2026', 'Hola ${BAJA}', %L)`, ":'tru'") +
    intento(`select retail.deshacer_aviso_enviado(gen_random_uuid())`) +
    `reset role;\ninsert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'avisos_club');\n` +
    como(MICAELA) +
    intentoCon(`select count(*) >= 0 from retail.fn_club_avisos_pendientes(%L)`, ":'tru'") +
    intentoCon(`select count(*) from retail.fn_club_avisos_pendientes(%L)`, ":'ubic'"),
  "42501|avisos_club_sin_modulo\n42501|avisos_club_sin_modulo\n42501|avisos_club_sin_modulo\n42501|avisos_club_sin_modulo\nSIN_ERROR\n42501|No puedes ver los avisos de esa tienda."
);
caso(
  "(g) la BAJA desde Avisos (G-7): con «Avisos del club» y SIN «Clientas», registrar_baja_whatsapp quita la publicidad; sin ninguno de los dos → clientas_sin_modulo",
  SOCIA("f", "90776001", { ubic: ":'tru'" }) +
    `reset role;
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';
` + como(MICAELA) + intento(`select retail.registrar_baja_whatsapp('990776001', null)`) +
    `reset role;\ninsert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'avisos_club');\n` +
    como(MICAELA) + `select retail.registrar_baja_whatsapp('990776001', null);
reset role;
select publicidad_desde is null, club_desde is not null from retail.clientas where id = :'f';
`,
  "42501|clientas_sin_modulo\n1\nt|t"
);
caso(
  "(g) EXECUTE: las cuatro de Avisos solo para authenticated (ni PUBLIC ni anon); el módulo nace sin rol",
  `select string_agg(proname || ':' || has_function_privilege('authenticated', oid, 'execute') || '/' || has_function_privilege('anon', oid, 'execute'), ',' order by proname)
  from pg_proc where pronamespace = 'retail'::regnamespace
   and proname in ('fn_club_avisos_pendientes', 'fn_club_avisos_enviados_hoy', 'registrar_aviso_enviado', 'deshacer_aviso_enviado');
select clave || ':' || grupo || ':' || orden || ':' || solo_lider || ':' || delegable from retail.modulos where clave = 'avisos_club';
select count(*) from retail.rol_modulos where modulo = 'avisos_club';
`,
  "deshacer_aviso_enviado:true/false,fn_club_avisos_enviados_hoy:true/false,fn_club_avisos_pendientes:true/false,registrar_aviso_enviado:true/false\navisos_club:Clientes:75:false:true\n0"
);

// =====================================================================================================================
// h. Anonimizar y solo agregar
// =====================================================================================================================
caso(
  "(h) anonimizar a la socia borra el teléfono y el texto de sus avisos (queda el tipo, cuándo y desde dónde); la tabla no se edita ni se borra (club_solo_agregar), tampoco como postgres",
  SOCIA("f", "90777001") + como(FELIPE) +
    `select retail.registrar_aviso_enviado(:'f', 'cumpleanos', :'anio_hoy', 'Hola Lucia. ${BAJA}', :'ubic') as a1 \\gset
select retail.archivar_clienta(:'f', 'lo pidió', true) as _v \\gset
reset role;
select telefono is null, texto is null, tipo, ubicacion_id = :'ubic' from retail.club_avisos_enviados where id = :'a1';
` + intentoCon(`update retail.club_avisos_enviados set tipo = 'rebaja' where id = %L`, ":'a1'") +
    intentoCon(`update retail.club_avisos_enviados set texto = 'otro' where id = %L`, ":'a1'") +
    intentoCon(`delete from retail.club_avisos_enviados where id = %L`, ":'a1'") +
    intento(`truncate retail.club_avisos_enviados`),
  "t|t|cumpleanos|t\nP0001|club_solo_agregar\nP0001|club_solo_agregar\nP0001|club_solo_agregar\nP0001|club_solo_agregar"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);
