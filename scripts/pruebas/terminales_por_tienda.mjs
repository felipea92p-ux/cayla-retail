#!/usr/bin/env node
/**
 * Pruebas de las cuentas TERMINAL por tienda (ADR-0159, migración `20260922200000_terminales_por_tienda.sql`)
 * contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que los poderes de cada terminal estén EN LA BASE y no solo en el menú, y que NADA MÁS se haya
 * abierto. Una terminal es un colaborador fijo a una tienda con una columna `terminal`:
 *   · terminal de VENTAS ........ cierra caja y mueve caja;
 *   · terminal ADMINISTRATIVA ... ajusta stock, cierra conteos y traslados con diferencia, escribe en el
 *                                 Catálogo y edita las cuentas bancarias de proveedores;
 *   · lo demás sigue siendo del líder: anular ventas y comprobantes, devoluciones, series, etiquetas con
 *     descuento. Un colaborador común (Micaela) no gana nada, y el líder (Felipe) sigue pasando por todo.
 * También: el alta (`agregar_terminal`: solo el líder, solo una tienda, una de cada tipo por tienda), el CHECK
 * (un líder no puede ser terminal), que suspender y reactivar conserven el tipo, los grants, y que la
 * migración se pueda pegar dos veces sin duplicar nada.
 *
 * CÓMO. Mismo patrón que `candado_lider_caja_y_ajuste.mjs` (léelo primero si esto no tiene sentido): cada
 * escenario corre en su propia transacción con ROLLBACK — nunca se commitea nada, corre seguro contra el
 * Postgres local que comparten ~20 worktrees. Las dos terminales se crean DENTRO de cada escenario como
 * personas de prueba (en local `public.personas` es un stub de Dynamic) y desaparecen con el ROLLBACK.
 * Simula a cada actor con `set local request.jwt.claim.sub`. Para las políticas de fila (que un superusuario
 * se salta) usa `set local role authenticated`, el rol real de la API; ese rol no ve el schema temporal, así
 * que ahí el rechazo se lee del error de psql.
 *
 * `--en-seco`: carga la migración DENTRO de cada escenario, sin aplicarla a la base compartida.
 *
 * USO
 *   pnpm pruebas:terminales            → migración ya aplicada en el local
 *   pnpm pruebas:terminales --en-seco  → la carga en cada escenario, sin aplicarla
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo
const T_VENTAS = "22222222-2222-4222-8222-0000000000a1"; // terminal de ventas de Trujillo (se crea en cada escenario)
const T_ADMIN = "22222222-2222-4222-8222-0000000000a2"; // terminal administrativa de Trujillo (idem)

const EN_SECO = process.argv.includes("--en-seco");
const SQL_MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260922200000_terminales_por_tienda.sql"), "utf8");
const PRELUDIO = EN_SECO ? SQL_MIGRACION : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;
const COMO_AUTENTICADO = `set local role authenticated;\nset local request.jwt.claim.role = 'authenticated';\n`;

/** `pg_temp.intento(sql)`: «SQLSTATE|mensaje» del error, o «SIN_ERROR». No aborta la transacción del escenario. */
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
`;

/** La escena: las tres ubicaciones y las dos terminales como personas (sin acceso todavía). */
const escena = (cuerpo) => `
begin;
${PRELUDIO}
${INTENTO}
select id as sede from public.sedes limit 1 \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into public.personas (auth_user_id, nombres, apellidos, sede_base_id) values ('${T_VENTAS}', 'Terminal', 'Ventas TRU', :'sede') returning id as p_ventas \\gset
insert into public.personas (auth_user_id, nombres, apellidos, sede_base_id) values ('${T_ADMIN}', 'Terminal', 'Administrativa TRU', :'sede') returning id as p_admin \\gset
${cuerpo}
rollback;
`;

/** El líder da de alta las dos terminales de Trujillo. Termina con la sesión en Felipe. */
const ALTA = `${cambiaA(FELIPE)}select retail.agregar_terminal(:'p_ventas', :'trujillo', 'ventas') as _a1 \\gset
select retail.agregar_terminal(:'p_admin', :'trujillo', 'administrativa') as _a2 \\gset
`;

/** La escena de inventario (misma que la del candado de líder): una variante y el piso de venta de Trujillo. */
const BASE_INVENTARIO = `
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'trujillo', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta');
select id as sub_piso from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta' \\gset
select id as var from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
`;

let fallos = 0;
function verificar(nombre, res, esperado, { debeFallar = false } = {}) {
  const texto = debeFallar ? (res.ok ? `(no falló) ${res.salida}` : res.mensaje) : res.ok ? res.salida : res.mensaje;
  const bien = esperado.test(texto);
  if (!bien) fallos++;
  console.log(`${bien ? "OK  " : "FALLA"} ${nombre}${bien ? "" : `\n      recibí: ${texto.slice(0, 400)}`}`);
}

/* ------------------------------------------------------------------ */
/* 1. El alta y el esquema                                            */
/* ------------------------------------------------------------------ */

verificar(
  "agregar_terminal: el líder da de alta una de ventas y una administrativa (colaborador, sede fija, con historial)",
  correr(escena(`${ALTA}select
    (select count(*) from retail.colaboradores where persona_id = :'p_ventas' and terminal = 'ventas' and rol = 'colaborador' and ubicacion_asignada_id = :'trujillo')
    || '|' || (select count(*) from retail.colaboradores where persona_id = :'p_admin' and terminal = 'administrativa' and rol = 'colaborador')
    || '|' || (select count(*) from retail.colaboradores_historial where persona_id = :'p_ventas' and accion = 'alta' and motivo = 'Terminal ventas');`)),
  /^1\|1\|1$/
);

verificar(
  "agregar_terminal: un colaborador común no puede dar de alta una terminal",
  correr(escena(`${cambiaA(MICAELA)}select pg_temp.intento(format('select retail.agregar_terminal(%L, %L, ''ventas'')', :'p_ventas', :'trujillo'));`)),
  /Solo un líder puede gestionar colaboradores/
);

verificar(
  "agregar_terminal: no se da de alta en el Taller",
  correr(escena(`${cambiaA(FELIPE)}select pg_temp.intento(format('select retail.agregar_terminal(%L, %L, ''ventas'')', :'p_ventas', :'taller'));`)),
  /Una terminal se asigna a una tienda activa/
);

verificar(
  "agregar_terminal: una tienda no tiene dos terminales del mismo tipo",
  correr(escena(`${ALTA}select pg_temp.intento(format('select retail.agregar_terminal(%L, %L, ''ventas'')', :'p_admin', :'trujillo'));`)),
  /ya tiene su terminal de ventas/
);

verificar(
  "agregar_terminal: el tipo tiene que ser ventas o administrativa",
  correr(escena(`${cambiaA(FELIPE)}select pg_temp.intento(format('select retail.agregar_terminal(%L, %L, ''otra'')', :'p_ventas', :'trujillo'));`)),
  /El tipo de terminal debe ser ventas o administrativa/
);

verificar(
  "CHECK: un líder no puede ser terminal (23514)",
  correr(escena(`select pg_temp.intento(format('update retail.colaboradores set terminal = ''ventas'' where persona_id = %L', :'persona_felipe'));`)),
  /23514\|.*colaboradores_terminal_valida/
);

const identidad = (quien, uid) =>
  correr(escena(`${ALTA}${cambiaA(uid)}select retail.fn_es_terminal() || '|' || retail.fn_es_terminal('administrativa') || '|' || retail.fn_es_terminal('ventas') || '|' || retail.fn_es_lider() || '|' || coalesce(retail.fn_mi_terminal(), '-');`));
verificar("identidad: la terminal administrativa", identidad("admin", T_ADMIN), /^true\|true\|false\|false\|administrativa$/);
verificar("identidad: la terminal de ventas", identidad("ventas", T_VENTAS), /^true\|false\|true\|false\|ventas$/);
verificar("identidad: un colaborador común no es terminal", identidad("micaela", MICAELA), /^false\|false\|false\|false\|-$/);
verificar("identidad: el líder no es terminal", identidad("felipe", FELIPE), /^false\|false\|false\|true\|-$/);

/* ------------------------------------------------------------------ */
/* 2. Caja: terminal de ventas                                        */
/* ------------------------------------------------------------------ */

const CAJA_ABIERTA = `${ALTA}
select count(*) as _cerro from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'trujillo' and estado = 'abierta') x \\gset
${cambiaA(MICAELA)}select retail.abrir_caja(:'trujillo', 100.00) as caja \\gset
`;

verificar(
  "caja: la terminal administrativa NO cierra la caja",
  correr(escena(`${CAJA_ABIERTA}${cambiaA(T_ADMIN)}select pg_temp.intento(format('select retail.cerrar_caja(%L, 100)', :'caja'));`)),
  /Solo un líder de equipo puede cerrar la caja/
);

verificar(
  "caja: la terminal de ventas mueve caja y CIERRA la caja",
  correr(escena(`${CAJA_ABIERTA}${cambiaA(T_VENTAS)}select retail.registrar_movimiento_caja(:'caja', 'ingreso', 30, 'Ingreso de prueba') as _m \\gset
