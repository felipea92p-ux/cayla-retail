#!/usr/bin/env node
/**
 * Pruebas de las cuentas TERMINAL por tienda — CAYLA V2. Los PODERES son los del ADR-0160
 * (`20260922200000_terminales_por_tienda.sql`); la IDENTIDAD es la del ADR-0162: una terminal es un aparato de
 * `retail.terminales` con su propia cuenta de Auth y SIN persona (`20260923010000_terminales_sin_persona.sql`), y lo
 * que hace lo firma el responsable elegido en el combo (`20260923020000_actor_firma_las_operaciones.sql`).
 * Reescrita el 2026-09-22 (ADR-0162 F3): antes creaba la terminal como persona con `agregar_terminal`, que se retiró.
 *
 * QUÉ PRUEBA. Que los poderes de cada terminal estén EN LA BASE y no solo en el menú, que NADA MÁS se haya abierto,
 * y que cada operación de la terminal quede firmada por una persona presente:
 *   · terminal de VENTAS ........ cierra caja y mueve caja;
 *   · terminal ADMINISTRATIVA ... ajusta stock, cierra conteos y traslados con diferencia, escribe en el Catálogo y
 *                                 edita las cuentas bancarias de proveedores;
 *   · lo demás sigue siendo del líder: anular ventas y comprobantes, devoluciones, series, etiquetas con descuento.
 *     Un colaborador común (Micaela) no gana nada, y el líder (Felipe) sigue pasando por todo.
 *   · FIRMA: con `x-responsable` presente, `usuario_id`/`*_por` = el responsable y `terminal_id` = el aparato; sin él
 *     (o con uno ausente), 42501 y no se escribe nada.
 *   · El alta del ADR-0160 (`agregar_terminal`, `colaboradores.terminal`) quedó retirada.
 *
 * CÓMO. Cada escenario en su propia transacción con ROLLBACK (nunca se commitea nada: la base local la comparten
 * ~20 sesiones). Las terminales (con su `auth.users`), Rosa (integrante de Trujillo, la responsable) y la asistencia
 * de Dynamic (`public.marcajes`, que la base local no tiene) se crean DENTRO de cada escenario. Cada actor se simula con
 * `request.jwt.claim.sub` y el encabezado con `request.headers` (lo que hace PostgREST). Para las políticas de fila (que
 * un superusuario se salta) usa `set local role authenticated`.
 *
 * USO
 *   pnpm pruebas:terminales                  → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:terminales --base cayla_f3  → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo
const T_VENTAS = "33333333-3333-4333-8333-0000000000a1"; // cuenta de la terminal de ventas de Trujillo (se crea en cada escenario)
const T_ADMIN = "33333333-3333-4333-8333-0000000000a2"; // cuenta de la terminal administrativa de Trujillo (idem)
const ROSA = "33333333-3333-4333-8333-0000000000b1"; // integrante de Trujillo, sin cuenta: la responsable que elige la terminal

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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

const ES_TERMINAL = new Set([T_VENTAS, T_ADMIN]);
/**
 * Cambia de sesión. Una TERMINAL manda siempre a Rosa como responsable (salvo `{ sinResponsable: true }`); una
 * persona no manda encabezado (el interruptor `fn_exige_responsable()` está apagado: firma ella).
 */
const cambiaA = (uid, { sinResponsable = false } = {}) => {
  const encabezado = ES_TERMINAL.has(uid) && !sinResponsable ? `json_build_object('x-responsable', '${ROSA}')::text` : `'{}'`;
  return `set local request.jwt.claim.sub = '${uid}';
set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
select set_config('request.headers', ${encabezado}, true) as _h \\gset
`;
};
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

/**
 * La escena: las ubicaciones, las dos terminales de Trujillo (aparatos SIN persona) y Rosa presente en Trujillo
 * (marcó su entrada hace un segundo; la fecha de la jornada va explícita para no depender de la medianoche).
 */
