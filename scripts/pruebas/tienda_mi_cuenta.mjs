#!/usr/bin/env node
/**
 * «Mi cuenta» de la tienda online: cambiar el correo, restablecer el acceso desde el ERP, eliminar la cuenta, y la anonimización que
 * espera un pedido web pagado — CAYLA V2 (`20261015131000_clientas_anonimizar_espera_pedido_pagado.sql` y
 * `20261015132000_tienda_mi_cuenta_correo_acceso_y_baja.sql`).
 *
 * EL PROBLEMA. Felipe (2026-10-15): el cliente cambia su correo de entrada con un código que llega al correo NUEVO; si no puede entrar,
 * la tienda (módulo «Clientes») le restablece el acceso escribiendo su correo nuevo, y el cambio ocurre recién cuando ella confirma el
 * código; «Eliminar cuenta» borra la cuenta y sus datos con la anonimización de siempre, pero no con un pedido web en curso; y
 * anonimizar desde el ERP espera un pedido web PAGADO sin entregar. La base tiene que hacerlo cumplir, no la pantalla: el código lo
 * verifica el proyecto de clientes, pero los topes, qué correo se puede pedir y cuándo se aplica, los decide la base.
 *
 * QUÉ PRUEBA
 *   PARTE 1 (la rutina de anonimizar)
 *     A. Estructura: una sola `fn_clienta_anonimizar` (la de 4), que nadie de la API ejecuta; `archivar_clienta` y la conservación,
 *        con el md5 de siempre (no se tocaron).
 *     B. La espera: anonimizar desde el ERP con un pedido web pagado sin entregar → `anonimizar_pedido_web_pagado` (con el código) y
 *        nada cambia; por confirmar o confirmado, anonimiza igual (la hoja avisa); archivar sin anonimizar, igual; entregado o
 *        anulado, anonimiza.
 *     C. A pedido suyo (`tienda_web`): sin persona, con su nota en los `revoca` del Club, su motivo y su frase en la actividad; mal
 *        usado (con persona, automática u otro valor) → `anonimizar_pedido_invalido`. La conservación sigue igual.
 *   PARTE 2 (la cuenta)
 *     D. Estructura: las dos tablas con RLS, sin políticas ni permisos (tampoco `tienda_web`); las diez `tienda_*` son security definer
 *        y solo las ejecuta `tienda_web`; las dos del ERP, solo authenticated; los ayudantes y los disparadores, nadie.
 *     E. Cambiar mi correo: sin cuenta, mal escrito, el mismo, el de otra cuenta, de otra ficha o que otra cuenta confirma → nunca dice
 *        de quién; su propio correo de contacto, sí; los topes (60 s, 5 por hora, el bloqueo), y que el destino no cambie mientras
 *        espera; los intentos del código (5, el quinto bloquea 15 minutos; vencido).
 *     F. El correo confirmado: se aplica solo si se pidió (y otra vez, «igual»); otra persona lo tomó en el medio → `de_otra_persona` y
 *        nada cambia; el de contacto de la ficha no cambia; la actividad sin datos suyos; un pedido vencido igual se aplica si su
 *        código se confirmó.
 *     G. Restablecer (ERP): el candado del módulo, el Responsable, el correo (mal, el mismo, de otra ficha o de otra cuenta, que dice de
 *        cuál), la ficha archivada y sin cuenta; la ficha de un solo uso (solo su sha256 en la base, 10 minutos, una vez); la actividad
 *        con la persona y sin datos suyos; el primer envío (`tienda_restablecer_enviar`), «Pedir otro código» y el intento desde la
 *        página pública (solo restablecimientos pedidos en tienda; el tope de consultas por ip).
 *     H. La contraseña: 5 intentos cada 15 minutos, el bloqueo, y una buena los borra.
 *     I. Eliminar: lo que frena (pedidos en curso con su tienda y su WhatsApp, apartados abiertos; no lo vencido, entregado o
 *        anulado) y entonces no cambia nada; sin nada: la ficha anonimizada a pedido suyo, la cuenta cerrada (usuario por borrar,
 *        favoritos y esperas quitados), su cambio de correo y sus intentos borrados, sus ventas en su lugar; otra vez → sin_cuenta.
 *     J. Al cerrarse la cuenta por cualquier camino (el ERP también) se van su cambio pendiente y sus intentos; y uno nuevo para una
 *        cuenta cerrada no entra (`cuenta_web_cerrada`).
 *     K. Como `tienda_web`, todo el camino funciona y las tablas se niegan. `fn_clienta_acceso_web` con el candado del módulo.
 *     L. El pegado: las dos partes, dos veces; aborta con una función cambiada en vivo; y la PARTE 2 sin la PARTE 1.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK (fichas con DNI 0996xxxx, correos «zz.…@ejemplo.com», huellas «zz-…»): nada queda
 * en el Postgres local que comparten los worktrees. El paso del tiempo se prueba corriendo hacia atrás, en esa transacción, las fechas
 * de la fila del cambio o de los intentos.
 *
 * MUTANTES. `--mutantes` corre todos los escenarios contra versiones rotas a propósito de las dos migraciones (cada mutante rompe UNA
 * promesa) y falla si alguno sobrevive. No va en el CI (tarda): se corre a mano al tocar estas funciones.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=1` mete las dos partes dentro de cada transacción (que se revierte).
 *
 * DA POR SENTADO: la tienda online (cuentas, pedidos web, favoritos y esperas, 20261015055000), la tanda 1g del Club, Felipe como líder
 * y Micaela como integrante (el seed), `Tienda Trujillo`, una caja y ninguna ficha con DNI 0996xxxx.
 *
 * USO
 *   pnpm pruebas:tienda-mi-cuenta                       → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-mi-cuenta -- --mutantes         → además, los mutantes (a mano)
 *   pnpm pruebas:tienda-mi-cuenta -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const CON_MUTANTES = process.argv.includes("--mutantes");
const MIGRACIONES = [
  "supabase/migrations/20261015131000_clientas_anonimizar_espera_pedido_pagado.sql",
  "supabase/migrations/20261015132000_tienda_mi_cuenta_correo_acceso_y_baja.sql",
];
const TEXTOS_MIGRACIONES = MIGRACIONES.map((f) => readFileSync(f, "utf8"));
const APLICAR_ANTES = process.env.APLICAR_ANTES === "1" ? TEXTOS_MIGRACIONES.join("\n") : "";
const PARTE_1G = readFileSync("supabase/migrations/20261001210700_club_paso1g_parte8_funciones.sql", "utf8");
const ENTRADA_WEB = readFileSync("supabase/migrations/20261015055000_tienda_cuentas_entrada_y_cierre.sql", "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const TEXTOS = "borrador-2026-10-14";
const ANONIMIZAR = "retail.fn_clienta_anonimizar(uuid,uuid,boolean,text)";

/** El md5 «después» de una firma en la tabla de versiones de una migración. */
const despuesEn = (texto, firma) => {
  const esc = firma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\('${esc}',\\s+(?:null|'[0-9a-f]{32}'),\\s+'([0-9a-f]{32})'\\)`).exec(texto)?.[1] ?? null;
};
const ARCHIVAR_1G = despuesEn(PARTE_1G, "retail.archivar_clienta(uuid,text,boolean,integer)");
const CONSERVACION_WEB = despuesEn(ENTRADA_WEB, "retail.fn_club_anonimizar_inactivas()");
if (!ARCHIVAR_1G || !CONSERVACION_WEB) {
  console.error("✗ No encontré el md5 de archivar_clienta (1g) o de fn_club_anonimizar_inactivas (20261015055000).");
  process.exit(2);
}

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    const salida = execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const MD5_NORM = (x) => `md5(regexp_replace(regexp_replace(regexp_replace(${x}, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))`;

// Cada escenario: Ana (miembro del Club con publicidad y cuenta web), Bea (ficha sin club, con cuenta), Cami (sin cuenta), Dani (otra
// ficha con correo de contacto), Eva (otra cuenta web) y Fio (ficha archivada con cuenta), todas a mano. Felipe (líder) firma.
const preparar = (aplicar) => `
begin;
${aplicar}
set local search_path = retail, public, extensions;
do $$ begin
  if exists (select 1 from retail.clientas where documento_numero like '0996%') then
    raise exception 'Ambiente sucio: ya hay fichas con DNI 0996xxxx en esta base.';
  end if;
end $$;
update retail.configuracion_empresa set exige_responsable = false;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as tru, nombre as tru_nombre, coalesce(whatsapp_numero, '') as tru_wsp from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, correo, telefono_whatsapp, club_desde, codigo_club, publicidad_desde)
values ('dni', '09960001', 'Ana Mi Cuenta', 'zz.ana.contacto@ejemplo.com', '987960001', now() - interval '200 days', retail.fn_club_codigo_nuevo(), now() - interval '100 days')
returning id as ana, codigo_club as ana_codigo \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp)
values ('dni', '09960002', 'Bea Mi Cuenta', '987960002') returning id as bea \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp)
values ('dni', '09960003', 'Cami Sin Cuenta', '987960003') returning id as cami \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, correo, club_desde, codigo_club, telefono_whatsapp)
values ('dni', '09960004', 'Dani Otra Ficha', 'zz.dani.contacto@ejemplo.com', now() - interval '50 days', retail.fn_club_codigo_nuevo(), '987960004')
returning id as dani, codigo_club as dani_codigo \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp)
values ('dni', '09960005', 'Eva Otra Cuenta', '987960005') returning id as eva \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp)
values ('dni', '09960006', 'Fio Archivada', '987960006') returning id as fio \\gset
-- Una cuenta web abierta, como la deja tienda_registrar_cuenta (aquí directo: lo que se prueba es lo de esta migración).
create function pg_temp.cuenta(p_ficha uuid, p_correo text) returns uuid language sql as $f$
  insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados, aceptados_en, creada_en)
  values (gen_random_uuid(), p_ficha, p_correo, '${TEXTOS}', now(), now())
  returning usuario_web_id;
