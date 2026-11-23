#!/usr/bin/env node
/**
 * Lectura del código para la familia «El botón que no hace lo que dice» de `/chaos` (ADR-0693).
 *
 * EL PROBLEMA. Hay un error que ningún otro detector ve: no falla nada, no se escribe nada malo en la base (las invariantes callan) y no hay
 * error en la consola, pero el botón no logra lo que promete. En este repo tiene tres formas típicas, y las tres se ven en el código antes que
 * en la pantalla:
 *   · refresco-tras-guardar  `router.refresh()`, `push`/`replace` o `revalidatePath` justo después de guardar: la pantalla vuelve a pintarse con
 *                            props nuevas y se lleva lo que la persona tenía a medias (lo escrito en otro campo, la fila abierta, el aviso);
 *   · efecto-que-pisa        un `useEffect([prop])` que vuelve a poner un estado cuando la prop cambia: después de guardar (y del refresco) deshace
 *                            lo que el botón acaba de poner. Con las dos en el mismo archivo, la pista lo dice: es la combinación más peligrosa;
 *   · efecto-sin-guardia     un efecto que lee algo y pone el resultado sin descartar la respuesta vieja: si la primera llega después que la
 *                            segunda, la pantalla muestra lo de antes (la carrera entre dos acciones async).
 * Es el «mapa de quién resetea qué» de la skill `click-path-audit` (affaan-m/ecc), adaptado: aquí no hay stores (Zustand/Redux); lo que pisa el
 * estado local son las props del servidor y los efectos que las copian.
 *
 * LO QUE NO ES. Una pista no es un hallazgo: muchos refrescos y efectos están bien. Cada una dice QUÉ ataque correr (BOT-02, BOT-03, BOT-04 del
 * catálogo) y en qué línea mirar; el hallazgo es lo que pasa en el navegador. Lee el AST con TypeScript (`../rendimiento/comun.mjs`), como los
 * escáneres de rendimiento: con texto plano, cada comentario o cadena daría un falso positivo.
 *
 * USO   node scripts/chaos/boton.mjs <archivo o carpeta>... [--json]
 *       (los archivos de una pantalla salen de `node scripts/focus/escanear.mjs --ruta <ruta>`)
 */
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cargarTS, leer, lineaDe, listarFuentes, parsear, rel } from "../rendimiento/comun.mjs";

/** Cada pista, el ataque de la familia «boton» que la confirma y qué mirar. */
export const PISTAS = {
  "refresco-tras-guardar": {
    ataque: "BOT-02",
    que: "Se vuelve a pintar la pantalla justo después de guardar: mira qué estado local se pierde (lo escrito en otro campo, la pestaña, la fila abierta, el aviso).",
  },
  "efecto-que-pisa": {
    ataque: "BOT-03",
    que: "Un efecto vuelve a poner un estado cuando cambia su dependencia: pulsa el botón que cambia ese estado y mira si vuelve solo a su valor anterior.",
  },
  "efecto-sin-guardia": {
    ataque: "BOT-04",
    que: "Un efecto pone el resultado de una lectura sin descartar la respuesta vieja: retrasa la primera y cambia dos veces seguidas; debe quedar la última.",
  },
};

