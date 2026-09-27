#!/usr/bin/env node
/**
 * Coherencia MÓDULO ↔ BASE: «si un módulo se puede apagar en la pantalla, la base tiene que enterarse»
 * (ADR-0150 dijo «una prueba debe fallar si…» y hasta hoy ninguna cruzaba módulos con funciones).
 *
 * EL PROBLEMA. Roles y accesos le da a cada cuenta una lista de módulos «ve / no ve». La pantalla esconde lo que la
 * cuenta no ve, pero lo que de verdad la detiene es la base. 10 de los 29 módulos delegables (medido en producción el
 * 2026-09-26) no los exige ninguna función: apagarlos oculta el menú y nada más; la cuenta sigue pudiendo llamar a la
 * función que guarda. `modulos.test.ts` vigila la otra dirección (que el catálogo de la web sea el de las migraciones),
 * y `roles_por_modulo.mjs` prueba que el mecanismo funciona; ninguna decía «este módulo no protege nada».
 *
 * PROMETE
 *   (a) Todo módulo delegable tiene, al menos, un guardián en la base (definición abajo), o está en la lista SOLO_PANTALLA
 *       de este archivo, con su razón en español.
 *   (b) SOLO_PANTALLA solo puede ENCOGERSE: si alguien cierra una rebanada (le pone guardián a un módulo) y se olvida de
 *       sacarlo de la lista, la prueba falla; y una entrada de un módulo que ya no existe o ya no es delegable, también.
 *       Efecto buscado: cubrir un módulo siempre se ve en el diff del PR como «sale de SOLO_PANTALLA», donde el revisor
 *       lee qué función dice protegerlo.
 *   (c) Un módulo delegable NUEVO sin guardián y sin entrada en la lista hace fallar la prueba con el mensaje de qué hacer.
 *   (d) La otra cara: toda función que exige SOLO LÍDER mediante un ayudante-candado (`fn_exigir_*`, ver abajo) está declarada
 *       en SOLO_LIDER con lo que hace la pantalla con quien no es líder. Una nueva, o una que dejó de serlo, hace fallar.
 * ASUME: el stack local levantado (`npx supabase start`) con todas las migraciones y el seed, como las demás pruebas de
 * este job, y el código de `apps/web` (lee de él qué funciones llama la pantalla). No depende del orden, ni de datos, ni de
 * cuentas: solo lee el catálogo (`pg_proc`, `pg_policy`, `pg_views`, `pg_trigger`) y `retail.modulos`. Los controles crean
 * cosas dentro de una transacción que termina en ROLLBACK.
 *
 * DEFINICIÓN DE «GUARDIÁN» (léela, Felipe: aquí hay decisiones discutibles)
 *   Un guardián es un objeto de `retail` que nombra el módulo con literal en `fn_ve_modulo('x')` o en
 *   `fn_capacidad_por_modulos(array['x', …])` —las dos únicas formas oficiales de preguntarle a la base por un módulo— y
 *   que está EN EL CAMINO de una operación real. Los objetos que cuentan son:
 *     · una POLÍTICA RLS o una VISTA que nombra el módulo: la base la aplica sola al leer, nadie tiene que llamarla;
 *     · una FUNCIÓN que nombra el módulo (definición viva de `pg_get_functiondef`, sin comentarios) y a la que se llega
 *       desde una RAÍZ. Son raíces: la pantalla (un `.rpc("nombre")` en `apps/web`, sin contar las pruebas ni los
 *       comentarios), un disparador enganchado a una tabla, y lo que llame una política o una vista. Se llega por llamadas:
 *       una raíz que llama a un ayudante que llama a otro, y así, cuenta toda la cadena. La pantalla NO hace raíz a una
 *       SONDA: una función que solo contesta un sí/no o una lista de sedes y no puede escribir (no es VOLATILE, no devuelve
 *       jsonb ni filas), porque la pantalla usa esa respuesta para mostrar u ocultar y el que protege es quien la llama
 *       dentro de la base (`fn_puede_gestionar_colaboradores` o `fn_gastos_ubicaciones` las llama el front y no por eso
 *       protegen); una lectura que devuelve datos, o una función que escribe, sí es puerta por sí misma.
 *   Lo que se busca es la LLAMADA por nombre (`nombre(`), con los textos entre comillas quitados: nombrar una función en un
 *   `raise notice` no es llamarla. Lo que devuelve la función no la hace guardián ni la descarta (boolean, uuid[], void…): lo
 *   que cuenta es que esté en el camino. Una función que nadie llama, y que la pantalla tampoco llama o solo llama como
 *   sonda, no protege nada, sea un `fn_puede_*` o un `fn_x_ubicaciones`. Si la fila del módulo sale «sin guardián» pero hay
 *   funciones que ya lo nombran, el mensaje las lista como «nadie las llama»: conéctalas o quita la mención.
 *   SÍ CUENTA
 *     · guardia de lectura y de escritura: Análisis, Actividad y Reportes financieros no escriben nada, su única
 *       protección posible es al leer;
 *     · un módulo nombrado en un arreglo junto a otros (`array['existencias','conteos','traslados']`): la capacidad es un «o»,
 *       y cualquiera de los tres la enciende. Se cuenta como guardián pero se marca «compartido»: apagar solo UNO de esos
 *       módulos no quita la capacidad mientras la cuenta tenga otro (hoy: existencias, conteos, traslados; productos,
 *       atributos). Es el diseño de `fn_capacidad_por_modulos`, no un defecto; el resumen lo dice para que el número no
 *       engañe, y exigir un guardián «propio» sería otra decisión de Felipe.
 *   NO CUENTA
 *     1. `fn_es_terminal` (lista SIN_GUARDIA): nombra `vender` y `existencias` solo para decidir de qué tipo es un aparato;
 *        no deja ni impide vender. Cualquier otra función que nombre un módulo sin guardar con él va en SIN_GUARDIA;
 *     2. la palabra suelta: solo se busca la LLAMADA. Una consulta exploratoria previa contaba `'produccion'` de
 *        `fn_por_pagar_consolidado`, que es una etiqueta de origen de una fila, no un candado, y por eso creía que
 *        Producción tenía una función; en la base no tiene ninguna;
 *     3. los comentarios y los textos: `-- fn_ve_modulo('x')` en un comentario no protege, y un `--` dentro de un texto no
 *        se confunde con un comentario (una sola pasada los separa);
 *     4. mirar la sede (`fn_puede_operar_ubicacion`) o exigir «solo líder» (`fn_es_lider`): no son guardianes de módulo.
 *        Por eso Cambios, Devoluciones, Recibir… están en SOLO_PANTALLA aunque sus funciones sí comprueben la sede;
 *     5. leer `retail.rol_modulos` a mano, o un módulo cuyo nombre se arma en tiempo de ejecución
 *        (`fn_ve_modulo(v_clave)`): una sola forma de preguntar, la oficial y con literal, para que se pueda auditar;
 *     6. una función a la que no se llega: sin `.rpc` en la pantalla (o solo como sonda), sin otra función, política, vista
 *        ni disparador que la llame. Una RPC nueva llega a ser raíz cuando la pantalla la llama (en el mismo PR, como pide
 *        CLAUDE.md).
 *   LÍMITES A PROPÓSITO (decisiones discutibles, dichas de frente)
 *     · «Al menos uno», no «todos». Un módulo con diez funciones que guardan y un solo guardián aparece cubierto:
 *       esta prueba dice si el módulo protege ALGO, no cuánto. Exigir «todas» obliga a clasificar función por función (son
 *       unas 137 las que guardan) y a decidir cada una con Felipe: es trabajo pendiente, por rebanadas.
 *     · La lista puede no llegar nunca a cero. Si Felipe decide que un módulo se queda así a propósito (p. ej. Historial,
 *       que se lee por sede), su entrada se queda con esa decisión escrita en la razón; la prueba solo exige que no se olvide.
 *     · Una política que nombra el módulo cuenta, pero la prueba no comprueba que otra política permisiva de la misma tabla
 *       no deje pasar a todos por su lado (las políticas permisivas se suman con «o»). Igual que un `if false and …` en una
 *       función: que se nombre el módulo no prueba que lo exija bien. Quien lo prueba de verdad, cuenta por cuenta, es
 *       `pnpm pruebas:roles`.
 *     · Las llamadas de la pantalla se leen del texto: `.rpc("x")`, `.rpc(a ? "x" : "y")` y `.rpc(CONSTANTE)` con
 *       `const CONSTANTE = "x"` escrita en cualquier archivo de apps/web. Un nombre armado en tiempo de ejecución no se ve
 *       (`--detalle` los lista); esa función solo cuenta si además la llama otra, así que el fallo es un rojo ruidoso, nunca
 *       un falso verde. La distinción «sonda / lectura / escritura» sale del tipo (VOLATILE, jsonb, filas): un heurístico, no
 *       una prueba de intención; si algún día se equivoca, se equivoca hacia el rojo.
 *
 * (d) AYUDANTES-CANDADO. Un ayudante-candado es una función `*exigir*` cuya guarda es «si no es líder, rechaza»
 *   (`fn_exigir_lider_dinero`, `fn_exigir_lider_balance`, `fn_flujo_exigir_lider`). Toda función que lo llama cuenta como
 *   «exige solo líder»: no se intenta adivinar si además tiene otro candado o lo pide solo en una rama, eso lo dice su razón.
 *   Cada una tiene que estar en SOLO_LIDER con el módulo delegable donde la pantalla la usa (o `null` si su pantalla es de un
 *   módulo no delegable) y qué hace esa pantalla con quien no es líder. Verificado a mano el 2026-09-26: la pantalla esconde
 *   lo que la base exige solo al líder (`esLider`, `redirect`, `SoloLiderFlujo`), así que hoy NO es «abre y falla al guardar»
 *   (en `cuentas_dinero`, además, 5 de las 9 que guardan viven en Configuración, no en el módulo);
 *   es «queda tapado por la pantalla y nadie lo decidió por escrito».
 *   Lo que esa lista NO ve: las funciones con el candado escrito directo (`if not fn_es_lider() then raise`, sin ayudante).
 *   Saber a qué módulo pertenece cada una no está en la base y hay que decidirlo función por función: el resumen dice
 *   cuántas son (trabajo pendiente: sacar «siempre solo del líder» de la base).
 *
 * DE DÓNDE SALEN LAS LISTAS INICIALES. Las mismas consultas (`--consulta`) dieron el 2026-09-26, en producción y en la base
 * construida con las migraciones, lo mismo: 32 módulos, 29 delegables, 19 con guardián (5 de ellos compartidos) y 10 sin él
 * (los de SOLO_PANTALLA); y las mismas 23 funciones que exigen solo líder por un ayudante-candado (las de SOLO_LIDER). Si un
 * día difieren, manda esta prueba en CI (corre sobre las migraciones).
 *
 * CONTROLES (para que la prueba muerda): en cada uno se crea un módulo falso y, si hace falta, una función, política, vista
 * o disparador falsos; se exige que la misma regla los delate o los perdone, y termina en ROLLBACK. Sin ellos alguien podría
 * aflojar la regla y la prueba seguiría en verde sin morder.
 *
 * USO
 *   pnpm pruebas:roles-cobertura                 → contra la base `postgres` del stack local
 *   pnpm pruebas:roles-cobertura --base cayla_x  → contra otra base del mismo contenedor
 *   … --detalle    → imprime, módulo por módulo, qué objetos lo exigen y qué llamadas de la pantalla no se pudieron leer
 *   … --consulta   → imprime solo las dos consultas (cada una un SELECT) para correrlas a mano, p. ej. en producción
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const DETALLE = process.argv.includes("--detalle");
const SOLO_CONSULTA = process.argv.includes("--consulta");

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB = join(RAIZ, "apps", "web");

// ---------------------------------------------------------------------------------------------------------------------
// Lo que se declara a mano. Las listas solo deben ENCOGERSE: cada entrada es una deuda o una decisión con su razón.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Módulos delegables que hoy NO protege ningún guardián: se apagan en pantalla y la base sigue dejando pasar. Cada razón
 * dice qué hace hoy la base en su lugar. Se saca una entrada en el mismo PR que le pone su guardián (por
 * rebanadas y con decisión de Felipe por función: «la base pide el módulo en las funciones que guardan»).
 */
