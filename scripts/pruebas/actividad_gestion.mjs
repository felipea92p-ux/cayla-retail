#!/usr/bin/env node
/**
 * Prueba de ADR-0207, «Actualización 2026-10-03» — Colaboradores, Roles, Configuración y Regularizar anotan su actividad
 * (`20261003210000_actividad_colaboradores_roles_configuracion_regularizar.sql`).
 *
 * QUÉ CUBRE
 *   · Con las funciones de las pantallas: suspender, reactivar y mover de sede a una colaboradora (la línea va en su sede;
 *     al moverla, en las dos), encender módulos en un rol, dar un rol, cambiar el fondo de caja y el WhatsApp de una
 *     tienda, y regularizar una prenda vendida sin registrar (en Recibir mercadería);
 *   · con las FORMAS que hay en producción (2026-10-03): cada fila de los tres historiales da una frase sin vacíos —
 *     módulos que ya no existen, apagar 14 de golpe, cambiar solo la pantalla principal, un impuesto que pasa de
 *     provisional a confirmado;
 *   · el dinero de la empresa no se escribe (saldo de una cuenta, presupuesto);
 *   · si anotar falla, el guardado sigue; la web no puede anotar a mano.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK. Los disparadores son AFTER comunes (no diferidos): cada fila de
 * estos historiales ya es una operación completa.
 *
 * USO
 *   pnpm pruebas:actividad-gestion    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const CENTINELA = "22222222-2222-4222-8222-222222222222"; // «prenda sin registrar» en una venta

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${PRELUDIO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PRELUDIO = `
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select coalesce(max(id), 0) as antes from retail.actividad \\gset
`;
const LINEAS = (modulo) =>
  `select coalesce(string_agg(accion || '¦' || descripcion || '¦' || coalesce(ubicacion_id::text, '-') || '¦' || coalesce(ubicacion_destino_id::text, '-') || '¦' || coalesce(persona_id::text, '-'), ' // ' order by id), '-')
     from retail.actividad where id > :antes and modulo = '${modulo}';`;
const VARS = `select :'tru' || '|' || :'lim' || '|' || :'felipe' || '|' || :'micaela';`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 2000)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n").filter(Boolean) : []);
/** Lee las líneas `accion¦descripcion¦sede¦destino¦persona` y las variables de la sesión. */
function leer(r) {
  const l = lineas(r);
  const [tru, lim, felipe, micaela] = (l.at(-1) ?? "").split("|");
  const filas = (l.at(-2) ?? "-") === "-" ? [] : l.at(-2).split(" // ").map((x) => x.split("¦"));
  return { filas, tru, lim, felipe, micaela };
}

// 1. Suspender y reactivar a una integrante: dos líneas en Colaboradores, en SU sede, firmadas por quien lo hizo.
{
  const r = correr(`
select retail.suspender_colaborador(:'micaela', 'faltó tres días') as _s \\gset
select retail.reactivar_colaborador(:'micaela') as _r \\gset
${LINEAS("colaboradores")}
${VARS}`);
  const { filas, tru, felipe } = leer(r);
  esperar(
    "suspender y reactivar: «suspendió a «Micaela…» · motivo: faltó tres días» y «reactivó a…», en Tienda Trujillo, firmadas",
    filas.length === 2 &&
      filas[0][0] === "colaborador_suspension" && /^suspendió a «Micaela .+» · motivo: faltó tres días$/.test(filas[0][1]) &&
      filas[1][0] === "colaborador_reactivacion" && /^reactivó a «Micaela .+»$/.test(filas[1][1]) &&
      filas.every((f) => f[2] === tru && f[4] === felipe),
    r,
  );
}