const escena = (cuerpo) => `
begin;
${INTENTO}
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
select id as trujillo, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into auth.users (id, aud, role, email) values
  ('${T_VENTAS}', 'authenticated', 'authenticated', 'terminal-ventas-tru@prueba.local'),
  ('${T_ADMIN}', 'authenticated', 'authenticated', 'terminal-admin-tru@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id) values (:'trujillo', 'Terminal Ventas TRU', 'ventas', '${T_VENTAS}') returning id as t_ventas \\gset
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id) values (:'trujillo', 'Terminal Administrativa TRU', 'administrativa', '${T_ADMIN}') returning id as t_admin \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values ('${ROSA}', 'Rosa', 'Prueba', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'trujillo');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
\\set rosa '${ROSA}'
${cuerpo}
rollback;
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
/* 1. Identidad y retiro del modelo del ADR-0160                       */
/* ------------------------------------------------------------------ */

const identidad = (uid) =>
  correr(escena(`${cambiaA(uid)}select retail.fn_es_terminal() || '|' || retail.fn_es_terminal('administrativa') || '|' || retail.fn_es_terminal('ventas') || '|' || retail.fn_es_lider() || '|' || coalesce(retail.fn_mi_terminal(), '-');`));
verificar("identidad: la terminal administrativa", identidad(T_ADMIN), /^true\|true\|false\|false\|administrativa$/);
verificar("identidad: la terminal de ventas", identidad(T_VENTAS), /^true\|false\|true\|false\|ventas$/);
verificar("identidad: un colaborador común no es terminal", identidad(MICAELA), /^false\|false\|false\|false\|-$/);
verificar("identidad: el líder no es terminal", identidad(FELIPE), /^false\|false\|false\|true\|-$/);
verificar(
  "identidad: la terminal NO tiene persona (el aparato nunca firma)",
  correr(escena(`select count(*) from public.personas where auth_user_id in ('${T_VENTAS}', '${T_ADMIN}');`)),
  /^0$/
);

verificar(
  "retiro del ADR-0160: agregar_terminal explica el camino nuevo (0A000)",
  correr(escena(`${cambiaA(FELIPE)}select pg_temp.intento(format('select retail.agregar_terminal(%L, %L, ''ventas'')', :'persona_felipe', :'trujillo'));`)),
  /^0A000\|/
);
verificar(
  "retiro del ADR-0160: colaboradores.terminal queda siempre vacía (23514)",
  correr(escena(`select pg_temp.intento('update retail.colaboradores set terminal = ''ventas'' where rol = ''colaborador''');`)),
  /^23514\|/
);

/* ------------------------------------------------------------------ */
/* 2. Caja: terminal de ventas                                        */
/* ------------------------------------------------------------------ */

const CAJA_ABIERTA = `${cambiaA(FELIPE)}select count(*) as _cerro from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'trujillo' and estado = 'abierta') x \\gset
${cambiaA(MICAELA)}select retail.abrir_caja(:'trujillo', 100.00) as caja \\gset
`;

verificar(
  "caja: la terminal administrativa NO cierra la caja",
  correr(escena(`${CAJA_ABIERTA}${cambiaA(T_ADMIN)}select pg_temp.intento(format('select retail.cerrar_caja(%L, 100)', :'caja'));`)),
  /Solo un líder de equipo puede cerrar la caja/
);

verificar(
  "caja: la terminal de ventas mueve caja y CIERRA la caja, firmado por Rosa (el movimiento, con terminal_id)",
  correr(escena(`${CAJA_ABIERTA}${cambiaA(T_VENTAS)}select retail.registrar_movimiento_caja(:'caja', 'ingreso', 30, 'Ingreso de prueba') as mc \\gset