select retail.cerrar_caja(:'caja', 130.00) as _r \\gset
select estado from retail.cajas where id = :'caja';`)),
  /^cerrada$/
);

/* ------------------------------------------------------------------ */
/* 3. Inventario: terminal administrativa                             */
/* ------------------------------------------------------------------ */

verificar(
  "inventario: la terminal de ventas NO ajusta stock",
  correr(escena(`${ALTA}${BASE_INVENTARIO}${cambiaA(T_VENTAS)}select pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, ''ajuste'', 1, ''prueba terminales'', ''nota'', %L)', :'var', :'trujillo', :'sub_piso'));`)),
  /Solo un líder de equipo puede ajustar stock/
);

verificar(
  "inventario: la terminal administrativa SÍ ajusta stock (queda el movimiento)",
  correr(escena(`${ALTA}${BASE_INVENTARIO}${cambiaA(T_ADMIN)}select retail.registrar_movimiento(:'var', :'trujillo', 'ajuste', 1, 'prueba terminales', 'nota', :'sub_piso') as mov \\gset
select count(*) from retail.movimientos where id = :'mov' and tipo = 'ajuste';`)),
  /^1$/
);

/* ------------------------------------------------------------------ */
/* 4. Las puertas del líder, una por una: quién pasa y quién no        */
/*    Un escenario POR ACTOR (la primera respuesta no contamina a la   */
/*    siguiente) y con objetos reales: varias funciones verifican que  */
/*    el conteo, el traslado o la caja EXISTAN, y en qué estado están, */
/*    ANTES del candado — llamarlas con un id inventado no distingue   */
/*    a nadie (así fallaron la primera vez esas pruebas).              */
/* ------------------------------------------------------------------ */

