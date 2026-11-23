/**
 * El tablero de sesiones (ADR-0697): quién trabaja en qué en el repo, armado de lo que git y GitHub ya saben.
 *
 * EL PROBLEMA. `docs/SESIONES-ACTIVAS.md` se llenaba a mano («agrégate con una fila») y el 2026-11-19 tenía 143 filas
 * «activas», la más vieja del 2026-09-18: nadie lo usaba como fuente de verdad. Lo que sí es verdad está repartido en cuatro
 * lugares que ya existen: las worktrees de este equipo (con sus archivos cambiados), las ramas `claude/*` empujadas, los PR
 * abiertos y las reservas de números (ADR-0381). Este módulo las junta por rama y dice cuáles están vivas.
 *
 * EL ESTADO SE DERIVA, NO SE ESCRIBE. Nada de esto se guarda en el repo: cada corrida lo arma de nuevo. Una sesión que
 * termina desaparece sola del tablero cuando su rama se fusiona o se queda quieta.
 *
 * Esta es la parte pura (sin git ni red), con su prueba en `reglas.test.mjs`. Lo que lee vive en `tablero.mjs`.
 */
import { ADR, detectarChoques, MIGRACION, numeros } from "../abrir-pr/choques.mjs";

/** Una sesión está «activa» si hizo algo en las últimas 48 h (lo que pide «ramas empujadas en las últimas 48 h»). */
export const VENTANA_ACTIVA_S = 48 * 3600;

/** Orden por punto de código: el mismo en toda máquina (`localeCompare` depende del idioma del sistema). */
const alfabetico = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * `git worktree list --porcelain` → `[{ ruta, nombre, rama, cabeza }]`. Una worktree sin carpeta (`prunable`) se descarta:
 * nadie trabaja ahí. `rama` es `null` si está en HEAD suelto.
 */
export function parsearWorktrees(texto) {
  const salida = [];
  for (const bloque of texto.split(/\n\s*\n/)) {
    const lineas = bloque.split("\n").filter(Boolean);
    const ruta = lineas.find((l) => l.startsWith("worktree "))?.slice(9);
    if (!ruta || lineas.some((l) => l.startsWith("prunable"))) continue;
    const rama = lineas.find((l) => l.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "") ?? null;
    const cabeza = lineas.find((l) => l.startsWith("HEAD "))?.slice(5) ?? null;
    salida.push({ ruta, nombre: ruta.split(/[\\/]/).filter(Boolean).pop(), rama, cabeza });
  }
  return salida;
}

/**
 * `git status --porcelain=v1 -z -uall` → `[{ ruta, nuevo }]`. Con `-z` las rutas no van entre comillas y un renombre trae
 * dos entradas (la nueva y, después, la vieja, que se salta). `nuevo` = sin seguimiento (`??`) o agregado (`A`).
 */
export function parsearStatus(texto) {
  const partes = texto.split("\0");
  const salida = [];
  for (let i = 0; i < partes.length; i++) {
    const entrada = partes[i];
    if (entrada.length < 4) continue;
    const xy = entrada.slice(0, 2);
    salida.push({ ruta: entrada.slice(3), nuevo: xy === "??" || xy.includes("A") });
    if (xy.includes("R") || xy.includes("C")) i++; // la ruta vieja del renombre
  }
  return salida;
}

/**
 * `git diff --name-status -z <base>...<rama>` → `[{ ruta, nuevo }]`. Un renombre (`R100`) o una copia trae la vieja y la
 * nueva: cuenta la nueva, como agregada.
 */
export function parsearCambios(texto) {
  const partes = texto.split("\0").filter((p) => p !== "");
  const salida = [];
  for (let i = 0; i < partes.length; i++) {
    const estado = partes[i];
    if (/^[RC]/.test(estado)) {
      salida.push({ ruta: partes[i + 2], nuevo: true });
      i += 2;
    } else {
      salida.push({ ruta: partes[i + 1], nuevo: estado === "A" });
      i += 1;
    }
  }
  return salida.filter((c) => c.ruta);
}

/**
 * Dónde trabaja una sesión, en pocas palabras: sus archivos agrupados por carpeta (hasta 4 niveles: `apps/web/components/caja`,
 * `supabase/migrations`, `scripts/sesiones`; un archivo de la raíz cuenta por sí mismo), de la que más tiene a la que menos.
 */