select retail.cerrar_caja(:'caja', 130.00) as _r \\gset
select c.estado || '|' || (c.cerrada_por = :'rosa') || '|' || (m.usuario_id = :'rosa') || '|' || (m.terminal_id = :'t_ventas')
  from retail.cajas c, retail.caja_movimientos m where c.id = :'caja' and m.id = :'mc';`)),
  /^cerrada\|true\|true\|true$/
);

verificar(
  "caja: la terminal de ventas SIN responsable no cierra (42501) y la caja sigue abierta",
  correr(escena(`${CAJA_ABIERTA}${cambiaA(T_VENTAS, { sinResponsable: true })}select pg_temp.intento(format('select retail.cerrar_caja(%L, 100)', :'caja')) as r \\gset
select :'r' || '|' || (select estado from retail.cajas where id = :'caja');`)),
  /^42501\|Elige quién hace esta operación\|abierta$/
);

/* ------------------------------------------------------------------ */
/* 3. Inventario: terminal administrativa                             */
/* ------------------------------------------------------------------ */

verificar(
  "inventario: la terminal de ventas NO ajusta stock",
  correr(escena(`${BASE_INVENTARIO}${cambiaA(T_VENTAS)}select pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, ''ajuste'', 1, ''prueba terminales'', ''nota'', %L)', :'var', :'trujillo', :'sub_piso'));`)),
  /Solo un líder de equipo puede ajustar stock/
);

verificar(
  "inventario: la terminal administrativa SÍ ajusta stock, firmado por Rosa y con su terminal_id",
  correr(escena(`${BASE_INVENTARIO}${cambiaA(T_ADMIN)}select retail.registrar_movimiento(:'var', :'trujillo', 'ajuste', 1, 'prueba terminales', 'nota', :'sub_piso') as mov \\gset
select tipo || '|' || (usuario_id = :'rosa') || '|' || (terminal_id = :'t_admin') from retail.movimientos where id = :'mov';`)),
  /^ajuste\|true\|true$/
);

verificar(
  "inventario: la terminal administrativa SIN responsable no ajusta (42501)",
  correr(escena(`${BASE_INVENTARIO}${cambiaA(T_ADMIN, { sinResponsable: true })}select pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, ''ajuste'', 1, ''x'', ''nota'', %L)', :'var', :'trujillo', :'sub_piso'));`)),
  /^42501\|Elige quién hace esta operación$/
);

verificar(
  "inventario: con un responsable AUSENTE (ya salió) tampoco (42501)",
  correr(escena(`${BASE_INVENTARIO}insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'salida_final', now(), (now() at time zone 'America/Lima')::date);
${cambiaA(T_ADMIN)}select pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, ''ajuste'', 1, ''x'', ''nota'', %L)', :'var', :'trujillo', :'sub_piso'));`)),
  /^42501\|Esa persona no está de turno/
);

/* ------------------------------------------------------------------ */
/* 4. Las puertas del líder, una por una: quién pasa y quién no        */
/*    Un escenario POR ACTOR (la primera respuesta no contamina a la   */
/*    siguiente) y con objetos reales: varias funciones verifican que  */
/*    el conteo, el traslado o la caja EXISTAN, y en qué estado están, */
/*    ANTES del candado — llamarlas con un id inventado no distingue   */
/*    a nadie. Las terminales mandan a Rosa como responsable.          */
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
    const res = correr(escena(`${previo}${cambiaA(uid)}${intento}`));
    const texto = res.ok ? res.salida : res.mensaje;
    const debePasar = quien === "felipe" || pasan.includes(quien);
    const rechazado = mensaje.test(texto);
    // Pasar la puerta NO es lo mismo que «sin error»: una llamada con un id inventado falla después del candado. Lo
    // que importa es que la terminal no se tope con el candado ni con el del responsable.
    const bien = res.ok && (debePasar ? !rechazado && !/Elige quién hace esta operación|no está de turno/.test(texto) : rechazado);
    if (!bien) fallos++;
    console.log(`${bien ? "OK  " : "FALLA"} ${nombre}: ${quien} ${debePasar ? "pasa" : "es rechazado"}${bien ? "" : `\n      recibí: ${texto.slice(0, 300)}`}`);
  }
}