const ACTORES = [
  ["ventas", T_VENTAS],
  ["admin", T_ADMIN],
  ["micaela", MICAELA],
  ["felipe", FELIPE],
];

// Fixtures: viven dentro de la transacción del escenario y el ROLLBACK los borra.
const FIXTURE_CONTEO = `${cambiaA(FELIPE)}update retail.conteos set estado = 'anulado' where ubicacion_id = :'trujillo' and estado = 'abierto';
insert into retail.conteos (ubicacion_id) values (:'trujillo') returning id as conteo \\gset
`;
const FIXTURE_TRASLADO = `insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado)
  values (:'lima', :'trujillo', 'recibido_con_diferencia') returning id as traslado \\gset
`;
const FIXTURE_CAJA = `${cambiaA(FELIPE)}select count(*) as _cerro from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'trujillo' and estado = 'abierta') x \\gset
${cambiaA(MICAELA)}select retail.abrir_caja(:'trujillo', 100.00) as caja \\gset
`;
const LLAMADA = (sql) => `select pg_temp.intento($q$${sql}$q$);`;

const PUERTAS = [
  // Lo que SE abrió. `pasan` = quiénes, además del líder, cruzan la puerta.
  { nombre: "cerrar_conteo", previo: FIXTURE_CONTEO, intento: `select pg_temp.intento(format('select retail.cerrar_conteo(%L)', :'conteo'));`, mensaje: /Solo un líder puede cerrar un conteo/, pasan: ["admin"] },
  { nombre: "cerrar_traslado_con_diferencia", previo: FIXTURE_TRASLADO, intento: `select pg_temp.intento(format('select retail.cerrar_traslado_con_diferencia(%L, ''x'')', :'traslado'));`, mensaje: /Solo un líder puede cerrar un traslado con diferencias/, pasan: ["admin"] },
  { nombre: "registrar_movimiento_caja (ajuste de efectivo)", previo: FIXTURE_CAJA, intento: `select pg_temp.intento(format('select retail.registrar_movimiento_caja(%L, ''ingreso'', 10, ''ajuste'', null, true)', :'caja'));`, mensaje: /Solo un líder de equipo puede registrar un ajuste de efectivo/, pasan: ["ventas"] },
  { nombre: "guardar_cuentas_proveedor", previo: "", intento: LLAMADA(`select retail.guardar_cuentas_proveedor(gen_random_uuid(), null, null, null, null)`), mensaje: /Solo un Líder puede editar las cuentas de un proveedor/, pasan: ["admin"] },
  { nombre: "crear_marca", previo: "", intento: LLAMADA(`select retail.crear_marca('Marca de prueba', gen_random_uuid())`), mensaje: /Solo un Líder puede agregar marcas/, pasan: ["admin"] },
  { nombre: "desactivar_categoria", previo: "", intento: LLAMADA(`select retail.desactivar_categoria(gen_random_uuid())`), mensaje: /Solo un Líder puede desactivar una categoría/, pasan: ["admin"] },
  { nombre: "actualizar_categoria_ejes", previo: "", intento: LLAMADA(`select retail.actualizar_categoria_ejes(gen_random_uuid(), '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[])`), mensaje: /Solo un Líder puede editar qué tallas/, pasan: ["admin"] },
  // Lo que NO se abrió y cuyo candado va primero: solo el líder.
  { nombre: "etiquetar_variantes (descuentos)", previo: "", intento: LLAMADA(`select retail.etiquetar_variantes('[]'::jsonb)`), mensaje: /Solo un Líder puede etiquetar prendas/, pasan: [] },
  { nombre: "actualizar_variantes_etiquetas (descuentos)", previo: "", intento: LLAMADA(`select retail.actualizar_variantes_etiquetas('[]'::jsonb)`), mensaje: /Solo un Líder puede aplicar etiquetas a una variante/, pasan: [] },
  { nombre: "anular_venta", previo: "", intento: LLAMADA(`select retail.anular_venta(gen_random_uuid(), 'x', '[]'::jsonb)`), mensaje: /Solo un líder puede anular una venta/, pasan: [] },
  { nombre: "registrar_serie_comprobante", previo: "", intento: LLAMADA(`select retail.registrar_serie_comprobante(gen_random_uuid(), 'boleta', 'B001', 1)`), mensaje: /Solo un líder puede registrar una serie de comprobantes/, pasan: [] },
];