export function zonas(archivos, cuantas = 4) {
  const cuenta = new Map();
  for (const ruta of archivos) {
    const carpetas = ruta.split("/").slice(0, -1);
    const zona = carpetas.length === 0 ? ruta : carpetas.slice(0, 4).join("/");
    cuenta.set(zona, (cuenta.get(zona) ?? 0) + 1);
  }
  return [...cuenta]
    .map(([zona, n]) => ({ zona, n }))
    .sort((a, b) => b.n - a.n || alfabetico(a.zona, b.zona))
    .slice(0, cuantas);
}

const unir = (...listas) => [...new Set(listas.flat())].sort();

/**
 * Junta las cuatro fuentes por rama y separa lo vivo de lo quieto.
 *
 * - `worktrees`: `[{ nombre, ruta, rama, enCommits: [{ruta,nuevo}], sinCommit: [{ruta,nuevo}], ultimo }]` (`ultimo` en
 *   segundos: el último commit propio o el archivo sin commit más reciente).
 * - `ramas`: las `claude/*` del remoto con commit en la ventana: `[{ rama, ultimo, cambios: [{ruta,nuevo}] }]`.
 * - `prs`: lo que da `leerOtros` de `choques.mjs`: `[{ numero, titulo, rama, archivos, adrs, migraciones, funciones }]`.
 * - `fechas`: `Map` rama → fecha del último commit en el remoto (para fechar un PR sin worktree).
 * - `reservas`: las de `reservas.mjs`. `rutasDeMain`: un número que ya está en main con ESE archivo no es nuevo.
 * - `actual`: la rama de esta sesión.
 *
 * Devuelve `{ activas, quietas, vacias }`. Cada sesión: `{ rama, worktree, pr, empujada, esta, archivos, sinCommit, ultimo,
 * adrs, migraciones, funciones, reservas }`. `vacias` son las worktrees sin nada propio (solo se cuentan).
 */
export function armarSesiones({ worktrees = [], ramas = [], prs = [], fechas = new Map(), reservas = [], rutasDeMain = new Set(), actual = null, ahora }) {
  const porRama = new Map();
  const sesion = (rama) => {
    if (!porRama.has(rama))
      porRama.set(rama, { rama, worktree: null, pr: null, empujada: false, esta: rama === actual, archivos: [], nuevos: [], sinCommit: 0, ultimo: null, funciones: [] });
    return porRama.get(rama);
  };
  const masReciente = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));
  const vacias = [];

  for (const w of worktrees) {
    const cambios = [...w.enCommits, ...w.sinCommit];
    if (cambios.length === 0) {
      vacias.push(w.nombre);
      continue;
    }
    const s = sesion(w.rama ?? `(sin rama) ${w.nombre}`);
    s.worktree = { nombre: w.nombre, ruta: w.ruta };
    s.archivos = unir(s.archivos, cambios.map((c) => c.ruta));
    s.nuevos = unir(s.nuevos, cambios.filter((c) => c.nuevo).map((c) => c.ruta));
    s.sinCommit = new Set(w.sinCommit.map((c) => c.ruta)).size;
    s.funciones = unir(s.funciones, w.funciones ?? []);
    s.ultimo = masReciente(s.ultimo, w.ultimo);
  }
  for (const r of ramas) {
    const s = sesion(r.rama);
    s.empujada = true;
    s.archivos = unir(s.archivos, r.cambios.map((c) => c.ruta));
    s.nuevos = unir(s.nuevos, r.cambios.filter((c) => c.nuevo).map((c) => c.ruta));
    s.funciones = unir(s.funciones, r.funciones ?? []);
    s.ultimo = masReciente(s.ultimo, r.ultimo);
  }
  for (const pr of prs) {
    const s = sesion(pr.rama);
    s.pr = { numero: pr.numero, titulo: pr.titulo };
    s.empujada = true;
    s.archivos = unir(s.archivos, pr.archivos);
    s.funciones = unir(s.funciones, pr.funciones ?? []);
    s.prAdrs = pr.adrs;
    s.prMigraciones = pr.migraciones;
    s.ultimo = masReciente(s.ultimo, fechas.get(pr.rama) ?? null);
  }

  const activas = [];
  const quietas = [];
  for (const s of porRama.values()) {
    const nuevosDeVerdad = s.nuevos.filter((r) => !rutasDeMain.has(r));
    const listo = {
      rama: s.rama,
      worktree: s.worktree,
      pr: s.pr,
      empujada: s.empujada,
      esta: s.esta,
      archivos: s.archivos,
      sinCommit: s.sinCommit,
      ultimo: s.ultimo,
      adrs: unir(numeros(nuevosDeVerdad, ADR), s.prAdrs ?? []),
      migraciones: unir(numeros(nuevosDeVerdad, MIGRACION), s.prMigraciones ?? []),
      funciones: s.funciones,
      reservas: reservas.filter((r) => r.rama === s.rama).map((r) => ({ tipo: r.tipo, numero: r.numero })),
    };
    const reciente = s.ultimo != null && ahora - s.ultimo <= VENTANA_ACTIVA_S;
    (reciente ? activas : quietas).push(listo);
  }
  const porFecha = (a, b) => (b.ultimo ?? 0) - (a.ultimo ?? 0) || alfabetico(a.rama, b.rama);
  return { activas: activas.sort(porFecha), quietas: quietas.sort(porFecha), vacias: vacias.sort() };
}

