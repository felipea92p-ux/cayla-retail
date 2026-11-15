import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// El cableado de dos reglas de Recibir ▸ Contar (Felipe 2026-11-14), leído del código fuente. Las reglas puras tienen su prueba (`destinoDelEnter`,
// `contadorDeParada`, `conservaLaCifra`), pero si alguien reescribe a mano las líneas que las llaman, esas pruebas siguen en verde y la pantalla vuelve a pisar un
// conteo con Enter o a cortar la cifra al tocar la fila. Estas pruebas fallan si eso pasa.
//
// Contrato. PROMETE: (a) el Enter del contador pide el destino a `destinoDelEnter(paradas, …)` y no lo calcula con el siguiente de la lista; (b) sin destino, el cursor
// busca primero el enlace del pie (`.rc-pie-sigue`) y después «Revisar y cerrar», nunca el botón del número; (c) la fila del modelo pregunta `conservaLaCifra` con la
// fila activa, la caja del número y el botón principal, y entonces hace `preventDefault`; (d) el Dial no vuelve a seleccionar la cifra si la caja ya tiene el cursor;
// (e) la placa y la fila dibujan el número con `contadorDeParada`. NO PROMETE: que la pantalla se comporte así (eso se vio en el navegador); solo que las líneas siguen ahí.

const raiz = join(__dirname, "..", "components", "recepcion-conteo");

/** El código sin sus comentarios, que nombran las reglas sin llamarlas. */
function sinComentarios(ts: string): string {
  return ts.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const fuente = (archivo: string): string => sinComentarios(readFileSync(join(raiz, archivo), "utf8"));

/** Una función de nivel superior entera: desde su `function` hasta la siguiente. Vacío si no está. */
function funcion(ts: string, nombre: string): string {
  const inicio = ts.indexOf(`function ${nombre}(`);
  if (inicio < 0) return "";
  const fin = ts.indexOf("\nfunction ", inicio + 1);
  return ts.slice(inicio, fin < 0 ? undefined : fin);
}

/** El bloque `{ … }` que abre la primera llave después de `ancla`, con sus llaves anidadas. `null` si el ancla no está. */
function bloqueDesde(ts: string, ancla: string | RegExp): string | null {
  const m = typeof ancla === "string" ? { index: ts.indexOf(ancla), largo: ancla.length } : (() => { const r = ancla.exec(ts); return { index: r ? r.index : -1, largo: r ? r[0].length : 0 }; })();
  if (m.index < 0) return null;
  const inicio = ts.indexOf("{", m.index + m.largo - 1);
  if (inicio < 0) return null;
  let profundidad = 0;
  for (let i = inicio; i < ts.length; i++) {
    if (ts[i] === "{") profundidad++;
    else if (ts[i] === "}" && --profundidad === 0) return ts.slice(inicio, i + 1);
  }
  return null;
}

describe("cómo se leen las líneas vigiladas", () => {
  it("toma el bloque con sus llaves anidadas y nada más", () => {
    expect(bloqueDesde("a={() => { if (x) { y(); } }} b={() => { z(); }}", "a={() =>")).toBe("{ if (x) { y(); } }");
    expect(bloqueDesde("nada", "a={")).toBeNull();
  });
  it("no toma por código lo que solo se menciona en un comentario", () => {
    expect(sinComentarios("// destinoDelEnter(paradas)\n  x();\n/* select() */ y(); {/* .rc-pie-sigue */}")).not.toMatch(/destinoDelEnter|select|rc-pie-sigue/);
  });
});

describe("Enter del contador: nunca abre un modelo que ya tiene cantidad", () => {
  const onEnter = bloqueDesde(fuente("ContarEnvio.tsx"), "onEnter={() =>") ?? "";

  it("(a) pide el destino a destinoDelEnter con lo que la lista muestra, sin calcular el siguiente a mano", () => {
    expect(onEnter, "no se encontró el onEnter del contador en ContarEnvio.tsx").not.toBe("");
    expect(onEnter).toMatch(/destinoDelEnter\(\s*paradas\s*,/);
    expect(onEnter).not.toMatch(/siguientePendiente|primeroPorContar|findIndex|indexOf|\+\s*1\s*\]/);
  });

  it("(b) sin destino, el cursor va al enlace del pie y, si no hay, a «Revisar y cerrar»; nunca al número", () => {
    const pie = onEnter.indexOf(".rc-pie-sigue");
    const cerrar = onEnter.indexOf('[data-guia="recepcion.pasar-a-cerrar"]');
    expect(pie, "el foco ya no busca .rc-pie-sigue").toBeGreaterThanOrEqual(0);
    expect(cerrar, "el foco ya no busca «Revisar y cerrar»").toBeGreaterThan(pie);
    expect(onEnter.slice(pie, cerrar)).toContain("??");
    expect(onEnter).not.toContain("rc-dial-numero");
  });
});

describe("tocar la fila del modelo que se cuenta no corta la cifra", () => {
  const fila = funcion(fuente("CategoriasAcordeon.tsx"), "FilaDeParada");

  it("(c) la fila pregunta conservaLaCifra con la fila activa, la caja del número y el botón principal, y hace preventDefault", () => {
    const alPresionar = bloqueDesde(fila, "onMouseDown={(e) =>") ?? "";
    expect(alPresionar, "la fila ya no tiene su onMouseDown").not.toBe("");
    const pregunta = bloqueDesde(alPresionar, "conservaLaCifra(") ?? "";
    expect(pregunta).toMatch(/filaActiva:\s*activa\b/);
    expect(pregunta).toMatch(/classList\.contains\(\s*"rc-dial-caja"\s*\)/);
    expect(pregunta).toMatch(/botonPrincipal:\s*e\.button\s*===\s*0/);
    expect(alPresionar.slice(alPresionar.indexOf("conservaLaCifra("))).toMatch(/\)\s*\)\s*e\.preventDefault\(\)/);
  });

  it("(d) el Dial no vuelve a seleccionar la cifra si la caja ya tiene el cursor", () => {
    const dial = fuente("Dial.tsx");
    const efecto = bloqueDesde(dial, /useEffect\(\(\)\s*=>\s*(?=\{[^}]*caja\.current\.select\(\))/) ?? "";
    expect(efecto, "no se encontró el efecto que selecciona la cifra en Dial.tsx").toContain("caja.current.select()");
    const corte = efecto.search(/document\.activeElement\s*===\s*caja\.current\)\s*return/);
    expect(corte, "falta el corte `document.activeElement === caja.current` antes de select()").toBeGreaterThanOrEqual(0);
    expect(corte).toBeLessThan(efecto.indexOf("caja.current.select()"));
  });
});