const SOLO_PANTALLA = {
  vender:
    "registrar_venta y emitir_comprobante solo comprueban que la cuenta opere esa sede (fn_puede_operar_ubicacion); fn_es_lider() " +
    "solo decide el tope de descuento. El módulo lo nombra únicamente fn_es_terminal, que lo usa para clasificar un aparato.",
  cambios: "registrar_cambio solo mira la sede; cambios_select deja leer a líder o a quien opera esa sede.",
  devoluciones: "crear_devolucion solo mira la sede; devoluciones_select y devoluciones_write son «líder o su sede».",
  historial:
    "Módulo de lectura: ventas_select, comprobantes_select, cambios_select y devoluciones_select dejan leer a líder o a la sede, sin preguntar por el módulo.",
  facturacion: "emitir_comprobante solo comprueba la sede; comprobantes_select deja leer a líder o a la sede.",
  clientas: "registrar_clienta no tiene candado en su cuerpo (solo firma con fn_actor_persona_id) y clientas_select deja leer a toda cuenta autenticada.",
  movimientos: "Módulo de lectura: movimientos_select deja leer a líder o a quien opera la sede de origen o de destino, sin preguntar por el módulo.",
  recibir: "recibir_lote, recibir_compras y recibir_insumo solo comprueban la sede (fn_puede_operar_ubicacion).",
  produccion:
    "abrir_produccion, cerrar_produccion y set_etapa_produccion solo comprueban la sede; producciones_select es «líder o su sede». " +
    "La palabra 'produccion' de fn_por_pagar_consolidado es la etiqueta de origen de una fila, no un candado.",
};

/**
 * Funciones que NOMBRAN un módulo sin guardar con él (no cuentan como guardián). Hoy solo una: fn_es_terminal usa
 * fn_ve_modulo('vender') y fn_ve_modulo('existencias') para saber de qué tipo es un aparato, no para dejar o impedir nada.
 */
const SIN_GUARDIA = {
  fn_es_terminal: "clasifica un aparato como de ventas o administrativo según los módulos de su rol; no guarda nada con ellos.",
};

/**
 * Las funciones que exigen SOLO LÍDER por un ayudante-candado, agrupadas por lo que hace su pantalla. `modulo` es el módulo
 * DELEGABLE donde la pantalla las usa (queda «tapado» por la pantalla, no protegido por el módulo), o `null` si su pantalla
 * es de un módulo no delegable. Todo verificado a mano el 2026-09-26 contra `apps/web` (archivo citado en cada razón).
 */