// 2. Moverla de sede: la línea la ven las dos.
{
  const r = correr(`
select retail.cambiar_ubicacion_colaborador(:'micaela', :'lim') as _u \\gset
${LINEAS("colaboradores")}
${VARS}`);
  const { filas, tru, lim } = leer(r);
  esperar(
    "moverla de sede: «movió a «Micaela…» de Tienda Trujillo a Tienda Lima», con origen y destino",
    filas.length === 1 && /^movió a «Micaela .+» de Tienda Trujillo a Tienda Lima$/.test(filas[0][1]) && filas[0][2] === tru && filas[0][3] === lim,
    r,
  );
}

// 3. Encender módulos en un rol y cambiar su pantalla principal: una línea en Roles, en la sede de quien lo hizo.
{
  const r = correr(`
insert into retail.roles (nombre, descripcion) values ('Prueba Actividad', 'temporal') returning id as rol \\gset
select retail.guardar_modulos_rol(:'rol', array['vender', 'caja'], null, 'vender') as _m \\gset
${LINEAS("roles")}
${VARS}`);
  const { filas } = leer(r);
  const modulos = filas.filter((f) => f[0] === "rol_modulos");
  esperar(
    "encender módulos: «encendió Punto de venta y Caja y puso «Punto de venta» como pantalla principal en el rol «Prueba Actividad»»",
    modulos.length === 1 &&
      modulos[0][1] === "encendió Punto de venta y Caja y puso «Punto de venta» como pantalla principal en el rol «Prueba Actividad»",
    r,
  );
}

// 4. Dar un rol a una persona: la línea va en la sede de esa persona.
{
  const r = correr(`
insert into retail.roles (nombre, descripcion) values ('Prueba Actividad', 'temporal') returning id as rol \\gset
select retail.guardar_modulos_rol(:'rol', array['vender'], null, null) as _m \\gset
select retail.asignar_rol(:'rol', :'micaela', null, null) as _a \\gset
select coalesce(string_agg(descripcion || '¦' || coalesce(ubicacion_id::text, '-'), ' // '), '-') from retail.actividad where id > :antes and accion = 'rol_asignacion';
select :'tru';`);
  const l = lineas(r);
  const [desc, sede] = (l.at(-2) ?? "").split("¦");
  esperar(
    "dar un rol: «le dio el rol «Prueba Actividad» a «Micaela…» (antes: …)», en la sede de Micaela",
    /^le dio el rol «Prueba Actividad» a «Micaela .+»( \(antes: .+\))?$/.test(desc ?? "") && sede === l.at(-1),
    r,
  );
}

// 5. Configuración de una tienda: fondo de caja y WhatsApp, en la sede de la tienda.
{
  const r = correr(`
select retail.guardar_metas_tienda(:'tru', array[null, null, null, null, null, null, null]::numeric[],
  coalesce((select fondo_caja from retail.ubicaciones where id = :'tru'), 0) + 123) as _m \\gset
select retail.guardar_whatsapp_tienda(:'tru', '987654321') as _w \\gset
${LINEAS("configuracion")}
${VARS}`);
  const { filas, tru } = leer(r);
  esperar(
    "fondo de caja y WhatsApp: «cambió en Tienda Trujillo: fondo de caja … → S/ …» y «cambió el WhatsApp de Tienda Trujillo: … → 987654321»",
    filas.length === 2 &&
      /^cambió en Tienda Trujillo: fondo de caja .+ → S\/.\d/.test(filas[0][1]) &&
      /^cambió el WhatsApp de Tienda Trujillo: .+ → 987654321$/.test(filas[1][1]) &&
      filas.every((f) => f[2] === tru),
    r,
  );
}