for (const { nombre, previo, intento, mensaje, pasan } of PUERTAS) {
  for (const [quien, uid] of ACTORES) {
    const res = correr(escena(`${ALTA}${previo}${cambiaA(uid)}${intento}`));
    const texto = res.ok ? res.salida : res.mensaje;
    const debePasar = quien === "felipe" || pasan.includes(quien);
    const rechazado = mensaje.test(texto);
    const bien = res.ok && (debePasar ? !rechazado : rechazado);
    if (!bien) fallos++;
    console.log(`${bien ? "OK  " : "FALLA"} ${nombre}: ${quien} ${debePasar ? "pasa" : "es rechazado"}${bien ? "" : `\n      recibí: ${texto.slice(0, 300)}`}`);
  }
}

// Las que NO se abrieron y verifican otras cosas antes del candado: se prueban por su definición. Siguen pidiendo
// líder y NINGUNA menciona una capacidad de terminal.
const SIGUEN_DEL_LIDER = [
  "aprobar_devolucion", "rechazar_devolucion", "anular_venta", "anular_comprobante", "marcar_comprobante_no_emitido",
  "registrar_serie_comprobante", "etiquetar_variantes", "actualizar_variantes_etiquetas", "actualizar_campana_etiqueta",
  "liquidar_prenda_danada", "resolver_prenda_danada",
];
verificar(
  `siguen del líder (${SIGUEN_DEL_LIDER.length}): devoluciones, anulaciones, series, etiquetas con descuento, prendas dañadas`,
  correr(escena(`select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace
    and p.proname in (${SIGUEN_DEL_LIDER.map((f) => `'${f}'`).join(", ")})
    and pg_get_functiondef(p.oid) ~ 'fn_es_lider\\(\\)'
    and pg_get_functiondef(p.oid) !~ 'fn_puede_(gestionar_caja|ajustar_inventario|editar_catalogo|editar_cuentas_proveedor)';`)),
  new RegExp(`^${SIGUEN_DEL_LIDER.length}$`)
);

