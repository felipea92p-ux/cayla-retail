#!/usr/bin/env node
/**
 * Prueba del ADR-0637, actividad 1 (`20261109232000_banco_lineas.sql`): el ERP guarda cada línea del extracto del banco y dice
 * «el banco dice / el ERP dice».
 *
 * QUÉ CUBRE
 *   · NO DUPLICA: el mismo extracto con otro token no agrega nada; con el MISMO token devuelve la misma respuesta sin escribir.
 *   · DOS PAGOS IGUALES SIGUEN SIENDO DOS: dos líneas no firmes idénticas (mismo día, monto y glosa) quedan dos, también al recargar.
 *   · PROVISIONAL → FIRME: lo que entró como provisional se retira cuando el banco lo trae ya procesado, y apunta a su sucesora.
 *   · ARCHIVO VIEJO: volver a subir el archivo de las provisionales después de confirmadas no duplica.
 *   · LO QUE EL BANCO YA NO TRAE se retira sin sucesora, y se cuenta. Eso solo lo hace el archivo: la tabla pegada, que puede venir
 *     cortada a mitad de un día, no quita líneas (si le falta una que ya estaba, no entra nada).
 *   · DE QUÉ CUENTA ES EL ARCHIVO: el de otra cuenta no entra (contra las cargas anteriores y contra el número anotado en la cuenta).
 *   · SOLO AGREGA: no se borra ni se edita una línea, una carga ni un corte; una línea firme no cambia jamás.
 *   · FRENOS: cuenta que no es banco o archivada, fecha futura, monto 0, firme sin número del banco, más de 5,000 líneas, sin ser
 *     líder… y no queda nada escrito. Cada freno se comprueba por SU motivo (su pista o una parte de su mensaje), no solo por fallar.
 *   · EL ORDEN DEL BANCO: las firmes van por (proceso, número), no por día; un archivo más viejo subido después del nuevo no cambia el saldo.
 *   · `fn_banco_cuadre` AL CÉNTIMO: el saldo del banco es su último saldo; el ERP con un movimiento anotado y otros sin anotar da la
 *     diferencia exacta; el punto de partida coincide; quitar una línea del medio es un hueco; un corte mueve el piso.
 *
 * CONTROL (`--control`, o `--mutante <nombre>` para uno): la misma prueba con la migración ROTA a propósito. Cada mutante tiene que
 * hacer caer los casos que dice probar; si no caen, la prueba no estaba probando nada.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK: nada queda escrito en la base. Los bancos de la prueba se crean en
 * la escena, con datos inventados.
 *
 * USO
 *   pnpm pruebas:banco-lineas                                     → contra el local compartido
 *   pnpm pruebas:banco-lineas -- --contenedor supabase_db_<pila>   → contra una pila propia
 *   pnpm pruebas:banco-lineas -- --control                         → todos los mutantes; sale con 0 solo si todos caen
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const a = process.argv.indexOf("--contenedor");
const CONTENEDOR = a > 0 ? process.argv[a + 1] : "supabase_db_cayla-retail";
const m = process.argv.indexOf("--mutante");
const CONTROL = process.argv.includes("--control");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const BANCO = "00000000-0000-4000-8000-0000000b0001";
const ARCHIVADA = "00000000-0000-4000-8000-0000000b0002";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORIGINAL = readFileSync(join(RAIZ, "supabase", "migrations", "20261109232000_banco_lineas.sql"), "utf8");

// Los mutantes: qué se rompe en la migración y qué casos TIENEN que caer con eso.
const reemplazar = (ancla, nuevo) => (sql) => {
  if (!sql.includes(ancla)) throw new Error(`La prueba no encuentra el texto que muta: actualiza el ancla «${ancla.slice(0, 60)}…».`);
  return sql.replace(ancla, nuevo);
};
const MUTANTES = {
  // Sin reconocer la firme repetida por su identidad: resubir el mismo extracto intenta guardar todo otra vez.
  duplicado: {
    muta: reemplazar(
      `     set entra = not exists (select 1 from retail.banco_lineas l
                              where l.cuenta_id = p_cuenta_id and l.retirada_en is null and l.identidad = t.identidad)`,
      "     set entra = true",
    ),
    caen: ["segunda"],
  },
  // Sin la regla «entran solo las que faltan»: el archivo viejo vuelve a meter las provisionales ya confirmadas.
  "archivo-viejo": {
    muta: reemplazar("     set entra = f.desde_el_final <= f.faltan", "     set entra = true"),
    caen: ["a_otra_vez", "vigentes_tras_archivo_viejo"],
  },
  // Sin retirar las provisionales del rango: la confirmada queda dos veces (la provisional y la firme).
  confirmar: {
    muta: reemplazar("     and not l.firme and l.fecha between v_desde and v_hasta;", "     and false;"),
    caen: ["b", "vigentes_firmes", "sucesoras"],
  },
  // Sin el candado de solo-agregar: una línea se puede borrar y editar.
  "solo-agregar": {
    muta: (sql) => `${sql}\nalter table retail.banco_lineas disable trigger banco_lineas_solo_agrega;\n`,
    caen: ["no_borrar_linea"],
  },
  // Sin el candado contra TRUNCATE: las líneas se pueden vaciar de un golpe.
  "sin-truncate": {
    muta: (sql) => `${sql}\nalter table retail.banco_lineas disable trigger banco_lineas_sin_truncate;\n`,
    caen: ["no_vaciar_lineas"],
  },
  // Sin exigir líder al guardar: cualquiera con sesión (o sin ella) llega más adentro. Los frenos de después también son P0001: por eso
  // el caso mira la PISTA del error, no solo su código.
  "sin-lider-cargar": {
    muta: reemplazar("  if not retail.fn_es_lider() then\n    raise exception 'Guardar el extracto del banco es solo del líder.'", "  if false then\n    raise exception 'Guardar el extracto del banco es solo del líder.'"),
    caen: ["cargar_solo_lider", "cargar_sin_sesion"],
  },
  // Sin exigir líder al leer: quien no es líder ve lo que dice el banco.
  "sin-lider-cuadre": {
    muta: reemplazar("  if not retail.fn_es_lider() then\n    raise exception 'Ver lo que dice el banco es solo del líder.'", "  if false then\n    raise exception 'Ver lo que dice el banco es solo del líder.'"),
    caen: ["cuadre_solo_lider", "cuadre_sin_sesion"],
  },
  // Las provisionales ordenadas por la hora de su carga antes que por su día: un archivo más viejo subido después deja un saldo atrasado.
  "orden-por-carga": {
    muta: reemplazar("                                       l.fecha, k.created_at, l.orden, l.id) as pos,", "                                       k.created_at, l.orden, l.id) as pos,"),
    caen: ["viejo_despues_del_nuevo"],
  },
  // Todo ordenado por el día de operación: el sábado que el banco procesa el lunes DESPUÉS del domingo queda antes, y la cadena se rompe.
  "orden-por-dia": {
    muta: reemplazar(
      `           row_number() over (order by coalesce(l.fecha_proceso, l.fecha), (not l.firme), case when l.firme then l.correlativo end,
                                       l.fecha, k.created_at, l.orden, l.id) as pos,`,
      "           row_number() over (order by l.fecha, k.created_at, l.orden, l.id) as pos,",
    ),
    caen: ["orden_del_banco"],
  },
  // Sin comparar la cuenta del archivo con la de las cargas anteriores: el extracto de otra cuenta entra, y una firme no sale más.
  "otra-cuenta": {
    muta: reemplazar("    if v_otra_cuenta is not null then", "    if false then"),
    caen: ["archivo_de_otra_cuenta"],
  },
  // Sin el freno de la tabla pegada cortada: retira las líneas que no trae, que el banco sí tiene.
  "pegado-cortado": {
    muta: reemplazar("    if v_sueltas > 0 then", "    if false then"),
    caen: ["pegado_cortado"],
  },
};

function correr(sql) {
  try {
    const salida = execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
      input: `${sql}\nrollback;\n`,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// Un freno: lo de adentro TIENE que fallar, y por SU motivo. Si pasa, la línea no se imprime y el caso falla. El aviso «tendría que
// haber fallado» lleva su propio código (XX999): con el mismo P0001 de los frenos, el bloque se tragaría su propio aviso y todo freno
// «pasaría» aunque no frenara. Y como casi todos los frenos son P0001, el código solo no dice CUÁL frenó (quitado el candado de líder,
// la carga seguía «fallando» por otro freno de más adentro): cada caso P0001 dice su `pista` (el hint del error) o una parte de su
// mensaje (`dice`); si falla por otra razón, el caso cae (XX998).
const comilla = (t) => t.replace(/'/g, "''");
const debeFallar = (nombre, sql, { codigo = "P0001", pista = null, dice = null } = {}) => {
  if (codigo === "P0001" && pista === null && dice === null) throw new Error(`El freno «${nombre}» no dice por qué tiene que fallar (pista o dice).`);
  return `
do $$
declare
  v_mensaje text;
  v_pista text;
begin
  ${sql};
  raise exception '${nombre}: tendría que haber fallado' using errcode = 'XX999';
exception when others then
  get stacked diagnostics v_mensaje = message_text, v_pista = pg_exception_hint;
  if sqlstate <> '${codigo}' then raise; end if;
  if ${pista === null ? "false" : `v_pista is distinct from '${comilla(pista)}'`} or ${dice === null ? "false" : `position('${comilla(dice)}' in v_mensaje) = 0`} then
    raise exception '${nombre}: falló, pero por otra razón (pista «%»): %', coalesce(v_pista, ''), v_mensaje using errcode = 'XX998';
  end if;
end $$;
select '${nombre}|ok';`;
};

// ---------- Las líneas de un extracto (inventadas) ----------
const H = (letra) => letra.repeat(64);
const T = (n) => `00000000-0000-4000-8000-00000000c${String(n).padStart(3, "0")}`;
/** Una línea que el banco ya procesó: trae su fecha de proceso y su número definitivo. */
const firme = (orden, fecha, proceso, correlativo, monto, saldo, descripcion, mas = {}) => ({
  orden, fecha, fecha_proceso: proceso, correlativo, codigo: mas.codigo ?? "0201", operacion: mas.operacion ?? null, descripcion, monto, saldo, firme: true,
});
/** Una línea sin confirmar: la provisional del archivo (con número «0000…») o la de la tabla copiada de la web (sin número). */
const suelta = (orden, fecha, monto, saldo, descripcion, mas = {}) => ({
  orden, fecha, fecha_proceso: mas.proceso ?? null, correlativo: mas.correlativo ?? null, codigo: mas.codigo ?? null, operacion: mas.operacion ?? null,
  descripcion, monto, saldo, firme: false,
});
const J = (lineas) => `'${JSON.stringify(lineas).replace(/'/g, "''")}'::jsonb`;
// La cuenta que dice el archivo en cada renglón (inventada). La tabla pegada no la trae: va vacía salvo que el caso pida otra cosa.
const CTA = "00100200300400500600789";
const CTA_OTRA = "00100200300400500601234";
const llamada = (fuente, lineas, huella, token, cuenta = `'${BANCO}'`, cuentaArchivo = fuente === "ibk_txt" ? CTA : null) =>
  `retail.cargar_lineas_banco(${cuenta}, '${fuente}', ${typeof lineas === "string" ? lineas : J(lineas)}, ${huella === null ? "null" : `'${huella}'`}, ${token === null ? "null" : `'${token}'`}, ${cuentaArchivo === null ? "null" : `'${cuentaArchivo}'`})`;