// 6. Regularizar una prenda vendida sin registrar: una línea en Recibir mercadería, en la sede de la prenda.
{
  const r = correr(`
select :'lim' as ubic \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset
select id as v1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 100, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
select id as cat from retail.categorias where activo order by nombre limit 1 \\gset
select id as talla from retail.tallas where activo and estado = 'aprobado' order by valor limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', '${CENTINELA}', 'cantidad', 1, 'precio_unitario', 50,
    'descuento_unitario', 0, 'descripcion_libre', 'Blusa lino beige', 'categoria_id', :'cat',
    'talla_id', :'talla', 'color_codigo', :'color')),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 50)),
  null, gen_random_uuid()) as venta_id \\gset
select id as item_id from retail.venta_items where venta_id = :'venta_id' \\gset
select retail.regularizar_prenda(p.id, :'v1', 'ya_registrada') as _dif from retail.prendas_por_regularizar p where venta_item_id = :'item_id' \\gset
${LINEAS("recibir")}
${VARS}`);
  const { filas, lim } = leer(r);
  esperar(
    "regularizar: «regularizó la prenda vendida sin registrar «Blusa lino beige»: era «…» · precio oficial S/ … , se cobró S/ 50.00», en su sede",
    filas.length === 1 && filas[0][0] === "prenda_regularizada" &&
      /^regularizó la prenda vendida sin registrar «Blusa lino beige»: era «.+» · precio oficial S\/.\S+, se cobró S\/.50\.00$/.test(filas[0][1]) &&
      filas[0][2] === lim,
    r,
  );
}