describe("una sola regla para el número del contador", () => {
  it("(e) la placa y la fila lo dibujan con contadorDeParada, sin calcularlo a mano", () => {
    const placa = fuente("PlacaDelModelo.tsx");
    expect(placa).toMatch(/const contadas = contadorDeParada\(parada\);/);
    const fila = funcion(fuente("CategoriasAcordeon.tsx"), "FilaDeParada");
    expect(fila).toMatch(/const contadas = contadorDeParada\(p\);/);
    for (const ts of [placa, fila]) expect(ts).not.toMatch(/\.contadas\s*:\s*sinIdentificarDelGrupo/);
  });
});

// Auditoría 2026-11-15: tres cableados que dejaban cerrar o contar lo que la base no tenía.
describe("lo que la base no tiene guardado no se cierra ni se cuenta de un toque", () => {
  it("(f) el cierre se frena con una línea cuyo guardado falló, no solo con una que está viajando", () => {
    const cerrar = fuente("CerrarEnvio.tsx");
    expect(cerrar).toMatch(/const noSePuedeCerrarTodavia = esperandoGuardar \|\| sinGuardar > 0;/);
    // Los dos caminos que cierran (pedir el cierre y cerrar) y el botón preguntan lo mismo.
    expect(cerrar.match(/if \(!guia\.puedeConfirmar \|\| noSePuedeCerrarTodavia\) return;/g) ?? []).toHaveLength(2);
    expect(cerrar).toMatch(/disabled=\{noSePuedeCerrarTodavia\}/);
    expect(cerrar).not.toMatch(/\|\| esperandoGuardar\) return;|disabled=\{esperandoGuardar\}/);
  });

  it("(g) la versión del envío es la más alta que se conoce: reabrir y volver a cerrar en la misma visita no manda la vieja", () => {
    const pantalla = fuente("RecibirContando.tsx");
    expect(pantalla).toMatch(/const version = Math\.max\(apertura\?\.version \?\? 0, detalle\.version\);/);
    expect(pantalla).not.toMatch(/apertura\?\.version \?\? detalle\.version/);
  });

  it("(h) la fila no ofrece «Llegaron las N» en una prenda por definir: la base rechaza ese conteo", () => {
    const fila = funcion(fuente("CategoriasAcordeon.tsx"), "FilaDeParada");
    expect(fila).toMatch(/const porDefinir = !!cat && esCategoriaPorDefinir\(cat\);/);
    expect(fila).toMatch(/const llegaron = !porDefinir && /);
  });
});

describe("la galería «¿Esta prenda ya existe?» no toma un corte por «no hay ninguna»", () => {
  it("(i) en todas las marcas pide la búsqueda CON su error, para decir «No se pudo buscar» y no ofrecer «Crearla como nueva»", () => {
    const galeria = sinComentarios(readFileSync(join(raiz, "..", "recepcion-envio", "ElegirPrendaExistente.tsx"), "utf8"));
    expect(galeria).toMatch(/await buscarParecidasEnTodasLasMarcas\(categoria\.id, busqueda\)/);
    expect(galeria).not.toMatch(/error:\s*null\s*\}\)\)/);
  });
});