const cargar = (nombre, fuente, lineas, huella, token, cuentaArchivo) => `select ${llamada(fuente, lineas, huella, token, undefined, cuentaArchivo)} as ${nombre} \\gset`;
/** «líneas,nuevas,repetidas,confirmadas,retiradas sin sucesora» de una carga. */
const cuentas = (v) => `select '${v}|' || concat_ws(',', :'${v}'::jsonb ->> 'lineas', :'${v}'::jsonb ->> 'nuevas', :'${v}'::jsonb ->> 'repetidas', :'${v}'::jsonb ->> 'confirmadas', :'${v}'::jsonb ->> 'retiradas_sin_sucesora');`;
const VIGENTES = `(select count(*) from retail.banco_lineas where cuenta_id = '${BANCO}' and retirada_en is null)`;
const FILAS = `(select count(*) from retail.banco_lineas where cuenta_id = '${BANCO}')`;
const CARGAS = `(select count(*) from retail.banco_cargas where cuenta_id = '${BANCO}')`;
const dinero = (expr) => `to_char((${expr})::numeric, 'FM999999990.00')`;

// Diez líneas firmes, dos por día, del 5 al 9 de octubre. El saldo parte de 1,000.
const DIEZ = Array.from({ length: 10 }, (_, i) => {
  const dia = 5 + Math.floor(i / 2);
  return firme(i, `2026-10-0${dia}`, `2026-10-0${dia}`, `0026${273 + dia}000${(i % 2) + 1}`, "10.00", (1000 + 10 * (i + 1)).toFixed(2), "TRANSF RECIBIDA");
});
// Tres provisionales del sábado 10 (el banco las procesa el lunes) y las mismas tres ya procesadas.
const A = [
  suelta(0, "2026-10-10", "30.00", "1030.00", "ABONO QR IBK", { proceso: "2026-10-11", correlativo: "00000000001", codigo: "0305" }),
  suelta(1, "2026-10-10", "30.00", "1060.00", "ABONO QR IBK", { proceso: "2026-10-11", correlativo: "00000000002", codigo: "0305" }),
  suelta(2, "2026-10-10", "-5.00", "1055.00", "COMISION MANT", { proceso: "2026-10-11", correlativo: "00000000003", codigo: "0909", operacion: "7654321" }),
];
const B = [
  firme(0, "2026-10-10", "2026-10-12", "00262850001", "30.00", "1030.00", "ABONO QR IBK", { codigo: "0305" }),
  firme(1, "2026-10-10", "2026-10-12", "00262850002", "30.00", "1060.00", "ABONO QR IBK", { codigo: "0305" }),
  firme(2, "2026-10-10", "2026-10-12", "00262850003", "-5.00", "1055.00", "COMISION MANT", { codigo: "0909", operacion: "7654321" }),
];
// Para el cuadre: dos líneas de historia (antes del 5-oct, el `saldo_desde` del banco), tres firmes y una provisional.
const CUADRE = [
  firme(0, "2026-10-02", "2026-10-02", "00262750001", "50.00", "950.00", "TRANSF RECIBIDA"),
  firme(1, "2026-10-03", "2026-10-05", "00262780001", "50.00", "1000.00", "TRANSF RECIBIDA"), // sábado: el banco la procesa el lunes
  firme(2, "2026-10-05", "2026-10-05", "00262780002", "500.00", "1500.00", "TRANSF RECIBIDA"), // la única anotada en el ERP
  firme(3, "2026-10-06", "2026-10-06", "00262790001", "200.00", "1700.00", "TRANSF RECIBIDA"),
  firme(4, "2026-10-07", "2026-10-07", "00262800001", "-0.05", "1699.95", "ITF", { codigo: "0909" }),
  suelta(5, "2026-10-07", "45.90", "1745.85", "ABONO QR IBK", { proceso: "2026-10-07", correlativo: "00000000001", codigo: "0305" }),
];
const UNA = (mas) => J([{ orden: 0, fecha: "2026-10-06", fecha_proceso: null, correlativo: null, codigo: null, operacion: null, descripcion: "LINEA DE PRUEBA", monto: "1.00", saldo: null, firme: false, ...mas }]);
const C = (campo) => `(retail.fn_banco_cuadre('${BANCO}') ${campo})`;
const ANOTAR = (monto, fecha) => `select retail.registrar_movimiento_dinero('aporte', ${monto}, null, '${BANCO}', date '${fecha}', 'prueba del extracto', 0, null, null, gen_random_uuid());`;

