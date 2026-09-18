#!/usr/bin/env node
/**
 * Generador del diccionario de datos de CAYLA — la MITAD GENERADA de `docs/datos/`.
 *
 * EL PROBLEMA QUE RESUELVE. Hasta hoy, "cuántas tablas tiene CAYLA" tenía tres
 * respuestas distintas según a qué documento se le preguntara: el README decía 36 en
 * local y 28 en producción, `docs/ARQUITECTURA.md` listaba un conjunto que ya no
 * coincide, y el SQL decía otra cosa. Un diccionario escrito a mano siempre termina
 * así: envejece sin avisar, y cuando alguien descubre un error deja de creerle al
 * archivo entero — incluso a la parte que seguía siendo cierta.
 *
 * QUÉ HACE. Le pregunta a un Postgres de verdad qué tablas, columnas, candados,
 * índices, políticas y funciones tiene, y escribe los archivos de `docs/datos/generado/`.
 * Nadie los edita a mano. Si dicen algo raro, es porque la base dice algo raro.
 *
 * LO ÚNICO QUE SE ESCRIBE A MANO es la columna "para qué sirve": esa vive en
 * `docs/datos/generado/glosario.json` y el generador la RESPETA — la busca por
 * `esquema.tabla.columna` y la pega donde corresponde. Una columna sin glosa sale
 * marcada con «—», que es una tarea visible, no un hueco silencioso.
 *
 * USO
 *   pnpm datos:generar                        → detecta solo el Postgres disponible
 *   pnpm datos:generar --fuente=cayla-retail  → fuerza el stack local de retail
 *   pnpm datos:generar --fuente=cayla-dynamic → el stack de Dynamic (foto de producción)
 *   pnpm datos:generar --volcado              → NO se conecta: arma el diccionario desde
 *                                               los volcados de PRODUCCIÓN que hay en
 *                                               docs/datos/generado/retail_*.json
 *
 * EL MODO `--volcado` EXISTE POR UNA RAZÓN CONCRETA. A producción no se llega con
 * `docker exec`: vive en Supabase, detrás de internet. Pero sí se le puede pedir el
 * inventario desde el editor SQL (o desde el MCP) y guardar la respuesta en disco.
 * Con eso, el diccionario describe LAS 45 TABLAS REALES y no las 28 de una copia local
 * que va por detrás. Cómo refrescar esos volcados: docs/datos/generado/COMO-REFRESCAR.md
 *
 * QUÉ PUEDE AFIRMAR Y QUÉ NO. Describe EXACTAMENTE la base a la que se conectó, y lo
 * dice en la cabecera de cada archivo con fecha y origen. No sabe nada de la base a la
 * que no se conectó: para comparar dos bases está `comparar.mjs`, que es otro problema.
 * Un diccionario que no dice de dónde salió es un diccionario que miente por omisión.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AVIARIO } from "./aviario.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const SALIDA = join(RAIZ, "docs", "datos", "generado");

const CANDIDATOS = ["supabase_db_cayla-retail", "supabase_db_cayla-dynamic"];

// ── Conexión ────────────────────────────────────────────────────────────────
// Mismo camino que `scripts/local/donde-estoy.mjs` y `scripts/migraciones/verificar.mjs`:
// `docker exec … psql`. Así no hace falta agregar una dependencia de Postgres al
// monorepo solo para esto.

function contenedoresVivos() {
  try {
    return execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
      .split("\n").map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function elegirFuente() {
  const pedida = process.argv.find(a => a.startsWith("--fuente="))?.split("=")[1];
  const vivos = contenedoresVivos();
  if (pedida) {
    const nombre = pedida.startsWith("supabase_db_") ? pedida : `supabase_db_${pedida}`;
    if (!vivos.includes(nombre)) {
      fallar(`Pediste ${nombre} y no está corriendo.`, vivos);
    }
    return nombre;
  }
  const encontrada = CANDIDATOS.find(c => vivos.includes(c));
  if (!encontrada) fallar("No encuentro ningún Postgres de CAYLA corriendo.", vivos);
  return encontrada;
}

function fallar(motivo, vivos) {
  console.error(`\n  ${motivo}`);
  console.error(`  Contenedores vivos ahora: ${vivos.length ? vivos.join(", ") : "ninguno"}`);
  console.error(`\n  Levanta el entorno con:  npx supabase start`);
  console.error(`  O apunta a la copia de producción: pnpm datos:generar --fuente=cayla-dynamic\n`);
  process.exit(1);
}

function consultar(contenedor, sql) {
  const salida = execFileSync(
    "docker",
    ["exec", "-i", contenedor, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(salida.trim() || "null");
}

// ── Las preguntas ───────────────────────────────────────────────────────────
// Una sola consulta que devuelve un JSON con todo. Menos viajes, y el resultado se
// puede guardar tal cual para comparar después.

const INVENTARIO = `
with esquemas as (select unnest(array['retail','public']) as esquema)
select jsonb_pretty(jsonb_build_object(
  'leido_en', now(),
  'version_postgres', version(),

  'tablas', (
    select jsonb_agg(t order by t->>'esquema', t->>'tabla') from (
      select jsonb_build_object(
        'esquema', n.nspname,
        'tabla', c.relname,
        'tipo', case c.relkind when 'r' then 'tabla' when 'p' then 'particionada' when 'v' then 'vista' when 'm' then 'vista materializada' end,
        'comentario', obj_description(c.oid, 'pg_class'),
        'filas_estimadas', greatest(c.reltuples::bigint, 0),
        'rls_activo', c.relrowsecurity,
        'rls_forzado', c.relforcerowsecurity,
        'columnas', (
          select jsonb_agg(jsonb_build_object(
            'nombre', a.attname,
            'orden', a.attnum,
            'tipo', format_type(a.atttypid, a.atttypmod),
            'acepta_vacio', not a.attnotnull,
            'por_defecto', pg_get_expr(d.adbin, d.adrelid),
            'generada', a.attgenerated <> '',
            'comentario', col_description(a.attrelid, a.attnum)
          ) order by a.attnum)
          from pg_attribute a
          left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        ),
        'candados', (
          select jsonb_agg(jsonb_build_object(
            'nombre', con.conname,
            'clase', case con.contype when 'p' then 'llave primaria' when 'f' then 'llave foránea'
                                      when 'u' then 'único' when 'c' then 'regla' when 'x' then 'exclusión' end,
            'definicion', pg_get_constraintdef(con.oid)
          ) order by con.contype, con.conname)
          from pg_constraint con where con.conrelid = c.oid
        ),
        'indices', (
          select jsonb_agg(jsonb_build_object('nombre', ic.relname, 'definicion', pg_get_indexdef(i.indexrelid))
                 order by ic.relname)
          from pg_index i join pg_class ic on ic.oid = i.indexrelid
          where i.indrelid = c.oid and not i.indisprimary
        ),
        'politicas', (
          select jsonb_agg(jsonb_build_object(
            'nombre', p.polname,
            'operacion', case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                                       when 'd' then 'DELETE' when '*' then 'TODAS' end,
            'condicion', pg_get_expr(p.polqual, p.polrelid),
            'condicion_escritura', pg_get_expr(p.polwithcheck, p.polrelid)
          ) order by p.polname)
          from pg_policy p where p.polrelid = c.oid
        ),
        'definicion_vista', case when c.relkind = 'v' then pg_get_viewdef(c.oid, true) end
      ) as t
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in (select esquema from esquemas) and c.relkind in ('r','p','v','m')
    ) s
  ),

  'funciones', (
    select jsonb_agg(f order by f->>'esquema', f->>'nombre', f->>'argumentos') from (
      select jsonb_build_object(
        'esquema', n.nspname,
        'nombre', p.proname,
        'argumentos', pg_get_function_arguments(p.oid),
        'devuelve', pg_get_function_result(p.oid),
        'seguridad', case when p.prosecdef then 'definer (corre como dueño)' else 'invoker (corre como quien llama)' end,
        'volatilidad', case p.provolatile when 'i' then 'inmutable' when 's' then 'estable' else 'volátil' end,
        'comentario', obj_description(p.oid, 'pg_proc'),
        'lineas_cuerpo', coalesce(array_length(string_to_array(p.prosrc, E'\\n'), 1), 0)
      ) as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in (select esquema from esquemas) and p.prokind = 'f'
    ) s
  ),

  'disparadores', (
    select jsonb_agg(jsonb_build_object(
      'esquema', n.nspname, 'tabla', c.relname, 'nombre', tg.tgname,
      'definicion', pg_get_triggerdef(tg.oid)
    ) order by n.nspname, c.relname, tg.tgname)
    from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in (select esquema from esquemas) and not tg.tgisinternal
  )
))`;


// ── Modo volcado: producción, sin conectarse ───────────────────────────────
// Traduce los cinco JSON que devuelve el editor SQL de producción a la MISMA forma
// que produce la consulta de arriba, para que el resto del script no sepa de dónde
// vino el dato. Lo que el volcado no trae —comentarios de columna, disparadores— se
// deja vacío en vez de inventarse.

function desdeVolcado() {
  const leer = (n) => JSON.parse(readFileSync(join(SALIDA, n), "utf8"));
  const columnas = leer("retail_columnas.json");
  const constraints = leer("retail_constraints.json");
  const indices = leer("retail_indices_unicos.json");
  const politicas = leer("retail_policies.json");
  const filas = leer("retail_filas.json");

  const sinEsquema = (s) => String(s).replace(/^retail\./, "");
  const clase = (def) =>
    /^PRIMARY KEY/i.test(def) ? "llave primaria" :
    /^FOREIGN KEY/i.test(def) ? "llave foránea" :
    /^UNIQUE/i.test(def) ? "único" :
    /^CHECK/i.test(def) ? "regla" : "otro";

  const tablas = Object.entries(columnas).map(([tabla, cols]) => ({
    esquema: "retail",
    tabla,
    tipo: (tabla === "personas" || tabla === "sedes") ? "vista" : "tabla",
    comentario: null,
    filas_estimadas: filas[tabla] ?? 0,
    rls_activo: politicas.some(p => p.tablename === tabla),
    rls_forzado: false,
    columnas: cols.map((c, i) => ({
      nombre: c.column_name,
      orden: c.ordinal_position ?? i + 1,
      tipo: c.data_type,
      acepta_vacio: c.is_nullable === "YES",
      por_defecto: c.column_default ?? null,
      generada: false,
      comentario: null,
    })),
    candados: constraints.filter(k => sinEsquema(k.tabla) === tabla)
      .map(k => ({ nombre: k.conname, clase: clase(k.definicion), definicion: k.definicion })),
    indices: indices.filter(i => i.tablename === tabla)
      .map(i => ({ nombre: i.indexname, definicion: i.indexdef })),
    politicas: politicas.filter(p => p.tablename === tabla)
      .map(p => ({ nombre: p.policyname, operacion: p.cmd, condicion: p.qual, condicion_escritura: p.with_check })),
    definicion_vista: null,
  }));

  return { leido_en: "volcado de producción — ver COMO-REFRESCAR.md", tablas, funciones: [], disparadores: [] };
}

// ── Escritura ───────────────────────────────────────────────────────────────

// De qué pájaro es cada tabla: la lista vive en `aviario.mjs`, no acá.

const MUERTAS = {
  ordenes_produccion: "Modelo de producción de la Fase 1. Reemplazado por `producciones` + `produccion_lineas`. Sigue vivo porque nunca se retiró; no tiene RPC activo.",
  bom_items: "Legado de la Fase 1 — pero OJO: sí tiene pantalla propia (la receta de costo en la ficha de producto). No se puede borrar sin decidir qué pasa con esa pantalla.",
};

function glosario() {
  const ruta = join(SALIDA, "glosario.json");
  if (!existsSync(ruta)) return {};
  try { return JSON.parse(readFileSync(ruta, "utf8")); } catch { return {}; }
}

function esc(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function fichaTabla(t, glosas) {
  const L = [];
  const clave = `${t.esquema}.${t.tabla}`;
  const muerta = MUERTAS[t.tabla];

  L.push(`### \`${t.tabla}\`${t.tipo === "vista" ? " *(vista)*" : ""}${muerta ? " — ⚰️ MUERTA" : ""}`);
  L.push("");
  if (t.comentario) L.push(`> ${esc(t.comentario)}`, "");
  if (muerta) L.push(`> **Por qué sigue viva:** ${muerta}`, "");

  const meta = [`${t.columnas?.length ?? 0} columnas`];
  if (t.tipo !== "vista") {
    meta.push(`~${t.filas_estimadas} filas`);
    meta.push(t.rls_activo ? "permisos por fila **activos**" : "⚠️ **sin permisos por fila**");
    if (t.rls_forzado) meta.push("forzados también para el dueño");
  }
  L.push(`*${meta.join(" · ")}*`, "");

  if (t.tipo === "vista") {
    L.push("<details><summary>Cómo se construye esta vista</summary>", "", "```sql", t.definicion_vista?.trim() ?? "", "```", "", "</details>", "");
  }

  L.push("| Columna | Tipo | Acepta vacío | Por defecto | Para qué sirve |");
  L.push("|---|---|---|---|---|");
  for (const c of t.columnas ?? []) {
    const glosa = glosas[`${clave}.${c.nombre}`] ?? c.comentario ?? "—";
    const nombre = c.generada ? `${c.nombre} *(calculada)*` : c.nombre;
    L.push(`| \`${nombre}\` | ${esc(c.tipo)} | ${c.acepta_vacio ? "sí" : "**no**"} | ${c.por_defecto ? `\`${esc(c.por_defecto)}\`` : "—"} | ${esc(glosa)} |`);
  }
  L.push("");

  const candados = (t.candados ?? []).filter(c => c.clase === "regla" || c.clase === "único" || c.clase === "exclusión");
  const unicosParciales = (t.indices ?? []).filter(i => /unique/i.test(i.definicion) && /where/i.test(i.definicion));
  if (candados.length || unicosParciales.length) {
    L.push("**Candados** — lo que esta tabla hace imposible:", "");
    for (const c of candados) L.push(`- \`${c.nombre}\` — \`${esc(c.definicion)}\``);
    for (const i of unicosParciales) L.push(`- \`${i.nombre}\` *(único parcial)* — \`${esc(i.definicion.replace(/^CREATE.*?ON /i, "").replace(/ USING \w+/i, ""))}\``);
    L.push("");
  }

  const fks = (t.candados ?? []).filter(c => c.clase === "llave foránea");
  if (fks.length) {
    L.push("**De qué depende:** " + fks.map(f => `\`${esc(f.definicion.replace(/^FOREIGN KEY /, ""))}\``).join(" · "), "");
  }

  if (t.politicas?.length) {
    L.push("**Quién puede qué** (políticas de fila):", "");
    L.push("| Política | Operación | Condición |");
    L.push("|---|---|---|");
    for (const p of t.politicas) {
      L.push(`| \`${p.nombre}\` | ${p.operacion} | \`${esc(p.condicion ?? p.condicion_escritura ?? "—")}\` |`);
    }
    L.push("");
  } else if (t.tipo !== "vista" && t.rls_activo) {
    L.push("**Quién puede qué:** ninguna política. Con permisos por fila activos y sin política, **los clientes no pueden leer ni escribir esta tabla**: el único camino es una función `security definer`. Si eso es a propósito, es un candado fuerte; si no, es una tabla inaccesible.", "");
  }

  return L.join("\n");
}

function cabecera(titulo, inv, fuente, extra = "") {
  return `# ${titulo}

> ⚠️ **ARCHIVO GENERADO. No lo edites a mano** — se reescribe entero cada vez que
> alguien corre \`pnpm datos:generar\`. Lo único editable a mano es la columna
> «Para qué sirve», que vive en \`glosario.json\` y este generador respeta.
>
> **Origen:** \`${fuente}\`
> **Leído el:** ${String(inv.leido_en).slice(0, 19).replace("T", " ")}
${extra}
---
`;
}

// ── Ejecución ───────────────────────────────────────────────────────────────

const modoVolcado = process.argv.includes("--volcado");
const fuente = modoVolcado ? "volcado de producción (retail_*.json)" : elegirFuente();
console.log(`  Leyendo el esquema desde ${fuente}…`);

const inv = modoVolcado ? desdeVolcado() : consultar(fuente, INVENTARIO);
if (!inv) { console.error("  La base no devolvió nada."); process.exit(1); }

mkdirSync(SALIDA, { recursive: true });
const glosas = glosario();

const tablas = inv.tablas ?? [];
const retail = tablas.filter(t => t.esquema === "retail");
const dynamic = tablas.filter(t => t.esquema === "public");

// ---- Diccionario de retail, ordenado por los 14 módulos
{
  const L = [];
  const vistas = new Set();
  L.push(cabecera("Diccionario — CAYLA Retail (schema `retail`)", inv, fuente,
`> **Tablas y vistas encontradas:** ${retail.length}
>
> El orden sigue los 14 módulos de \`docs/datos/00-MAPA.md\`. Para entender **por qué**
> existe cada tabla, abre el archivo del módulo en \`docs/datos/modulos/\`; este archivo
> solo dice **qué hay**.`));

  for (const { n, modulo, tablas: nombres } of AVIARIO) {
    const delDominio = nombres.map(nombre => retail.find(t => t.tabla === nombre)).filter(Boolean);
    if (!delDominio.length) continue;
    L.push(`\n## ${n} · ${modulo}\n`);
    for (const t of delDominio) { vistas.add(t.tabla); L.push(fichaTabla(t, glosas), ""); }
  }

  const huerfanas = retail.filter(t => !vistas.has(t.tabla));
  if (huerfanas.length) {
    L.push(`\n## Sin módulo asignado\n`);
    L.push(`> Estas tablas existen en la base y **no están en ningún módulo** de \`00-MAPA.md\`.`);
    L.push(`> Eso siempre significa una de dos cosas: el mapa se quedó viejo, o alguien creó una`);
    L.push(`> tabla sin decidir de quién es. Las dos hay que resolverlas, no ignorarlas.\n`);
    for (const t of huerfanas) L.push(fichaTabla(t, glosas), "");
  }

  writeFileSync(join(SALIDA, "DICCIONARIO-RETAIL.md"), L.join("\n"));
  console.log(`  ✓ DICCIONARIO-RETAIL.md — ${retail.length} tablas${huerfanas.length ? `, ${huerfanas.length} sin módulo` : ""}`);
}

// ---- Diccionario de Dynamic (el volcado de producción solo trae `retail`)
if (!modoVolcado) {
  const L = [];
  L.push(cabecera("Diccionario — CAYLA Dynamic (schema `public`)", inv, fuente,
`> **Tablas y vistas encontradas:** ${dynamic.length}
>
> Este es el sistema de personas de CAYLA (asistencia, planilla). Vive en el mismo
> proyecto de base de datos que Retail: \`public\` es Dynamic, \`retail\` es la tienda.
> La frontera entre ambos está explicada en \`docs/datos/14-DYNAMIC.md\`.`));
  for (const t of dynamic.sort((a, b) => a.tabla.localeCompare(b.tabla))) L.push(fichaTabla(t, glosas), "");
  writeFileSync(join(SALIDA, "DICCIONARIO-DYNAMIC.md"), L.join("\n"));
  console.log(`  ✓ DICCIONARIO-DYNAMIC.md — ${dynamic.length} tablas`);
}

// ---- Las funciones: la única puerta de escritura (el volcado no las trae)
if (!modoVolcado) {
  const fns = (inv.funciones ?? []).filter(f => f.esquema === "retail");
  const porNombre = new Map();
  for (const f of fns) porNombre.set(f.nombre, [...(porNombre.get(f.nombre) ?? []), f]);
  const duplicadas = [...porNombre.entries()].filter(([, v]) => v.length > 1);

  const L = [];
  L.push(cabecera("Funciones — la única puerta de escritura", inv, fuente,
`> **Funciones en \`retail\`:** ${fns.length}
>
> Escribir en esta base no se hace con un \`insert\`: se hace llamando a una de estas
> funciones, que hace todo o no hace nada. Lo que corre **como dueño** (\`definer\`) se
> salta los permisos por fila a propósito — por eso cada una tiene que validar sede y
> rol por su cuenta.`));

  if (duplicadas.length) {
    L.push(`\n## ⚠️ Funciones con más de una firma\n`);
    L.push(`En Postgres, reemplazar una función con parámetros distintos **no la reemplaza:`);
    L.push(`crea una segunda**. Cuando hay dos, nadie sabe cuál se está llamando de verdad.`);
    L.push(`Ya pasó en este sistema y costó un diagnóstico entero.\n`);
    for (const [nombre, versiones] of duplicadas) {
      L.push(`- **\`${nombre}\`** — ${versiones.length} firmas vivas:`);
      for (const v of versiones) L.push(`  - \`(${esc(v.argumentos)})\` → ${esc(v.devuelve)}`);
    }
    L.push("");
  }

  L.push(`\n## Todas las funciones\n`);
  for (const f of fns.sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    L.push(`### \`${f.nombre}\``);
    L.push("");
    if (f.comentario) L.push(`> ${esc(f.comentario)}`, "");
    L.push("```sql");
    L.push(`${f.nombre}(${f.argumentos || ""})`);
    L.push(`  → ${f.devuelve}`);
    L.push("```");
    L.push(`*${f.seguridad} · ${f.volatilidad} · ${f.lineas_cuerpo} líneas de cuerpo*`);
    L.push("");
  }

  writeFileSync(join(SALIDA, "RPCS.md"), L.join("\n"));
  console.log(`  ✓ RPCS.md — ${fns.length} funciones${duplicadas.length ? `, ⚠️ ${duplicadas.length} con firma duplicada` : ""}`);
}

// ---- El crudo, para que `comparar.mjs` pueda hacer su trabajo
const nombreCrudo = modoVolcado ? "inventario-produccion.json" : `inventario-${fuente.replace("supabase_db_", "")}.json`;
writeFileSync(join(SALIDA, nombreCrudo), JSON.stringify(inv, null, 2));
console.log(`  ✓ ${nombreCrudo} — el crudo, para comparar`);

// ---- Glosario: crea la plantilla la primera vez, sin pisar lo ya escrito
{
  const ruta = join(SALIDA, "glosario.json");
  if (!existsSync(ruta)) {
    const plantilla = {};
    for (const t of retail) for (const c of t.columnas ?? []) plantilla[`retail.${t.tabla}.${c.nombre}`] = "";
    writeFileSync(ruta, JSON.stringify(plantilla, null, 2));
    console.log(`  ✓ glosario.json — plantilla con ${Object.keys(plantilla).length} columnas por explicar`);
  } else {
    const total = retail.reduce((n, t) => n + (t.columnas?.length ?? 0), 0);
    const escritas = Object.entries(glosas).filter(([k, v]) => k.startsWith("retail.") && v).length;
    console.log(`  · glosario.json — ${escritas}/${total} columnas de retail explicadas a mano`);
  }
}

console.log(`\n  Listo. Revisa el diff de docs/datos/generado/ antes de commitear.\n`);