verificar(
  "firma: la terminal administrativa cierra el conteo y el traslado con diferencia a nombre de Rosa",
  correr(escena(`${FIXTURE_CONTEO}${FIXTURE_TRASLADO}${cambiaA(T_ADMIN)}select retail.cerrar_conteo(:'conteo') as _c \\gset
select retail.cerrar_traslado_con_diferencia(:'traslado', 'x') as _t \\gset
select (select cerrado_por = :'rosa' from retail.conteos where id = :'conteo') || '|' || (select cerrado_por = :'rosa' from retail.transferencias where id = :'traslado');`)),
  /^true\|true$/
);

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

const comoApi = (uid, sql, opciones) => correr(escena(`${cambiaA(uid, opciones)}${COMO_AUTENTICADO}${sql}`));
const INSERTAR_MARCA = `insert into retail.marcas (nombre) values ('MARCA TERMINAL DE PRUEBA') returning nombre;`;
const INSERTAR_COLOR = `insert into retail.colores (codigo, nombre) values ('zz9', 'Color de prueba') returning estado || '|' || coalesce(aprobado_por, propuesto_por)::text;`;

verificar("catálogo (política de fila): la terminal administrativa escribe en `marcas`", comoApi(T_ADMIN, INSERTAR_MARCA), /^MARCA TERMINAL DE PRUEBA$/);
verificar("catálogo (política de fila): el líder escribe en `marcas`", comoApi(FELIPE, INSERTAR_MARCA), /^MARCA TERMINAL DE PRUEBA$/);
verificar("catálogo (política de fila): la terminal de ventas NO escribe en `marcas`", comoApi(T_VENTAS, INSERTAR_MARCA), /row-level security/, { debeFallar: true });
verificar("catálogo (política de fila): un colaborador común NO escribe en `marcas`", comoApi(MICAELA, INSERTAR_MARCA), /row-level security/, { debeFallar: true });

verificar("catálogo (disparador): lo que crea la terminal administrativa queda APROBADO, firmado por Rosa", comoApi(T_ADMIN, INSERTAR_COLOR), new RegExp(`^aprobado\\|${ROSA}$`));
verificar("catálogo (disparador): lo que crea el líder queda APROBADO", comoApi(FELIPE, INSERTAR_COLOR), /^aprobado\|/);
verificar("catálogo (disparador): lo que propone la terminal de ventas queda PENDIENTE, propuesto por Rosa", comoApi(T_VENTAS, INSERTAR_COLOR), new RegExp(`^pendiente\\|${ROSA}$`));
verificar("catálogo (disparador): lo que propone un colaborador común queda PENDIENTE", comoApi(MICAELA, INSERTAR_COLOR), /^pendiente\|/);
verificar(
  "catálogo (disparador): la terminal administrativa SIN responsable no escribe",
  comoApi(T_ADMIN, INSERTAR_COLOR, { sinResponsable: true }),
  /Elige quién hace esta operación/,
  { debeFallar: true }
);

/* ------------------------------------------------------------------ */
/* 6. Lo que las migraciones dejan en el catálogo de la base           */
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
  correr(escena(`${cambiaA(T_ADMIN)}select retail.fn_puede_dar_descuento_por_etiqueta() as a \\gset
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
  "grants: authenticated ejecuta las capacidades y fn_actor_persona_id; anon no",
  correr(escena(`select (
    has_function_privilege('authenticated', 'retail.fn_puede_gestionar_caja()', 'execute')
    and has_function_privilege('authenticated', 'retail.fn_puede_editar_catalogo()', 'execute')
    and has_function_privilege('authenticated', 'retail.fn_actor_persona_id(boolean)', 'execute')
    and not has_function_privilege('anon', 'retail.fn_actor_persona_id(boolean)', 'execute')
    and not has_function_privilege('anon', 'retail.fn_es_terminal(text)', 'execute'))::text;`)),
  /^true$/
);

console.log(fallos === 0 ? "\nTodo en verde." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