/** Pistas de UN archivo (pura). Devuelve `[{ tipo, ataque, linea, detalle }]`. */
export function pistasDeArchivo(texto, nombre = "x.tsx") {
  const ts = cargarTS();
  const sf = parsear(texto, nombre);
  const pistas = [];
  const esFuncion = (n) => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);
  /** La función más cercana que contiene al nodo (la que corre cuando él corre). */
  const funcionDe = (n) => {
    let p = n.parent;
    while (p && !esFuncion(p)) p = p.parent;
    return p ?? null;
  };
  // `setX` de un `useState`; `setTimeout`/`setInterval` empiezan igual y no lo son.
  const esSetter = (n) => ts.isIdentifier(n) && /^set[A-Z]/.test(n.text) && !/^set(Timeout|Interval|Immediate)$/.test(n.text);
  const recorrer = (n, f) => {
    f(n);
    ts.forEachChild(n, (h) => recorrer(h, f));
  };
  const esThen = (n) => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "then";

  // Los nombres que salen de `useRouter()` (`const router = useRouter()`): solo su `refresh/push/replace` cuenta.
  const routers = new Set();
  recorrer(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(sf) === "useRouter")
      routers.add(n.name.text);
  });

  // Los efectos con dependencias.
  const efectosQuePisan = [];
  recorrer(sf, (n) => {
    if (!ts.isCallExpression(n) || !/^(React\.)?useEffect$/.test(n.expression.getText(sf))) return;
    const [cb, deps] = n.arguments;
    if (!cb || !(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) || !deps || !ts.isArrayLiteralExpression(deps) || deps.elements.length === 0) return;
    const todas = deps.elements.map((e) => e.getText(sf)).join(", ");
    const dependencias = todas.length > 70 ? `${todas.slice(0, 70)}…` : todas;
    const enElCuerpo = new Set();
    let tardio = false;
    let async = false;
    recorrer(cb.body, (m) => {
      if (ts.isAwaitExpression(m) || esThen(m)) async = true;
      if (ts.isCallExpression(m) && esSetter(m.expression)) {
        if (funcionDe(m) === cb) enElCuerpo.add(m.expression.text);
        else tardio = true;
      }
      // `.then(setLista)`: el setter pasado tal cual también llega tarde.
      if (esThen(m) && m.arguments.some(esSetter)) tardio = true;
    });
    if (enElCuerpo.size) {
      const detalle = `${[...enElCuerpo].join(", ")} ← [${dependencias}]`;
      efectosQuePisan.push({ linea: lineaDe(sf, n), setters: [...enElCuerpo] });
      pistas.push({ tipo: "efecto-que-pisa", ataque: PISTAS["efecto-que-pisa"].ataque, linea: lineaDe(sf, n), detalle });
    }
    // Limpia al salir si devuelve una función (la bandera `vigente = false`, el `abort()`): ahí la respuesta vieja se descarta.
    const limpia =
      ts.isBlock(cb.body) &&
      cb.body.statements.some((s) => ts.isReturnStatement(s) && s.expression && (ts.isArrowFunction(s.expression) || ts.isFunctionExpression(s.expression) || ts.isIdentifier(s.expression)));
    if (async && tardio && !limpia)
      pistas.push({ tipo: "efecto-sin-guardia", ataque: PISTAS["efecto-sin-guardia"].ataque, linea: lineaDe(sf, n), detalle: `[${dependencias}]` });
  });

  // Los refrescos que vienen después de guardar: tras un `await` de la MISMA función, o dentro del `.then` de una promesa.
  recorrer(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    const c = n.expression;
    const esRefresco =
      (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && routers.has(c.expression.text) && /^(refresh|push|replace)$/.test(c.name.text)) ||
      (ts.isIdentifier(c) && /^(revalidatePath|revalidateTag)$/.test(c.text));
    if (!esRefresco) return;
    const f = funcionDe(n);
    if (!f) return;
    let trasAwait = false;
    recorrer(f.body ?? f, (m) => {
      if (ts.isAwaitExpression(m) && funcionDe(m) === f && m.getStart(sf) < n.getStart(sf)) trasAwait = true;
    });
    const enThen = f.parent && esThen(f.parent) && f.parent.arguments.includes(f);
    if (!trasAwait && !enThen) return;
    const setters = [...new Set(efectosQuePisan.flatMap((e) => e.setters))];
    const lineas = efectosQuePisan.map((e) => e.linea);
    const junto = efectosQuePisan.length
      ? ` · junto a un efecto que vuelve a poner ${setters.slice(0, 3).join(", ")}${setters.length > 3 ? "…" : ""} (línea${lineas.length > 1 ? "s" : ""} ${lineas.join(", ")})`
      : "";
    pistas.push({ tipo: "refresco-tras-guardar", ataque: PISTAS["refresco-tras-guardar"].ataque, linea: lineaDe(sf, n), detalle: `${c.getText(sf)}()${junto}` });
  });

  return pistas.sort((a, b) => a.linea - b.linea);
}

/** Las pistas de varios archivos o carpetas (rutas relativas al repo). */
export function pistasDe(rutas) {
  const archivos = rutas.flatMap((r) => (statSync(r).isDirectory() ? listarFuentes(r) : [r]));
  return archivos.flatMap((a) => pistasDeArchivo(leer(a), a).map((p) => ({ archivo: rel(resolve(a)), ...p })));
}

function main(argv) {
  const rutas = argv.filter((a) => !a.startsWith("--"));
  if (!rutas.length) return console.error("Uso: node scripts/chaos/boton.mjs <archivo o carpeta>... [--json]"), 2;
  const todas = pistasDe(rutas);
  if (argv.includes("--json")) return console.log(JSON.stringify(todas, null, 2)), 0;
  if (!todas.length) return console.log("Sin pistas: ni refrescos tras guardar ni efectos que pisen o lleguen tarde. BOT-01, BOT-05 y BOT-06 se corren igual."), 0;
  // Un refresco tras guardar es lo normal en este repo (hay cientos): solo no prioriza. Lo que sí apunta fuerte es el refresco JUNTO a
  // un efecto que copia una prop, y el efecto sin guardia. Esas van primero.
  const fuerte = (p) => /junto a un efecto/.test(p.detalle) || p.tipo !== "refresco-tras-guardar";
  const fuertes = todas.filter(fuerte);
  if (fuertes.length) console.log(`↯ EMPIEZA POR AQUÍ (${fuertes.length}): el refresco junto a un efecto que copia la prop, y los efectos que pisan o llegan tarde.`);
  let archivo = "";
  for (const p of [...fuertes, ...todas.filter((p) => !fuerte(p))]) {
    if (p.archivo !== archivo) console.log(`\n${(archivo = p.archivo)}`);
    console.log(`  ${fuerte(p) ? "↯" : " "} ${String(p.linea).padStart(4)}  ${p.ataque}  ${p.tipo}  ${p.detalle}`);
  }
  console.log(`\n${todas.length} pistas (${fuertes.length} fuertes). Qué mirar en cada una:`);
  for (const [tipo, p] of Object.entries(PISTAS)) console.log(`  ${p.ataque} ${tipo}: ${p.que}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main(process.argv.slice(2)));