const SOLO_LIDER_GRUPOS = [
  {
    modulo: "cuentas_dinero",
    funciones: [
      "registrar_conciliacion", "anular_conciliacion", "marcar_revisados_dinero", "asignar_cuenta_pasada",
      "fn_conciliacion", "fn_conciliacion_cuentas", "fn_medios_de_cobro", "fn_plata_del_dueno", "fn_dinero_sin_cuenta", "fn_pagos_sin_cuenta",
    ],
    razon:
      "Las llama Cuentas y dinero (app/(app)/finanzas/dinero, components/finanzas/CuentasDinero.tsx y PagosSinCuenta.tsx) y solo se piden o " +
      "se muestran si la cuenta es líder (`esLider`; la conciliación redirige a quien no lo es): la pantalla tapa lo que la base exige solo " +
      "del líder. Falta decidir si el módulo lo incluye o pasa a «siempre solo del líder» (trabajo pendiente).",
  },
  {
    modulo: null,
    funciones: [
      "crear_cuenta_dinero", "editar_cuenta_dinero", "eliminar_cuenta_dinero", "archivar_cuenta_dinero", "guardar_medio_de_cobro",
      "fn_cuenta_dinero_detalle",
    ],
    razon:
      "Solo las llaman ConfiguracionCuentas.tsx y EditarCuentaModal.tsx, que cuelgan de Configuración (app/(app)/configuracion), un módulo " +
      "no delegable («solo líder por ahora»): no son deuda de ningún módulo delegable. Si Configuración se delega algún día, se revisan.",
  },
  {
    modulo: "reportes_financieros",
    funciones: ["fn_balance_general", "fn_conciliacion_contable", "fn_saldos_iniciales", "fn_saldos_iniciales_propuesta", "registrar_saldo_inicial"],
    razon:
      "Balance de CAYLA entera y saldos de arranque (app/(app)/finanzas/reportes/balance, BalancePanel.tsx, SaldosArranqueModal.tsx). El mensaje " +
      "de fn_exigir_lider_balance lo dice a propósito: lo ve el líder y con «Reportes financieros» se ve lo de la tienda; la página solo pide " +
      "estas funciones cuando la cuenta es líder (`esLider`) y a quien no lo es le muestra el balance de su tienda.",
  },
  {
    modulo: "reportes_financieros",
    funciones: ["fn_flujo_caja_real", "fn_flujo_caja_proyeccion"],
    razon:
      "Flujo de caja y Escenarios (app/(app)/finanzas/reportes/flujo y /escenarios): quien no es líder ve <SoloLiderFlujo> en lugar de la " +
      "pantalla. El mensaje de fn_flujo_exigir_lider dice «por ahora lo ve el líder»: es una decisión provisional, no un olvido.",
  },
];
const SOLO_LIDER = {};
for (const g of SOLO_LIDER_GRUPOS) {
  for (const f of g.funciones) {
    if (f in SOLO_LIDER) throw new Error(`SOLO_LIDER: «${f}» está en dos grupos`);
    SOLO_LIDER[f] = { modulo: g.modulo, razon: g.razon };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Qué llama la pantalla: los `.rpc("nombre")` de apps/web (sin las pruebas). Son las raíces de las funciones.
// ---------------------------------------------------------------------------------------------------------------------

function archivosDeCodigo(dir, acc = []) {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === ".next" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivosDeCodigo(ruta, acc);
    else if (/\.(ts|tsx|mts)$/.test(entrada) && !/\.test\.(ts|tsx|mts)$/.test(entrada)) acc.push(ruta);
  }
  return acc;
}

/** El primer argumento de una llamada: desde justo después del «(» hasta la primera coma o el «)» que la cierra. */
function primerArgumento(texto, desde) {
  let nivel = 0;
  let comilla = null;
  for (let k = desde; k < texto.length; k++) {
    const c = texto[k];
    if (comilla) {
      if (c === "\\") k++;
      else if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") comilla = c;
    else if (c === "(" || c === "[" || c === "{") nivel++;
    else if (c === ")" || c === "]" || c === "}") {
      if (nivel === 0) return texto.slice(desde, k);
      nivel--;
    } else if (c === "," && nivel === 0) return texto.slice(desde, k);
  }
  return texto.slice(desde);
}

/** Sin comentarios: una llamada nombrada dentro de un comentario no es una llamada de la pantalla (ni una raíz). */
const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;,{}()\]])\/\/[^\n]*/gm, "$1");

