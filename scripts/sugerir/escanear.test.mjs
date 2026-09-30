import assert from "node:assert/strict";
import { test } from "node:test";
import { analizar, causasPosibles, clasificar, informe, superficies } from "./escanear.mjs";

const W = "apps/web/";
const P = `${W}app/(app)/`;

test("clasificar: un ejemplo de contenido es «ejemplo»; una orden o un número no dependen de lo elegido", () => {
  assert.equal(clasificar("Blusa Aurora"), "ejemplo");
  assert.equal(clasificar("Manga globo, botones forrados…"), "ejemplo");
  assert.equal(clasificar("Buscar por nombre…"), "instruccion");
  assert.equal(clasificar("Escribe el motivo"), "instruccion");
  assert.equal(clasificar("Elige una sede"), "instruccion");
  assert.equal(clasificar("0.00"), "numerico");
  assert.equal(clasificar("S/ 0.00"), "numerico");
  assert.equal(clasificar(""), "numerico");
});

test("superficies: un placeholder literal —con comillas o en llaves— es estático", () => {
  const t = [
    `<CampoTexto placeholder="Blusa Aurora" />`,
    `<CampoTexto placeholder={"Manga globo"} />`,
    "<CampoTexto placeholder={`Botones forrados`} />",
    `<input placeholder='Casaca Río' />`,
  ].join("\n");
  const s = superficies(t);
  assert.equal(s.length, 4);
  assert.ok(s.every((x) => x.estatica && x.tipo === "placeholder" && x.clase === "ejemplo"));
  assert.deepEqual(s.map((x) => x.texto), ["Blusa Aurora", "Manga globo", "Botones forrados", "Casaca Río"]);
  assert.deepEqual(s.map((x) => x.linea), [1, 2, 3, 4]);
});

test("superficies: lo que calcula una expresión es derivado, no estático (y un template con ${} tampoco es literal)", () => {
  const t = [
    `<CampoTexto placeholder={ejemploDe(categoria)} />`,
    "<CampoTexto placeholder={`Ej. ${categoria.nombre} Luna`} />",
    `<CampoTexto placeholder={esLider ? "Sede" : "Tu sede"} />`,
  ].join("\n");
  const s = superficies(t);
  assert.equal(s.length, 3);
  assert.ok(s.every((x) => !x.estatica && x.clase === "derivada"));
  assert.match(s[0].texto, /ejemploDe\(categoria\)/);
});

test("superficies: llaves anidadas dentro de la expresión no cortan la lectura antes de tiempo", () => {
  const s = superficies(`<CampoTexto placeholder={mapa[{ a: 1 }.a] ?? "x"} value={v} />`);
  assert.equal(s.length, 1);
  assert.equal(s[0].estatica, false);
});

test("superficies: «Ej. …» en un texto de ayuda cuenta; la palabra «ejemplo» dentro del código no", () => {
  const t = [
    `const TEXTOS = { tallas: { placeholder: "Ej. 44" } };`,
    `<p>Por ejemplo: cuello alto, manga larga</p>`,
    `{ejemplo && (<span />)}`,
    `// Ej. esto es un comentario`,
    ` * Ejemplo: otro comentario`,
  ].join("\n");
  const ej = superficies(t).filter((x) => x.tipo === "ejemplo-en-texto");
  assert.deepEqual(ej.map((x) => x.linea), [1, 2]);
});

test("superficies: un <datalist> o la prop sugerencias es una lista; sugerencias={expr} es derivada, ={false} no", () => {
  const t = [`<datalist id="x">`, `<Combo sugerencias={false} />`, `<Combo sugerencias={sugeridas} />`].join("\n");
  const s = superficies(t).filter((x) => x.tipo === "lista");
  assert.deepEqual(s.map((x) => [x.linea, x.estatica]), [[1, true], [2, true], [3, false]]);
});

test("causasPosibles: los useState de selección, no los de texto libre ni la función que cambia el estado", () => {
  const t = [
    `const [categoriaId, setCategoriaId] = useState("");`,
    `const [medioPago, setMedioPago] = useState("efectivo");`,
    `const [referencia, setReferencia] = useState("");`,
    `const [descripcion, setDescripcion] = useState("");`,
    `const [categoriaId2, setCategoriaId2] = useState("");`,
  ].join("\n");
  assert.deepEqual(causasPosibles(t), ["categoriaId", "medioPago", "categoriaId2"]);
});

test("analizar: en «tocadas» solo mira lo cambiado; una instrucción o un número no cuentan como sugerencia", () => {
  const archivos = new Map([
    [`${W}components/Form.tsx`, `const [categoriaId, setCategoriaId] = useState("");\n<CampoTexto placeholder="Blusa Aurora" />\n<CampoTexto placeholder="Buscar…" />\n<CampoTexto placeholder="0.00" />`],
    [`${W}components/Otro.tsx`, `<CampoTexto placeholder="Vestido Luna" />`],
    [`${P}productos/nuevo/page.tsx`, `import { Form } from "@/components/Form";`],
  ]);
  const r = analizar({ archivos, cambiados: new Set([`${W}components/Form.tsx`]) });
  assert.equal(r.filas.length, 1);
  assert.equal(r.filas[0].ruta, `${W}components/Form.tsx`);
  assert.equal(r.filas[0].superficies.length, 1);
  assert.equal(r.filas[0].superficies[0].texto, "Blusa Aurora");
  assert.deepEqual(r.filas[0].causas, ["categoriaId"]);
  assert.deepEqual(r.filas[0].pantallas, ["/productos/nuevo"]);
  assert.equal(r.estaticas, 1);
  assert.equal(r.noEjemplos, 2);
});