/**
 * Lo que puede llegar a `main` y por eso puede chocar: una sesión activa, o una quieta que tiene un PR abierto. Una worktree
 * quieta sin PR es trabajo dejado: sus números y archivos no se cruzan (serían ruido de hace semanas).
 */
export function puedeLlegarAMain(tablero) {
  return [...tablero.activas, ...tablero.quietas.filter((s) => s.pr)];
}

/**
 * Los choques entre las sesiones vivas, con el MISMO detector de `pnpm abrir-pr:choques` (`detectarChoques`; aquí no se
 * escribe otro). Cada sesión se compara una vez con `main` y con las reservas, y cada par de sesiones una vez entre sí.
 * Devuelve `[{ gravedad: "seguro" | "probable" | "compartido", ramas: [a, b?], que, detalle }]`, de peor a menos malo.
 */
export function choquesEntreSesiones({ sesiones, main = { adrs: [], migraciones: [] }, reservas = [] }) {
  const choques = [];
  const sinMain = { adrs: [], migraciones: [] };
  sesiones.forEach((a, i) => {
    const conMain = detectarChoques({ mio: a, otros: [], main, reservas, rama: a.rama });
    for (const c of conMain.seguros) choques.push({ gravedad: "seguro", ramas: [a.rama], que: c.que, detalle: c.detalle });
    for (const b of sesiones.slice(i + 1)) {
      const entre = detectarChoques({ mio: a, otros: [b], main: sinMain, rama: a.rama });
      for (const [gravedad, lista] of [
        ["seguro", entre.seguros],
        ["probable", entre.probables],
        ["compartido", entre.compartidos],
      ])
        for (const c of lista) choques.push({ gravedad, ramas: [a.rama, b.rama], que: c.que, detalle: c.detalle });
    }
  });
  const orden = { seguro: 0, probable: 1, compartido: 2 };
  return choques.sort((x, y) => orden[x.gravedad] - orden[y.gravedad]);
}

/** «hace 40 min», «hace 3 h», «hace 2 d»; «sin fecha» si no se supo. */
export function hace(segundos, ahora) {
  if (segundos == null) return "sin fecha";
  const d = Math.max(0, ahora - segundos);
  if (d < 3600) return `hace ${Math.max(1, Math.round(d / 60))} min`;
  if (d < 48 * 3600) return `hace ${Math.round(d / 3600)} h`;
  return `hace ${Math.round(d / 86400)} d`;
}

/** Una lista de números corta: con más de 3, cuántos y el primero y el último. */
function listaDeNumeros(nombre, plural, lista) {
  if (lista.length === 0) return null;
  if (lista.length <= 3) return `${nombre} ${lista.join(", ")}`;
  return `${lista.length} ${plural} (${lista[0]} … ${lista.at(-1)})`;
}

/**
 * Una sesión activa en dos líneas (la rama, cuándo y dónde vive; qué toca, qué trae y qué reservó sin usar todavía) o, si
 * está quieta, en una sola (`corta`).
 */