/** → { nombres: Set de funciones que la pantalla llama, dinamicas: llamadas cuyo nombre no se pudo leer }. Pura: recibe [{ ruta, texto }]. */
function leerLlamadas(fuentes) {
  const nombres = new Set();
  const dinamicas = [];
  const textos = fuentes.map(({ ruta, texto }) => ({ ruta, texto: sinComentarios(texto) }));
  // Las constantes con el nombre de una función (`export const RPC_BAJADA = "bajar_al_piso"`), de cualquier archivo.
  const constantes = new Map();
  for (const { texto } of textos) {
    for (const m of texto.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*(?::[^=;]+)?=\s*["'`]([a-z][a-z0-9_]*)["'`]/g)) constantes.set(m[1], m[2]);
  }
  for (const { ruta, texto } of textos) {
    for (const m of texto.matchAll(/\.rpc\(/g)) {
      const arg = primerArgumento(texto, m.index + m[0].length);
      const literales = [...arg.matchAll(/["'`]([a-z][a-z0-9_]*)["'`]/g)].map((x) => x[1]);
      if (literales.length) {
        literales.forEach((n) => nombres.add(n));
        continue;
      }
      // `.rpc(RPC_X as never …)` con `const RPC_X = "nombre"` escrita en algún archivo.
      const ident = /^\s*([A-Z][A-Z0-9_]*)\s*(?:as\s+\w+)?\s*$/.exec(arg)?.[1];
      if (ident && constantes.has(ident)) nombres.add(constantes.get(ident));
      else dinamicas.push(`${ruta}: .rpc(${arg.trim().slice(0, 50)})`);
    }
  }
  return { nombres, dinamicas };
}

function llamadasDeLaPantalla() {
  const archivos = existsSync(WEB) ? archivosDeCodigo(WEB) : [];
  return leerLlamadas(archivos.map((ruta) => ({ ruta: relative(RAIZ, ruta), texto: readFileSync(ruta, "utf8") })));
}

// ---------------------------------------------------------------------------------------------------------------------
// Las reglas, en SQL (cada una un solo SELECT: sirven igual contra la base local, CI y —solo lectura— producción).
// ---------------------------------------------------------------------------------------------------------------------

const nombresValidos = (lista, donde) => {
  for (const n of lista) if (!/^[a-z0-9_]+$/.test(n)) throw new Error(`nombre de función no válido en ${donde}: ${n}`);
};
const arregloSql = (lista) => (lista.length ? `array[${lista.map((n) => `'${n}'`).join(", ")}]::text[]` : "array[]::text[]");

/**
 * Las funciones de retail con su definición VIVA. `d` = sin comentarios (los textos se conservan: ahí están los nombres de
 * los módulos); `c` = además sin textos (ahí se buscan las llamadas: nombrar una función en un `raise notice` no es llamarla).
 * Comentarios y textos se separan en UNA pasada: un `--` dentro de un texto no es un comentario. Y `aristas` es el grafo de
 * llamadas: «llama» contiene una llamada por nombre a «llamado».
 */
const PRELUDIO = String.raw`prog as (
  select p.oid, p.proname, x.d,
         regexp_replace(x.d, '''(?:[^'']|'''')*''', '', 'g') as c,
         exists (select 1 from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal) as es_disparador,
         (not p.proretset and p.provolatile <> 'v' and p.prorettype not in ('jsonb'::regtype, 'json'::regtype, 'record'::regtype)) as es_sonda
    from pg_proc p
   cross join lateral (
         select regexp_replace(pg_get_functiondef(p.oid), '(''(?:[^'']|'''')*'')|(--[^\n]*)|(/\*(?:[^*]|\*+[^*/])*\*+/)', '\1', 'g') as d
         ) x
   where p.pronamespace = 'retail'::regnamespace and p.prokind in ('f', 'p')
),
aristas as (
  select distinct p.proname::text as llama, m[1] as llamado
    from prog p, regexp_matches(lower(p.c), '\m([a-z_][a-z0-9_]*)\s*\(', 'g') m
   where m[1] <> p.proname::text
)`;

/** La consulta de cobertura: una fila por módulo con sus guardianes, si alguno es «propio» y qué funciones lo nombran sin llegar a nada. */
function consultaCobertura({ excluidas = Object.keys(SIN_GUARDIA), web = [] } = {}) {
  nombresValidos(excluidas, "SIN_GUARDIA");
  nombresValidos(web, "las llamadas de la pantalla");
  return String.raw`with recursive
${PRELUDIO},
-- Lo que la base aplica sola al leer: políticas RLS y vistas. Todo lo que llamen es una raíz.
superficie as (
  select 'política ' || replace(c.relname || '.' || po.polname, ',', ';') as nombre,
         coalesce(pg_get_expr(po.polqual, po.polrelid), '') || ' ' || coalesce(pg_get_expr(po.polwithcheck, po.polrelid), '') as d
    from pg_policy po join pg_class c on c.oid = po.polrelid
   where c.relnamespace = 'retail'::regnamespace
  union all
  select 'vista ' || replace(v.viewname, ',', ';'), v.definition from pg_views v where v.schemaname = 'retail'
),
llamadas_de_superficie as (
  select distinct m[1] as llamado
    from superficie s, regexp_matches(lower(regexp_replace(s.d, '''(?:[^'']|'''')*''', '', 'g')), '\m([a-z_][a-z0-9_]*)\s*\(', 'g') m
),
-- Cada vez que algo pregunta por un módulo con literal: fn_ve_modulo('x') o fn_capacidad_por_modulos(array['x', …]) («compartido»
-- si el arreglo trae más de un módulo).
menciones as (
  select p.proname::text as objeto, true as es_fn, m[1] as modulo, false as compartido
    from prog p, regexp_matches(p.d, 'fn_ve_modulo\(\s*''([a-z_]+)''\s*(?:::text)?\s*\)', 'g') m
  union all
  select p.proname::text, true, x[1], (select count(*) from regexp_matches(m[1], '''([a-z_]+)''', 'g')) > 1
    from prog p, regexp_matches(p.d, 'fn_capacidad_por_modulos\(\s*array\[([^\]]*)\]', 'gi') m, regexp_matches(m[1], '''([a-z_]+)''', 'g') x
  union all
  select s.nombre, false, m[1], false
    from superficie s, regexp_matches(s.d, 'fn_ve_modulo\(\s*''([a-z_]+)''\s*(?:::text)?\s*\)', 'g') m
  union all
  select s.nombre, false, x[1], (select count(*) from regexp_matches(m[1], '''([a-z_]+)''', 'g')) > 1
    from superficie s, regexp_matches(s.d, 'fn_capacidad_por_modulos\(\s*array\[([^\]]*)\]', 'gi') m, regexp_matches(m[1], '''([a-z_]+)''', 'g') x
),
-- Funciones que nombran un módulo (menos las de SIN_GUARDIA) y a quién le llegan: se sube por las llamadas hasta una raíz.
candidatas as (
  select distinct objeto as proname from menciones where es_fn and objeto <> all (${arregloSql(excluidas)})
),
sube(candidata, actual) as (
  select proname, proname from candidatas
  union
  select s.candidata, a.llama from sube s join aristas a on a.llamado = s.actual
),
efectivas as (
  select distinct s.candidata as proname
    from sube s join prog f on f.proname::text = s.actual
   where (f.proname::text = any (${arregloSql(web)}) and not f.es_sonda) or f.es_disparador
      or f.proname::text in (select llamado from llamadas_de_superficie)
),
validas as (
  select m.objeto, m.modulo, m.compartido, (not m.es_fn) or m.objeto in (select proname from efectivas) as efectiva
    from menciones m
   where (not m.es_fn) or m.objeto <> all (${arregloSql(excluidas)})
)
select mo.clave, mo.grupo, mo.delegable,
       coalesce((select string_agg(distinct v.objeto, ',' order by v.objeto) from validas v where v.modulo = mo.clave and v.efectiva), '') as guardianes,
       coalesce((select bool_or(not v.compartido) from validas v where v.modulo = mo.clave and v.efectiva), false) as propio,
       coalesce((select string_agg(distinct v.objeto, ',' order by v.objeto) from validas v where v.modulo = mo.clave and not v.efectiva), '') as huerfanas
  from retail.modulos mo
 order by mo.orden, mo.clave;`;
}

/**
 * La consulta de «solo líder»: una fila por función que exige solo líder, con el ayudante-candado por el que lo exige
 * (o «directo» si el candado está escrito en su cuerpo, sin ayudante). Toda llamada a un ayudante-candado cuenta: la prueba no
 * intenta adivinar si la función tiene además otro candado o si lo pide solo en una rama; eso lo dice su razón en SOLO_LIDER.
 */
function consultaSoloLider() {
  const guarda = String.raw`not\s+(?:coalesce\(\s*)?(?:retail\.)?fn_es_lider\(\s*\)(?:\s*,\s*false\s*\))?\s+then\s+raise`;
  return String.raw`with
${PRELUDIO},
candados as (select proname::text as proname from prog where proname::text ~ 'exigir' and c ~* '${guarda}'),
por_ayudante as (
  select a.llama as funcion, string_agg(distinct a.llamado, ',' order by a.llamado) as via
    from aristas a
   where a.llamado in (select proname from candados)
     and a.llama not in (select proname from candados)
   group by a.llama
),
directas as (
  select p.proname::text as funcion, 'directo' as via
    from prog p
   where p.c ~* '${guarda}'
     and p.proname::text not in (select proname from candados)
     and p.proname::text not in (select funcion from por_ayudante)
)
select funcion, via from por_ayudante
union all
select funcion, via from directas
order by 2, 1;`;
}

const { nombres: LLAMADAS_WEB, dinamicas: LLAMADAS_DINAMICAS } = llamadasDeLaPantalla();
if (LLAMADAS_WEB.size === 0) {
  // Sin ellas, ninguna función de la base es alcanzable y todo saldría «sin guardián»: mejor decir por qué.
  console.error(`✗ No encontré ninguna llamada .rpc("…") en ${relative(RAIZ, WEB)}: esta prueba se corre desde el repo completo (necesita el código de la pantalla).`);
  process.exit(1);
}

if (SOLO_CONSULTA) {
  console.log(consultaCobertura({ web: [...LLAMADAS_WEB].sort() }));
  console.log("\n" + consultaSoloLider());
  process.exit(0);
}

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "\t", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** Corre `preparacion` (DDL o inserts de un control) y la consulta dentro de UNA transacción que siempre termina en ROLLBACK. */
function enTransaccion(preparacion, consulta) {
  try {
    return psql(`begin;\n${preparacion}\n${consulta}\nrollback;`)
      .split("\n")
      .filter(Boolean)
      .map((fila) => fila.split("\t"));
  } catch (e) {
    // Sin base (o sin el esquema retail) la prueba no puede decir nada: se cae con el motivo, no con un stack.
    console.error(`✗ No pude consultar la base (¿levantaste \`npx supabase start\`? ¿--base correcta?):\n${String(e.stderr ?? e.message).trim()}`);
    process.exit(1);
  }
}

/** → [{ clave, grupo, delegable, guardianes: [], propio, huerfanas: [] }]. `web`: las funciones que la pantalla llama. */
function leerCobertura({ preparacion = "", excluidas, web = [...LLAMADAS_WEB] } = {}) {
  return enTransaccion(preparacion, consultaCobertura({ excluidas, web })).map(([clave, grupo, delegable, guardianes = "", propio = "f", huerfanas = ""]) => ({
    clave,
    grupo,
    delegable: delegable === "t",
    guardianes: guardianes ? guardianes.split(",") : [],
    propio: propio === "t",
    huerfanas: huerfanas ? huerfanas.split(",") : [],
  }));
}

/** → [{ funcion, via }]: las funciones que exigen solo líder y por dónde. */
function leerSoloLider({ preparacion = "" } = {}) {
  return enTransaccion(preparacion, consultaSoloLider()).map(([funcion, via]) => ({ funcion, via }));
}

// ---------------------------------------------------------------------------------------------------------------------
// La evaluación (pura: recibe lo leído y las listas, devuelve los problemas en palabras de quien tiene que arreglarlos).
// ---------------------------------------------------------------------------------------------------------------------

function evaluar({ modulos, soloPantalla }) {
  const problemas = [];
  const porClave = new Map(modulos.map((m) => [m.clave, m]));
  // (a) y (c): todo delegable con guardián o con su entrada.
  for (const m of modulos.filter((x) => x.delegable)) {
    if (m.guardianes.length === 0 && !(m.clave in soloPantalla)) {
      const yaNombrado = m.huerfanas.length
        ? ` Ojo: ya lo nombran ${m.huerfanas.join(", ")}, pero nadie las llama (ni la pantalla con .rpc('nombre'), ni otra función, política, vista o disparador): conéctalas o quita la mención.`
        : "";
      problemas.push(
        `el módulo «${m.clave}» (${m.grupo}) es delegable y ninguna función de retail lo exige: agrega fn_ve_modulo('${m.clave}') a las funciones que guardan ` +
          `(o a la política RLS que deja leer, o fn_capacidad_por_modulos(array['${m.clave}']) en su ayudante fn_puede_*), o anótalo en SOLO_PANTALLA con su razón ` +
          `(scripts/pruebas/roles_cobertura_modulos.mjs).${yaNombrado}`
      );
    }
  }
  // (b): la lista solo se encoge.
  for (const [clave, razon] of Object.entries(soloPantalla)) {
    const m = porClave.get(clave);
    if (!m) {
      problemas.push(`«${clave}» está en SOLO_PANTALLA pero ya no existe en retail.modulos: sácalo de la lista`);
    } else if (!m.delegable) {
      problemas.push(`«${clave}» está en SOLO_PANTALLA pero ya no es delegable (solo el líder lo ve, no hay nada que cubrir): sácalo de la lista`);
    } else if (m.guardianes.length > 0) {
      problemas.push(
        `«${clave}» está en SOLO_PANTALLA pero ya lo exige ${m.guardianes.join(", ")}: sácalo de la lista (la lista solo se encoge)`
      );
    }
    if (typeof razon !== "string" || razon.trim().length < 30) {
      problemas.push(`«${clave}» está en SOLO_PANTALLA sin razón (escribe qué hace hoy la base en su lugar)`);
    }
  }
  return problemas;
}

/** (d): cada función que exige solo líder por un ayudante-candado está declarada; y ninguna declarada quedó vieja. */
function evaluarSoloLider({ filas, modulos, soloLider }) {
  const problemas = [];
  const porClave = new Map(modulos.map((m) => [m.clave, m]));
  const porAyudante = new Map(filas.filter((f) => f.via !== "directo").map((f) => [f.funcion, f.via]));
  for (const [funcion, via] of porAyudante) {
    if (!(funcion in soloLider)) {
      problemas.push(
        `«${funcion}» exige solo líder (por ${via}) y no está declarada en SOLO_LIDER: si es de un módulo delegable, cámbiale el candado por el módulo ` +
          `(fn_ve_modulo o un fn_puede_*); si el líder debe seguir siendo el único, decláralo en SOLO_LIDER con lo que hace la pantalla con quien no lo es ` +
          `(scripts/pruebas/roles_cobertura_modulos.mjs)`
      );
    }
  }
  for (const [funcion, e] of Object.entries(soloLider)) {
    if (!porAyudante.has(funcion)) {
      problemas.push(`«${funcion}» está en SOLO_LIDER pero ya no exige solo líder por un ayudante-candado (o ya no existe): sácala de la lista`);
    }
    if (e.modulo !== null) {
      const m = porClave.get(e.modulo);
      if (!m) problemas.push(`«${funcion}» (SOLO_LIDER) apunta al módulo «${e.modulo}», que ya no existe en retail.modulos`);
      else if (!m.delegable) problemas.push(`«${funcion}» (SOLO_LIDER) apunta a «${e.modulo}», que ya no es delegable: pon modulo: null`);
    }
    if (typeof e.razon !== "string" || e.razon.trim().length < 30) {
      problemas.push(`«${funcion}» está en SOLO_LIDER sin razón (escribe qué hace la pantalla con quien no es líder)`);
    }
  }
  return problemas;
}

// ---------------------------------------------------------------------------------------------------------------------
// Corrida
// ---------------------------------------------------------------------------------------------------------------------

let fallas = 0;
let casos = 0;
function caso(nombre, ok, detalle = "") {
  casos++;
  if (ok) {
    console.log(`✓ ${nombre}`);
  } else {
    fallas++;
    console.log(`✗ ${nombre}${detalle ? `\n    ${detalle.replaceAll("\n", "\n    ")}` : ""}`);
  }
}

// ---- CONTROLES: la regla muerde ---------------------------------------------------------------------------------
const FALSO = "zz_cobertura_nuevo";
const FALSO_2 = "zz_cobertura_otro";
const alta = (clave, delegable = true) =>
  `insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable)
     values ('${clave}', 'Gestión', 'Módulo de prueba', 'Solo para la prueba de cobertura', 9999, false, ${delegable});`;
const RAZON_DE_PRUEBA = "Razón de prueba: este módulo falso solo existe dentro de una transacción que se deshace.";
// Los controles no miran la pantalla real: solo las funciones que cada control declare que «la pantalla llama».
const conFalso = (preparacion, { web = [], extra = {} } = {}) =>
  evaluar({ modulos: leerCobertura({ preparacion: alta(FALSO) + "\n" + preparacion, web }), soloPantalla: { ...SOLO_PANTALLA, ...extra } });
const delFalso = (problemas) => problemas.filter((p) => p.includes(FALSO));
const filaFalso = (preparacion, opciones = {}) => leerCobertura({ preparacion: alta(FALSO) + "\n" + preparacion, web: [], ...opciones }).find((m) => m.clave === FALSO);
const cubiertoFalso = (preparacion, opciones = {}) => filaFalso(preparacion, opciones)?.guardianes ?? [];

// Una función que guarda (no devuelve boolean) y pregunta por el módulo falso.
const PUERTA = `create function retail.zz_cobertura_guarda() returns void language plpgsql as $f$
begin
  if not retail.fn_ve_modulo('${FALSO}') then raise exception 'sin módulo' using errcode = '42501'; end if;
end; $f$;`;
const WEB_PUERTA = ["zz_cobertura_guarda"];

{
  // (c) un módulo delegable nuevo, sin guardián y sin entrada, hace fallar la prueba con el mensaje de qué hacer.
  const problemas = delFalso(conFalso(""));
  caso(
    "CONTROL (c): un módulo delegable NUEVO sin guardián ni entrada en SOLO_PANTALLA hace fallar, y el mensaje dice qué hacer",
    problemas.length === 1 &&
      problemas[0].includes(`agrega fn_ve_modulo('${FALSO}') a las funciones que guardan`) &&
      problemas[0].includes("anótalo en SOLO_PANTALLA con su razón"),
    `problemas sobre ${FALSO}: ${JSON.stringify(problemas)}`
  );
}
{
  // (a) con la entrada escrita (y su razón), el mismo módulo pasa.
  caso(
    "CONTROL (a): el mismo módulo, anotado en SOLO_PANTALLA con su razón, pasa",
    delFalso(conFalso("", { extra: { [FALSO]: RAZON_DE_PRUEBA } })).length === 0
  );
}
{
  // (b) el módulo se cubre (una rebanada cerrada) y la entrada se quedó en la lista: falla.
  const problemas = delFalso(conFalso(PUERTA, { web: WEB_PUERTA, extra: { [FALSO]: RAZON_DE_PRUEBA } }));
  caso(
    "CONTROL (b): un módulo que YA tiene guardián y sigue en SOLO_PANTALLA hace fallar («la lista solo se encoge»)",
    problemas.length === 1 && problemas[0].includes("ya lo exige zz_cobertura_guarda") && problemas[0].includes("sácalo de la lista"),
    `problemas sobre ${FALSO}: ${JSON.stringify(problemas)}`
  );
  // …y sin la entrada, con guardián, no hay nada que reclamar.
  caso("CONTROL (a): con guardián y sin entrada en la lista, pasa", delFalso(conFalso(PUERTA, { web: WEB_PUERTA })).length === 0);
}
{
  // (b) entradas de módulos que ya no existen o que dejaron de ser delegables.
  const modulos = leerCobertura({ preparacion: alta(FALSO_2, false), web: [] });
  const problemas = evaluar({
    modulos,
    soloPantalla: { ...SOLO_PANTALLA, zz_no_existe: RAZON_DE_PRUEBA, [FALSO_2]: RAZON_DE_PRUEBA },
  });
  caso(
    "CONTROL (b): una entrada de un módulo que ya no existe, o que ya no es delegable, hace fallar",
    problemas.some((p) => p.includes("«zz_no_existe»") && p.includes("ya no existe")) &&
      problemas.some((p) => p.includes(`«${FALSO_2}»`) && p.includes("ya no es delegable")),
    JSON.stringify(problemas)
  );
  caso(
    "CONTROL (a): un módulo NO delegable sin guardián no se exige (solo el líder lo ve: no hay nada que delegar)",
    !evaluar({ modulos, soloPantalla: SOLO_PANTALLA }).some((p) => p.includes(FALSO_2))
  );
  caso(
    "CONTROL (b): una entrada sin razón hace fallar",
    evaluar({ modulos, soloPantalla: { ...SOLO_PANTALLA, vender: "" } }).some((p) => p.includes("«vender»") && p.includes("sin razón"))
  );
}
{
  // Un comentario o un texto que dicen la frase no protegen nada; un `--` dentro de un texto no esconde una llamada real.
  const g = cubiertoFalso(`create function retail.zz_cobertura_comentario() returns text language plpgsql as $f$
begin
  -- antes decía: if not retail.fn_ve_modulo('${FALSO}') then raise exception 'no'; end if;
  /* retail.fn_capacidad_por_modulos(array['${FALSO}']) */
  return '${FALSO}';   -- una etiqueta con el nombre del módulo tampoco es un candado
end; $f$;`, { web: ["zz_cobertura_comentario"] });
  caso("CONTROL: un comentario o un texto con el nombre del módulo NO lo cubre (solo la llamada a fn_ve_modulo / fn_capacidad_por_modulos)", g.length === 0, `guardianes: ${g}`);
  const h = cubiertoFalso(`create function retail.zz_cobertura_guion() returns void language plpgsql as $f$
begin
  perform 'un texto con -- adentro', retail.fn_ve_modulo('${FALSO}');   -- y aquí sí hay un comentario /* de verdad */
  perform /* otro */ 1;
end; $f$;`, { web: ["zz_cobertura_guion"] });
  caso("CONTROL: un «--» dentro de un texto NO se toma por comentario (no esconde la llamada que viene después en la misma línea)", h.join() === "zz_cobertura_guion", `guardianes: ${h}`);
}
{
  // fn_capacidad_por_modulos con varios módulos en el arreglo: cubre a cada uno, y se marca «compartido».
  const modulos = leerCobertura({
    preparacion: `${alta(FALSO)}\n${alta(FALSO_2)}
create function retail.zz_cobertura_varios() returns void language plpgsql as $f$
begin
  if not retail.fn_capacidad_por_modulos(array['${FALSO}', '${FALSO_2}']) then raise exception 'no' using errcode = '42501'; end if;
end; $f$;`,
    web: ["zz_cobertura_varios"],
  });
  caso(
    "CONTROL: fn_capacidad_por_modulos(array[a, b]) cubre a los DOS módulos (la capacidad es un «o») y los marca «compartido»",
    [FALSO, FALSO_2].every((c) => modulos.find((m) => m.clave === c)?.guardianes.join() === "zz_cobertura_varios" && modulos.find((m) => m.clave === c)?.propio === false)
  );
  const propio = filaFalso(`create function retail.zz_cobertura_solo() returns void language plpgsql as $f$
begin
  if not retail.fn_capacidad_por_modulos(array['${FALSO}']) then raise exception 'no' using errcode = '42501'; end if;
end; $f$;`, { web: ["zz_cobertura_solo"] });
  caso("CONTROL: un arreglo de UN solo módulo, o fn_ve_modulo('x'), es guardián «propio» (no compartido)", propio?.propio === true, JSON.stringify(propio));
}
{
  // Un ayudante booleano que nadie llama no protege nada; en cuanto una raíz lo llama, sí.
  const AYUDANTE = `create function retail.zz_cobertura_ayudante() returns boolean language sql stable as $f$
  select retail.fn_capacidad_por_modulos(array['${FALSO}']) $f$;`;
  const LLAMADOR = `create function retail.zz_cobertura_llama() returns void language plpgsql as $f$
begin
  if not retail.zz_cobertura_ayudante() then raise exception 'no' using errcode = '42501'; end if;
end; $f$;`;
  const huerfano = cubiertoFalso(AYUDANTE);
  const llamadoPorHuerfana = cubiertoFalso(AYUDANTE + "\n" + LLAMADOR); // el llamador tampoco lo llama nadie
  const llamado = cubiertoFalso(AYUDANTE + "\n" + LLAMADOR, { web: ["zz_cobertura_llama"] });
  caso(
    "CONTROL: un ayudante fn_puede_* que NADIE llama no cubre el módulo; en cuanto una función que la pantalla llama lo llama, sí",
    huerfano.length === 0 && llamadoPorHuerfana.length === 0 && llamado.join() === "zz_cobertura_ayudante",
    `sin llamador: [${huerfano}]; llamado por una función que nadie llama: [${llamadoPorHuerfana}]; con la pantalla: [${llamado}]`
  );
  // Cadena: raíz → ayudante 2 → ayudante 1 (el que nombra el módulo).
  const CADENA = `create function retail.zz_cobertura_ayudante_2() returns boolean language sql stable as $f$ select retail.zz_cobertura_ayudante() $f$;
create function retail.zz_cobertura_llama_2() returns void language plpgsql as $f$
begin
  if not retail.zz_cobertura_ayudante_2() then raise exception 'no' using errcode = '42501'; end if;
end; $f$;`;
  const cadena = cubiertoFalso(AYUDANTE + "\n" + CADENA, { web: ["zz_cobertura_llama_2"] });
  const cadenaCortada = cubiertoFalso(
    AYUDANTE + "\ncreate function retail.zz_cobertura_ayudante_2() returns boolean language sql stable as $f$ select retail.zz_cobertura_ayudante() $f$;"
  );
  caso(
    "CONTROL: la cadena raíz → ayudante → ayudante cubre; si nadie llama al primer eslabón, no",
    cadena.join() === "zz_cobertura_ayudante" && cadenaCortada.length === 0,
    `con raíz: [${cadena}]; sin raíz: [${cadenaCortada}]`
  );
}
{
  // Una función que NO devuelve boolean tampoco es guardián por sí sola: sin que la llamen (ni la pantalla), no protege nada.
  const UUIDS = `create function retail.zz_cobertura_ubicaciones() returns uuid[] language sql stable as $f$
  select case when retail.fn_capacidad_por_modulos(array['${FALSO}']) then array[]::uuid[] else null end $f$;`;
  const VOID = `create function retail.zz_cobertura_exigir() returns void language plpgsql as $f$
begin
  if not retail.fn_ve_modulo('${FALSO}') then raise exception 'no' using errcode = '42501'; end if;
end; $f$;`;
  const a = filaFalso(UUIDS);
  const b = cubiertoFalso(VOID);
  const c = cubiertoFalso(VOID, { web: ["zz_cobertura_exigir"] });
  caso(
    "CONTROL: una función que devuelve uuid[] o void y NADIE llama (ni la pantalla) NO cubre el módulo, y se lista como «nadie la llama»",
    a?.guardianes.length === 0 && a.huerfanas.join() === "zz_cobertura_ubicaciones" && b.length === 0 && c.join() === "zz_cobertura_exigir",
    `uuid[]: ${JSON.stringify(a)}; void sin pantalla: [${b}]; void con pantalla: [${c}]`
  );
  const problemas = delFalso(conFalso(UUIDS));
  caso(
    "CONTROL: el mensaje de un módulo con funciones que lo nombran pero nadie llama dice cuáles y qué hacer",
    problemas.length === 1 && problemas[0].includes("zz_cobertura_ubicaciones") && problemas[0].includes("nadie las llama"),
    JSON.stringify(problemas)
  );
}
{
  // Una SONDA (contesta un sí/no o una lista de sedes y no puede escribir) no protege nada porque la pantalla la llame: la
  // pantalla usa la respuesta para mostrar u ocultar. Una que devuelve datos (jsonb), sí es una lectura protegida.
  const SONDA_BOOLEANA = `create function retail.zz_cobertura_sonda() returns boolean language sql stable as $f$
  select retail.fn_capacidad_por_modulos(array['${FALSO}']) $f$;`;
  const SONDA_SEDES = `create function retail.zz_cobertura_sedes() returns uuid[] language sql stable as $f$
  select case when retail.fn_ve_modulo('${FALSO}') then array[]::uuid[] else null end $f$;`;
  const LECTURA = `create function retail.zz_cobertura_lectura() returns jsonb language plpgsql stable as $f$
begin
  if not retail.fn_ve_modulo('${FALSO}') then raise exception 'no' using errcode = '42501'; end if;
  return '{}'::jsonb;
end; $f$;`;
  const a = cubiertoFalso(SONDA_BOOLEANA, { web: ["zz_cobertura_sonda"] });
  const b = cubiertoFalso(SONDA_SEDES, { web: ["zz_cobertura_sedes"] });
  const c = cubiertoFalso(LECTURA, { web: ["zz_cobertura_lectura"] });
  caso(
    "CONTROL: una sonda (boolean o uuid[] que no escribe) que solo la pantalla llama NO cubre el módulo; una lectura que devuelve datos (jsonb) sí",
    a.length === 0 && b.length === 0 && c.join() === "zz_cobertura_lectura",
    `sonda boolean: [${a}]; sonda de sedes: [${b}]; lectura jsonb: [${c}]`
  );
}
{
  // Una RPC booleana que guarda y la pantalla llama SÍ es guardián (no es un «ayudante» solo por devolver boolean).
  const RPC = `create function retail.zz_cobertura_registrar(p_dato text) returns boolean language plpgsql as $f$
begin
  if not retail.fn_ve_modulo('${FALSO}') then raise exception 'no' using errcode = '42501'; end if;
  return true;
end; $f$;`;
  const conPantalla = cubiertoFalso(RPC, { web: ["zz_cobertura_registrar"] });
  const sinPantalla = cubiertoFalso(RPC);
  caso(
    "CONTROL: una RPC que devuelve boolean, guarda y la pantalla llama SÍ cubre el módulo; sin que nadie la llame, no",
    conPantalla.join() === "zz_cobertura_registrar" && sinPantalla.length === 0,
    `con pantalla: [${conPantalla}]; sin pantalla: [${sinPantalla}]`
  );
}
{
  // Nombrar un ayudante dentro de un texto (un raise notice) no es llamarlo.
  const g = cubiertoFalso(`create function retail.zz_cobertura_puede_h() returns boolean language sql stable as $f$
  select retail.fn_capacidad_por_modulos(array['${FALSO}']) $f$;
create function retail.zz_cobertura_habla() returns void language plpgsql as $f$
begin raise notice 'ojo: falta llamar zz_cobertura_puede_h()'; end; $f$;`, { web: ["zz_cobertura_habla"] });
  caso("CONTROL: nombrar un ayudante en un texto (un raise notice) NO es llamarlo: no lo vuelve guardián", g.length === 0, `guardianes: [${g}]`);
}
{
  // Políticas RLS y vistas: nombran el módulo y la base las aplica sola al leer.
  const TABLA = `create table retail.zz_cobertura_t (id int);\nalter table retail.zz_cobertura_t enable row level security;`;
  const POLITICA = `${TABLA}\ncreate policy zz_cobertura_p on retail.zz_cobertura_t for select using ((select retail.fn_ve_modulo('${FALSO}')));`;
  const VISTA = `create view retail.zz_cobertura_v as select 1 as x where retail.fn_ve_modulo('${FALSO}');`;
  const p = cubiertoFalso(POLITICA);
  const v = cubiertoFalso(VISTA);
  caso(
    "CONTROL: una política RLS o una vista que nombran el módulo con fn_ve_modulo SÍ lo cubren (así se cierran Historial, Movimientos, Clientas…)",
    p.join() === "política zz_cobertura_t.zz_cobertura_p" && v.join() === "vista zz_cobertura_v",
    `política: [${p}]; vista: [${v}]`
  );
  const conCapacidad = cubiertoFalso(`${TABLA}\ncreate policy zz_cobertura_p2 on retail.zz_cobertura_t for select using (retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['${FALSO}']));`);
  caso("CONTROL: una política con fn_capacidad_por_modulos(array[…]) también lo cubre", conCapacidad.join() === "política zz_cobertura_t.zz_cobertura_p2", `[${conCapacidad}]`);
  const conAyudante = cubiertoFalso(`${TABLA}
create function retail.zz_cobertura_puede_p() returns boolean language sql stable as $f$ select retail.fn_capacidad_por_modulos(array['${FALSO}']) $f$;
create policy zz_cobertura_p3 on retail.zz_cobertura_t for select using (retail.zz_cobertura_puede_p());`);
  caso("CONTROL: un ayudante que llama una política SÍ cubre (la política es raíz)", conAyudante.join() === "zz_cobertura_puede_p", `[${conAyudante}]`);
}
{
  // Un disparador enganchado a una tabla es raíz; la misma función sin enganchar, no.
  const FUNCION = `create table retail.zz_cobertura_t2 (id int);
create function retail.zz_cobertura_trg() returns trigger language plpgsql as $f$
begin
  if not retail.fn_ve_modulo('${FALSO}') then raise exception 'no' using errcode = '42501'; end if;
  return new;
end; $f$;`;
  const suelta = cubiertoFalso(FUNCION);
  const enganchada = cubiertoFalso(`${FUNCION}\ncreate trigger zz_cobertura_trg before insert on retail.zz_cobertura_t2 for each row execute function retail.zz_cobertura_trg();`);
  caso(
    "CONTROL: una función de disparador enganchada a una tabla cubre el módulo; sin enganchar, no",
    enganchada.join() === "zz_cobertura_trg" && suelta.length === 0,
    `enganchada: [${enganchada}]; suelta: [${suelta}]`
  );
}
{
  // SIN_GUARDIA: una función que nombra el módulo pero está excluida no cubre; sin la exclusión, sí.
  const MENCIONA = `create function retail.zz_cobertura_menciona() returns text language plpgsql as $f$
begin
  if retail.fn_ve_modulo('${FALSO}') then return 'a'; end if; return 'b';
end; $f$;`;
  const sinExcluir = cubiertoFalso(MENCIONA, { web: ["zz_cobertura_menciona"] });
  const excluida = cubiertoFalso(MENCIONA, { web: ["zz_cobertura_menciona"], excluidas: [...Object.keys(SIN_GUARDIA), "zz_cobertura_menciona"] });
  caso(
    "CONTROL: una función listada en SIN_GUARDIA que nombra el módulo NO lo cubre (como fn_es_terminal con «vender»)",
    sinExcluir.join() === "zz_cobertura_menciona" && excluida.length === 0,
    `sin excluir: [${sinExcluir}]; excluida: [${excluida}]`
  );
}

{
  // Qué llamadas de la pantalla se leen: literales, condicionales, constantes de otro archivo; no comentarios ni nombres armados.
  const { nombres, dinamicas } = leerLlamadas([
    {
      ruta: "a.tsx",
      texto: `// antes: supabase.rpc("zz_en_comentario_de_linea", {})
/** y también: .rpc("zz_en_comentario_de_bloque") */
const a = await supabase.rpc("zz_literal" as never, { p: 1 } as never);
const b = await supabase.rpc(activo ? "zz_si" : "zz_no", {});
const c = await supabase.rpc(RPC_ZZ as never);
const d = await supabase.rpc(rpc as never, args);
const url = "https://ejemplo.pe//ruta"; await supabase.rpc("zz_tras_una_url");`,
    },
    { ruta: "b.ts", texto: `export const RPC_ZZ = "zz_constante_de_otro_archivo";` },
  ]);
  caso(
    "CONTROL: de la pantalla se leen los .rpc con literal, condicional o constante de otro archivo; no los comentarios; y el nombre armado en tiempo de ejecución se lista aparte",
    ["zz_literal", "zz_si", "zz_no", "zz_constante_de_otro_archivo", "zz_tras_una_url"].every((n) => nombres.has(n)) &&
      !nombres.has("zz_en_comentario_de_linea") && !nombres.has("zz_en_comentario_de_bloque") &&
      dinamicas.length === 1 && dinamicas[0].includes("a.tsx") && dinamicas[0].includes("rpc as never"),
    `nombres: ${[...nombres]}; dinámicas: ${JSON.stringify(dinamicas)}`
  );
}

// ---- CONTROLES de (d): las funciones que exigen solo líder ---------------------------------------------------------
{
  const CANDADO = `create function retail.zz_exigir_lider_prueba() returns void language plpgsql stable as $f$
begin
  if not retail.fn_es_lider() then raise exception 'solo del líder' using errcode = '42501'; end if;
end; $f$;`;
  const GUARDA = `create function retail.zz_guarda_solo_lider() returns void language plpgsql as $f$
begin
  perform retail.zz_exigir_lider_prueba();
end; $f$;`;
  const modulos = leerCobertura({ preparacion: alta(FALSO), web: [] });
  const filas = leerSoloLider({ preparacion: `${CANDADO}\n${GUARDA}` });
  const suya = filas.find((f) => f.funcion === "zz_guarda_solo_lider");
  const sinDeclarar = evaluarSoloLider({ filas, modulos, soloLider: SOLO_LIDER }).filter((p) => p.includes("zz_guarda_solo_lider"));
  caso(
    "CONTROL (d): una función NUEVA que llama a un ayudante-candado y no está en SOLO_LIDER hace fallar, y el mensaje dice qué hacer",
    suya?.via === "zz_exigir_lider_prueba" && sinDeclarar.length === 1 && sinDeclarar[0].includes("no está declarada en SOLO_LIDER") && sinDeclarar[0].includes("cámbiale el candado por el módulo"),
    `fila: ${JSON.stringify(suya)}; problemas: ${JSON.stringify(sinDeclarar)}`
  );
  const declarada = { ...SOLO_LIDER, zz_guarda_solo_lider: { modulo: FALSO, razon: RAZON_DE_PRUEBA } };
  caso(
    "CONTROL (d): la misma función, declarada en SOLO_LIDER con su módulo y su razón, pasa",
    !evaluarSoloLider({ filas, modulos, soloLider: declarada }).some((p) => p.includes("zz_guarda_solo_lider"))
  );
  // El ayudante mismo no es una «función que exige solo líder»; una que lo llama en el nombre de un texto (un raise notice), tampoco.
  const HABLA = `create function retail.zz_habla_del_candado() returns void language plpgsql as $f$
begin raise notice 'falta llamar zz_exigir_lider_prueba()'; end; $f$;`;
  const filas2 = leerSoloLider({ preparacion: `${CANDADO}\n${HABLA}` });
  caso(
    "CONTROL (d): el ayudante-candado no cuenta como función que exige solo líder, ni la que solo lo nombra en un texto",
    !filas2.some((f) => ["zz_exigir_lider_prueba", "zz_habla_del_candado"].includes(f.funcion)),
    JSON.stringify(filas2.filter((f) => f.funcion.startsWith("zz_")))
  );
  // Sin «exigir» en el nombre no es ayudante-candado: sus llamadores no entran, y él mismo queda como «directo» (no vigilado).
  const OTRO = `create function retail.zz_solo_para_lideres() returns void language plpgsql stable as $f$
begin
  if not retail.fn_es_lider() then raise exception 'no' using errcode = '42501'; end if;
end; $f$;
create function retail.zz_llama_otro() returns void language plpgsql as $f$ begin perform retail.zz_solo_para_lideres(); end; $f$;`;
  const filas3 = leerSoloLider({ preparacion: OTRO }).filter((f) => ["zz_solo_para_lideres", "zz_llama_otro"].includes(f.funcion));
  caso(
    "CONTROL (d): un candado que no se llama «exigir» no es ayudante-candado: queda «directo» (informado, no vigilado) y sus llamadores no entran",
    filas3.length === 1 && filas3[0].funcion === "zz_solo_para_lideres" && filas3[0].via === "directo",
    JSON.stringify(filas3)
  );
  // La lista solo se encoge: entradas viejas, sin razón o con un módulo que ya no existe o no es delegable.
  const filasReales = [{ funcion: "fn_conciliacion", via: "fn_exigir_lider_dinero" }];
  const viejas = evaluarSoloLider({
    filas: filasReales,
    modulos: [...modulos, { clave: FALSO_2, grupo: "Gestión", delegable: false, guardianes: [], propio: false, huerfanas: [] }],
    soloLider: {
      fn_conciliacion: { modulo: "zz_no_existe", razon: RAZON_DE_PRUEBA },
      fn_vieja: { modulo: null, razon: RAZON_DE_PRUEBA },
      fn_sin_razon: { modulo: FALSO_2, razon: "" },
    },
  });
  caso(
    "CONTROL (d): una entrada que ya no exige solo líder, sin razón, o con un módulo que no existe o ya no es delegable, hace fallar",
    viejas.some((p) => p.includes("«fn_vieja»") && p.includes("sácala de la lista")) &&
      viejas.some((p) => p.includes("«fn_conciliacion»") && p.includes("zz_no_existe") && p.includes("ya no existe")) &&
      viejas.some((p) => p.includes("«fn_sin_razon»") && p.includes("sin razón")) &&
      viejas.some((p) => p.includes("«fn_sin_razon»") && p.includes("ya no es delegable")),
    JSON.stringify(viejas)
  );
}

// ---- El estado real ---------------------------------------------------------------------------------------------
const modulos = leerCobertura();
const delegables = modulos.filter((m) => m.delegable);
const cubiertos = delegables.filter((m) => m.guardianes.length > 0);
const compartidos = cubiertos.filter((m) => !m.propio);
const sinGuardian = delegables.filter((m) => m.guardianes.length === 0);
const declarados = sinGuardian.filter((m) => m.clave in SOLO_PANTALLA);

if (DETALLE) {
  console.log("\nCobertura módulo por módulo (delegables):");
  for (const m of delegables) {
    const marca = m.guardianes.length ? (m.propio ? "  guardián" : "  compartido") : m.clave in SOLO_PANTALLA ? "  SOLO PANTALLA" : "  ¿?";
    const huerfanas = m.huerfanas.length ? `   (lo nombran sin que nadie las llame: ${m.huerfanas.join(", ")})` : "";
    console.log(`  ${m.clave.padEnd(22)}${marca.padEnd(17)}${m.guardianes.join(", ")}${huerfanas}`);
  }
  console.log(`\nLlamadas de la pantalla (.rpc): ${LLAMADAS_WEB.size} nombres leídos; ${LLAMADAS_DINAMICAS.length} con el nombre armado en tiempo de ejecución (no se ven):`);
  for (const d of LLAMADAS_DINAMICAS) console.log(`  · ${d}`);
  console.log("");
}

const problemas = evaluar({ modulos, soloPantalla: SOLO_PANTALLA });
caso(
  `cada módulo delegable tiene guardián en la base o está declarado en SOLO_PANTALLA con su razón (${delegables.length} delegables: ${cubiertos.length} con guardián, ${declarados.length} declarados solo pantalla${sinGuardian.length > declarados.length ? `, ${sinGuardian.length - declarados.length} SIN DECLARAR` : ""})`,
  problemas.length === 0,
  problemas.map((p) => `· ${p}`).join("\n")
);
if (declarados.length) {
  console.log(`  SOLO_PANTALLA (${declarados.length}, la lista solo puede encogerse): ${declarados.map((m) => m.clave).join(", ")}`);
}
if (compartidos.length) {
  console.log(
    `  Guardián COMPARTIDO (${compartidos.length} de los ${cubiertos.length}; un «o» con otros módulos, apagar solo uno no quita la capacidad): ${compartidos.map((m) => m.clave).join(", ")}`
  );
}

const filasLider = leerSoloLider();
const problemasLider = evaluarSoloLider({ filas: filasLider, modulos, soloLider: SOLO_LIDER });
const porAyudante = filasLider.filter((f) => f.via !== "directo");
const enDelegables = Object.values(SOLO_LIDER).filter((e) => e.modulo !== null);
const conteoPorModulo = (() => {
  const c = {};
  for (const e of enDelegables) c[e.modulo] = (c[e.modulo] ?? 0) + 1;
  return Object.entries(c).map(([k, n]) => `${k} ${n}`).join(", ");
})();
caso(
  `cada función que exige solo líder por un ayudante-candado está declarada en SOLO_LIDER y ninguna entrada quedó vieja (${porAyudante.length} funciones: ${enDelegables.length} con su pantalla en un módulo delegable [${conteoPorModulo}], ${Object.keys(SOLO_LIDER).length - enDelegables.length} en uno que no se delega)`,
  problemasLider.length === 0,
  problemasLider.map((p) => `· ${p}`).join("\n")
);
console.log(
  `  No vigilado aquí: ${filasLider.length - porAyudante.length} funciones con el candado escrito directo («if not fn_es_lider() then raise», sin ayudante); a qué módulo pertenece cada una es trabajo pendiente.`
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);