$f$;
select pg_temp.cuenta(:'ana', 'zz.ana.web@ejemplo.com') as u_ana \\gset
select pg_temp.cuenta(:'bea', 'zz.bea.web@ejemplo.com') as u_bea \\gset
select pg_temp.cuenta(:'eva', 'zz.eva.web@ejemplo.com') as u_eva \\gset
select pg_temp.cuenta(:'fio', 'zz.fio.web@ejemplo.com') as u_fio \\gset
update retail.clientas set archivada_en = now(), motivo_archivo = 'prueba' where id = :'fio';
select id as cuenta_ana from retail.cuentas_web where usuario_web_id = :'u_ana' \\gset
select id as cuenta_bea from retail.cuentas_web where usuario_web_id = :'u_bea' \\gset
-- Corre una llamada y DEVUELVE «estado|hint|detail|mensaje» (o «ok»): lo que hizo, si salió bien, queda (para ver después).
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_detalle text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_detalle = pg_exception_detail, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || coalesce(v_detalle, '') || '|' || v_msg;
end $f$;
grant execute on function pg_temp.intento(text) to authenticated, tienda_web;
create function pg_temp.corto(p text) returns text language sql as $f$
  select case when p = 'ok' then 'ok' else split_part(p, '|', 1) || '|' || split_part(p, '|', 2) || '|' || split_part(p, '|', 3) end
$f$;
grant execute on function pg_temp.corto(text) to authenticated, tienda_web;
-- Un pedido web de una ficha en un estado (con lo que su estado exige).
create function pg_temp.pedido(p_ficha uuid, p_tienda uuid, p_estado text, p_creado timestamptz default now()) returns text language plpgsql as $f$
declare v_codigo text; v_persona uuid := (select id from public.personas where auth_user_id = '${FELIPE}');
begin
  if p_estado = 'por_confirmar' then
    insert into retail.pedidos_web (clienta_id, ubicacion_id, creado_en) values (p_ficha, p_tienda, p_creado) returning codigo into v_codigo;
  elsif p_estado = 'confirmado' then
    insert into retail.pedidos_web (clienta_id, ubicacion_id, estado, total, confirmado_en, confirmado_por, creado_en)
    values (p_ficha, p_tienda, 'confirmado', 100, p_creado + interval '1 hour', v_persona, p_creado) returning codigo into v_codigo;
  elsif p_estado = 'pagado' then
    insert into retail.pedidos_web (clienta_id, ubicacion_id, estado, total, pagado, confirmado_en, confirmado_por, pagado_en, creado_en)
    values (p_ficha, p_tienda, 'pagado', 100, 100, p_creado + interval '1 hour', v_persona, p_creado + interval '2 hours', p_creado) returning codigo into v_codigo;
  elsif p_estado = 'entregado' then
    insert into retail.pedidos_web (clienta_id, ubicacion_id, estado, total, pagado, confirmado_en, confirmado_por, pagado_en, entregado_en, entregado_por, creado_en)
    values (p_ficha, p_tienda, 'entregado', 100, 100, p_creado + interval '1 hour', v_persona, p_creado + interval '2 hours', p_creado + interval '3 hours', v_persona, p_creado)
    returning codigo into v_codigo;
  elsif p_estado = 'anulado' then
    insert into retail.pedidos_web (clienta_id, ubicacion_id, estado, cerrado_en, cerrado_por, cierre_motivo, creado_en)
    values (p_ficha, p_tienda, 'anulado', p_creado + interval '1 hour', v_persona, 'cliente_desistio', p_creado) returning codigo into v_codigo;
  elsif p_estado = 'vencido' then
    insert into retail.pedidos_web (clienta_id, ubicacion_id, estado, cerrado_en, cierre_motivo, creado_en)
    values (p_ficha, p_tienda, 'vencido', p_creado + interval '25 hours', 'sin_confirmar', p_creado) returning codigo into v_codigo;
  end if;
  return v_codigo;
end $f$;
-- Un apartado abierto de una ficha (directo, como postgres: lo que se prueba es que frena).
create function pg_temp.apartado(p_ficha uuid, p_tienda uuid, p_codigo text) returns void language sql as $f$
  insert into retail.separaciones (codigo, ubicacion_id, caja_id, clienta_id, clienta_nombres, clienta_apellidos, clienta_celular,
    comprobante_tipo, creado_por, total, adelanto, vence_el, devolucion_medio, devolucion_numero)
  values (p_codigo, p_tienda, (select id from retail.cajas order by id limit 1), p_ficha, 'Zz', 'Prueba Mi Cuenta', '987960099',
    'boleta', (select id from public.personas where auth_user_id = '${FELIPE}'), 100, 50, current_date + 7, 'yape', '999888777');