/** Corre todas las escenas con esa migración. `breve` (el control): solo dice qué casos cayeron, con la primera línea del porqué. */
function suite(migracion, breve = false) {
  const resultados = {};
  let casos = 0;
  let fallos = 0;
  function verificar(titulo, r, esperados) {
    const lineas = r.ok ? Object.fromEntries(r.salida.split("\n").filter((l) => l.includes("|")).map((l) => [l.slice(0, l.indexOf("|")), l.slice(l.indexOf("|") + 1)])) : {};
    for (const [caso, valor] of Object.entries(esperados)) {
      casos++;
      const ok = r.ok && lineas[caso] === valor;
      resultados[caso] = ok;
      if (!ok) fallos++;
      const porque = ok ? "" : r.ok ? `esperado ${valor}, salió ${lineas[caso]}` : r.mensaje;
      if (breve) {
        if (!ok) console.log(`  ✗ ${caso}: ${porque.split("\n")[0].replace(/^psql:<stdin>:\d+: /, "").slice(0, 150)}`);
        continue;
      }
      console.log(`${ok ? "✓" : "✗"} ${titulo}: ${caso}`);
      if (!ok) console.log(`    ${porque.slice(0, 1200)}`);
    }
  }

  // El banco de la prueba abre el 5-oct con S/ 1,000. La migración se vuelve a aplicar dentro de la escena: es idempotente, y así el
  // control corre la misma prueba con la migración mutada.
  const ESCENA = `
begin;
set client_min_messages = warning;
set local request.jwt.claim.sub = '${FELIPE}';
${migracion}
reset lock_timeout;
update retail.parametros_finanzas set inicio_finanzas = '2019-01-01';
insert into retail.cuentas_dinero (id, nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde)
  values ('${BANCO}', 'Banco de prueba del extracto', 'banco', '104', 1000.00, date '2026-10-05');
insert into retail.cuentas_dinero (id, nombre, tipo, cuenta_contable, archivada_en)
  values ('${ARCHIVADA}', 'Banco archivado de prueba', 'banco', '104', now());
`;

  verificar("no duplica", correr(`${ESCENA}
${cargar("primera", "ibk_txt", DIEZ, H("a"), T(1))}
${cuentas("primera")}
select 'rango|' || (:'primera'::jsonb ->> 'desde') || ',' || (:'primera'::jsonb ->> 'hasta');
select 'identidad_firme|' || identidad from retail.banco_lineas where cuenta_id = '${BANCO}' and orden = 0;
-- El mismo extracto, otro envío: nada nuevo.
${cargar("segunda", "ibk_txt", DIEZ, H("a"), T(2))}
${cuentas("segunda")}
-- El MISMO envío (doble clic): la misma respuesta, sin escribir.
${cargar("otra_vez", "ibk_txt", DIEZ, H("a"), T(1))}
select 'mismo_token|' || (:'primera'::jsonb = :'otra_vez'::jsonb);
select 'filas|' || ${CARGAS} || ',' || ${FILAS} || ',' || ${VIGENTES};
-- El token sigue al contenido: con otro archivo o en otra cuenta se rechaza.
${debeFallar("token_con_otro_archivo", `perform ${llamada("ibk_txt", DIEZ, H("b"), T(1))}`, { pista: "token_reusado" })}
${debeFallar("token_en_otra_cuenta", `perform ${llamada("ibk_txt", DIEZ, H("a"), T(1), `'${ARCHIVADA}'`)}`, { pista: "token_reusado" })}
-- La misma línea del banco con otro monto, otro día u otro saldo: ese archivo no es de esta cuenta.
${debeFallar("misma_linea_otro_monto", `perform ${llamada("ibk_txt", [{ ...DIEZ[0], monto: "11.00" }], H("c"), T(3))}`, { pista: "banco_linea_distinta" })}
${debeFallar("misma_linea_otro_dia", `perform ${llamada("ibk_txt", [{ ...DIEZ[0], fecha: "2026-10-04" }], H("c"), T(3))}`, { pista: "banco_linea_distinta" })}
${debeFallar("misma_linea_otro_saldo", `perform ${llamada("ibk_txt", [{ ...DIEZ[0], saldo: "999.00" }], H("c"), T(3))}`, { pista: "banco_linea_distinta" })}
-- Una sola clase de fuente por día: la tabla de la web no entra sobre un día que ya tiene líneas del archivo.
${debeFallar("tabla_sobre_dia_con_archivo", `perform ${llamada("tabla_web", [suelta(0, "2026-10-05", "10.00", "1010.00", "TRANSF RECIBIDA")], H("d"), T(4))}`, { pista: "banco_dia_con_archivo" })}
-- Y un pegado enviado como si fuera el archivo tampoco: la fuente se reconoce por lo que trae (ninguna línea con el número del banco).
${debeFallar("pegado_enviado_como_archivo", `perform ${llamada("ibk_txt", [suelta(0, "2026-10-05", "10.00", "1010.00", "TRANSF RECIBIDA")], H("d"), T(4))}`, { dice: "ninguna línea trae su número del banco" })}
select 'sigue_igual|' || ${CARGAS} || ',' || ${FILAS};
-- La misma línea con la descripción recortada sí es la misma (son palabras, no plata): cuenta como repetida y lo guardado no cambia.
${cargar("otra_glosa", "ibk_txt", [{ ...DIEZ[0], descripcion: "TRANSF RECIB" }], H("e"), T(5))}
${cuentas("otra_glosa")}
select 'glosa_guardada|' || descripcion from retail.banco_lineas where cuenta_id = '${BANCO}' and orden = 0;
`), {
    primera: "10,10,0,0,0",
    rango: "2026-10-05,2026-10-09",
    identidad_firme: "ibk:20261005:00262780001",
    segunda: "10,0,10,0,0",
    mismo_token: "true",
    filas: "2,10,10",
    token_con_otro_archivo: "ok",
    token_en_otra_cuenta: "ok",
    misma_linea_otro_monto: "ok",
    misma_linea_otro_dia: "ok",
    misma_linea_otro_saldo: "ok",
    tabla_sobre_dia_con_archivo: "ok",
    pegado_enviado_como_archivo: "ok",
    sigue_igual: "2,10",
    otra_glosa: "1,0,1,0,0",
    glosa_guardada: "TRANSF RECIBIDA",
  });

  // De qué cuenta es el archivo. Una firme no se retira jamás: el extracto de OTRA cuenta guardado aquí no tendría vuelta atrás.
  const OTROS_DIAS = [firme(0, "2026-10-20", "2026-10-20", "00262930001", "15.00", "1115.00", "TRANSF RECIBIDA")];
  verificar("de qué cuenta es el archivo", correr(`${ESCENA}
${cargar("primera", "ibk_txt", DIEZ, H("a"), T(1))}
select 'cuenta_guardada|' || cuenta_archivo from retail.banco_cargas where cuenta_id = '${BANCO}';
-- Días que no se solapan con nada (no hay línea repetida que lo delate): solo la cuenta del archivo lo frena.
${debeFallar("archivo_de_otra_cuenta", `perform ${llamada("ibk_txt", OTROS_DIAS, H("b"), T(2), undefined, CTA_OTRA)}`, { pista: "banco_otra_cuenta" })}
${debeFallar("archivo_sin_cuenta", `perform ${llamada("ibk_txt", OTROS_DIAS, H("b"), T(2), undefined, null)}`, { pista: "banco_sin_cuenta_del_archivo" })}
${debeFallar("archivo_con_cuenta_ilegible", `perform ${llamada("ibk_txt", OTROS_DIAS, H("b"), T(2), undefined, "000-00x")}`, { pista: "banco_sin_cuenta_del_archivo" })}
${debeFallar("tabla_pegada_con_cuenta", `perform ${llamada("tabla_web", [suelta(0, "2026-10-20", "15.00", null, "TRANSF RECIBIDA")], H("b"), T(2), undefined, CTA)}`, { dice: "no dice de qué cuenta es" })}
select 'nada_escrito|' || ${CARGAS} || ',' || ${FILAS};
-- La misma cuenta escrita de otra forma (con guiones, sin los ceros de la izquierda) es la misma.
${cargar("misma_cuenta", "ibk_txt", OTROS_DIAS, H("b"), T(2), "100-200300400-500600789")}
${cuentas("misma_cuenta")}
-- La cuenta tiene su número anotado («•••• 1111»): el archivo tiene que terminar igual.
update retail.cuentas_dinero set numero = '•••• 1111' where id = '${BANCO}';
${debeFallar("no_termina_como_el_numero_anotado", `perform ${llamada("ibk_txt", DIEZ, H("a"), T(3))}`, { pista: "banco_otra_cuenta", dice: "tiene anotado un número terminado en 1111" })}
update retail.cuentas_dinero set numero = 'Cta. 500-600789' where id = '${BANCO}';
${cargar("termina_igual", "ibk_txt", DIEZ, H("a"), T(3))}
${cuentas("termina_igual")}
-- La tabla pegada no dice de qué cuenta es: entra sin ese dato (y nunca como firme).
${cargar("pegada", "tabla_web", [suelta(0, "2026-10-21", "15.00", "1130.00", "TRANSF RECIBIDA")], H("c"), T(4))}
select 'pegada_sin_cuenta|' || coalesce(cuenta_archivo, 'vacía') from retail.banco_cargas where id = (:'pegada'::jsonb ->> 'carga_id')::uuid;
`), {
    cuenta_guardada: "100200300400500600789",
    archivo_de_otra_cuenta: "ok",
    archivo_sin_cuenta: "ok",
    archivo_con_cuenta_ilegible: "ok",
    tabla_pegada_con_cuenta: "ok",
    nada_escrito: "1,10",
    misma_cuenta: "1,1,0,0,0",
    no_termina_como_el_numero_anotado: "ok",
    termina_igual: "10,0,10,0,0",
    pegada_sin_cuenta: "vacía",
  });

  // La tabla copiada de la web: sin número del banco. Dos pagos iguales del mismo día (la glosa se compara sin mirar mayúsculas ni
  // espacios de más) y una línea final sin saldo.
  const GEMELAS = [
    suelta(0, "2026-10-06", "45.90", "1045.90", "ABONO QR IBK"),
    suelta(1, "2026-10-06", "45.90", "1091.80", "abono  qr ibk "),
    suelta(2, "2026-10-06", "-10.00", null, "COMISION"),
  ];
  verificar("dos pagos iguales siguen siendo dos", correr(`${ESCENA}
${cargar("gemelas", "tabla_web", GEMELAS, H("a"), T(1))}
${cuentas("gemelas")}
select 'identidades|' || string_agg(identidad, ' ' order by identidad collate "C") from retail.banco_lineas where cuenta_id = '${BANCO}' and retirada_en is null;
${cargar("recarga", "tabla_web", GEMELAS, H("a"), T(2))}
${cuentas("recarga")}
select 'siguen_dos|' || count(*) from retail.banco_lineas where cuenta_id = '${BANCO}' and retirada_en is null and monto = 45.90;
select 'vigentes_y_filas|' || ${VIGENTES} || ',' || ${FILAS};
select 'renovadas_con_sucesora|' || count(*) from retail.banco_lineas where cuenta_id = '${BANCO}' and retirada_en is not null and reemplazada_por is not null;
-- La última línea no trae saldo: el banco dice el último saldo más lo que vino después.
select 'saldo_sin_ultimo|' || ${dinero(C("-> 'banco' ->> 'saldo'"))} || ',' || ${C("->> 'por_confirmar'")};
-- Aparece un tercer pago igual: entra uno solo.
${cargar("tercero", "tabla_web", [...GEMELAS.slice(0, 2), suelta(2, "2026-10-06", "45.90", "1137.70", "ABONO QR IBK"), { ...GEMELAS[2], orden: 3 }], H("b"), T(3))}
${cuentas("tercero")}
select 'ahora_tres|' || count(*) from retail.banco_lineas where cuenta_id = '${BANCO}' and retirada_en is null and monto = 45.90;
`), {
    gemelas: "3,3,0,0,0",
    identidades: "sin:20261006:-1000:COMISION:-:1 sin:20261006:4590:ABONO QR IBK:-:1 sin:20261006:4590:ABONO QR IBK:-:2",
    recarga: "3,0,3,0,0",
    siguen_dos: "2",
    vigentes_y_filas: "3,6",
    renovadas_con_sucesora: "3",
    saldo_sin_ultimo: "1081.80,3",
    tercero: "4,1,3,0,0",
    ahora_tres: "3",
  });

  // La tabla pegada solo agrega o repite. La web del banco pagina: lo copiado puede empezar a mitad de un día. Si retirara lo que no
  // trae, se llevaría líneas que el banco sí tiene (y el punto de partida se correría sin que la cadena lo delate).
  const DIA_6 = [
    suelta(0, "2026-10-06", "10.00", "1010.00", "ABONO UNO"),
    suelta(1, "2026-10-06", "20.00", "1030.00", "ABONO DOS"),
    suelta(2, "2026-10-06", "30.00", "1060.00", "ABONO TRES"),
  ];
  const DIA_7 = suelta(3, "2026-10-07", "40.00", "1100.00", "ABONO CUATRO");
  verificar("la tabla pegada solo agrega o repite", correr(`${ESCENA}
${cargar("dia", "tabla_web", DIA_6, H("a"), T(1))}
-- La segunda página empieza a mitad del día 6: no trae sus dos primeras líneas. No entra nada.
${debeFallar("pegado_cortado", `perform ${llamada("tabla_web", [{ ...DIA_6[2], orden: 0 }, { ...DIA_7, orden: 1 }], H("b"), T(2))}`, { pista: "banco_pegado_incompleto", dice: "le faltan 2 líneas" })}
select 'nada_cambia|' || ${CARGAS} || ',' || ${VIGENTES} || ',' || ${FILAS} || ',' || ${dinero(C("-> 'ancla' ->> 'banco'"))};
-- Con los días completos sí: las tres de antes se repiten y entra la nueva.
${cargar("completo", "tabla_web", [...DIA_6, DIA_7], H("c"), T(3))}
${cuentas("completo")}
select 'ancla_igual|' || ${VIGENTES} || ',' || ${dinero(C("-> 'ancla' ->> 'banco'"))} || ',' || ${C("->> 'huecos'")};
-- Quitar una línea que el banco dejó de traer es cosa del archivo: trae los días completos y dice la verdad de ese rango.
${cargar("archivo", "ibk_txt", [
    firme(0, "2026-10-06", "2026-10-06", "00262790001", "10.00", "1010.00", "ABONO UNO"),
    firme(1, "2026-10-06", "2026-10-06", "00262790002", "30.00", "1040.00", "ABONO TRES"),
    firme(2, "2026-10-07", "2026-10-07", "00262800001", "40.00", "1080.00", "ABONO CUATRO"),
  ], H("d"), T(4))}
${cuentas("archivo")}
select 'tras_el_archivo|' || ${VIGENTES} || ',' || ${dinero(C("-> 'banco' ->> 'saldo'"))} || ',' || ${C("->> 'huecos'")};
`), {
    pegado_cortado: "ok",
    nada_cambia: "1,3,3,1000.00",
    completo: "4,1,3,0,0",
    ancla_igual: "4,1000.00,0",
    archivo: "3,0,0,3,1",
    tras_el_archivo: "3,1080.00,0",
  });

  verificar("provisional → firme, archivo viejo y lo que el banco ya no trae", correr(`${ESCENA}
${cargar("a", "ibk_txt", A, H("a"), T(1))}
${cuentas("a")}
-- El lunes el banco las trae ya procesadas: las tres provisionales se retiran y apuntan a su sucesora.
${cargar("b", "ibk_txt", B, H("b"), T(2))}
${cuentas("b")}
select 'vigentes_firmes|' || count(*) || ',' || count(*) filter (where firme) from retail.banco_lineas where cuenta_id = '${BANCO}' and retirada_en is null;
select 'sucesoras|' || count(*) from retail.banco_lineas v join retail.banco_lineas s on s.id = v.reemplazada_por
 where v.cuenta_id = '${BANCO}' and v.retirada_por_carga = (:'b'::jsonb ->> 'carga_id')::uuid and s.firme and s.retirada_en is null and s.monto = v.monto and s.fecha = v.fecha;
-- Alguien vuelve a subir el archivo del domingo: no duplica nada.
${cargar("a_otra_vez", "ibk_txt", A, H("a"), T(3))}
${cuentas("a_otra_vez")}
select 'vigentes_tras_archivo_viejo|' || ${VIGENTES} || ',' || ${FILAS};
-- Dos provisionales del 13; después el banco confirma una (con otra línea nueva) y la otra ya no viene: se retira sin sucesora.
${cargar("p", "ibk_txt", [
    suelta(0, "2026-10-13", "77.00", "1132.00", "ABONO QR IBK", { proceso: "2026-10-13", correlativo: "00000000001" }),
    suelta(1, "2026-10-13", "12.00", "1144.00", "ABONO QR IBK", { proceso: "2026-10-13", correlativo: "00000000002" }),
  ], H("c"), T(4))}
${cargar("q", "ibk_txt", [
    firme(0, "2026-10-13", "2026-10-13", "00262860001", "12.00", "1067.00", "ABONO QR IBK"),
    firme(1, "2026-10-13", "2026-10-13", "00262860002", "-3.00", "1064.00", "COMISION MANT"),
  ], H("d"), T(5))}
${cuentas("q")}
select 'la_que_ya_no_viene|' || count(*) filter (where reemplazada_por is null) || ',' || count(*) filter (where reemplazada_por is not null)
  from retail.banco_lineas where cuenta_id = '${BANCO}' and retirada_por_carga = (:'q'::jsonb ->> 'carga_id')::uuid;
select 'vigentes_al_final|' || ${VIGENTES};
-- El reintento de esa carga (mismo token) responde lo mismo, también la que se retiró sin sucesora, y no escribe.
${cargar("q_otra_vez", "ibk_txt", [
    firme(0, "2026-10-13", "2026-10-13", "00262860001", "12.00", "1067.00", "ABONO QR IBK"),
    firme(1, "2026-10-13", "2026-10-13", "00262860002", "-3.00", "1064.00", "COMISION MANT"),
  ], H("d"), T(5))}
select 'reintento_igual|' || (:'q'::jsonb = :'q_otra_vez'::jsonb) || ',' || ${CARGAS};
`), {
    a: "3,3,0,0,0",
    b: "3,0,0,3,0",
    vigentes_firmes: "3,3",
    sucesoras: "3",
    a_otra_vez: "3,0,3,0,0",
    vigentes_tras_archivo_viejo: "3,6",
    q: "2,1,0,1,1",
    la_que_ya_no_viene: "1,1",
    vigentes_al_final: "5",
    reintento_igual: "true,5",
  });

  // Dos pagos iguales, uno confirmado y otro todavía no: la firme cuenta, y la provisional entra solo si FALTA.
  const VEINTE = (orden, extra) => suelta(orden, "2026-10-14", "20.00", null, "ABONO QR IBK", { proceso: "2026-10-14", correlativo: `0000000000${orden + 1}`, ...extra });
  const VEINTE_FIRME = firme(0, "2026-10-14", "2026-10-14", "00262870001", "20.00", null, "ABONO QR IBK");
  verificar("una confirmada y otra todavía no", correr(`${ESCENA}
${cargar("dos", "ibk_txt", [VEINTE(0), VEINTE(1)], H("a"), T(1))}
-- El banco confirma una; la otra sigue provisional.
${cargar("mitad", "ibk_txt", [VEINTE_FIRME, VEINTE(1)], H("b"), T(2))}
${cuentas("mitad")}
select 'una_y_una|' || count(*) filter (where firme) || ',' || count(*) filter (where not firme) from retail.banco_lineas where cuenta_id = '${BANCO}' and retirada_en is null;
select 'k_despues_de_la_firme|' || identidad from retail.banco_lineas where cuenta_id = '${BANCO}' and retirada_en is null and not firme;
-- Aparece un tercer pago igual, también provisional: la firme ya está, entran las dos que faltan (una es la de antes, renovada).
${cargar("tres", "ibk_txt", [VEINTE_FIRME, VEINTE(1), VEINTE(2)], H("c"), T(3))}
${cuentas("tres")}
select 'vigentes|' || ${VIGENTES};
`), {
    mitad: "2,0,1,1,0",
    una_y_una: "1,1",
    k_despues_de_la_firme: "sin:20261014:2000:ABONO QR IBK:-:2",
    tres: "3,1,2,0,0",
    vigentes: "3",
  });

  const UNA_LINEA = `(select id from retail.banco_lineas where cuenta_id = '${BANCO}' and`;
  verificar("solo agrega", correr(`${ESCENA}
${cargar("mezcla", "ibk_txt", [...B, suelta(3, "2026-10-12", "8.00", "1063.00", "ABONO QR IBK", { proceso: "2026-10-12", correlativo: "00000000001" })], H("a"), T(1))}
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into retail.banco_cortes (cuenta_id, fecha, saldo_banco, registrado_por, token_cliente) values ('${BANCO}', date '2026-10-09', 1000.00, :'felipe', gen_random_uuid());
insert into retail.banco_cortes (cuenta_id, fecha, saldo_banco, registrado_por, token_cliente) values ('${BANCO}', date '2026-10-08', 990.00, :'felipe', gen_random_uuid());
${debeFallar("no_borrar_linea", `delete from retail.banco_lineas where cuenta_id = '${BANCO}' and not firme`, { dice: "no se borra" })}
${debeFallar("no_editar_monto", `update retail.banco_lineas set monto = 9.00 where cuenta_id = '${BANCO}' and not firme`, { dice: "solo cambia para retirarse" })}
${debeFallar("no_editar_glosa_de_firme", `update retail.banco_lineas set descripcion = 'OTRA' where cuenta_id = '${BANCO}' and firme`, { dice: "ya confirmó no cambia" })}
${debeFallar("no_retirar_una_firme", `update retail.banco_lineas set retirada_en = now(), retirada_por_carga = carga_id where cuenta_id = '${BANCO}' and firme`, { dice: "ya confirmó no cambia" })}
${debeFallar("no_borrar_firme", `delete from retail.banco_lineas where cuenta_id = '${BANCO}' and firme`, { dice: "no se borra" })}
-- Un TRUNCATE salta los candados por fila: tiene el suyo en las tres tablas.
${debeFallar("no_vaciar_lineas", "truncate retail.banco_lineas", { dice: "no se vacía" })}
${debeFallar("no_vaciar_cargas", "truncate retail.banco_cargas cascade", { dice: "no se vacía" })}
${debeFallar("no_vaciar_cortes", "truncate retail.banco_cortes", { dice: "no se vacía" })}
-- Y la tabla misma no acepta una firme procesada antes de haber pasado, venga de donde venga.
${debeFallar("firme_procesada_antes_en_la_tabla", `insert into retail.banco_lineas (cuenta_id, carga_id, identidad, fecha, fecha_proceso, correlativo, descripcion, monto, orden, firme) select cuenta_id, id, 'ibk:20261001:00262740001', date '2026-10-02', date '2026-10-01', '00262740001', 'X', 1.00, 99, true from retail.banco_cargas where cuenta_id = '${BANCO}'`, { codigo: "23514" })}
${debeFallar("no_borrar_carga", `delete from retail.banco_cargas where cuenta_id = '${BANCO}'`, { dice: "no se edita ni se borra" })}
${debeFallar("no_editar_carga", `update retail.banco_cargas set nuevas = 0, repetidas = lineas, confirmadas = 0 where cuenta_id = '${BANCO}'`, { dice: "no se edita ni se borra" })}
${debeFallar("no_borrar_corte", `delete from retail.banco_cortes where cuenta_id = '${BANCO}'`, { dice: "no se borra" })}
${debeFallar("no_editar_corte", `update retail.banco_cortes set saldo_banco = 1.00 where cuenta_id = '${BANCO}'`, { dice: "no se edita" })}
${debeFallar("no_dos_cortes_el_mismo_dia", `insert into retail.banco_cortes (cuenta_id, fecha, saldo_banco, registrado_por, token_cliente) select cuenta_id, fecha, 5.00, registrado_por, gen_random_uuid() from retail.banco_cortes where cuenta_id = '${BANCO}' and fecha = date '2026-10-09'`, { codigo: "23505" })}
-- Lo único que cambia: un corte se anula con motivo (y ya anulado, no cambia más) y una provisional se retira (y no vuelve).
update retail.banco_cortes set estado = 'anulado', motivo_anulacion = 'Prueba', anulado_en = now() where cuenta_id = '${BANCO}' and fecha = date '2026-10-08';
select 'corte_se_anula|' || estado from retail.banco_cortes where cuenta_id = '${BANCO}' and fecha = date '2026-10-08';
${debeFallar("anulado_no_cambia", `update retail.banco_cortes set motivo_anulacion = 'Otra' where cuenta_id = '${BANCO}' and estado = 'anulado'`, { dice: "no se edita" })}
update retail.banco_lineas set retirada_en = now(), retirada_por_carga = carga_id where cuenta_id = '${BANCO}' and not firme;
select 'provisional_se_retira|' || count(*) from retail.banco_lineas where cuenta_id = '${BANCO}' and retirada_en is not null;
${debeFallar("retirada_no_vuelve", `update retail.banco_lineas set retirada_en = null, retirada_por_carga = null where cuenta_id = '${BANCO}' and not firme`, { dice: "solo cambia para retirarse" })}
${debeFallar("retirada_no_cambia_de_fecha", `update retail.banco_lineas set retirada_en = now() - interval '1 day' where cuenta_id = '${BANCO}' and not firme`, { dice: "solo cambia para retirarse" })}
update retail.banco_lineas set reemplazada_por = ${UNA_LINEA} firme and monto = -5.00) where cuenta_id = '${BANCO}' and not firme;
${debeFallar("sucesora_no_cambia", `update retail.banco_lineas set reemplazada_por = ${UNA_LINEA} firme and saldo = 1030.00) where cuenta_id = '${BANCO}' and not firme`, { dice: "solo cambia para retirarse" })}
select 'permisos|' || concat_ws(',',
  has_function_privilege('anon', 'retail.cargar_lineas_banco(uuid, text, jsonb, text, uuid, text)', 'execute'),
  has_function_privilege('authenticated', 'retail.cargar_lineas_banco(uuid, text, jsonb, text, uuid, text)', 'execute'),
  has_function_privilege('anon', 'retail.fn_banco_cuadre(uuid)', 'execute'),
  has_function_privilege('authenticated', 'retail.fn_banco_cuadre(uuid)', 'execute'),
  has_table_privilege('authenticated', 'retail.banco_lineas', 'select'),
  has_table_privilege('authenticated', 'retail.banco_cargas', 'select'),
  has_table_privilege('authenticated', 'retail.banco_cortes', 'select'),
  (select bool_and(relrowsecurity) from pg_class where oid in ('retail.banco_lineas'::regclass, 'retail.banco_cargas'::regclass, 'retail.banco_cortes'::regclass)));
`), {
    no_borrar_linea: "ok",
    no_editar_monto: "ok",
    no_editar_glosa_de_firme: "ok",
    no_retirar_una_firme: "ok",
    no_borrar_firme: "ok",
    no_vaciar_lineas: "ok",
    no_vaciar_cargas: "ok",
    no_vaciar_cortes: "ok",
    firme_procesada_antes_en_la_tabla: "ok",
    no_borrar_carga: "ok",
    no_editar_carga: "ok",
    no_borrar_corte: "ok",
    no_editar_corte: "ok",
    no_dos_cortes_el_mismo_dia: "ok",
    corte_se_anula: "anulado",
    anulado_no_cambia: "ok",
    provisional_se_retira: "1",
    retirada_no_vuelve: "ok",
    retirada_no_cambia_de_fecha: "ok",
    sucesora_no_cambia: "ok",
    permisos: "f,t,f,t,f,f,f,t",
  });

  const MUCHAS = (n) => `(select jsonb_agg(jsonb_build_object('orden', g, 'fecha', '2026-10-06', 'descripcion', 'LINEA ' || g, 'monto', '1.00', 'firme', false)) from generate_series(0, ${n - 1}) g)`;
  verificar("frenos", correr(`${ESCENA}
${debeFallar("no_es_banco", `perform ${llamada("tabla_web", UNA({}), H("a"), T(1), "(select id from retail.cuentas_dinero where tipo = 'por_abonar' limit 1)")}`, { dice: "elige la cuenta del banco" })}
${debeFallar("cuenta_archivada", `perform ${llamada("tabla_web", UNA({}), H("a"), T(1), `'${ARCHIVADA}'`)}`, { dice: "está archivada" })}
${debeFallar("cuenta_que_no_existe", `perform ${llamada("tabla_web", UNA({}), H("a"), T(1), "gen_random_uuid()")}`, { dice: "elige la cuenta del banco" })}
${debeFallar("fecha_futura", `perform ${llamada("tabla_web", `jsonb_build_array(jsonb_build_object('orden', 0, 'fecha', to_char(retail.fn_hoy_lima() + 1, 'YYYY-MM-DD'), 'descripcion', 'MAÑANA', 'monto', '1.00', 'firme', false))`, H("a"), T(1))}`, { dice: "con fecha futura" })}
${debeFallar("fecha_que_no_existe", `perform ${llamada("tabla_web", UNA({ fecha: "2026-02-31" }), H("a"), T(1))}`, { dice: "que no existe" })}
${debeFallar("monto_cero", `perform ${llamada("tabla_web", UNA({ monto: "0.00" }), H("a"), T(1))}`, { dice: "una línea sin monto" })}
${debeFallar("monto_que_no_es_numero", `perform ${llamada("tabla_web", UNA({ monto: "NaN" }), H("a"), T(1))}`, { dice: "no trae un monto legible" })}
${debeFallar("monto_con_tres_decimales", `perform ${llamada("tabla_web", UNA({ monto: "1.005" }), H("a"), T(1))}`, { dice: "no trae un monto legible" })}
${debeFallar("monto_gigante", `perform ${llamada("tabla_web", UNA({ monto: "1000000.01" }), H("a"), T(1))}`, { dice: "de más de S/ 1,000,000" })}
${debeFallar("firme_sin_correlativo", `perform ${llamada("ibk_txt", UNA({ firme: true, fecha_proceso: "2026-10-06" }), H("a"), T(1))}`, { dice: "tiene que traer su fecha de proceso y su número del banco" })}
${debeFallar("firme_sin_fecha_de_proceso", `perform ${llamada("ibk_txt", UNA({ firme: true, correlativo: "00262790001" }), H("a"), T(1))}`, { dice: "tiene que traer su fecha de proceso y su número del banco" })}
${debeFallar("firme_con_numero_provisional", `perform ${llamada("ibk_txt", UNA({ firme: true, fecha_proceso: "2026-10-06", correlativo: "00000000001" }), H("a"), T(1))}`, { dice: "con un número provisional" })}
${debeFallar("tabla_web_con_firme", `perform ${llamada("tabla_web", UNA({ firme: true, fecha_proceso: "2026-10-06", correlativo: "00262790001" }), H("a"), T(1))}`, { dice: "no puede marcarlas como ya procesadas" })}
${debeFallar("tabla_web_con_numero_del_banco", `perform ${llamada("tabla_web", UNA({ correlativo: "00000000001" }), H("a"), T(1))}`, { dice: "eso es del archivo" })}
-- La fecha de proceso ordena las líneas: una del futuro quedaría última para siempre y su saldo pasaría por el del banco.
${debeFallar("proceso_futuro", `perform ${llamada("ibk_txt", `jsonb_build_array(jsonb_build_object('orden', 0, 'fecha', '2026-10-06', 'fecha_proceso', to_char(retail.fn_hoy_lima() + 1, 'YYYY-MM-DD'), 'correlativo', '00000000001', 'descripcion', 'MAÑANA', 'monto', '1.00', 'firme', false))`, H("a"), T(1))}`, { dice: "fecha de proceso futura" })}
${debeFallar("firme_con_proceso_lejano", `perform ${llamada("ibk_txt", UNA({ firme: true, fecha_proceso: "9999-12-31", correlativo: "00262790001", saldo: "5.00" }), H("a"), T(1))}`, { dice: "fecha de proceso futura" })}
${debeFallar("firme_procesada_antes_de_pasar", `perform ${llamada("ibk_txt", UNA({ firme: true, fecha_proceso: "2026-10-05", correlativo: "00262780009" }), H("a"), T(1))}`, { dice: "antes de que pasara" })}
-- El número de operación va dentro de la identidad, separado por «:».
${debeFallar("operacion_con_dos_puntos", `perform ${llamada("tabla_web", UNA({ operacion: "12:34" }), H("a"), T(1))}`, { dice: "número de operación ilegible" })}
${debeFallar("la_misma_firme_dos_veces", `perform ${llamada("ibk_txt", [DIEZ[0], { ...DIEZ[0], orden: 1 }], H("a"), T(1))}`, { dice: "dos veces la misma línea" })}
${debeFallar("orden_repetido", `perform ${llamada("ibk_txt", [DIEZ[0], { ...DIEZ[1], orden: 0 }], H("a"), T(1))}`, { dice: "en la misma posición" })}
${debeFallar("sin_descripcion", `perform ${llamada("tabla_web", UNA({ descripcion: "  " }), H("a"), T(1))}`, { dice: "no trae descripción" })}
${debeFallar("fuente_desconocida", `perform ${llamada("otro_banco", UNA({}), H("a"), T(1))}`, { dice: "No reconozco de dónde viene" })}
${debeFallar("huella_que_no_es_huella", `perform ${llamada("tabla_web", UNA({}), "abc", T(1))}`, { dice: "Falta la huella" })}
${debeFallar("sin_token", `perform ${llamada("tabla_web", UNA({}), H("a"), null)}`, { dice: "Falta la marca del envío" })}
${debeFallar("sin_lineas", `perform ${llamada("tabla_web", "'[]'::jsonb", H("a"), T(1))}`, { dice: "no trae ninguna línea" })}
${debeFallar("mas_de_5000", `perform ${llamada("tabla_web", MUCHAS(5001), H("a"), T(1))}`, { dice: "hasta 5,000" })}
select 'nada_escrito|' || (select count(*) from retail.banco_cargas where token_cliente = '${T(1)}') || ',' || (select count(*) from retail.banco_lineas where cuenta_id in ('${BANCO}', '${ARCHIVADA}'));
-- Y 5,000 justas sí entran.
${cargar("tope", "tabla_web", MUCHAS(5000), H("a"), T(2))}
${cuentas("tope")}
`), {
    no_es_banco: "ok",
    cuenta_archivada: "ok",
    cuenta_que_no_existe: "ok",
    fecha_futura: "ok",
    fecha_que_no_existe: "ok",
    monto_cero: "ok",
    monto_que_no_es_numero: "ok",
    monto_con_tres_decimales: "ok",
    monto_gigante: "ok",
    firme_sin_correlativo: "ok",
    firme_sin_fecha_de_proceso: "ok",
    firme_con_numero_provisional: "ok",
    tabla_web_con_firme: "ok",
    tabla_web_con_numero_del_banco: "ok",
    proceso_futuro: "ok",
    firme_con_proceso_lejano: "ok",
    firme_procesada_antes_de_pasar: "ok",
    operacion_con_dos_puntos: "ok",
    la_misma_firme_dos_veces: "ok",
    orden_repetido: "ok",
    sin_descripcion: "ok",
    fuente_desconocida: "ok",
    huella_que_no_es_huella: "ok",
    sin_token: "ok",
    sin_lineas: "ok",
    mas_de_5000: "ok",
    nada_escrito: "0,0",
    tope: "5000,5000,0,0,0",
  });

  // El ERP anota el aporte de 500 del 5-oct. No anota los 200 del 6, ni el ITF, ni el QR del 7: la diferencia es 200 − 0.05 + 45.90.
  // Un aporte anterior al `saldo_desde` y otro posterior a la última línea del banco no cuentan.
  const ERP = `${ANOTAR("500.00", "2026-10-05")}\n${ANOTAR("77.00", "2026-10-03")}\n${ANOTAR("999.00", "2026-10-08")}`;
  const POR_CODIGO = `(select string_agg(concat_ws(':', x ->> 'codigo', x ->> 'glosa', x ->> 'n', ${dinero("x ->> 'entra'")}, ${dinero("x ->> 'sale'")}), ' ' order by o) from jsonb_array_elements(${C("-> 'por_codigo'")}) with ordinality e(x, o))`;
  verificar("el banco dice / el ERP dice", correr(`${ESCENA}
select 'sin_extracto|' || concat_ws(',', ${C("->> 'hay_extracto'")}, ${C("->> 'piso'")}, coalesce(${C("->> 'banco'")}, 'nulo'), coalesce(${C("->> 'diferencia'")}, 'nulo'));
${ERP}
${cargar("c", "ibk_txt", CUADRE, H("a"), T(1))}
select 'piso_y_corte|' || ${C("->> 'piso'")} || ',' || coalesce(${C("->> 'corte'")}, 'sin corte');
select 'banco|' || ${dinero(C("-> 'banco' ->> 'saldo'"))} || '@' || ${C("-> 'banco' ->> 'al'")};
select 'erp|' || ${dinero(C("-> 'erp' ->> 'saldo'"))};
select 'diferencia|' || ${dinero(C("->> 'diferencia'"))};
select 'ancla|' || concat_ws(',', ${dinero(C("-> 'ancla' ->> 'banco'"))}, ${dinero(C("-> 'ancla' ->> 'erp'"))}, ${dinero(C("-> 'ancla' ->> 'diferencia'"))});
select 'lineas|' || concat_ws(',', ${C("->> 'lineas_desde_piso'")}, ${C("->> 'lineas_historia'")}, ${C("->> 'por_confirmar'")}, ${C("->> 'huecos'")});
select 'entra_y_sale|' || ${dinero(C("->> 'entra'"))} || ',' || ${dinero(C("->> 'sale'"))};
select 'por_codigo|' || ${POR_CODIGO};
select 'ultima_carga|' || concat_ws(',', ${C("-> 'ultima_carga' ->> 'por'")}, ${C("-> 'ultima_carga' ->> 'fuente'")}, ${C("-> 'ultima_carga' ->> 'desde'")}, ${C("-> 'ultima_carga' ->> 'hasta'")}, ${C("-> 'ultima_carga' ->> 'nuevas'")}, (${C("-> 'ultima_carga' ->> 'id'")} = :'c'::jsonb ->> 'carga_id'));
-- Con un corte al cierre del 5-oct el piso pasa al 6: el 5 se vuelve historia y el punto de partida es el del corte.
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into retail.banco_cortes (cuenta_id, fecha, saldo_banco, registrado_por, token_cliente) values ('${BANCO}', date '2026-10-05', 1500.00, :'felipe', gen_random_uuid());
select 'con_corte|' || concat_ws(',', ${C("->> 'piso'")}, ${C("-> 'corte' ->> 'fecha'")}, ${dinero(C("-> 'corte' ->> 'saldo_banco'"))}, ${C("->> 'lineas_desde_piso'")}, ${C("->> 'lineas_historia'")});
select 'ancla_con_corte|' || concat_ws(',', ${dinero(C("-> 'ancla' ->> 'banco'"))}, ${dinero(C("-> 'ancla' ->> 'erp'"))}, ${dinero(C("-> 'ancla' ->> 'diferencia'"))});
select 'el_corte_no_cambia_la_diferencia|' || ${dinero(C("->> 'diferencia'"))};
-- Un corte al cierre del último día guardado: todo es historia, pero el último saldo del banco ES el de la víspera del piso, y el ERP
-- parte con lo anotado hasta ese día (los 500 del 5; el aporte del 8 ya es del piso).
insert into retail.banco_cortes (cuenta_id, fecha, saldo_banco, registrado_por, token_cliente) values ('${BANCO}', date '2026-10-07', 1745.85, :'felipe', gen_random_uuid());
select 'corte_en_la_vispera|' || concat_ws(',', ${C("->> 'piso'")}, ${C("->> 'lineas_desde_piso'")}, ${C("->> 'lineas_historia'")}, ${dinero(C("-> 'ancla' ->> 'banco'"))}, ${dinero(C("-> 'ancla' ->> 'erp'"))}, ${dinero(C("-> 'ancla' ->> 'diferencia'"))});
-- Un corte posterior a todo lo guardado: el último saldo del banco es de dos semanas antes y no dice con cuánto abrió el piso. No se
-- afirma un punto de partida sin evidencia.
insert into retail.banco_cortes (cuenta_id, fecha, saldo_banco, registrado_por, token_cliente) values ('${BANCO}', date '2026-10-20', 1745.85, :'felipe', gen_random_uuid());
select 'corte_posterior|' || concat_ws(',', ${C("->> 'piso'")}, ${C("->> 'lineas_desde_piso'")}, ${C("->> 'lineas_historia'")}, coalesce(${C("->> 'ancla'")}, 'sin punto de partida'), ${dinero(C("->> 'diferencia'"))});
-- Anulados los cortes, el piso vuelve al \`saldo_desde\` de la cuenta.
update retail.banco_cortes set estado = 'anulado', motivo_anulacion = 'Prueba', anulado_en = now() where cuenta_id = '${BANCO}';
select 'sin_cortes|' || ${C("->> 'piso'")} || ',' || ${C("->> 'lineas_historia'")};
`), {
    sin_extracto: "false,2026-10-05,nulo,nulo",
    piso_y_corte: "2026-10-05,sin corte",
    banco: "1745.85@2026-10-07",
    erp: "1500.00",
    diferencia: "245.85",
    ancla: "1000.00,1000.00,0.00",
    lineas: "4,2,1,0",
    entra_y_sale: "745.90,0.05",
    por_codigo: "0201:TRANSF RECIBIDA:2:700.00:0.00 0305:ABONO QR IBK:1:45.90:0.00 0909:ITF:1:0.00:0.05",
    ultima_carga: "Felipe Alvarez,ibk_txt,2026-10-02,2026-10-07,6,t",
    con_corte: "2026-10-06,2026-10-05,1500.00,3,3",
    ancla_con_corte: "1500.00,1500.00,0.00",
    el_corte_no_cambia_la_diferencia: "245.85",
    corte_en_la_vispera: "2026-10-08,0,6,1745.85,1500.00,245.85",
    corte_posterior: "2026-10-21,0,6,sin punto de partida,245.85",
    sin_cortes: "2026-10-05,2",
  });

  verificar("a la cadena le falta una línea", correr(`${ESCENA}
${ERP}
${cargar("c", "ibk_txt", CUADRE.filter((l) => l.orden !== 3), H("a"), T(1))}
select 'un_hueco|' || ${C("->> 'huecos'")};
-- El saldo del banco sigue siendo su último saldo, no una suma: la diferencia no cambia; el punto de partida sí delata la falta.
select 'saldo_y_diferencia|' || ${dinero(C("-> 'banco' ->> 'saldo'"))} || ',' || ${dinero(C("->> 'diferencia'"))};
select 'ancla_delata|' || ${dinero(C("-> 'ancla' ->> 'diferencia'"))};
-- Llega el extracto completo: la que faltaba entra y el hueco se cierra.
${cargar("completo", "ibk_txt", CUADRE, H("b"), T(2))}
${cuentas("completo")}
select 'sin_hueco|' || ${C("->> 'huecos'")} || ',' || ${dinero(C("-> 'ancla' ->> 'diferencia'"))};
`), {
    un_hueco: "1",
    saldo_y_diferencia: "1745.85,245.85",
    ancla_delata: "200.00",
    completo: "6,1,5,0,0",
    sin_hueco: "0,0.00",
  });

  // El orden del banco. El domingo 11 y el sábado 10 se procesan el lunes 12, y el banco procesó PRIMERO el domingo: el orden real es el
  // del número del banco, no el del día. Después, lo del fin de semana siguiente que el banco aún no procesa: dos descargas del mismo día.
  const TRES = [
    firme(0, "2026-10-09", "2026-10-09", "00262820001", "100.00", "1100.00", "TRANSF RECIBIDA"),
    firme(1, "2026-10-11", "2026-10-12", "00262850001", "20.00", "1120.00", "ABONO QR IBK", { codigo: "0305" }),
    firme(2, "2026-10-10", "2026-10-12", "00262850002", "-70.00", "1050.00", "COMISION MANT", { codigo: "0909" }),
  ];
  const prov = (orden, fecha, monto, saldo, n) => suelta(orden, fecha, monto, saldo, "ABONO QR IBK", { proceso: "2026-10-18", correlativo: `0000000000${n}`, codigo: "0305" });
  const TARDE = [prov(0, "2026-10-17", "30.00", "1080.00", 1), prov(1, "2026-10-17", "40.00", "1120.00", 2), prov(2, "2026-10-18", "-15.00", "1105.00", 3)];
  const MANANA = TARDE.slice(0, 2); // la descarga de la mañana: todavía sin la línea del 18
  verificar("el orden del banco", correr(`${ESCENA}
${cargar("tres", "ibk_txt", TRES, H("a"), T(1))}
select 'orden_del_banco|' || ${dinero(C("-> 'banco' ->> 'saldo'"))} || '@' || ${C("-> 'banco' ->> 'al'")} || ',' || ${C("->> 'huecos'")};
${cargar("tarde", "ibk_txt", TARDE, H("b"), T(2))}
select 'con_provisionales|' || ${dinero(C("-> 'banco' ->> 'saldo'"))} || '@' || ${C("-> 'banco' ->> 'al'")} || ',' || ${C("->> 'huecos'")} || ',' || ${C("->> 'por_confirmar'")};
-- Alguien sube DESPUÉS el archivo más viejo (el de la mañana): renueva sus dos provisionales, y la del 18 sigue vigente. El saldo del
-- banco sigue siendo el de la última línea, no el último del archivo viejo.
${cargar("manana", "ibk_txt", MANANA, H("c"), T(3))}
${cuentas("manana")}
select 'viejo_despues_del_nuevo|' || ${dinero(C("-> 'banco' ->> 'saldo'"))} || '@' || ${C("-> 'banco' ->> 'al'")} || ',' || ${C("->> 'huecos'")} || ',' || ${C("->> 'por_confirmar'")};
`), {
    orden_del_banco: "1050.00@2026-10-11,0",
    con_provisionales: "1105.00@2026-10-18,0,3",
    manana: "2,0,2,0,0",
    viejo_despues_del_nuevo: "1105.00@2026-10-18,0,3",
  });

  verificar("solo el líder", correr(`${ESCENA}
${cargar("c", "ibk_txt", CUADRE, H("a"), T(1))}
set local request.jwt.claim.sub = '${MICAELA}';
-- Líneas que entrarían limpias (otros días, sin chocar con nada): lo único que las frena es no ser líder, y se comprueba por su pista.
${debeFallar("cargar_solo_lider", `perform ${llamada("ibk_txt", B, H("b"), T(2))}`, { pista: "banco_solo_lider" })}
${debeFallar("cuadre_solo_lider", `perform retail.fn_banco_cuadre('${BANCO}')`, { pista: "banco_solo_lider" })}
set local request.jwt.claim.sub = '';
${debeFallar("cargar_sin_sesion", `perform ${llamada("ibk_txt", B, H("b"), T(2))}`, { pista: "banco_solo_lider" })}
${debeFallar("cuadre_sin_sesion", `perform retail.fn_banco_cuadre('${BANCO}')`, { pista: "banco_solo_lider" })}
select 'nada_mas|' || ${CARGAS} || ',' || ${FILAS};
set local request.jwt.claim.sub = '${FELIPE}';
${debeFallar("cuadre_de_lo_que_no_es_banco", `perform retail.fn_banco_cuadre((select id from retail.cuentas_dinero where tipo = 'por_abonar' limit 1))`, { dice: "Elige un banco" })}
`), {
    cargar_solo_lider: "ok",
    cuadre_solo_lider: "ok",
    cargar_sin_sesion: "ok",
    cuadre_sin_sesion: "ok",
    nada_mas: "1,6",
    cuadre_de_lo_que_no_es_banco: "ok",
  });

  return { resultados, casos, fallos };
}