/* ------------------------------------------------------------------ */
/* 5. Catálogo por la API directa (políticas de fila) y sus disparadores */
/* ------------------------------------------------------------------ */

const comoApi = (uid, sql) => correr(escena(`${ALTA}${cambiaA(uid)}${COMO_AUTENTICADO}${sql}`));
const INSERTAR_MARCA = `insert into retail.marcas (nombre) values ('MARCA TERMINAL DE PRUEBA') returning nombre;`;
const INSERTAR_COLOR = `insert into retail.colores (codigo, nombre) values ('zz9', 'Color de prueba') returning estado;`;

verificar("catálogo (política de fila): la terminal administrativa escribe en `marcas`", comoApi(T_ADMIN, INSERTAR_MARCA), /^MARCA TERMINAL DE PRUEBA$/);
verificar("catálogo (política de fila): el líder escribe en `marcas`", comoApi(FELIPE, INSERTAR_MARCA), /^MARCA TERMINAL DE PRUEBA$/);
verificar("catálogo (política de fila): la terminal de ventas NO escribe en `marcas`", comoApi(T_VENTAS, INSERTAR_MARCA), /row-level security/, { debeFallar: true });
verificar("catálogo (política de fila): un colaborador común NO escribe en `marcas`", comoApi(MICAELA, INSERTAR_MARCA), /row-level security/, { debeFallar: true });

verificar("catálogo (disparador): lo que crea la terminal administrativa queda APROBADO", comoApi(T_ADMIN, INSERTAR_COLOR), /^aprobado$/);
verificar("catálogo (disparador): lo que crea el líder queda APROBADO", comoApi(FELIPE, INSERTAR_COLOR), /^aprobado$/);
verificar("catálogo (disparador): lo que propone la terminal de ventas queda PENDIENTE", comoApi(T_VENTAS, INSERTAR_COLOR), /^pendiente$/);
verificar("catálogo (disparador): lo que propone un colaborador común queda PENDIENTE", comoApi(MICAELA, INSERTAR_COLOR), /^pendiente$/);

/* ------------------------------------------------------------------ */
/* 6. Suspender y reactivar conservan el tipo de terminal              */
/* ------------------------------------------------------------------ */

verificar(
  "suspender y reactivar: la terminal conserva su tipo (en la fila suspendida y al volver)",
  correr(escena(`${ALTA}select retail.suspender_colaborador(:'p_admin', 'prueba') as _s \\gset
select (select terminal from retail.colaboradores_suspendidos where persona_id = :'p_admin') as t_susp \\gset
select retail.reactivar_colaborador(:'p_admin') as _r \\gset
select :'t_susp' || '|' || (select terminal from retail.colaboradores where persona_id = :'p_admin');`)),
  /^administrativa\|administrativa$/
);

/* ------------------------------------------------------------------ */
/* 7. Lo que la migración deja en el catálogo de la base               */
/* ------------------------------------------------------------------ */

const POLITICAS_CATALOGO = [
  "categoria_patrones_write_lider", "categoria_tallas_write_lider", "categoria_tejidos_write_lider", "categorias_write_lider",
  "codigos_barras_write_lider", "colores_update_lider", "familias_write_lider", "marca_proveedores_write_lider", "marcas_write_lider",
  "patrones_update_lider", "producto_fotos_write_lider", "productos_write_lider", "tallas_update_lider", "tejidos_update_lider", "variantes_write_lider",
];
verificar(
  "políticas: las 15 de Catálogo piden fn_puede_editar_catalogo; las de etiquetas siguen pidiendo líder",
  correr(escena(`select
    (select count(*) from pg_policies where schemaname = 'retail' and policyname in (${POLITICAS_CATALOGO.map((p) => `'${p}'`).join(", ")})
       and (coalesce(qual, '') ~ 'fn_puede_editar_catalogo' or coalesce(with_check, '') ~ 'fn_puede_editar_catalogo'))
    || '|' || (select count(*) from pg_policies where schemaname = 'retail' and policyname in ('etiquetas_update_lider', 'etiqueta_categorias_write_lider', 'variante_etiquetas_write_lider')
       and coalesce(qual, '') ~ 'fn_es_lider');`)),
  /^15\|3$/
);

