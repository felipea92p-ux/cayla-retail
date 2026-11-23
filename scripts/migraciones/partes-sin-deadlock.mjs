#!/usr/bin/env node
/**
 * Candado de migraciones — una parte que se pega sola no mezcla una política con el `alter` de una tabla que ya existía.
 *
 * EL PROBLEMA QUE RESUELVE. El SQL Editor de producción corre todo lo pegado en UNA transacción, y en Supabase cada
 * `create policy`, `alter policy`, `drop policy` (aunque no exista) y `drop trigger` toma en exclusiva las tablas de `auth`
 * y `storage` que lista `supautils.policy_grants` (21 hoy) hasta el final. Si la misma pegada ya tiene tomada en exclusiva
 * una tabla que la tienda usa (por un `alter table ubicaciones`), choca con el Asesor de seguridad del panel, que lee
 * `storage.buckets` y después esa tabla: `40P01 deadlock detected`, y no se aplica nada (ADR-0195, F1, 2026-09-24). La regla
 * está en CLAUDE.md («Políticas y deadlocks»), y `sin-drop-trigger.mjs` vigila la mitad que se lee en el texto. Esta mitad
 * no se lee: hay que ver qué candados toma cada sentencia, y eso solo lo dice Postgres.
 *
 * CÓMO LO MIDE. Corre la migración en un Postgres de Supabase dentro de `begin … rollback` (nunca la deja aplicada), y
 * después de CADA sentencia lee `pg_locks` de su propio proceso: qué relaciones tiene en `AccessExclusiveLock`. La sentencia
 * que de pronto tiene en exclusiva tablas de `auth`/`storage` es la política. Una parte sale roja si, ANTES de su primera
 * política, otra sentencia de la misma parte tomó en exclusiva una relación que ya existía antes de la migración: es el
 * ciclo de F1 (la migración tiene `ubicaciones` y pide `storage.buckets`; el Asesor tiene `storage.buckets` y pide
 * `ubicaciones`). Lo que se toma DESPUÉS no cuenta: con `storage.buckets` ya en exclusiva, el Asesor no puede estar
 * teniéndolo (y así pasa la función que reescribe políticas en la parte «solo políticas» de `20261005100200`). Tampoco
 * cuenta lo que toma la propia sentencia de la política (su tabla: `create policy … on t` toma `t` en exclusiva antes que
 * las de `auth`, y esa es la forma correcta, «las políticas solas y al final»), ni una relación que nace en la misma pegada
 * (tiene un oid mayor que el más alto del inicio; nadie más la ve todavía). Medido el 2026-11-23
 * en `supabase/postgres:17.6.1.171`, la imagen del CLI 2.118.0 del CI: reproduce las 21 de producción.
 *
 * QUÉ ES UNA PARTE. Lo que va entre dos líneas de marca, fuera de toda sentencia: `-- ===== PARTE 2 · cajas (sola) =====`,
 * `-- PARTE 3 · políticas`, `-- PARTE 2 de 6 · …`, `-- ===== PARTE FINAL · … =====` o `-- FIN DE LA PARTE 1` (ver `marcaDeParte`). Una migración sin marcas es
 * una sola parte: se pega entera.
 *
 * QUÉ NO PUEDE DECIR.
 *   · Lo que pasa DENTRO de una sola sentencia: un bloque `do` (o una función) que hace el `alter` y crea la política toma
 *     todo de una vez, y se lee como la política misma. Escribe el `alter` y la política como sentencias sueltas. Una
 *     función que crea políticas en una parte cuyas tablas de `auth` ya tomó otra anterior tampoco se reconoce: la política
 *     de esa parte tiene que estar escrita (suelta o en un `execute '…'`).
 *   · Una tabla que una parte ANTERIOR de la misma migración creó o ya tomó en exclusiva, y esta vuelve a tomar: la medida
 *     corre el archivo entero en una transacción (no lo puede confirmar a medias), y un candado que ya se tiene no aparece
 *     de nuevo. En producción esa parte anterior ya estaría confirmada y la tabla, a la vista del Asesor.
 *   · Si el Postgres deja de reproducir el bloqueo (otra imagen, otro `supautils`): por eso cada medida corre antes un
 *     canario (una política sobre una tabla temporal), y si no toma `auth`/`storage` lo dice.
 *   · Una migración que maneja su propia transacción (`begin`, `commit`…) o usa órdenes de psql (`\set`): no se mide.
 *
 * QUÉ HACER SI SALE ROJO. Pasa la política (o el `alter`) a su propia parte: una línea `-- ===== PARTE N · políticas =====`
 * antes de ella, y en producción pega esa parte sola y al final, con `set lock_timeout = '3s'` e idempotente (ejemplo:
 * `20260924210000_configuracion_meta_y_fondo_por_campana.sql`). Si la tabla nueva solo se lee por funciones `security
 * definer`, mejor sin políticas: RLS encendido y nada más.
 *
 * USO
 *   node scripts/migraciones/partes-sin-deadlock.mjs medir <archivo.sql>… [--contenedor <nombre>]
 *       Mide cada archivo contra la base que esté arriba (por defecto `supabase_db_cayla-retail`), sin aplicarlo: cada uno
 *       sobre la base tal como está. Sale con 1 si alguna parte mezcla. Toma por un momento los candados que tomaría la
 *       migración: en la base compartida, hazlo cuando nadie la esté usando.
 *   node scripts/migraciones/partes-sin-deadlock.mjs revisar <partes.json>
 *       Lo que corre el CI: lee lo que midió `huellas-del-pr.mjs aplicar --partes` (cada migración nueva del PR, justo antes
 *       de aplicarla) y sale con 1 si alguna parte mezcla. Sin archivo (el PR no agrega migraciones) no hay nada que revisar.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { MARCA_DOLAR, sinComentarios } from "./sin-drop-trigger.mjs";

const CONTENEDOR = "supabase_db_cayla-retail";

/** Los esquemas cuyas tablas toma `supautils` con cada política: verlas en exclusiva es la señal de una política. */
const SENAL = new Set(["auth", "storage", "realtime"]);
/** Lo que no es «una tabla que la tienda usa» aunque quede en exclusiva (catálogo, TOAST de una tabla reescrita). */
const FUERA = new Set(["pg_catalog", "pg_toast", "information_schema"]);

