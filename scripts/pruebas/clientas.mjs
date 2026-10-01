#!/usr/bin/env node
/**
 * Pruebas de `retail.buscar_clienta`/`retail.registrar_clienta` contra el Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. La ficha de clienta v1 (D-76/D-77,
 * 20260922140000_ficha_de_clienta_v1_backend.sql) es la primera vez que el sistema puede
 * identificar a una clienta. Dos cosas legalmente sensibles dependen de que esto no falle
 * en silencio: el consentimiento de WhatsApp es un dato APARTE del teléfono (Ley 29733 — nunca
 * se asume por dar el número), y un upsert sin volver a preguntar por WhatsApp NUNCA debe
 * revocar un consentimiento ya dado (ver «LA OBJECIÓN» en la cabecera de la migración).
 *
 * QUÉ HACE. Mismo patrón que `scripts/pruebas/registrar_venta.mjs`: cada escenario en su
 * propia transacción con ROLLBACK — nunca se commitea nada, corre seguro contra el Postgres
 * local que comparten ~20 sesiones, sin dejar rastro ni pisar datos de otra sesión. Simula a
 * Felipe (líder) o Micaela (colaboradora) con `set local request.jwt.claim.sub`, igual que
 * `supabase/seed.sql`.
 *
 * POR QUÉ NO ES UN `*.test.ts` DE VITEST. `pnpm test` corre sobre un checkout limpio sin
 * Postgres ni Docker — mismo criterio que ya documenta `registrar_cambio.mjs`.
 *
 * QUÉ DA POR SENTADO. Que `retail.clientas` existe (20260922140000 aplicada) y que
 * `supabase/seed.sql` corrió (usa DNIs que el seed no siembra, así que no choca con él).
 *
 * DESDE ADR-0288 (tanda 1a, 20260930160000). El documento tiene tipo: `clientas.dni` pasó a
 * `documento_numero` + `documento_tipo`, y `registrar_clienta`/`editar_clienta` reciben
 * `p_documento_tipo` antes del número. Aquí todas las fichas son con DNI ('dni'); los otros tipos,
 * el formato, CL-27 y la venta ligada a la ficha los prueba `club_venta_ligada.mjs`.
 *
 * DESDE ADR-0288 (tanda 1b, 20260930200000). Registrarse ya NO da el permiso de WhatsApp: `registrar_clienta` y
 * `editar_clienta` perdieron `p_acepta_whatsapp`/`p_revoca_whatsapp` y ganaron `p_cumple_anio`. El club (su «sí») y la
 * publicidad (solo si ella escribió) los prueba `club_permisos.mjs`; aquí queda que registrar y editar no dan ni quitan
 * ningún permiso, y que un upsert nunca revoca uno ya dado (LA OBJECIÓN, ahora sobre el legado y el club).
 *
 * USO
 *   pnpm pruebas:clientas    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Mismas credenciales obvias que supabase/seed.sql y registrar_venta.mjs.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — la ficha de clienta no distingue rol

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

function comoPersona(authUserId, sqlDespues) {
  return `
begin;
set local request.jwt.claim.sub = '${authUserId}';
set local request.jwt.claim.role = 'authenticated';
${sqlDespues}
`;
}

const CASOS = [];
function exito(nombre, sql, verificar) {
  CASOS.push({ nombre, tipo: "exito", sql, verificar });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}

// ---------------------------------------------------------------------------
// 1: alta con celular y cumpleaños — registrarse NO da ningún permiso (ADR-0288 D-4, tanda 1b)
// ---------------------------------------------------------------------------

exito(
  "alta con celular y cumpleaños (y año): guarda la ficha y NO da ningún permiso — ni club, ni publicidad, ni el whatsapp_consentimiento_en de antes",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90111222', 'Prueba Uno', '987000111', 15::smallint, 3::smallint, 1994::smallint) as id \\gset
select (whatsapp_consentimiento_en is null), documento_tipo || ':' || documento_numero, nombre, cumple_dia, cumple_mes, cumple_anio,
       club_desde is null and publicidad_desde is null and codigo_club is null
  from retail.clientas where id = :'id'::uuid;
rollback;
`
  ),
  ([sinPermiso, dni, nombre, dia, mes, anio, sinClub]) =>
    sinPermiso === "t" && dni === "dni:90111222" && nombre === "Prueba Uno" && dia === "15" && mes === "3" && anio === "1994" && sinClub === "t"
);

// ---------------------------------------------------------------------------
// 2: el permiso ya no se marca al registrar — la firma vieja no existe
// ---------------------------------------------------------------------------

error(
  "registrar_clienta ya no recibe p_acepta_whatsapp: la publicidad solo nace de un mensaje de ella (ADR-0288 D-4)",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta(p_documento_numero => '90111223', p_nombre => 'Prueba Dos', p_telefono_whatsapp => '987000112', p_acepta_whatsapp => true);\n`
  ),
  "does not exist"
);

// ---------------------------------------------------------------------------
// 3: upsert por DNI — un segundo alta con el mismo DNI actualiza, no duplica
// ---------------------------------------------------------------------------

exito(
  "el mismo DNI dos veces no duplica: la segunda llamada actualiza la fila",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90111224', 'Prueba Tres', null, null, null) as id1 \\gset
select retail.registrar_clienta('dni', '90111224', 'Prueba Tres Actualizada', null, null, null) as id2 \\gset
select (:'id1' = :'id2'), (select count(*) from retail.clientas where documento_numero = '90111224'), nombre
  from retail.clientas where id = :'id2'::uuid;
rollback;
`
  ),
  ([mismoId, total, nombre]) => mismoId === "t" && Number(total) === 1 && nombre === "Prueba Tres Actualizada"
);

// ---------------------------------------------------------------------------
// 4: LA OBJECIÓN — un upsert NUNCA revoca un permiso ya dado: ni el de antes (whatsapp_consentimiento_en,
// legado) ni el club ni la publicidad (ADR-0288: la ficha no da ni quita permisos)
// ---------------------------------------------------------------------------

exito(
  "un upsert conserva el permiso de antes (legado) y el club con su publicidad",
  comoPersona(
    FELIPE,
    `insert into retail.clientas (documento_numero, nombre, telefono_whatsapp, whatsapp_consentimiento_en)
  values ('90111225', 'Prueba Cuatro', '987000113', now()) returning id as id \\gset
select retail.registrar_clienta('dni', '90111225', 'Prueba Cuatro Editada', null, null, null) as id2 \\gset
select retail.registrar_clienta('dni', '90111226', 'Prueba Cinco', '987000114', null, null) as socia \\gset
select codigo_club as _c from retail.unirse_al_club(:'socia'::uuid, '987000114') \\gset
select retail.registrar_mensaje_publicidad(:'socia'::uuid, '987000114') as _p \\gset
select retail.registrar_clienta('dni', '90111226', 'Prueba Cinco', null, null, null) as socia2 \\gset
select (:'id' = :'id2'), (whatsapp_consentimiento_en is not null), nombre,
       (select club_desde is not null and publicidad_desde is not null and :'socia' = :'socia2' from retail.clientas where id = :'socia'::uuid)
  from retail.clientas where id = :'id2'::uuid;
rollback;
`
  ),
  ([mismoId, siguePermiso, nombre, sigueSocia]) => mismoId === "t" && siguePermiso === "t" && nombre === "Prueba Cuatro Editada" && sigueSocia === "t"
);

// ---------------------------------------------------------------------------
// 5: documento vacío o solo espacios se normaliza a NULL — no choca con otra clienta sin documento
// ---------------------------------------------------------------------------

exito(
  "un DNI vacío o solo espacios se guarda como NULL, sin chocar con otra clienta sin DNI",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '   ', 'Sin Dni Uno', null, null, null) as id1 \\gset
select retail.registrar_clienta('dni', '', 'Sin Dni Dos', null, null, null) as id2 \\gset
select
  (select documento_numero from retail.clientas where id = :'id1'::uuid),
  (select documento_numero from retail.clientas where id = :'id2'::uuid);
rollback;
`
  ),
  ([dni1, dni2]) => dni1 === "" && dni2 === ""
);

// ---------------------------------------------------------------------------
// 6: candados de rango — cumple_dia/cumple_mes fuera de 1-31/1-12
// ---------------------------------------------------------------------------

error(
  "cumple_dia fuera de 1-31 se rechaza (candado clientas_cumple_dia_valido)",
  comoPersona(FELIPE, `select retail.registrar_clienta('dni', null, 'Prueba Rango', null, 32::smallint, null);\n`),
  "clientas_cumple_dia_valido"
);

error(
  "cumple_mes fuera de 1-12 se rechaza (candado clientas_cumple_mes_valido)",
  comoPersona(FELIPE, `select retail.registrar_clienta('dni', null, 'Prueba Rango', null, null, 13::smallint);\n`),
  "clientas_cumple_mes_valido"
);

// ---------------------------------------------------------------------------
// 7: un DNI repetido por INSERT directo (sin pasar por la RPC) también choca. Desde ADR-0288 el único es
// (documento_tipo, documento_numero): el mismo número con otro tipo es otra persona (club_venta_ligada.mjs).
// ---------------------------------------------------------------------------

error(
  "un DNI repetido por insert directo se rechaza (candado clientas_documento_unico)",
  comoPersona(
    FELIPE,
    `insert into retail.clientas (documento_numero, nombre) values ('90111299', 'Directo Uno');
insert into retail.clientas (documento_tipo, documento_numero, nombre) values ('dni', '90111299', 'Directo Dos');
`
  ),
  "clientas_documento_unico"
);

// ---------------------------------------------------------------------------
// 8: buscar_clienta — DNI y WhatsApp exactos, nombre con ILIKE
// ---------------------------------------------------------------------------

exito(
  "buscar_clienta encuentra por DNI exacto (el número, sin importar el tipo)",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90222111', 'Buscable Uno', '987222001', null, null) as id \\gset
select count(*), (select nombre from retail.buscar_clienta('90222111') limit 1) from retail.buscar_clienta('90222111');
rollback;
`
  ),
  ([total, nombre]) => Number(total) === 1 && nombre === "Buscable Uno"
);

exito(
  "buscar_clienta encuentra por WhatsApp exacto",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', null, 'Buscable Dos', '987222002', null, null) as id \\gset
select count(*) from retail.buscar_clienta('987222002');
rollback;
`
  ),
  ([total]) => Number(total) === 1
);

exito(
  "buscar_clienta encuentra por nombre parcial, sin distinguir mayúsculas",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', null, 'Buscable Tres Rodríguez', null, null, null) as id \\gset
select count(*) from retail.buscar_clienta('rodríguez');
rollback;
`
  ),
  ([total]) => Number(total) === 1
);

exito(
  "buscar_clienta con término vacío no devuelve filas — no es un listado",
  comoPersona(FELIPE, `select count(*) from retail.buscar_clienta('');\n`),
  ([total]) => Number(total) === 0
);

// ---------------------------------------------------------------------------
// 9: cualquier colaborador con sesión, no solo el líder — Micaela también puede
// ---------------------------------------------------------------------------

exito(
  "Micaela (colaboradora, no líder) también puede registrar y buscar — retail no tiene noción de \"mi clienta\"",
  comoPersona(
    MICAELA,
    `select retail.registrar_clienta('dni', '90333111', 'De Micaela', null, null, null) as id \\gset
select count(*) from retail.buscar_clienta('90333111');
rollback;
`
  ),
  ([total]) => Number(total) === 1
);

// ---------------------------------------------------------------------------
// 10: sin sesión (anon), ni la tabla ni las RPC responden
// ---------------------------------------------------------------------------

error(
  "sin sesión (anon) no puede leer la tabla directo",
  `begin;
set local role anon;
select * from retail.clientas;
rollback;
`,
  "permission denied for table clientas"
);

error(
  "sin sesión (anon) no puede llamar buscar_clienta",
  `begin;
set local role anon;
select retail.buscar_clienta('cualquier cosa');
rollback;
`,
  "permission denied for function buscar_clienta"
);

// ---------------------------------------------------------------------------
// 11: editar_clienta — candado optimista (ADR-0193 reusado, ver 20260928140000)
// ---------------------------------------------------------------------------

exito(
  "editar_clienta con la version correcta guarda y sube la version",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90444111', 'Editar Antes', '987444111', null, null) as id \\gset
select retail.editar_clienta(:'id'::uuid, 'dni', '90444111', 'Editar Después', '987444111', 5::smallint, 8::smallint, null, null, 1) as v \\gset
select nombre, version from retail.clientas where id = :'id'::uuid;
rollback;
`
  ),
  ([nombre, version]) => nombre === "Editar Después" && version === "2"
);

error(
  "editar_clienta con una version vieja rechaza con PT409 (alguien más editó entre medio)",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90444112', 'Version Vieja', null, null, null) as id \\gset
select retail.editar_clienta(:'id'::uuid, 'dni', '90444112', 'Primer Cambio', null, null, null, null, null, 1) as v1 \\gset
select retail.editar_clienta(:'id'::uuid, 'dni', '90444112', 'Segundo Cambio Con Version Vieja', null, null, null, null, null, 1);
`
  ),
  "Alguien más editó esta ficha"
);

exito(
  "editar_clienta ya no toca el permiso: el de antes (legado) sigue; la BAJA es registrar_baja_whatsapp (ADR-0288)",
  comoPersona(
    FELIPE,
    `insert into retail.clientas (documento_numero, nombre, telefono_whatsapp, whatsapp_consentimiento_en)
  values ('90444113', 'Con Permiso', '987444113', now()) returning id as id \\gset
select retail.editar_clienta(:'id'::uuid, 'dni', '90444113', 'Con Permiso', '987444113', null, null, null, null, 1) as v \\gset
select whatsapp_consentimiento_en is not null from retail.clientas where id = :'id'::uuid;
rollback;
`
  ),
  ([sigue]) => sigue === "t"
);

error(
  "editar_clienta sobre una ficha archivada se rechaza",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90444114', 'Sera Archivada', null, null, null) as id \\gset
select retail.archivar_clienta(:'id'::uuid, 'motivo de prueba', false, 1) as v \\gset
select retail.editar_clienta(:'id'::uuid, 'dni', null, 'No Debería Poder', null, null, null, null, null, :v);
`
  ),
  "Esta ficha está archivada"
);

// ---------------------------------------------------------------------------
// 12: archivar_clienta / reactivar_clienta — nunca delete (CLAUDE.md)
// ---------------------------------------------------------------------------

error(
  "archivar_clienta sin motivo se rechaza",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90444115', 'Sin Motivo', null, null, null) as id \\gset
select retail.archivar_clienta(:'id'::uuid, '', false, 1);
`
  ),
  "Escribe un motivo"
);

exito(
  "archivar_clienta simple conserva sus datos; reactivar_clienta la devuelve",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90444116', 'Ida Y Vuelta', '987444116', null, null) as id \\gset
select retail.archivar_clienta(:'id'::uuid, 'ya no compra', false, 1) as v1 \\gset
select retail.reactivar_clienta(:'id'::uuid, :v1) as v2 \\gset
select archivada_en is null, telefono_whatsapp from retail.clientas where id = :'id'::uuid;
rollback;
`
  ),
  ([activa, telefono]) => activa === "t" && telefono === "987444116"
);

exito(
  "archivar_clienta con p_anonimizar=true borra todo dato personal (Ley 29733)",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90444117', 'A Anonimizar', '987444117', 5::smallint, 8::smallint) as id \\gset
select retail.archivar_clienta(:'id'::uuid, 'pedido de la clienta', true, 1) as v \\gset
select documento_numero, nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, anonimizada from retail.clientas where id = :'id'::uuid;
rollback;
`
  ),
  ([dni, nombre, tel, whats, dia, anon]) => dni === "" && nombre === "Clienta anonimizada" && tel === "" && whats === "" && dia === "" && anon === "t"
);

error(
  "reactivar_clienta sobre una ficha anonimizada se rechaza — sus datos ya no existen",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90444118', 'No Se Reactiva', null, null, null) as id \\gset
select retail.archivar_clienta(:'id'::uuid, 'pedido de la clienta', true, 1) as v \\gset
select retail.reactivar_clienta(:'id'::uuid, :v);
`
  ),
  "fue anonimizada"
);

error(
  "estado imposible: un UPDATE directo que deje anonimizada=true con un nombre real viola el CHECK",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90444119', 'Se Cuela', null, null, null) as id \\gset
select retail.archivar_clienta(:'id'::uuid, 'pedido de la clienta', true, 1) as v \\gset
update retail.clientas set nombre = 'se coló un nombre real' where id = :'id'::uuid;
`
  ),
  "clientas_anonimizada_sin_datos_personales"
);

// ---------------------------------------------------------------------------
// 13: unir_clientas — D-99, una transacción que mueve ventas/separaciones/pedidos
// ---------------------------------------------------------------------------

exito(
  "unir_clientas mueve una venta y un pedido no atendido a la ficha que se queda, y anonimiza a la perdedora",
  comoPersona(
    FELIPE,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.registrar_clienta('dni', '90444120', 'Se Queda', '987444120', null, null) as mantiene \\gset
select retail.registrar_clienta('dni', null, 'Se Une', '987444121', null, null) as fusiona \\gset
insert into retail.ventas (id, ubicacion_id, cliente_id, estado, es_prueba) values (gen_random_uuid(), :'ubic'::uuid, :'fusiona'::uuid, 'completada', true) returning id as venta \\gset
insert into retail.pedidos_no_atendidos (id, ubicacion_id, descripcion_libre, clienta_id, created_at, resuelto)
  values (gen_random_uuid(), :'ubic'::uuid, 'prueba clientas.mjs', :'fusiona'::uuid, now(), false);
select (retail.unir_clientas(:'mantiene'::uuid, :'fusiona'::uuid, 1, 1)).documento_numero as dni_ganadora \\gset
select
  (select cliente_id from retail.ventas where id = :'venta'::uuid) = :'mantiene'::uuid,
  (select documento_numero is null and nombre = 'Clienta anonimizada' and anonimizada and fusionada_en_id = :'mantiene'::uuid from retail.clientas where id = :'fusiona'::uuid),
  (select ventas_movidas from retail.clientas_fusiones where clienta_fusionada_id = :'fusiona'::uuid);
rollback;
`
  ),
  ([ventaMovida, perdedoraOk, ventasMovidas]) => ventaMovida === "t" && perdedoraOk === "t" && ventasMovidas === "1"
);

error(
  "unir_clientas contra una ficha que ya se unió a otra se rechaza (no se fusiona dos veces)",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', '90444122', 'Primera', null, null, null) as a \\gset
select retail.registrar_clienta('dni', '90444123', 'Segunda', null, null, null) as b \\gset
select retail.registrar_clienta('dni', null, 'Tercera', '987444124', null, null) as c \\gset
select retail.unir_clientas(:'a'::uuid, :'c'::uuid, 1, 1) as v1 \\gset
select retail.unir_clientas(:'b'::uuid, :'c'::uuid, 1, 1);
`
  ),
  "ya está archivada o ya se unió a otra"
);

// ---------------------------------------------------------------------------
// 14: buscar_clienta con p_incluir_archivadas — no reaparece una anonimizada por accidente
// ---------------------------------------------------------------------------

exito(
  "buscar_clienta no muestra archivadas por defecto, sí con p_incluir_archivadas=true",
  comoPersona(
    FELIPE,
    `select retail.registrar_clienta('dni', null, 'Buscar Archivada', '987444125', null, null) as id \\gset
select retail.archivar_clienta(:'id'::uuid, 'motivo', false, 1) as v \\gset
select
  (select count(*) from retail.buscar_clienta('987444125')),
  (select count(*) from retail.buscar_clienta('987444125', true));
rollback;
`
  ),
  ([sinArchivadas, conArchivadas]) => sinArchivadas === "0" && conArchivadas === "1"
);

// ---------------------------------------------------------------------------
// 15: exportar_clientas — D-109/G.4, solo Admin, con rastro en retail.actividad
// ---------------------------------------------------------------------------

error(
  "exportar_clientas rechaza a quien no es Admin (Micaela, colaboradora)",
  comoPersona(MICAELA, `select retail.exportar_clientas();\n`),
  "Solo un Admin puede exportar"
);

exito(
  "exportar_clientas funciona para un Admin y queda anotado en retail.actividad",
  comoPersona(
    FELIPE,
    `select count(*) from retail.exportar_clientas() \\gset total_
select (select count(*) > 0 from retail.actividad where modulo = 'clientas' and accion = 'exportar');
rollback;
`
  ),
  ([hayRastro]) => hayRastro === "t"
);

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(
      `No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`
    );
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(
          `✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`
        );
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else {
      if (!resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        const columnas = resultado.salida.split("|");
        if (!caso.verificar(columnas)) {
          fallos++;
          console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
        } else {
          console.log(`✓ ${caso.nombre}`);
        }
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