if (CONTROL || m > 0) {
  const pedido = m > 0 ? process.argv[m + 1] : null;
  if (m > 0 && !(pedido in MUTANTES)) {
    console.error(`--mutante espera uno de: ${Object.keys(MUTANTES).join(", ")}`);
    process.exit(2);
  }
  let vivos = 0;
  for (const nombre of CONTROL ? Object.keys(MUTANTES) : [pedido]) {
    console.log(`\n=== CONTROL «${nombre}»: con la migración rota, TIENEN que caer: ${MUTANTES[nombre].caen.join(", ")}`);
    const { resultados, casos, fallos } = suite(MUTANTES[nombre].muta(ORIGINAL), true);
    const sobreviven = MUTANTES[nombre].caen.filter((c) => resultados[c] !== false);
    console.log(`${casos - fallos} de ${casos} casos. ${sobreviven.length === 0 ? `✓ El mutante «${nombre}» cayó.` : `✗ El mutante «${nombre}» SOBREVIVIÓ: no cayó ${sobreviven.join(", ")}.`}`);
    if (sobreviven.length > 0) vivos++;
  }
  process.exit(vivos > 0 ? 1 : 0);
}

const { casos, fallos } = suite(ORIGINAL);
console.log(`\n${casos - fallos} de ${casos} casos.`);
process.exit(fallos > 0 ? 1 : 0);