$f$;
-- Como tienda_web (la puerta de la tienda) o como la cuenta de los claims (el ERP).
grant tienda_web to current_user with set true;
`;
const COMO_TIENDA = "set local role tienda_web;\n";
const COMO_CUENTA = "set local role authenticated;\n";
const DE_POSTGRES = "reset role;\n";
/** El estado de una respuesta jsonb de la base. */
const est = (llamada) => `((${llamada}) ->> 'estado')`;

// Escenarios: [nombre, sql, esperado]; un título suelto es [titulo].
const ESCENARIOS = [];
const seccion = (titulo) => ESCENARIOS.push([titulo]);
const escenario = (nombre, sql, esperado) => ESCENARIOS.push([null, nombre, sql, esperado]);

// =====================================================================================================================
seccion("— PARTE 1 · A. Estructura de la rutina —");
escenario(
  "una sola fn_clienta_anonimizar (la de 4: la de 3 ya no existe) y nadie de la API la ejecuta (ni tienda_web)",
  `select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_clienta_anonimizar';
   select to_regprocedure('retail.fn_clienta_anonimizar(uuid,uuid,boolean)') is null;
   select bool_or(has_function_privilege(r, '${ANONIMIZAR}', 'execute')) from unnest(array['anon', 'authenticated', 'tienda_web']) r;`,
  "1\nt\nf",
);
escenario(
  "archivar_clienta y la conservación no se tocaron (su md5 es el de la 1g y el de 20261015055000) y la llaman con tres argumentos",
  `select string_agg(${MD5_NORM("p.prosrc")}, '|' order by p.proname) from pg_proc p
    where p.oid in ('retail.archivar_clienta(uuid,text,boolean,integer)'::regprocedure, 'retail.fn_club_anonimizar_inactivas()'::regprocedure);`,
  `${ARCHIVAR_1G}|${CONSERVACION_WEB}`,
);

seccion("— PARTE 1 · B. Anonimizar espera un pedido web pagado —");
escenario(
  "con un pedido pagado sin entregar: anonimizar_pedido_web_pagado, con su código, y no cambia NADA (ficha, versión, cuenta, Club, actividad)",
  `select pg_temp.pedido(:'bea', :'tru', 'pagado') as p1 \\gset
   select version as v0 from retail.clientas where id = :'bea' \\gset
   select count(*) as act0 from retail.actividad where modulo = 'clientas' \\gset
   ${COMO_CUENTA}select split_part(r, '|', 1) || '|' || split_part(r, '|', 2) || '|' || (split_part(r, '|', 3) = :'p1')
     from (select pg_temp.intento(format('select retail.archivar_clienta(%L, %L, true, null)', :'bea', 'lo pidió')) as r) x;
   ${DE_POSTGRES}select (select (archivada_en is null and not anonimizada and version = :v0)::text from retail.clientas where id = :'bea')
     || '|' || (select (cerrada_en is null)::text from retail.cuentas_web where id = :'cuenta_bea')
     || '|' || ((select count(*) from retail.actividad where modulo = 'clientas') - :act0);`,
  "P0001|anonimizar_pedido_web_pagado|true\ntrue|true|0",
);
escenario(
  "dos pedidos pagados: los dos códigos en el detail, del más viejo al más nuevo; el mensaje no nombra a la persona",
  `select pg_temp.pedido(:'bea', :'tru', 'pagado', now() - interval '3 days') as p1 \\gset
   select pg_temp.pedido(:'bea', :'tru', 'pagado', now() - interval '1 day') as p2 \\gset
   select r ~ ('\\|' || :'p1' || ', ' || :'p2' || '\\|') and r !~* 'Bea' from (select pg_temp.intento(format('select retail.archivar_clienta(%L, %L, true, null)', :'bea', 'x')) as r) x;`,
  "t",
);
escenario(
  "por confirmar o confirmado (sin pagar): anonimiza igual (la hoja avisa) y su cuenta se cierra",
  `select pg_temp.pedido(:'bea', :'tru', 'por_confirmar') as _1 \\gset
   select pg_temp.pedido(:'bea', :'tru', 'confirmado') as _2 \\gset
   ${COMO_CUENTA}select pg_temp.intento(format('select retail.archivar_clienta(%L, %L, true, null)', :'bea', 'lo pidió'));
   ${DE_POSTGRES}select (select anonimizada::text from retail.clientas where id = :'bea') || '|' || (select (cerrada_en is not null)::text from retail.cuentas_web where id = :'cuenta_bea');`,
  "ok\ntrue|true",
);
escenario(
  "archivar SIN anonimizar con un pedido pagado: archiva como siempre (y su cuenta sigue abierta)",
  `select pg_temp.pedido(:'bea', :'tru', 'pagado') as _p \\gset
   ${COMO_CUENTA}select pg_temp.intento(format('select retail.archivar_clienta(%L, %L, false, null)', :'bea', 'se mudó'));
   ${DE_POSTGRES}select (archivada_en is not null)::text || '|' || anonimizada from retail.clientas where id = :'bea';
   select (cerrada_en is null)::text from retail.cuentas_web where id = :'cuenta_bea';`,
  "ok\ntrue|false\ntrue",
);
escenario(
  "entregado o anulado ya no la frena: anonimiza",
  `select pg_temp.pedido(:'bea', :'tru', 'entregado') as _1 \\gset
   select pg_temp.pedido(:'bea', :'tru', 'anulado') as _2 \\gset
   ${COMO_CUENTA}select pg_temp.intento(format('select retail.archivar_clienta(%L, %L, true, null)', :'bea', 'lo pidió'));
   ${DE_POSTGRES}select anonimizada from retail.clientas where id = :'bea';`,
  "ok\nt",
);

seccion("— PARTE 1 · C. A pedido suyo —");
escenario(
  "a pedido suyo (tienda_web), miembro con publicidad: dos revoca SIN persona con su nota, su motivo, su frase en la actividad y su cuenta cerrada",
  `select count(*) as act0 from retail.actividad where modulo = 'clientas' and accion = 'anonimizar' \\gset
   select retail.fn_clienta_anonimizar(:'ana', null, false, 'tienda_web') as revocados \\gset
   select :'revocados';
   select string_agg(finalidad || ':' || accion || ':' || medio || ':' || coalesce(registrado_por::text, 'sin_persona') || ':' || nota, ',' order by finalidad)
     from retail.club_permisos where clienta_id = :'ana' and medio = 'anonimizar';
   select anonimizada || '|' || motivo_archivo || '|' || (archivada_por is null) || '|' || (club_desde is null) || '|' || (correo is null) from retail.clientas where id = :'ana';
   select descripcion || '|' || (persona_id is null) || '|' || (detalle ->> 'a_pedido_suyo') from retail.actividad
    where modulo = 'clientas' and accion = 'anonimizar' and registro_id = :'ana';
   select (cerrada_en is not null) || '|' || (usuario_cerrado_id = :'u_ana') from retail.cuentas_web where id = :'cuenta_ana';`,
  "2\nclub:revoca:anonimizar:sin_persona:a pedido suyo, desde su cuenta de la tienda online,publicidad_whatsapp:revoca:anonimizar:sin_persona:a pedido suyo, desde su cuenta de la tienda online\n" +
    "true|Anonimizada a pedido suyo, desde la tienda online (Ley 29733)|true|true|true\n" +
    "un cliente eliminó su cuenta de la tienda online: se borraron sus datos de la ficha (Ley 29733)|true|tienda_web\ntrue|true",
);
escenario(
  "a pedido suyo con persona, automático o con otro medio: anonimizar_pedido_invalido, y nada cambia",
  `select pg_temp.corto(pg_temp.intento(format('select retail.fn_clienta_anonimizar(%L, %L, false, %L)', :'ana', :'persona_felipe', 'tienda_web')));
   select pg_temp.corto(pg_temp.intento(format('select retail.fn_clienta_anonimizar(%L, null, true, %L)', :'ana', 'tienda_web')));
   select pg_temp.corto(pg_temp.intento(format('select retail.fn_clienta_anonimizar(%L, null, false, %L)', :'ana', 'whatsapp')));
   select anonimizada from retail.clientas where id = :'ana';`,
  "22023|anonimizar_pedido_invalido|\n22023|anonimizar_pedido_invalido|\n22023|anonimizar_pedido_invalido|\nf",
);
escenario(
  "sin persona y sin ser a pedido suyo ni automática, a una miembro: responsable_requerido (como siempre)",
  `select pg_temp.corto(pg_temp.intento(format('select retail.fn_clienta_anonimizar(%L, null, false)', :'ana')));`,
  "42501|responsable_requerido|",
);
escenario(
  "a pedido suyo con un pedido pagado: también espera (la red de abajo de «Eliminar cuenta»)",
  `select pg_temp.pedido(:'ana', :'tru', 'pagado') as p1 \\gset
   select split_part(r, '|', 1) || '|' || split_part(r, '|', 2) || '|' || (split_part(r, '|', 3) = :'p1')
     from (select pg_temp.intento(format('select retail.fn_clienta_anonimizar(%L, null, false, %L)', :'ana', 'tienda_web')) as r) x;`,
  "P0001|anonimizar_pedido_web_pagado|true",
);
escenario(
  "la conservación (3 años, automática) sigue: anonimiza con su nota de siempre",
  `update retail.clientas set created_at = now() - interval '5 years', club_desde = null, codigo_club = null, publicidad_desde = null where id = :'cami';
   select retail.fn_club_anonimizar_inactivas() as _n \\gset
   select anonimizada || '|' || motivo_archivo from retail.clientas where id = :'cami';`,
  "true|Anonimizada: 3 años sin compras (Ley 29733)",
);

// =====================================================================================================================
const TIENDA = [
  "tienda_pedir_cambio_correo(uuid,text,boolean)",
  "tienda_intento_cambio_correo(uuid,text)",
  "tienda_correo_confirmado(uuid,text)",
  "tienda_restablecer_enviar(text)",
  "tienda_restablecer_reenviar(text,text)",
  "tienda_restablecer_intento(text,text)",
  "tienda_intento_de_clave(uuid)",
  "tienda_clave_correcta(uuid)",
  "tienda_antes_de_eliminar(uuid)",
  "tienda_eliminar_mi_cuenta(uuid)",
];
const ERP = ["restablecer_acceso_tienda_web(uuid,text)", "fn_clienta_acceso_web(uuid)"];
const NADIE = [
  "fn_cambio_correo_libre(uuid,text)",
  "fn_cambio_correo_limpiar(text)",
  "fn_cambio_correo_reservar_envio(uuid,text,text)",
  "fn_cambio_correo_contar_intento(uuid)",
  "fn_cambio_correo_reglas()",
  "fn_cuentas_web_limpiar_al_cerrar()",
  "fn_cuenta_web_lo_que_frena(uuid)",
];
const privilegios = (lista) =>
  `select string_agg(f || ':' || has_function_privilege('tienda_web', ('retail.' || f)::regprocedure, 'execute') || ':' ||
           has_function_privilege('authenticated', ('retail.' || f)::regprocedure, 'execute') || ':' ||
           has_function_privilege('anon', ('retail.' || f)::regprocedure, 'execute'), ',' order by f collate "C")
     from unnest(array[${lista.map((f) => `'${f}'`).join(", ")}]) f;`;

seccion("— PARTE 2 · D. Estructura —");
escenario(
  "las dos tablas: RLS encendido, sin políticas y sin permisos para nadie de la API (tampoco tienda_web)",
  `select string_agg(c.relname || ':' || c.relrowsecurity || ':' || (select count(*) from pg_policy p where p.polrelid = c.oid) || ':' ||
           (has_table_privilege('tienda_web', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select')
            or has_table_privilege('anon', c.oid, 'select') or has_table_privilege('tienda_web', c.oid, 'insert')), ',' order by c.relname)
     from pg_class c where c.oid in ('retail.cuentas_web_cambios_correo'::regclass, 'retail.cuentas_web_intentos_clave'::regclass);`,
  "cuentas_web_cambios_correo:true:0:false,cuentas_web_intentos_clave:true:0:false",
);
escenario(
  "las diez de la tienda: security definer con su search_path, y solo las ejecuta tienda_web",
  `select bool_and(p.prosecdef and exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'))
     from pg_proc p where p.oid in (${TIENDA.map((f) => `'retail.${f}'::regprocedure`).join(", ")});
   ${privilegios(TIENDA)}`,
  `t\n${[...TIENDA].sort().map((f) => `${f}:true:false:false`).join(",")}`,
);
escenario(
  "las dos del ERP: security definer, las ejecuta authenticated (no anon ni tienda_web); los ayudantes y los disparadores, nadie",
  `select bool_and(p.prosecdef) from pg_proc p where p.oid in (${ERP.map((f) => `'retail.${f}'::regprocedure`).join(", ")});
   ${privilegios(ERP)}
   ${privilegios(NADIE)}`,
  `t\n${[...ERP].sort().map((f) => `${f}:false:true:false`).join(",")}\n${[...NADIE].sort().map((f) => `${f}:false:false:false`).join(",")}`,
);
escenario(
  "los disparadores: el candado de las dos tablas (solo cuentas abiertas) y la limpieza al cerrar la cuenta",
  `select string_agg(c.relname || ':' || t.tgname, ',' order by t.tgname) from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and t.tgname in ('cuentas_web_cambios_correo_reglas', 'cuentas_web_intentos_clave_reglas', 'cuentas_web_limpiar_al_cerrar');`,
  "cuentas_web_cambios_correo:cuentas_web_cambios_correo_reglas,cuentas_web_intentos_clave:cuentas_web_intentos_clave_reglas,cuentas_web:cuentas_web_limpiar_al_cerrar",
);

const pedir = (u, correo) => `retail.tienda_pedir_cambio_correo(${u}, ${correo})`;
seccion("— PARTE 2 · E. Cambiar mi correo —");
escenario(
  "sin cuenta, mal escrito, el mismo, el de otra cuenta, el de contacto de otra ficha: nunca dice de quién (y nada queda pedido)",
  `select concat_ws(',',
     ${est(pedir("gen_random_uuid()", "'zz.nueva@ejemplo.com'"))},
     ${est(pedir("null", "'zz.nueva@ejemplo.com'"))},
     ${est(pedir(":'u_ana'", "'no-es-un-correo'"))},
     ${est(pedir(":'u_ana'", "' ZZ.Ana.Web@Ejemplo.com '"))},
     ${est(pedir(":'u_ana'", "'zz.eva.web@ejemplo.com'"))},
     ${est(pedir(":'u_ana'", "'zz.dani.contacto@ejemplo.com'"))});
   select count(*) from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_ana';
   select ${pedir(":'u_ana'", "'zz.dani.contacto@ejemplo.com'")}::text !~* '(dani|09960004)';`,
  "sin_cuenta,sin_cuenta,invalido,mismo_correo,correo_de_otra_persona,correo_de_otra_persona\n0\nt",
);
escenario(
  "su propio correo de contacto sí; «enviar» con el de antes y el nuevo (normalizado); el código vence a los 30 minutos y vive un día",
  `select ${pedir(":'u_ana'", "'  ZZ.Ana.Contacto@ejemplo.com '")}::text;
   select origen || '|' || envios || '|' || intentos || '|' || (codigo_vence_en between now() + interval '29 minutes' and now() + interval '31 minutes')
          || '|' || (vence_en between now() + interval '23 hours' and now() + interval '25 hours') || '|' || (token_hash is null)
     from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_ana';`,
  `{"estado": "enviar", "correo_nuevo": "zz.ana.contacto@ejemplo.com", "correo_actual": "zz.ana.web@ejemplo.com"}\ncuenta|1|0|true|true|true`,
);
escenario(
  "el correo que otra cuenta está confirmando: correo_de_otra_persona; uno muerto (vencido y sin código vivo) ya no traba",
  `select ${est(pedir(":'u_bea'", "'zz.compartido@ejemplo.com'"))} as _b \\gset
   select ${est(pedir(":'u_ana'", "'zz.compartido@ejemplo.com'"))};
   update retail.cuentas_web_cambios_correo set pedido_en = now() - interval '3 days', vence_en = now() - interval '2 days', codigo_vence_en = now() - interval '2 days' where cuenta_web_id = :'cuenta_bea';
   select ${est(pedir(":'u_ana'", "'zz.compartido@ejemplo.com'"))};
   select count(*) from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_bea';`,
  "correo_de_otra_persona\nenviar\n0",
);
escenario(
  "los topes: 60 s entre uno y otro (y mientras espera, el destino NO cambia); 5 por hora; nada durante un bloqueo",
  `select ${est(pedir(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))} as _1 \\gset
   select ((${pedir(":'u_ana'", "'zz.ana.otro@ejemplo.com'")}) ->> 'estado') || ':' || (((${pedir(":'u_ana'", "'zz.ana.otro@ejemplo.com'")}) ->> 'segundos')::int between 1 and 60)::text;
   select correo_nuevo from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_ana';
   update retail.cuentas_web_cambios_correo set ultimo_envio_en = now() - interval '2 minutes', envios = 5, primer_envio_en = now() - interval '10 minutes' where cuenta_web_id = :'cuenta_ana';
   select ${est(pedir(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))};
   update retail.cuentas_web_cambios_correo set envios = 1, bloqueado_hasta = now() + interval '9 minutes' where cuenta_web_id = :'cuenta_ana';
   select ${est(pedir(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))};
   update retail.cuentas_web_cambios_correo set bloqueado_hasta = now() - interval '1 second' where cuenta_web_id = :'cuenta_ana';
   select ${est(pedir(":'u_ana'", "'zz.ana.otro@ejemplo.com'"))};
   select correo_nuevo from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_ana';`,
  "esperar:true\nzz.ana.nuevo@ejemplo.com\nlimite\nbloqueado\nenviar\nzz.ana.otro@ejemplo.com",
);
const reenvio = (u, correo) => `retail.tienda_pedir_cambio_correo(${u}, ${correo}, true)`;
escenario(
  "«Pedir otro código» (reenvío) solo para el correo que ya pidió en Mi cuenta: a otro correo (o sin pedido) → sin_pedido y nada cambia",
  `select ${est(reenvio(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))};
   select ${est(pedir(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))} as _p \\gset
   select ${est(reenvio(":'u_ana'", "'zz.ana.otro@ejemplo.com'"))} || '|' || ${est(reenvio(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))};
   update retail.cuentas_web_cambios_correo set ultimo_envio_en = now() - interval '2 minutes' where cuenta_web_id = :'cuenta_ana';
   select ${est(reenvio(":'u_ana'", "' ZZ.Ana.Nuevo@ejemplo.com'"))};
   select correo_nuevo || '|' || envios from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_ana';`,
  "sin_pedido\nsin_pedido|esperar\nenviar\nzz.ana.nuevo@ejemplo.com|2",
);
const intento = (u, correo) => `retail.tienda_intento_cambio_correo(${u}, ${correo})`;
escenario(
  "el código: 5 intentos (quedan 4…0), el quinto deja 15 minutos de bloqueo; otro correo → sin_pedido; vencido",
  `select ${est(pedir(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))} as _1 \\gset
   select ${est(intento(":'u_ana'", "'zz.ana.otro@ejemplo.com'"))};
   select string_agg((${intento(":'u_ana'", "'ZZ.ana.nuevo@ejemplo.com'")}) ->> 'quedan', ',') from generate_series(1, 5);
   select ${est(intento(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))};
   select (bloqueado_hasta between now() + interval '14 minutes' and now() + interval '16 minutes') from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_ana';
   update retail.cuentas_web_cambios_correo set bloqueado_hasta = null, intentos = 0, codigo_vence_en = now() - interval '1 second' where cuenta_web_id = :'cuenta_ana';
   select ${est(intento(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))} || '|' || ${est(intento("gen_random_uuid()", "'zz.ana.nuevo@ejemplo.com'"))};`,
  "sin_pedido\n4,3,2,1,0\nbloqueado\nt\nvencido|sin_cuenta",
);

const confirmado = (u, correo) => `retail.tienda_correo_confirmado(${u}, ${correo})`;
seccion("— PARTE 2 · F. El correo que quedó en el proyecto de clientes —");
escenario(
  "se aplica solo si se pidió: sin pedido → sin_pedido (con el de antes); pedido → aplicado; otra vez → igual; el de contacto no cambia",
  `select ${confirmado(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'")}::text;
   select ${est(pedir(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))} as _p \\gset
   select ${confirmado(":'u_ana'", "' ZZ.Ana.Nuevo@ejemplo.com '")}::text;
   select ${est(confirmado(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))};
   select w.correo || '|' || c.correo || '|' || (select count(*) from retail.cuentas_web_cambios_correo m where m.cuenta_web_id = w.id)
     from retail.cuentas_web w join retail.clientas c on c.id = w.clienta_id where w.id = :'cuenta_ana';`,
  `{"estado": "sin_pedido", "correo_actual": "zz.ana.web@ejemplo.com"}\n{"estado": "aplicado", "origen": "cuenta"}\nigual\nzz.ana.nuevo@ejemplo.com|zz.ana.contacto@ejemplo.com|0`,
);
escenario(
  "otra persona tomó el correo entre el pedido y el código: de_otra_persona (con el de antes) y nada cambia",
  `select ${est(pedir(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))} as _p \\gset
   update retail.clientas set correo = 'zz.ana.nuevo@ejemplo.com' where id = :'cami';
   select ${confirmado(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'")}::text;
   select correo from retail.cuentas_web where id = :'cuenta_ana';`,
  `{"estado": "de_otra_persona", "correo_actual": "zz.ana.web@ejemplo.com"}\nzz.ana.web@ejemplo.com`,
);
escenario(
  "la actividad: una línea sin persona, sin el correo ni el nombre, con su origen",
  `select ${est(pedir(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))} as _p \\gset
   select ${est(confirmado(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))} as _c \\gset
   select count(*) || '|' || bool_and(persona_id is null) || '|' || bool_and(a::text !~* '(zz\\.ana|Ana Mi Cuenta|09960001)') || '|' || max(detalle ->> 'origen')
     from retail.actividad a where modulo = 'clientas' and accion = 'correo_web' and registro_id = :'ana';`,
  "1|true|true|cuenta",
);
escenario(
  "un pedido que ya venció (más de un día) igual se aplica si su código se confirmó; uno de otra cuenta no",
  `select ${est(pedir(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))} as _p \\gset
   update retail.cuentas_web_cambios_correo set pedido_en = now() - interval '3 days', vence_en = now() - interval '2 days' where cuenta_web_id = :'cuenta_ana';
   select ${est(confirmado(":'u_bea'", "'zz.ana.nuevo@ejemplo.com'"))};
   select ${est(confirmado(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))};`,
  "sin_pedido\naplicado",
);

const restablecer = (ficha, correo) => `retail.restablecer_acceso_tienda_web(${ficha}, ${correo})`;
seccion("— PARTE 2 · G. Restablecer el acceso desde el ERP —");
escenario(
  "como Felipe (Clientes): devuelve la ficha de un uso (64 hex), guarda solo su sha256 (10 min) y el pedido en tienda (un día)",
  `${COMO_CUENTA}select ${restablecer(":'ana'", "' ZZ.Ana.Nueva@ejemplo.com '")} as r \\gset
   ${DE_POSTGRES}select (:'r'::jsonb ->> 'token') ~ '^[0-9a-f]{64}$' || '|' || (:'r'::jsonb ->> 'correo_nuevo');
   select (token_hash = encode(sha256(convert_to(:'r'::jsonb ->> 'token', 'UTF8')), 'hex')) || '|' || (token_hash <> (:'r'::jsonb ->> 'token'))
          || '|' || origen || '|' || (token_vence_en between now() + interval '9 minutes' and now() + interval '11 minutes')
          || '|' || (vence_en between now() + interval '23 hours' and now() + interval '25 hours') || '|' || envios
     from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_ana';
   select correo from retail.cuentas_web where id = :'cuenta_ana';`,
  "true|zz.ana.nueva@ejemplo.com\ntrue|true|tienda|true|true|0\nzz.ana.web@ejemplo.com",
);
escenario(
  "la actividad: Clientes, firmada por la persona, sin el correo ni el nombre del cliente",
  `${COMO_CUENTA}select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as _r \\gset
   ${DE_POSTGRES}select count(*) || '|' || bool_and(persona_id = :'persona_felipe') || '|' || bool_and(a::text !~* '(zz\\.ana|Ana Mi Cuenta|09960001)')
     from retail.actividad a where modulo = 'clientas' and accion = 'restablecer_acceso_web' and registro_id = :'ana';`,
  "1|true|true",
);
escenario(
  "el correo: mal escrito, el mismo con que entra, el de contacto de otra ficha o el de otra cuenta (dice de cuál), uno que otra cuenta confirma",
  `${COMO_CUENTA}select pg_temp.corto(pg_temp.intento(format('select %s', format($q$retail.restablecer_acceso_tienda_web(%L, %L)$q$, :'ana', 'sin-arroba'))));
   select pg_temp.corto(pg_temp.intento(format('select retail.restablecer_acceso_tienda_web(%L, %L)', :'ana', 'zz.ana.web@ejemplo.com')));
   select pg_temp.intento(format('select retail.restablecer_acceso_tienda_web(%L, %L)', :'ana', 'zz.dani.contacto@ejemplo.com'))
          = '23505|correo_de_otra_ficha|correo|Ese correo ya es de la ficha de Dani Otra Ficha (' || :'dani_codigo' || '). Un correo es de una sola persona: usa otro.';
   select pg_temp.intento(format('select retail.restablecer_acceso_tienda_web(%L, %L)', :'ana', 'zz.eva.web@ejemplo.com'));
   ${DE_POSTGRES}select ${est(pedir(":'u_bea'", "'zz.lo.pide.bea@ejemplo.com'"))} as _b \\gset
   ${COMO_CUENTA}select pg_temp.corto(pg_temp.intento(format('select retail.restablecer_acceso_tienda_web(%L, %L)', :'ana', 'zz.lo.pide.bea@ejemplo.com')));
   ${DE_POSTGRES}select count(*) from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_ana';`,
  "22023|correo_invalido|correo\nP0001|acceso_web_mismo_correo|correo\nt\n" +
    "23505|correo_de_otra_ficha|correo|Con ese correo entra a la tienda online la ficha de Eva Otra Cuenta. Un correo es de una sola persona: usa otro.\n" +
    "23505|correo_de_otra_ficha|correo\n0",
);
escenario(
  "una ficha archivada o sin cuenta web: no; sin «Clientes» en su rol: clientas_sin_modulo; y nada queda pedido",
  `${COMO_CUENTA}select pg_temp.corto(pg_temp.intento(format('select retail.restablecer_acceso_tienda_web(%L, %L)', :'fio', 'zz.fio.nueva@ejemplo.com')));
   select pg_temp.corto(pg_temp.intento(format('select retail.restablecer_acceso_tienda_web(%L, %L)', :'cami', 'zz.cami.nueva@ejemplo.com')));
   ${DE_POSTGRES}delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';
   set local request.jwt.claim.sub = '${MICAELA}';
   set local request.jwt.claims = '{"sub":"${MICAELA}","role":"authenticated"}';
   ${COMO_CUENTA}select split_part(pg_temp.intento(format('select retail.restablecer_acceso_tienda_web(%L, %L)', :'ana', 'zz.ana.nueva@ejemplo.com')), '|', 2)
          || '|' || split_part(pg_temp.intento(format('select retail.fn_clienta_acceso_web(%L)', :'ana')), '|', 2);
   ${DE_POSTGRES}select count(*) from retail.cuentas_web_cambios_correo m join retail.cuentas_web w on w.id = m.cuenta_web_id
     where w.clienta_id in (:'ana', :'bea', :'cami', :'dani', :'eva', :'fio');`,
  "P0001|ficha_archivada|\nP0001|sin_cuenta_web|\nclientas_sin_modulo|clientas_sin_modulo\n0",
);
escenario(
  "fn_clienta_acceso_web: si tiene cuenta y el restablecimiento pendiente (el correo nuevo, cuándo vence y cuántos códigos salieron)",
  `${COMO_CUENTA}select retail.fn_clienta_acceso_web(:'cami')::text;
   select retail.fn_clienta_acceso_web(:'ana')::text;
   select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as _r \\gset
   select (r ->> 'cuenta_web') || '|' || (r -> 'restablecer' ->> 'correo') || '|' || (r -> 'restablecer' ->> 'envios') from (select retail.fn_clienta_acceso_web(:'ana') as r) x;`,
  `{"cuenta_web": false, "restablecer": null}\n{"cuenta_web": true, "restablecer": null}\ntrue|zz.ana.nueva@ejemplo.com|0`,
);
const enviarCon = (token) => `retail.tienda_restablecer_enviar(${token})`;
escenario(
  "el primer envío con la ficha: enviar (usuario, el de antes y el nuevo); la ficha se gasta (otra vez: invalido); una inventada o mal formada: invalido",
  `${COMO_CUENTA}select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as r \\gset
   ${DE_POSTGRES}select (x ->> 'estado') || '|' || (x ->> 'usuario_web_id' = :'u_ana') || '|' || (x ->> 'correo_actual') || '|' || (x ->> 'correo_nuevo')
     from (select ${enviarCon(":'r'::jsonb ->> 'token'")} as x) y;
   select ${est(enviarCon(":'r'::jsonb ->> 'token'"))} || '|' || ${est(enviarCon("repeat('a', 64)"))} || '|' || ${est(enviarCon("'corta'"))} || '|' || ${est(enviarCon("null"))};
   select envios || '|' || (token_hash is null) || '|' || (codigo_vence_en > now()) from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_ana';`,
  "enviar|true|zz.ana.web@ejemplo.com|zz.ana.nueva@ejemplo.com\ninvalido|invalido|invalido|invalido\n1|true|true",
);
escenario(
  "la ficha vencida (10 minutos): invalido; volver a pedirlo en 60 s: la ficha nueva sirve, pero dice esperar",
  `${COMO_CUENTA}select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as r1 \\gset
   ${DE_POSTGRES}update retail.cuentas_web_cambios_correo set token_vence_en = now() - interval '1 second', pedido_en = now() - interval '11 minutes' where cuenta_web_id = :'cuenta_ana';
   select ${est(enviarCon(":'r1'::jsonb ->> 'token'"))};
   ${COMO_CUENTA}select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as r2 \\gset
   ${DE_POSTGRES}select ${est(enviarCon(":'r2'::jsonb ->> 'token'"))} as _e \\gset
   ${COMO_CUENTA}select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as r3 \\gset
   ${DE_POSTGRES}select ${est(enviarCon(":'r3'::jsonb ->> 'token'"))};`,
  "invalido\nesperar",
);
const reenviar = (correo, ip) => `retail.tienda_restablecer_reenviar(${correo}, ${ip})`;
const restIntento = (correo, ip) => `retail.tienda_restablecer_intento(${correo}, ${ip})`;
escenario(
  "«Pedir otro código» en la página pública: solo un restablecimiento pedido EN TIENDA (no el cambio que pidió ella); 60 s; sin ip, invalido",
  `${COMO_CUENTA}select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as _r \\gset
   ${DE_POSTGRES}select ${est(pedir(":'u_bea'", "'zz.bea.nueva@ejemplo.com'"))} as _b \\gset
   select concat_ws(',', ${est(reenviar("'zz.nadie@ejemplo.com'", "'zz-ip-1'"))}, ${est(reenviar("'zz.bea.nueva@ejemplo.com'", "'zz-ip-1'"))},
     ${reenviar("' ZZ.Ana.Nueva@ejemplo.com'", "'zz-ip-1'")} ->> 'correo_nuevo', ${est(reenviar("'zz.ana.nueva@ejemplo.com'", "'zz-ip-1'"))},
     ${est(reenviar("'zz.ana.nueva@ejemplo.com'", "null"))});`,
  "sin_pedido,sin_pedido,zz.ana.nueva@ejemplo.com,esperar,invalido",
);
escenario(
  "«Obtener código» cuando el primer envío nunca salió (la tienda no le contestó al ERP): enviar, con el usuario y su correo de entrada de hoy (el servidor vuelve a PEDIR el cambio en el proyecto de clientes)",
  `${COMO_CUENTA}select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as _r \\gset
   ${DE_POSTGRES}select (x ->> 'estado') || '|' || (x ->> 'usuario_web_id' = :'u_ana') || '|' || (x ->> 'correo_actual') || '|' || (x ->> 'correo_nuevo')
     from (select ${reenviar("'zz.ana.nueva@ejemplo.com'", "'zz-ip-4'")} as x) y;
   select envios from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_ana';`,
  "enviar|true|zz.ana.web@ejemplo.com|zz.ana.nueva@ejemplo.com\n1",
);
escenario(
  "el tope de consultas por ip de la página pública (20 por hora, el de la tienda y el cartel): la 21.ª dice muchos_intentos",
  `select string_agg(distinct ${est(reenviar("'zz.nadie@ejemplo.com'", "'zz-ip-tope'"))}, ',') from generate_series(1, 20);
   select ${est(reenviar("'zz.nadie@ejemplo.com'", "'zz-ip-tope'"))} || '|' || ${est(restIntento("'zz.nadie@ejemplo.com'", "'zz-ip-tope'"))};`,
  "sin_pedido\nmuchos_intentos|muchos_intentos",
);
escenario(
  "el intento desde la página pública: puede (con el usuario de ESA cuenta), los 5 y el bloqueo, vencido; el cambio que pidió ella no se completa aquí",
  `${COMO_CUENTA}select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as r \\gset
   ${DE_POSTGRES}select ${est(enviarCon(":'r'::jsonb ->> 'token'"))} as _e \\gset
   select (x ->> 'estado') || '|' || (x ->> 'quedan') || '|' || (x ->> 'usuario_web_id' = :'u_ana') from (select ${restIntento("'zz.ana.nueva@ejemplo.com'", "'zz-ip-2'")} as x) y;
   select string_agg(${restIntento("'zz.ana.nueva@ejemplo.com'", "'zz-ip-2'")} ->> 'estado', ',') from generate_series(1, 5);
   select ${est(pedir(":'u_bea'", "'zz.bea.nueva@ejemplo.com'"))} as _b \\gset
   select ${est(restIntento("'zz.bea.nueva@ejemplo.com'", "'zz-ip-2'"))};`,
  "puede|4|true\npuede,puede,puede,puede,bloqueado\nsin_pedido",
);
escenario(
  "un código mandado al final del día del pedido sirve sus 30 minutos aunque el pedido ya venció; después, ya no",
  `${COMO_CUENTA}select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as r \\gset
   ${DE_POSTGRES}select ${est(enviarCon(":'r'::jsonb ->> 'token'"))} as _e \\gset
   update retail.cuentas_web_cambios_correo set pedido_en = now() - interval '1 day 1 minute', vence_en = now() - interval '1 minute' where cuenta_web_id = :'cuenta_ana';
   select ${est(restIntento("'zz.ana.nueva@ejemplo.com'", "'zz-ip-3'"))} || '|' || ${est(reenviar("'zz.ana.nueva@ejemplo.com'", "'zz-ip-3'"))};
   update retail.cuentas_web_cambios_correo set codigo_vence_en = now() - interval '1 second' where cuenta_web_id = :'cuenta_ana';
   select ${est(restIntento("'zz.ana.nueva@ejemplo.com'", "'zz-ip-3'"))};`,
  "puede|sin_pedido\nsin_pedido",
);
escenario(
  "restablecer y confirmar: el correo de entrada cambia recién con el código (tienda_correo_confirmado, origen tienda)",
  `${COMO_CUENTA}select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as r \\gset
   ${DE_POSTGRES}select ${est(enviarCon(":'r'::jsonb ->> 'token'"))} as _e \\gset
   select correo from retail.cuentas_web where id = :'cuenta_ana';
   select ${confirmado(":'u_ana'", "'zz.ana.nueva@ejemplo.com'")}::text;
   select correo from retail.cuentas_web where id = :'cuenta_ana';`,
  `zz.ana.web@ejemplo.com\n{"estado": "aplicado", "origen": "tienda"}\nzz.ana.nueva@ejemplo.com`,
);

const clave = (u) => `retail.tienda_intento_de_clave(${u})`;
seccion("— PARTE 2 · H. La contraseña —");
escenario(
  "5 intentos cada 15 minutos (quedan 4…0) y el sexto, bloqueado 15 minutos; sin cuenta; una buena los borra",
  `select string_agg(${clave(":'u_ana'")} ->> 'quedan', ',') from generate_series(1, 5);
   select ${est(clave(":'u_ana'"))} || '|' || ((((${clave(":'u_ana'")}) ->> 'minutos')::int between 14 and 15)::text) || '|' || ${est(clave("gen_random_uuid()"))};
   select retail.tienda_clave_correcta(:'u_ana') || '|' || ${est(clave(":'u_ana'"))} || '|' || retail.tienda_clave_correcta(gen_random_uuid());`,
  "4,3,2,1,0\nbloqueado|true|sin_cuenta\ntrue|puede|false",
);
escenario(
  "pasados 15 minutos sin bloqueo, la cuenta empieza de cero; pasado el bloqueo, también",
  `select string_agg(${clave(":'u_ana'")} ->> 'quedan', ',') from generate_series(1, 3);
   update retail.cuentas_web_intentos_clave set primer_intento_en = now() - interval '16 minutes' where cuenta_web_id = :'cuenta_ana';
   select ${clave(":'u_ana'")} ->> 'quedan';
   update retail.cuentas_web_intentos_clave set intentos = 5, bloqueada_hasta = now() - interval '1 second' where cuenta_web_id = :'cuenta_ana';
   select ${clave(":'u_ana'")} ->> 'quedan';`,
  "4,3,2\n4\n4",
);

const eliminar = (u) => `retail.tienda_eliminar_mi_cuenta(${u})`;
seccion("— PARTE 2 · I. Eliminar mi cuenta —");
escenario(
  "lo que frena: los pedidos en curso (por confirmar en plazo, confirmado, pagado) con su tienda y su WhatsApp, y los apartados abiertos; no lo demás",
  `select pg_temp.pedido(:'ana', :'tru', 'por_confirmar', now() - interval '1 hour') as p_recien \\gset
   select pg_temp.pedido(:'ana', :'tru', 'por_confirmar', now() - interval '30 days') as _viejo \\gset
   select pg_temp.pedido(:'ana', :'tru', 'confirmado', now() - interval '3 days') as p_conf \\gset
   select pg_temp.pedido(:'ana', :'tru', 'pagado', now() - interval '5 days') as p_pag \\gset
   select pg_temp.pedido(:'ana', :'tru', 'entregado', now() - interval '9 days') as _e \\gset
   select pg_temp.pedido(:'ana', :'tru', 'anulado', now() - interval '12 days') as _a \\gset
   select pg_temp.pedido(:'ana', :'tru', 'vencido', now() - interval '14 days') as _v \\gset
   select pg_temp.pedido(:'bea', :'tru', 'pagado') as _otra \\gset
   select pg_temp.apartado(:'ana', :'tru', 'APT-ZZ-0001');
   select (select string_agg((p ->> 'codigo') || ':' || (p ->> 'estado'), ',') from jsonb_array_elements(x -> 'pedidos') p)
          || '|' || (select string_agg(a ->> 'codigo', ',') from jsonb_array_elements(x -> 'apartados') a)
          || '|' || (x -> 'pedidos' -> 0 ->> 'whatsapp' is not distinct from nullif(:'tru_wsp', ''))
     from (select retail.tienda_antes_de_eliminar(:'u_ana') as x) y;
   select :'p_pag' || ':pagado,' || :'p_conf' || ':confirmado,' || :'p_recien' || ':por_confirmar|APT-ZZ-0001|true';`,
  "IGUALES",
);
escenario(
  "con algo en curso no se elimina: en_curso, con la lista, y no cambia NADA (ni la ficha, ni la cuenta, ni el Club)",
  `select pg_temp.pedido(:'ana', :'tru', 'confirmado') as _p \\gset
   select version as v0 from retail.clientas where id = :'ana' \\gset
   select x ->> 'estado' || '|' || jsonb_array_length(x -> 'pedidos') || '|' || jsonb_array_length(x -> 'apartados') from (select ${eliminar(":'u_ana'")} as x) y;
   select (version = :v0) || '|' || anonimizada || '|' || (club_desde is not null) from retail.clientas where id = :'ana';
   select (cerrada_en is null) || '|' || (select count(*) from retail.club_permisos where clienta_id = :'ana' and medio = 'anonimizar') from retail.cuentas_web where id = :'cuenta_ana';`,
  "en_curso|1|0\ntrue|false|true\ntrue|0",
);
escenario(
  "un apartado abierto también frena (la regla de la conservación)",
  `select pg_temp.apartado(:'ana', :'tru', 'APT-ZZ-0002');
   select ${est(eliminar(":'u_ana'"))} || '|' || (select anonimizada from retail.clientas where id = :'ana');`,
  "en_curso|false",
);
escenario(
  "sin nada en curso: eliminada — ficha anonimizada a pedido suyo, cuenta cerrada (usuario por borrar, favoritos y esperas quitados), su cambio y sus intentos borrados",
  `insert into retail.favoritos_web (cuenta_web_id, producto_id) select :'cuenta_ana', p.id from retail.productos p order by p.id limit 2;
   insert into retail.esperas_web (cuenta_web_id, variante_id) select :'cuenta_ana', v.id from retail.variantes v order by v.id limit 1;
   select ${est(pedir(":'u_ana'", "'zz.ana.nuevo@ejemplo.com'"))} as _p \\gset
   select ${est(clave(":'u_ana'"))} as _c \\gset
   select pg_temp.pedido(:'ana', :'tru', 'entregado') as _e \\gset
   select ${eliminar(":'u_ana'")}::text;
   select anonimizada || '|' || motivo_archivo || '|' || (documento_numero is null) || '|' || (club_desde is null) from retail.clientas where id = :'ana';
   select (cerrada_en is not null) || '|' || (correo is null) || '|' || (usuario_cerrado_id = :'u_ana') || '|' || ((retail.tienda_usuarios_por_borrar(200) -> 'usuarios') ? :'u_ana')
     from retail.cuentas_web where id = :'cuenta_ana';
   select (select count(*) filter (where quitado_en is null) from retail.favoritos_web where cuenta_web_id = :'cuenta_ana') || '|' ||
          (select count(*) filter (where quitada_en is null) from retail.esperas_web where cuenta_web_id = :'cuenta_ana') || '|' ||
          (select count(*) from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_ana') || '|' ||
          (select count(*) from retail.cuentas_web_intentos_clave where cuenta_web_id = :'cuenta_ana');
   select ${est(eliminar(":'u_ana'"))} || '|' || coalesce(retail.tienda_mi_cuenta(:'u_ana')::text, 'null');
   select count(*) from retail.pedidos_web where clienta_id = :'ana';`,
  `{"estado": "eliminada"}\ntrue|Anonimizada a pedido suyo, desde la tienda online (Ley 29733)|true|true\ntrue|true|true|true\n0|0|0|0\nsin_cuenta|null\n1`,
);
escenario(
  "una ficha archivada (sin anonimizar) con cuenta también se puede eliminar; y sin usuario: sin_cuenta",
  `select ${est(eliminar(":'u_fio'"))} || '|' || ${est(eliminar("null"))};
   select anonimizada from retail.clientas where id = :'fio';`,
  "eliminada|sin_cuenta\nt",
);

seccion("— PARTE 2 · J. Al cerrarse la cuenta por cualquier camino —");
escenario(
  "anonimizar en el ERP también borra su cambio pendiente y sus intentos; y uno nuevo para la cuenta cerrada no entra",
  `${COMO_CUENTA}select ${restablecer(":'bea'", "'zz.bea.nueva@ejemplo.com'")} as _r \\gset
   ${DE_POSTGRES}select ${est(clave(":'u_bea'"))} as _c \\gset
   ${COMO_CUENTA}select pg_temp.intento(format('select retail.archivar_clienta(%L, %L, true, null)', :'bea', 'lo pidió'));
   ${DE_POSTGRES}select (select count(*) from retail.cuentas_web_cambios_correo where cuenta_web_id = :'cuenta_bea') || '|' ||
          (select count(*) from retail.cuentas_web_intentos_clave where cuenta_web_id = :'cuenta_bea');
   select pg_temp.corto(pg_temp.intento(format($q$insert into retail.cuentas_web_cambios_correo (cuenta_web_id, correo_nuevo, origen, vence_en) values (%L, 'zz.x@ejemplo.com', 'cuenta', now() + interval '1 day')$q$, :'cuenta_bea')));
   select pg_temp.corto(pg_temp.intento(format($q$insert into retail.cuentas_web_intentos_clave (cuenta_web_id) values (%L)$q$, :'cuenta_bea')));`,
  "ok\n0|0\n23514|cuenta_web_cerrada|\n23514|cuenta_web_cerrada|",
);
const SIN_RESTOS = `select count(*) from retail.cuentas_web_cambios_correo m join retail.cuentas_web w on w.id = m.cuenta_web_id where w.cerrada_en is not null;\n`;
escenario(
  "en toda la base: ninguna cuenta cerrada tiene un cambio de correo pendiente",
  `${COMO_CUENTA}select ${restablecer(":'bea'", "'zz.bea.nueva@ejemplo.com'")} as _r \\gset
   select pg_temp.intento(format('select retail.archivar_clienta(%L, %L, true, null)', :'bea', 'lo pidió')) as _a \\gset
   ${DE_POSTGRES}${SIN_RESTOS}`,
  "0",
);
escenario(
  "control: sin el disparador de la limpieza, el cambio SÍ queda colgado (la consulta de arriba no está ciega)",
  `alter table retail.cuentas_web disable trigger cuentas_web_limpiar_al_cerrar;
   ${COMO_CUENTA}select ${restablecer(":'bea'", "'zz.bea.nueva@ejemplo.com'")} as _r \\gset
   select pg_temp.intento(format('select retail.archivar_clienta(%L, %L, true, null)', :'bea', 'lo pidió')) as _a \\gset
   ${DE_POSTGRES}${SIN_RESTOS}`,
  "1",
);

seccion("— PARTE 2 · K. Como tienda_web —");
escenario(
  "todo el camino de la tienda funciona como tienda_web, y las dos tablas se le niegan",
  `${COMO_CUENTA}select ${restablecer(":'ana'", "'zz.ana.nueva@ejemplo.com'")} as r \\gset
   ${DE_POSTGRES}${COMO_TIENDA}select concat_ws(',',
     ${est(enviarCon(":'r'::jsonb ->> 'token'"))},
     ${est(restIntento("'zz.ana.nueva@ejemplo.com'", "'zz-ip-tw'"))},
     ${est(confirmado(":'u_ana'", "'zz.ana.nueva@ejemplo.com'"))},
     ${est(pedir(":'u_bea'", "'zz.bea.nueva@ejemplo.com'"))},
     ${est(intento(":'u_bea'", "'zz.bea.nueva@ejemplo.com'"))},
     ${est(clave(":'u_bea'"))},
     retail.tienda_clave_correcta(:'u_bea')::text,
     (retail.tienda_antes_de_eliminar(:'u_bea') -> 'pedidos')::text,
     ${est(eliminar(":'u_bea'"))});
   select split_part(pg_temp.intento('select count(*) from retail.cuentas_web_cambios_correo'), '|', 1) || '|' ||
          split_part(pg_temp.intento('select count(*) from retail.cuentas_web_intentos_clave'), '|', 1);`,
  "enviar,puede,aplicado,enviar,puede,puede,true,[],eliminada\n42501|42501",
);

// ---- Los mutantes: cada uno rompe UNA promesa; algún escenario tiene que ponerse rojo -----------------------------------------
const MUTANTES = [
  ["anonimizar no espera el pedido pagado", 0, "where w.clienta_id = p_id and w.estado = 'pagado');", "where false);"],
  ["a pedido suyo exige igual al responsable", 0, "and p_persona is null and not p_automatica and not v_ella then", "and p_persona is null and not p_automatica then"],
  ["a pedido suyo sin su nota", 0, "when p_pedido_por_ella is not null then 'a pedido suyo, desde su cuenta de la tienda online' end;", "end;"],
  ["a pedido suyo acepta cualquier medio", 0, "if v_ella and p_pedido_por_ella is distinct from 'tienda_web' then", "if false then"],
  ["a pedido suyo con el motivo de siempre", 0, "when v_ella then 'Anonimizada a pedido suyo, desde la tienda online (Ley 29733)'", "when v_ella then 'Anonimizada (Ley 29733)'"],
  ["el correo de otra ficha sirve", 1, "c.id is distinct from (select w.clienta_id from retail.cuentas_web w where w.id = p_cuenta)) then 'de_otra_ficha'", "c.id is distinct from (select w.clienta_id from retail.cuentas_web w where w.id = p_cuenta)) then null"],
  ["el correo de otra cuenta sirve", 1, "where w.correo = p_correo and w.id <> p_cuenta) then 'de_otra_cuenta'", "where w.correo = p_correo and w.id <> p_cuenta) then null"],
  ["el de contacto de su propia ficha no sirve", 1, "c.id is distinct from (select w.clienta_id from retail.cuentas_web w where w.id = p_cuenta)) then 'de_otra_ficha'", "true) then 'de_otra_ficha'"],
  ["sin espera de 60 s", 1, "if v_ultimo > v_ahora - interval '60 seconds' then", "if false then"],
  ["el reenvío manda a un correo que no pidió (sin pasar por la contraseña)", 1, "  if coalesce(p_reenvio, false) and not exists (", "  if false and not exists ("],
  ["sin tope de 5 por hora", 1, "if v_primer > v_ahora - interval '1 hour' and v_envios >= 5 then", "if false then"],
  ["el destino cambia aunque haya que esperar", 1,
    "  if v_ultimo > v_ahora - interval '60 seconds' then",
    "  update retail.cuentas_web_cambios_correo m set correo_nuevo = coalesce(p_correo, m.correo_nuevo) where m.cuenta_web_id = p_cuenta;\n  if v_ultimo > v_ahora - interval '60 seconds' then"],
  ["sin bloqueo al quinto código equivocado", 1, "bloqueado_hasta = case when v_intentos + 1 >= 5 then v_ahora + interval '15 minutes' else m.bloqueado_hasta end", "bloqueado_hasta = m.bloqueado_hasta"],
  ["el correo confirmado se aplica sin pedido", 1, "  if v_origen is null then\n    -- Nadie pidió", "  if false then\n    -- Nadie pidió"],
  ["la ficha del ERP se puede usar dos veces", 1, "  update retail.cuentas_web_cambios_correo m set token_hash = null, token_vence_en = null where m.cuenta_web_id = v_cuenta;\n", ""],
  ["la ficha del ERP no vence", 1, "and m.token_vence_en > now() and m.origen = 'tienda' and w.cerrada_en is null", "and m.origen = 'tienda' and w.cerrada_en is null"],
  ["la base guarda la ficha del ERP en claro", 1, "values (v_cuenta, v_correo, 'tienda', now(), now() + interval '1 day', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),", "values (v_cuenta, v_correo, 'tienda', now(), now() + interval '1 day', v_token,"],
  ["el ERP restablece sin el módulo", 1, "  perform retail.fn_exigir_modulo('clientas');\n  v_persona := retail.fn_actor_persona_id(true);", "  v_persona := retail.fn_actor_persona_id(true);"],
  ["el ERP restablece una ficha archivada", 1, "  if v_archivada then\n    raise exception 'Esta ficha está archivada", "  if false then\n    raise exception 'Esta ficha está archivada"],
  ["la página pública completa el cambio que pidió ella", 1, "where m.correo_nuevo = v_correo and m.origen = 'tienda' and (m.vence_en > now() or m.codigo_vence_en > now())", "where m.correo_nuevo = v_correo and (m.vence_en > now() or m.codigo_vence_en > now())"],
  ["la página pública sin tope por ip", 1, "  if not retail.club_intento('consulta', p_ip_hash, null, null) then\n    return jsonb_build_object('estado', 'muchos_intentos');\n  end if;\n  for v_cuenta, v_usuario, v_actual in", "  for v_cuenta, v_usuario, v_actual in"],
  // «Obtener código» de la página pública sin el usuario: el servidor solo podría reenviar, y si el primer envío no salió, no llega nada.
  ["la página pública no dice de qué usuario es", 1, "jsonb_build_object('usuario_web_id', v_usuario, 'correo_actual', v_actual, 'correo_nuevo', v_correo)", "jsonb_build_object('correo_nuevo', v_correo)"],
  ["la contraseña sin bloqueo", 1, "bloqueada_hasta = case when v_intentos + 1 >= 5 then v_ahora + interval '15 minutes' end", "bloqueada_hasta = null"],
  ["eliminar no mira los pedidos en curso", 1, "if jsonb_array_length(v_frena -> 'pedidos') > 0 or", "if false or"],
  ["eliminar no mira los apartados", 1, "where s.clienta_id = p_clienta and s.estado = 'abierta'", "where false"],
  ["lo que frena cuenta lo entregado", 1, "and w.estado in ('por_confirmar', 'confirmado', 'pagado')", "and w.estado in ('por_confirmar', 'confirmado', 'pagado', 'entregado')"],
  ["al cerrarse la cuenta su cambio queda colgado", 1, "  delete from retail.cuentas_web_cambios_correo m where m.cuenta_web_id = new.id;\n", ""],
];

function escenariosContra(aplicar) {
  const PREPARAR = preparar(aplicar);
  const resultados = [];
  for (const [titulo, nombre, cuerpo, esperado] of ESCENARIOS) {
    if (titulo) continue;
    const r = correr(`${PREPARAR}${cuerpo}\nrollback;\n`);
    let ok;
    let detalle;
    if (esperado === "IGUALES") {
      const lineas = r.ok ? r.salida.split("\n") : [];
      const [obtenido, armado] = lineas.slice(-2);
      ok = r.ok && !!obtenido && obtenido === armado;
      detalle = r.ok ? `dio «${obtenido}», se esperaba «${armado}»` : r.mensaje;
    } else {
      ok = r.ok && r.salida === esperado;
      detalle = r.ok ? `dio:\n${r.salida}\nse esperaba:\n${esperado}` : r.mensaje;
    }
    resultados.push({ nombre, ok, detalle });
  }
  return resultados;
}

function main() {
  if (!correr("select 1;").ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES && correr("select to_regprocedure('retail.tienda_eliminar_mi_cuenta(uuid)') is not null;").salida !== "t") {
    console.error(`Faltan las migraciones: aplica ${MIGRACIONES.join(" y ")}, o corre con APLICAR_ANTES=1`);
    process.exit(2);
  }
  const prep = correr(`${preparar(APLICAR_ANTES)}select 'listo';\nrollback;\n`);
  if (!prep.ok || !prep.salida.endsWith("listo")) {
    console.error(`No se pudo preparar el escenario: ${prep.mensaje ?? prep.salida}`);
    process.exit(2);
  }

  let fallos = 0;
  let total = 0;
  const resultados = escenariosContra(APLICAR_ANTES);
  let i = 0;
  for (const [titulo] of ESCENARIOS) {
    if (titulo) {
      console.log(titulo);
      continue;
    }
    const r = resultados[i++];
    total++;
    console.log(`${r.ok ? "✓" : "✗"} ${r.nombre}`);
    if (!r.ok) {
      fallos++;
      console.log(`    ${String(r.detalle).trim().split("\n").slice(0, 14).join("\n    ")}`);
    }
  }

  console.log("— L. El pegado —");
  const [parte1, parte2] = TEXTOS_MIGRACIONES;
  const dosVeces = correr(`begin;\n${parte1}\n${parte2}\n${parte1}\n${parte2}\nset local search_path = retail, public, extensions;
select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_clienta_anonimizar', ${[...TIENDA, ...ERP, ...NADIE].map((f) => `'${f.slice(0, f.indexOf("("))}'`).join(", ")});
rollback;\n`);
  total++;
  const okDos = dosVeces.ok && dosVeces.salida.split("\n").pop() === String(1 + TIENDA.length + ERP.length + NADIE.length);
  console.log(`${okDos ? "✓" : "✗"} las dos partes se pueden pegar dos veces seguidas (sin duplicar ninguna función)`);
  if (!okDos) {
    fallos++;
    console.log(`    ${dosVeces.ok ? dosVeces.salida : dosVeces.mensaje}`);
  }
  const cambiada = correr(`begin;\n${APLICAR_ANTES}\ncreate or replace function retail.tienda_eliminar_mi_cuenta(p_usuario_web_id uuid) returns jsonb language sql security definer set search_path = retail, public as $q$ select '{}'::jsonb $q$;\n${parte2}\nrollback;\n`);
  total++;
  const okCambiada = !cambiada.ok && cambiada.mensaje.includes("retail.tienda_eliminar_mi_cuenta(uuid) cambió desde que se escribió esta migración");
  console.log(`${okCambiada ? "✓" : "✗"} la PARTE 2 aborta si una de sus funciones cambió en vivo (no la reemplaza a ciegas)`);
  if (!okCambiada) {
    fallos++;
    console.log(`    ${cambiada.ok ? "no abortó" : cambiada.mensaje.split("\n").slice(0, 4).join("\n    ")}`);
  }
  const rutina = correr(`begin;\n${APLICAR_ANTES}\ncreate or replace function retail.fn_clienta_anonimizar(p_id uuid, p_persona uuid, p_automatica boolean, p_pedido_por_ella text default null) returns integer language plpgsql as $q$ begin return 0; end; $q$;\n${parte1}\nrollback;\n`);
  total++;
  const okRutina = !rutina.ok && rutina.mensaje.includes(`${ANONIMIZAR} cambió desde que se escribió esta migración`);
  console.log(`${okRutina ? "✓" : "✗"} la PARTE 1 aborta si la rutina de anonimizar cambió en vivo`);
  if (!okRutina) {
    fallos++;
    console.log(`    ${rutina.ok ? "no abortó" : rutina.mensaje.split("\n").slice(0, 4).join("\n    ")}`);
  }
  const sinParte1 = correr(`begin;\n${APLICAR_ANTES}\ndrop function if exists ${ANONIMIZAR};\n${parte2}\nrollback;\n`);
  total++;
  const okSin = !sinParte1.ok && sinParte1.mensaje.includes("Falta la PARTE 1");
  console.log(`${okSin ? "✓" : "✗"} la PARTE 2 sin la PARTE 1 aborta y dice qué falta`);
  if (!okSin) {
    fallos++;
    console.log(`    ${sinParte1.ok ? "no abortó" : sinParte1.mensaje.split("\n").slice(0, 4).join("\n    ")}`);
  }
  const sinSelectInto = TEXTOS_MIGRACIONES.every((t) => !/'[^'\n]*\bselect\b[^'\n]*\binto\b[^'\n]*'/i.test(t.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/g, "")));
  total++;
  console.log(`${sinSelectInto ? "✓" : "✗"} ningún «select … into» dentro de un texto entre comillas fuera de $…$ (el SQL Editor lo confunde)`);
  if (!sinSelectInto) fallos++;
  const sinPoliticas = TEXTOS_MIGRACIONES.every((t) => !/\b(create|drop)\s+policy\b|\bdrop\s+trigger\b/i.test(t.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n")));
  total++;
  console.log(`${sinPoliticas ? "✓" : "✗"} sin «create/drop policy» ni «drop trigger» (CLAUDE.md, «Políticas y deadlocks»)`);
  if (!sinPoliticas) fallos++;

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);

  if (!CON_MUTANTES) return;
  console.log("\n— Mutantes (cada uno tiene que poner rojo algún escenario) —");
  let vivos = 0;
  for (const [nombre, archivo, de, a] of MUTANTES) {
    if (!TEXTOS_MIGRACIONES[archivo].includes(de)) {
      console.log(`✗ ${nombre}: el texto que muta ya no está en ${MIGRACIONES[archivo]} (actualiza el mutante)`);
      vivos++;
      continue;
    }
    const mutadas = TEXTOS_MIGRACIONES.map((t, k) => (k === archivo ? t.replace(de, a) : t)).join("\n");
    // El candado de versión de la migración mutada no debe abortar: la base tiene la versión buena (o ninguna, con APLICAR_ANTES).
    const sinCandado = mutadas.replace(/raise exception '% cambió desde que se escribió esta migración/g, "raise notice '% cambió desde que se escribió esta migración");
    const muertos = escenariosContra(`${APLICAR_ANTES}\n${sinCandado}`).filter((r) => !r.ok);
    if (muertos.length === 0) vivos++;
    console.log(`${muertos.length > 0 ? "✓" : "✗"} ${nombre}${muertos.length > 0 ? ` — lo frena «${muertos[0].nombre}»` : " — SOBREVIVE: ningún escenario lo vio"}`);
  }
  console.log(`\n${MUTANTES.length - vivos}/${MUTANTES.length} mutantes frenados.`);
  if (vivos > 0) process.exit(1);
}

main();