verificar(
  "candados: ninguna de las funciones tocadas conserva fn_es_lider() suelto (salvo la de etiquetas con descuento)",
  correr(escena(`select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace
    and p.proname in ('cerrar_caja','registrar_movimiento_caja','registrar_movimiento','cerrar_conteo','cerrar_traslado_con_diferencia','guardar_cuentas_proveedor',
      'actualizar_categoria','actualizar_categoria_ejes','desactivar_categoria','reactivar_categoria','crear_marca','censo_crear_variante','crear_producto_con_variantes',
      'fn_productos_estado_alta_trigger','fn_colores_estado_trigger','fn_patrones_estado_trigger','fn_tallas_estado_trigger','fn_tejidos_estado_trigger')
    and pg_get_functiondef(p.oid) ~ 'fn_es_lider\\(\\)';`)),
  /^0$/
);

verificar(
  "descuentos: la terminal administrativa no puede dar descuento por etiqueta; el líder sí",
  correr(escena(`${ALTA}${cambiaA(T_ADMIN)}select retail.fn_puede_dar_descuento_por_etiqueta() as a \\gset
${cambiaA(FELIPE)}select retail.fn_puede_dar_descuento_por_etiqueta() as l \\gset
select :'a' || '|' || :'l';`)),
  /^f\|t$/
);

verificar(
  "descuentos: crear_producto_con_variantes lleva el guardia una sola vez",
  correr(escena(`select (length(d) - length(replace(d, 'Solo un líder puede asignar una etiqueta con descuento.', ''))) / length('Solo un líder puede asignar una etiqueta con descuento.') || '|' || (d ~ 'fn_puede_dar_descuento_por_etiqueta')::text
    from (select pg_get_functiondef('retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid)'::regprocedure) as d) x;`)),
  /^1\|true$/
);

verificar(
  "grants: authenticated ejecuta agregar_terminal y las capacidades; anon no",
  correr(escena(`select (
    has_function_privilege('authenticated', 'retail.agregar_terminal(uuid, uuid, text)', 'execute')
    and has_function_privilege('authenticated', 'retail.fn_puede_gestionar_caja()', 'execute')
    and has_function_privilege('authenticated', 'retail.fn_puede_editar_catalogo()', 'execute')
    and not has_function_privilege('anon', 'retail.agregar_terminal(uuid, uuid, text)', 'execute')
    and not has_function_privilege('anon', 'retail.fn_es_terminal(text)', 'execute'))::text;`)),
  /^true$/
);

verificar(
  "re-ejecutable: pegar la migración otra vez no duplica el guardia ni rompe nada",
  correr(escena(`${SQL_MIGRACION}
${ALTA}${BASE_INVENTARIO}${cambiaA(T_ADMIN)}select retail.registrar_movimiento(:'var', :'trujillo', 'ajuste', 1, 'segunda vez', 'nota', :'sub_piso') as mov \\gset
select (select count(*) from retail.movimientos where id = :'mov')::text
  || '|' || (select (length(d) - length(replace(d, 'Solo un líder puede asignar una etiqueta con descuento.', ''))) / length('Solo un líder puede asignar una etiqueta con descuento.')
             from (select pg_get_functiondef('retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid)'::regprocedure) as d) x)::text;`)),
  /^1\|1$/
);

// El SQL Editor de producción se puede usar con `set search_path to retail, public;` al inicio (CLAUDE.md). Con
// ese `search_path`, `pg_policies` muestra `fn_es_lider()` SIN el prefijo `retail.`: la primera versión de la
// migración solo buscaba la forma con prefijo y abortaba. Este escenario NO usa `escena` (sin preludio): es la
// PRIMERA carga de la migración, con otro `search_path`.
verificar(
  "search_path: la migración se pega también con `set search_path to retail, public;` (las 15 políticas cambian)",
  correr(`begin;
set local search_path to retail, public, extensions;
${SQL_MIGRACION}
select count(*) from pg_policies where schemaname = 'retail' and policyname in (${POLITICAS_CATALOGO.map((p) => `'${p}'`).join(", ")})
  and (coalesce(qual, '') ~ 'fn_puede_editar_catalogo' or coalesce(with_check, '') ~ 'fn_puede_editar_catalogo');
rollback;`),
  /^15$/
);

console.log(fallos === 0 ? "\nTodo en verde." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