/**
 * Si la línea abre una parte, su etiqueta; si no, null. Son marca: una línea decorada (`-- ===== …`, `-- ----- …`) que nombra
 * «PARTE <n>» (o «PARTE FINAL»); «-- PARTE <n> · …» (o «PARTE <n> de <m> · …», o con raya); y «FIN DE LA PARTE <n>», que cierra una y abre la
 * que sigue. «-- PARTE 3: si una caja…» es prosa, no marca: la usa un comentario dentro de otra parte. Ante la duda se toma
 * como marca: una de más solo puede esconder una mezcla (partirla en dos), una de menos podría inventarla.
 */
export function marcaDeParte(linea) {
  if (!linea.startsWith("--")) return null;
  const fin = linea.match(/^--[ \t]*(?:[=═─━—–_*#~-]{3,}[ \t]*)?fin[ \t]+de[ \t]+la[ \t]+parte[ \t]+(\d+|final)/i);
  if (fin) return `después de la PARTE ${fin[1].toUpperCase()}`;
  const numero = linea.match(/\bparte[ \t]+(\d+|final)\b/i)?.[1]?.toUpperCase();
  if (!numero) return null;
  if (/^--[ \t]*[=═─━—–_*#~-]{3,}/.test(linea)) return `PARTE ${numero}`;
  if (/^--[ \t]*parte[ \t]+(?:\d+|final)(?:[ \t]+de[ \t]+\d+)?[ \t]*(?:[·—–-]|$)/i.test(linea)) return `PARTE ${numero}`;
  return null;
}

/** Lo que maneja la transacción por su cuenta o es una orden de psql: con eso adentro, la medida no se puede confiar. */
const CONTROL_DE_TRANSACCION = /^(?:begin|commit|rollback|end|abort|start\s+transaction|savepoint|release|prepare\s+transaction)\b/i;

/**
 * Una sentencia de política (o un `drop trigger`, que toma lo mismo), escrita suelta o dentro de un `execute '…'`. Sirve para
 * la SEGUNDA política de una parte: las tablas de `auth`/`storage` ya están tomadas y no aparecen de nuevo, pero la tabla que
 * toma es la suya, no un `alter`.
 */
const ES_POLITICA = /\b(?:create|alter|drop)\s+policy\b|\bdrop\s+trigger\b/i;

const PREFIJO = "§cayla§";

/** Número de línea (desde 1) de una posición del texto. */
const lineaDe = (texto, pos) => {
  let n = 1;
  for (let i = 0; i < pos; i++) if (texto.charCodeAt(i) === 10) n++;
  return n;
};

/**
 * Parte el SQL en sentencias de primer nivel: `[{ desde, hasta, inicio, linea, texto }]`. `desde`–`hasta` es el trozo del
 * archivo (con sus comentarios, terminado en «;»), `inicio` dónde empieza de verdad la sentencia, y `texto` la sentencia sin
 * comentarios y en una línea. Respeta textos `'…'` y `E'…'`, identificadores `"…"`, bloques `$tag$…$tag$` y comentarios
 * (los borra `sinComentarios`, que deja cada carácter en su lugar). Los trozos solo de comentarios no son sentencias.
 */
export function sentencias(sql) {
  const limpio = sinComentarios(sql);
  const r = [];
  let desde = 0;
  const cerrar = (hasta) => {
    const trozo = limpio.slice(desde, hasta);
    const blanco = trozo.search(/\S/);
    if (blanco !== -1) {
      const inicio = desde + blanco;
      r.push({ desde, hasta, inicio, linea: lineaDe(sql, inicio), texto: trozo.replace(/\s+/g, " ").trim() });
    }
    desde = hasta;
  };
  let i = 0;
  while (i < limpio.length) {
    const c = limpio[i];
    if (c === "'") {
      const conBarra = /[eE]/.test(limpio[i - 1] ?? "") && !/[\w$]/.test(limpio[i - 2] ?? "");
      i++;
      while (i < limpio.length) {
        if (conBarra && limpio[i] === "\\") { i += 2; continue; }
        if (limpio[i] === "'") { if (limpio[i + 1] === "'") { i += 2; continue; } break; }
        i++;
      }
      i++;
      continue;
    }
    if (c === '"') {
      i++;
      while (i < limpio.length) {
        if (limpio[i] === '"') { if (limpio[i + 1] === '"') { i += 2; continue; } break; }
        i++;
      }
      i++;
      continue;
    }
    if (c === "$" && !/[\w$]/.test(limpio[i - 1] ?? "")) {
      MARCA_DOLAR.lastIndex = i;
      const marca = MARCA_DOLAR.exec(limpio)?.[0];
      if (marca) {
        const cierre = limpio.indexOf(marca, i + marca.length);
        i = cierre === -1 ? limpio.length : cierre + marca.length;
        continue;
      }
    }
    if (c === ";") cerrar(i + 1);
    i++;
  }
  cerrar(limpio.length);
  return r;
}

/**
 * Las sentencias de la migración, cada una con su parte: `{ partes: [{ etiqueta, linea }], sentencias: [{ …, parte }] }`.
 * `parte` es el índice en `partes`. La parte 0 es lo que va antes de la primera marca (o el archivo entero si no hay
 * marcas); si queda vacía (la cabecera con su explicación), no se lista.
 */
export function partir(sql) {
  const lista = sentencias(sql);
  const marcas = [];
  let pos = 0;
  for (const linea of sql.split("\n")) {
    const etiqueta = marcaDeParte(linea);
    // Una marca dentro de una sentencia (en el cuerpo de una función) no parte nada.
    if (etiqueta && !lista.some((s) => pos > s.inicio && pos < s.hasta)) marcas.push({ pos, etiqueta, linea: lineaDe(sql, pos) });
    pos += linea.length + 1;
  }
  const partes = [{ etiqueta: marcas.length ? "antes de la PARTE 1" : "el archivo entero", linea: 1 }, ...marcas];
  const conParte = lista.map((s) => ({ ...s, parte: marcas.filter((m) => m.pos < s.inicio).length }));
  return { partes, sentencias: conParte };
}

/** Por qué no se puede medir este archivo, o null. */
export function motivoParaNoMedir(lista) {
  for (const s of lista) {
    if (CONTROL_DE_TRANSACCION.test(s.texto)) return `la línea ${s.linea} maneja la transacción por su cuenta (\`${s.texto.slice(0, 40)}\`)`;
    if (s.texto.startsWith("\\")) return `la línea ${s.linea} es una orden de psql (\`${s.texto.slice(0, 40)}\`)`;
  }
  return null;
}

/** La consulta que anota, con su número, qué relaciones tiene este proceso en exclusiva. Todo calificado: corre con cualquier `search_path`. */
const foto = (numero) => `select '${PREFIJO}${numero}§' || coalesce((
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(l.relation::pg_catalog.int8, n.nspname, c.relname, c.relpersistence::pg_catalog.text))
    from pg_catalog.pg_locks l
    left join pg_catalog.pg_class c on c.oid = l.relation
    left join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where l.pid = pg_catalog.pg_backend_pid() and l.locktype = 'relation' and l.mode = 'AccessExclusiveLock' and l.granted
     and l.database = (select d.oid from pg_catalog.pg_database d where d.datname = pg_catalog.current_database())
)::pg_catalog.text, '[]');\n`;

/**
 * El guion que se le pasa a psql: la migración tal cual, con una foto de `pg_locks` después de cada sentencia, entre
 * `begin` y `rollback`. Antes de todo, el oid más alto de `pg_class`: lo que nazca en la pegada tendrá uno mayor.
 */
export function guionDeMedida(sql, lista) {
  let g = `begin;\nset local lock_timeout = '10s';\nselect '${PREFIJO}inicio§' || (select pg_catalog.max(oid)::pg_catalog.int8 from pg_catalog.pg_class)::pg_catalog.text;\n`;
  let previo = 0;
  lista.forEach((s, n) => {
    g += sql.slice(previo, s.hasta);
    // La última sentencia puede no tener «;» (y terminar en un comentario de línea): el «;» va en su propia línea.
    if (!s.texto.endsWith(";")) g += "\n;";
    g += `\n${foto(n)}`;
    previo = s.hasta;
  });
  return `${g}${sql.slice(previo)}\nrollback;\n`;
}

/** Lo que imprimió psql → `{ maxOid, fotos: [[{ oid, esquema, nombre, persistencia }], …] }` (una foto por sentencia). */
export function leerMedida(salida, cuantas) {
  let maxOid = null;
  const fotos = Array(cuantas).fill(null);
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith(PREFIJO)) continue;
    // «§cayla§<n>§<json>»: el número (o «inicio») va hasta el primer «§» que sigue.
    const resto = linea.slice(PREFIJO.length);
    const corte = resto.indexOf("§");
    const clave = resto.slice(0, corte);
    const json = resto.slice(corte + 1);
    if (clave === "inicio") { maxOid = Number(json); continue; }
    fotos[Number(clave)] = JSON.parse(json).map(([oid, esquema, nombre, persistencia]) => ({ oid: Number(oid), esquema, nombre, persistencia }));
  }
  if (maxOid === null || fotos.some((f) => f === null)) throw new Error("la salida de psql no trae todas las fotos de pg_locks");
  return { maxOid, fotos };
}

const nombreDe = (r) => (r.esquema ? `${r.esquema}.${r.nombre}` : `la relación ${r.oid} (borrada en la misma pegada)`);
const resumen = (texto) => (texto.length > 70 ? `${texto.slice(0, 67)}…` : texto);

/**
 * Lo que importa de la medida, por parte. Devuelve `[{ etiqueta, linea, politicas: [{ linea, sentencia }], otras: [{ linea,
 * sentencia, relacion }] }]` SOLO de las partes que mezclan: tienen una política y, antes de la primera, otra sentencia que
 * tomó en exclusiva una relación que ya existía antes de la migración.
 */
export function analizar({ partes, sentencias: lista }, { maxOid, fotos }) {
  const porParte = partes.map((p) => ({ ...p, politicas: [], otras: [] }));
  let antes = new Set();
  lista.forEach((s, n) => {
    const ahora = new Map(fotos[n].map((r) => [r.oid, r]));
    const nuevas = [...ahora.values()].filter((r) => !antes.has(r.oid));
    const parte = porParte[s.parte];
    const tomaSenal = nuevas.some((r) => SENAL.has(r.esquema));
    // Si una parte anterior ya tomó las de `auth`/`storage`, la política de esta no las toma de nuevo: se reconoce por su
    // texto (en producción esta parte se pega aparte y las tomaría).
    const senalYaTomada = [...ahora.values()].some((r) => SENAL.has(r.esquema) && antes.has(r.oid));
    if (tomaSenal || (senalYaTomada && ES_POLITICA.test(s.texto))) {
      parte.politicas.push({ linea: s.linea, sentencia: resumen(s.texto) });
    } else if (parte.politicas.length === 0 && !ES_POLITICA.test(s.texto)) {
      // Solo lo tomado ANTES de la primera política de la parte cierra el ciclo. Lo que toma una sentencia de política es suyo.
      for (const r of nuevas) {
        if (SENAL.has(r.esquema) || FUERA.has(r.esquema) || r.persistencia === "t") continue;
        // Lo que nació en esta pegada tiene un oid mayor que el más alto del inicio: nadie más lo ve todavía.
        if (r.oid <= maxOid) parte.otras.push({ linea: s.linea, sentencia: resumen(s.texto), relacion: nombreDe(r) });
      }
    }
    antes = new Set(ahora.keys());
  });
  return porParte.filter((p) => p.politicas.length > 0 && p.otras.length > 0);
}

/** Corre psql en el contenedor con el guion en la entrada. Lo de la base que falle (o un error de la migración) sale como excepción. */
export function psqlEn(contenedor = CONTENEDOR) {
  return (guion) =>
    execFileSync("docker", ["exec", "-i", contenedor, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
      input: guion,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
}

/** El canario: una política sobre una tabla temporal. ¿Toma este Postgres las tablas de `auth`/`storage`, como producción? */
export function reproduceElBloqueo(psql) {
  const sql = "create temp table cayla_canario (id int);\ncreate policy cayla_canario on cayla_canario using (true);\n";
  const lista = sentencias(sql);
  const { fotos } = leerMedida(psql(guionDeMedida(sql, lista)), lista.length);
  return fotos[1].some((r) => SENAL.has(r.esquema));
}

/**
 * Mide una migración sobre la base tal como está (sin aplicarla). `{ partes, mezclas }` o `{ sinMedir: motivo }`.
 * Un error de la base al correrla sale como excepción: quien llama decide (el CI la aplica igual y ahí falla de verdad).
 */
export function medirMigracion(sql, psql) {
  const p = partir(sql);
  const motivo = motivoParaNoMedir(p.sentencias);
  if (motivo) return { sinMedir: motivo };
  if (p.sentencias.length === 0) return { partes: 0, mezclas: [] };
  const medida = leerMedida(psql(guionDeMedida(sql, p.sentencias)), p.sentencias.length);
  return { partes: new Set(p.sentencias.map((s) => s.parte)).size, mezclas: analizar(p, medida) };
}

/** El informe de una lista `[{ archivo, partes?, mezclas?, sinMedir?, error? }]`. `{ texto, rojo }`. */
export function informe(resultados, { reproduce = true } = {}) {
  const lineas = [];
  let rojo = false;
  if (!reproduce) {
    lineas.push("::warning::Este Postgres ya no toma auth/storage con una política (el canario no lo vio): la medida no puede ver la mezcla. Revisa ADR-0195, «Actualización 2026-11-23».");
  }
  for (const r of resultados) {
    if (r.error || r.sinMedir) {
      lineas.push(`::warning::${r.archivo}: no se pudo medir (${r.sinMedir ?? r.error}). Eso no dice que esté bien: revisa sus partes a mano (CLAUDE.md, «Políticas y deadlocks»).`);
      continue;
    }
    if (r.mezclas.length === 0) {
      lineas.push(`✓ ${r.archivo}: ${r.partes} parte${r.partes === 1 ? "" : "s"}, ninguna mezcla una política con el alter de una tabla que ya existía.`);
      continue;
    }
    rojo = true;
    for (const m of r.mezclas) {
      lineas.push(`✗ ${r.archivo} — ${m.etiqueta} (línea ${m.linea}) mezcla una política con el alter de una tabla que ya existía (40P01, ADR-0195):`);
      for (const o of m.otras) lineas.push(`    · línea ${o.linea}: \`${o.sentencia}\` toma en exclusiva ${o.relacion}`);
      for (const p of m.politicas) lineas.push(`    · línea ${p.linea}: \`${p.sentencia}\` toma en exclusiva las tablas de auth y storage`);
    }
  }
  if (rojo) {
    lineas.push("");
    lineas.push("Pásala a su propia parte: una línea `-- ===== PARTE N · políticas =====` antes de la política, y en producción pega");
    lineas.push("esa parte sola y al final. Detalle: encabezado de scripts/migraciones/partes-sin-deadlock.mjs y CLAUDE.md, «Políticas y deadlocks».");
  }
  return { texto: lineas.join("\n"), rojo };
}

function main() {
  const [orden, ...resto] = process.argv.slice(2);
  if (orden === "revisar" && resto.length === 1) {
    if (!existsSync(resto[0])) {
      console.log("✓ Sin medida de partes: el PR no agrega migraciones.");
      return;
    }
    const { reproduce, archivos } = JSON.parse(readFileSync(resto[0], "utf8"));
    const { texto, rojo } = informe(archivos, { reproduce });
    console.log(texto || "✓ Nada que revisar.");
    if (rojo) process.exit(1);
    return;
  }
  if (orden === "medir" && resto.length > 0) {
    const i = resto.indexOf("--contenedor");
    const contenedor = i === -1 ? CONTENEDOR : resto[i + 1];
    const archivos = i === -1 ? resto : resto.filter((_, j) => j !== i && j !== i + 1);
    const psql = psqlEn(contenedor);
    const reproduce = reproduceElBloqueo(psql);
    const resultados = archivos.map((ruta) => {
      try {
        return { archivo: basename(ruta), ...medirMigracion(readFileSync(ruta, "utf8"), psql) };
      } catch (e) {
        return { archivo: basename(ruta), error: String(e.stderr || e.message || e).trim().split("\n")[0] };
      }
    });
    const { texto, rojo } = informe(resultados, { reproduce });
    console.log(texto);
    if (rojo) process.exit(1);
    return;
  }
  console.error("Uso: partes-sin-deadlock.mjs medir <archivo.sql>… [--contenedor <nombre>] | revisar <partes.json>");
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