function lineasDeSesion(s, ahora, { corta = false } = {}) {
  const donde = [s.worktree ? `worktree ${s.worktree.nombre}` : s.empujada ? "rama empujada (sin worktree en esta máquina)" : null, s.pr ? `PR #${s.pr.numero}` : null]
    .filter(Boolean)
    .join(" · ");
  const cabeza = `  ${s.rama}${s.esta ? " (esta sesión)" : ""} · ${hace(s.ultimo, ahora)} · ${donde}`;
  const cuanto = `${s.archivos.length} ${s.archivos.length === 1 ? "archivo" : "archivos"}${s.sinCommit ? ` (${s.sinCommit} sin commit)` : ""}`;
  const que = zonas(s.archivos, corta ? 2 : 4)
    .map((z) => `${z.zona} (${z.n})`)
    .join(", ");
  if (corta) return [`${cabeza} · ${cuanto} · ${que}`];
  const trae = [listaDeNumeros("ADR", "ADR", s.adrs), listaDeNumeros("migración", "migraciones", s.migraciones)].filter(Boolean).join(" · ");
  // Una reserva que la rama ya usa está en «trae»; aquí van solo las que todavía no aparecen en sus archivos.
  const sinUsar = s.reservas.filter((r) => !(r.tipo === "adr" ? s.adrs : s.migraciones).includes(r.numero));
  const reservo = [
    listaDeNumeros("ADR", "ADR", sinUsar.filter((r) => r.tipo === "adr").map((r) => r.numero)),
    listaDeNumeros("migración", "migraciones", sinUsar.filter((r) => r.tipo === "migracion").map((r) => r.numero)),
  ].filter(Boolean);
  const detalle = [cuanto, que, trae, reservo.length ? `reservó sin usar todavía: ${reservo.join(", ")}` : null].filter(Boolean).join(" · ");
  return [cabeza, `      ${detalle}`];
}

/** Los nombres de las fuentes, para decir cuál no respondió. */
const FUENTES = { worktrees: "las worktrees", ramas: "las ramas del remoto (sin red: uso las que ya tenía)", prs: "los PR (gh no respondió)", reservas: "las reservas" };

/** El tablero legible de `pnpm sesiones`. `tablero` = lo de `armarSesiones` + `faltan` (fuentes que no respondieron). */
export function informe(tablero, ahora) {
  const partes = [];
  partes.push(`Tablero de sesiones — se arma de git, GitHub y las reservas cada vez; no guarda nada (ADR-0697)\n`);
  partes.push(`ACTIVAS (algo en las últimas 48 h): ${tablero.activas.length}`);
  for (const s of tablero.activas) partes.push(...lineasDeSesion(s, ahora));
  if (tablero.quietas.length) {
    partes.push(`\nQUIETAS (más de 48 h, con trabajo sin cerrar o un PR abierto): ${tablero.quietas.length}`);
    for (const s of tablero.quietas) partes.push(...lineasDeSesion(s, ahora, { corta: true }));
  }
  const choques = tablero.choques ?? [];
  const graves = choques.filter((c) => c.gravedad !== "compartido");
  const compartidos = choques.filter((c) => c.gravedad === "compartido");
  partes.push(`\nCHOQUES entre lo que puede llegar a main (activas y PR abiertos): ${graves.length ? graves.length : "ninguno seguro ni probable"}`);
  for (const c of graves) partes.push(`  ${c.gravedad === "seguro" ? "🔴 SEGURO" : "🟠 PROBABLE"} · ${c.que} · ${c.ramas.join(" y ")}`, `      ${c.detalle}`);
  if (compartidos.length) {
    partes.push(`  ℹ Comparten otros archivos (solo para saber con quién hablar):`);
    for (const c of compartidos) partes.push(`      ${c.ramas.join(" y ")}: ${c.que} — ${c.detalle}`);
  }
  partes.push(`\nVACÍAS: ${tablero.vacias.length} ${tablero.vacias.length === 1 ? "worktree" : "worktrees"} sin cambios propios.`);
  if (tablero.faltan?.length) partes.push(`\nNo pude leer: ${tablero.faltan.map((f) => FUENTES[f] ?? f).join("; ")}.`);
  return partes.join("\n");
}