// 7. Las formas de producción (2026-10-03): cada una da una frase, sin vacíos ni guiones bajos.
{
  const r = correr(`
select id as rol from retail.roles where archivado_at is null order by nombre limit 1 \\gset
insert into retail.colaboradores_historial (persona_id, accion, por, rol, ubicacion_anterior_id, ubicacion_nueva_id, motivo) values
  (:'micaela', 'alta', :'felipe', 'lider', null, null, null),
  (:'micaela', 'alta', :'felipe', 'colaborador', null, :'tru', 'Terminal ventas'),
  (:'micaela', 'aprobacion', :'felipe', 'colaborador', null, :'tru', null),
  (:'micaela', 'baja', :'felipe', 'colaborador', :'tru', null, 'Estación convertida en terminal sin persona (ADR-0162)');
insert into retail.roles_historial (rol_id, accion, detalle, hecho_por) values
  (:'rol', 'creacion', '{"origen": "migracion 20260923030000"}', :'felipe'),
  (:'rol', 'modulos', '{"antes": ["atributos","caja","cambios","clientas","conteos","devoluciones","existencias","historial","movimientos","produccion","productos","recibir","traslados","vender"], "despues": []}', :'felipe'),
  (:'rol', 'modulos', '{"antes": ["productos","vender"], "despues": ["productos","vender","bajada_piso","ajustar_stock"]}', :'felipe'),
  (:'rol', 'modulos', '{"antes": ["vender"], "despues": ["vender"], "pantalla_principal_antes": null, "pantalla_principal_despues": "vender"}', :'felipe'),
  (:'rol', 'renombre', '{"antes": "Terminal administrativa", "despues": "Terminal Almacén"}', :'felipe'),
  (:'rol', 'archivo', '{"motivo": "Reemplazado por el escalón Admin"}', :'felipe'),
  (:'rol', 'asignacion', '{"cuenta": "Sandra Ramírez", "rol_antes": "Integrante"}', :'felipe');
insert into retail.configuracion_historial (que, detalle, hecho_por) values
  ('parametro_tributario', '{"antes": {"texto": null, "valor": 5500, "provisional": true}, "nombre": "uit", "despues": {"texto": null, "valor": 5500}, "vigente_desde": "2026-01-01"}', :'felipe'),
  ('parametro_tributario', '{"antes": {"texto": null, "valor": 6000, "provisional": false}, "nombre": "uit", "despues": {"texto": null, "valor": 5500}, "vigente_desde": "2026-01-01"}', :'felipe'),
  ('cuenta_dinero_creada', '{"tipo": "banco", "nombre": "BCP", "saldo_inicial": 98765}', :'felipe'),
  ('medio_de_cobro', jsonb_build_object('antes', null, 'medio', 'yape', 'ubicacion_id', :'tru'), :'felipe'),
  ('efecto_campana', jsonb_build_object('antes', jsonb_build_object('fondo', null, 'meta_pct', 10), 'despues', jsonb_build_object('fondo', null, 'meta_pct', 0), 'ubicacion_id', :'tru'), :'felipe'),
  ('presupuesto', jsonb_build_object('mes', '2026-10-01', 'ubicacion_id', :'tru', 'cuenta', 'Luz', 'antes', 4321, 'despues', 8765), :'felipe'),
  ('beneficios_club', '{"antes": {"pct": 5}, "despues": {"pct": 10}, "terminos_version": 3}', :'felipe');
select string_agg(descripcion, E'\\n' order by id) from retail.actividad where id > :antes;
select count(*) from retail.actividad where id > :antes;`);
  const l = lineas(r);
  const n = Number(l.at(-1));
  const texto = l.slice(0, -1).join("\n");
  const esperadas = [
    /dio de alta a «Micaela .+» como líder$/m,
    /dio de alta a «Micaela .+» como integrante en Tienda Trujillo · motivo: Terminal ventas$/m,
    /aprobó el acceso de «Micaela .+» como integrante$/m,
    /dio de baja a «Micaela .+» · motivo: Estación convertida/m,
    /^creó el rol «.+»$/m,
    /^apagó Punto de venta, Caja, Cambios y 11 más en el rol «.+»$/m,
    /^encendió ajustar stock y bajada piso en el rol «.+»$/m,
    /^puso «Punto de venta» como pantalla principal en el rol «.+»$/m,
    /^renombró el rol «Terminal administrativa» a «Terminal Almacén»$/m,
    /^archivó el rol «.+» · motivo: Reemplazado por el escalón Admin$/m,
    /^le dio el rol «.+» a «Sandra Ramírez» \(antes: Integrante\)$/m,
    /^confirmó el parámetro tributario «uit» en 5500 \(ya no es provisional\) \(vigente desde 01\/01\/2026\)$/m,
    /^cambió el parámetro tributario «uit»: 6000 → 5500 \(vigente desde 01\/01\/2026\)$/m,
    /^creó la cuenta «BCP» \(banco\)$/m,
    /^asignó la cuenta «sin cuenta» al cobro con Yape en Tienda Trujillo$/m,
    /^configuró el efecto de la campaña «una campaña» en Tienda Trujillo: meta \+10 % → \+0 %$/m,
    /^cambió el presupuesto de «Luz» de Tienda Trujillo para 10\/2026$/m,
    /^cambió los beneficios del club \(versión 3 de los términos\)$/m,
  ];
  const faltan = esperadas.filter((e) => !e.test(texto)).map(String);
  esperar(
    "las formas de producción dan 18 frases legibles (y ninguna con el dinero de la empresa)",
    n === 18 && faltan.length === 0 && !/98765|8765|4321/.test(texto),
    { n, faltan, texto },
  );
}

// 8. Si anotar falla, el guardado sigue.
{
  const r = correr(`
alter table retail.actividad add constraint prueba_siempre_falla check (false) not valid;
select retail.guardar_whatsapp_tienda(:'tru', '911222333') as _w \\gset
select (select count(*) from retail.configuracion_historial where que = 'whatsapp_tienda' and detalle ->> 'despues' = '911222333') || '|' ||
       (select count(*) from retail.actividad where id > :antes);`);
  esperar("si el historial falla, el WhatsApp se guarda igual (y no queda línea)", lineas(r).at(-1) === "1|0", r);
}

// 9. La web no puede anotar a mano.
{
  const r = correr(`select has_function_privilege('authenticated', 'retail.fn_actividad_colaborador(bigint, text)', 'execute') || '|' ||
       has_function_privilege('authenticated', 'retail.fn_actividad_configuracion(bigint, text)', 'execute') || '|' ||
       has_function_privilege('authenticated', 'retail.fn_actividad_regularizar(uuid, text)', 'execute');`);
  esperar("la web no puede anotar a mano", lineas(r).at(-1) === "false|false|false", r);
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