test("analizar: --ruta trae lo que esa pantalla alcanza, y no lo de otra", () => {
  const archivos = new Map([
    [`${W}components/Form.tsx`, `<CampoTexto placeholder="Blusa Aurora" />`],
    [`${W}components/Ajeno.tsx`, `<CampoTexto placeholder="Vestido Luna" />`],
    [`${P}productos/nuevo/page.tsx`, `import { Form } from "@/components/Form";`],
    [`${P}otra/page.tsx`, `import { Ajeno } from "@/components/Ajeno";`],
  ]);
  const r = analizar({ archivos, soloRuta: "/productos/nuevo" });
  assert.deepEqual(r.filas.map((f) => f.ruta), [`${W}components/Form.tsx`]);
});

test("analizar: --archivo acepta la ruta corta; los archivos de components/ui no son «pantalla» pero sí se pueden pedir por nombre", () => {
  const archivos = new Map([[`${W}components/Form.tsx`, `<CampoTexto placeholder="Blusa Aurora" />`]]);
  assert.equal(analizar({ archivos, soloArchivo: "components/Form.tsx" }).filas.length, 1);
  assert.equal(analizar({ archivos, soloArchivo: "components/NoExiste.tsx" }).filas.length, 0);
});

test("analizar: un archivo que lo usan muchas pantallas sale marcado como compartido", () => {
  const archivos = new Map([[`${W}components/Comun.tsx`, `<CampoTexto placeholder="Blusa Aurora" />`]]);
  for (const n of ["a", "b", "c"]) archivos.set(`${P}${n}/page.tsx`, `import { Comun } from "@/components/Comun";`);
  assert.equal(analizar({ archivos, soloArchivo: "components/Comun.tsx", umbral: 3 }).filas[0].compartido, true);
  assert.equal(analizar({ archivos, soloArchivo: "components/Comun.tsx", umbral: 4 }).filas[0].compartido, false);
});

test("informe: dice qué es estático y cuál es la causa; sin nada, lo dice", () => {
  const archivos = new Map([[`${W}components/Form.tsx`, `const [categoriaId, setCategoriaId] = useState("");\n<CampoTexto placeholder="Blusa Aurora" />`]]);
  const con = informe(analizar({ archivos, cambiados: new Set([`${W}components/Form.tsx`]) }), { alcance: "tocadas", base: "origin/main", nCambiados: 1 });
  assert.match(con, /ESTÁTICA {2}placeholder: Blusa Aurora/);
  assert.match(con, /categoriaId/);
  assert.match(con, /1 ejemplo\(s\) estático\(s\)/);
  const vacio = informe(analizar({ archivos: new Map(), cambiados: new Set() }), { alcance: "tocadas", base: "origin/main", nCambiados: 0 });
  assert.match(vacio, /Ninguna superficie/);
});

test("clasificar: «—», «¿Por qué…?», «Escanea…» y «Detalle…» son instrucciones o vacíos, no ejemplos", () => {
  assert.equal(clasificar("—"), "numerico");
  assert.equal(clasificar("¿Por qué se descuenta?"), "instruccion");
  assert.equal(clasificar("Por qué se anula"), "instruccion");
  assert.equal(clasificar("Escanea la etiqueta o busca la prenda"), "instruccion");
  assert.equal(clasificar("Detalle libre del ajuste"), "instruccion");
  assert.equal(clasificar("Obligatorio"), "instruccion");
  assert.equal(clasificar("Casaca Río"), "ejemplo");
});

test("sugerir-fijo: un ejemplo marcado con su motivo, en su línea o en la de arriba, deja de contar como estático", () => {
  const t = [
    `<input placeholder="Textil Andina SAC" /> {/* sugerir-fijo: razón social de un proveedor, no depende de lo elegido */}`,
    `// sugerir-fijo: el hex es un ejemplo de formato, no de contenido`,
    `<input placeholder="#c9b79c" />`,
    `<input placeholder="Blusa Aurora" />`,
  ].join("\n");
  const s = superficies(t);
  assert.deepEqual(s.map((x) => x.clase), ["fijo", "fijo", "ejemplo"]);
  assert.match(s[0].motivo, /razón social de un proveedor/);
  assert.doesNotMatch(s[0].motivo, /\*\/|\}/);
  assert.equal(s[2].estatica, true);
});

test("sugerir-fijo: sin motivo real (una palabra suelta) no cuenta", () => {
  const s = superficies(`<input placeholder="Blusa Aurora" /> {/* sugerir-fijo: ok */}`);
  assert.equal(s[0].clase, "ejemplo");
});

test("analizar: lo marcado como fijo no suma a los estáticos, pero el archivo sigue apareciendo con su motivo", () => {
  const archivos = new Map([[`${W}components/F.tsx`, `<input placeholder="Textil Andina SAC" /> {/* sugerir-fijo: razón social de un proveedor, no depende de nada */}`]]);
  const r = analizar({ archivos, cambiados: new Set([`${W}components/F.tsx`]) });
  assert.equal(r.estaticas, 0);
  assert.equal(r.filas.length, 1);
  assert.match(informe(r, { alcance: "tocadas", base: "origin/main", nCambiados: 1 }), /✓ fijo .*razón social de un proveedor/);
});
