import assert from "node:assert/strict";
import { test } from "node:test";
import { analizar, contarControles, DEFINEN_LA_GUIA, esModal, importsDe, informe, parsearRegistro, resolverImport, rutaDePagina, tieneCampos, tieneGuia } from "./escanear.mjs";

const W = "apps/web/";
const P = `${W}app/(app)/`;

test("rutaDePagina: la ruta sale de la carpeta; Inicio es «/»; lo que no es page.tsx no es pantalla", () => {
  assert.equal(rutaDePagina(`${P}page.tsx`), "/");
  assert.equal(rutaDePagina(`${P}vender/page.tsx`), "/vender");
  assert.equal(rutaDePagina(`${P}productos/[id]/editar/page.tsx`), "/productos/[id]/editar");
  assert.equal(rutaDePagina(`${P}productos/layout.tsx`), null);
  assert.equal(rutaDePagina(`${W}components/Algo.tsx`), null);
});

test("importsDe lee import, export from e import() dinámico", () => {
  const t = `import { A } from "@/components/A";\nimport type { B } from "./B";\nexport { C } from '../C';\nconst D = dynamic(() => import("@/components/D"));\nimport x from "react";`;
  assert.deepEqual(importsDe(t).sort(), ["../C", "./B", "@/components/A", "@/components/D", "react"].sort());
});

test("resolverImport: alias @/, relativos, index, y los de afuera dan null", () => {
  const archivos = new Map([
    [`${W}components/A.tsx`, ""],
    [`${W}lib/util.ts`, ""],
    [`${W}components/carpeta/index.tsx`, ""],
    [`${P}vender/local.tsx`, ""],
  ]);
  assert.equal(resolverImport(`${P}vender/page.tsx`, "@/components/A", archivos), `${W}components/A.tsx`);
  assert.equal(resolverImport(`${P}vender/page.tsx`, "@/lib/util", archivos), `${W}lib/util.ts`);
  assert.equal(resolverImport(`${P}vender/page.tsx`, "@/components/carpeta", archivos), `${W}components/carpeta/index.tsx`);
  assert.equal(resolverImport(`${P}vender/page.tsx`, "./local", archivos), `${P}vender/local.tsx`);
  assert.equal(resolverImport(`${P}vender/page.tsx`, "react", archivos), null);
  assert.equal(resolverImport(`${P}vender/page.tsx`, "@/components/NoExiste", archivos), null);
});

test("tieneCampos: un control en JSX cuenta; un comentario o un texto no", () => {
  assert.equal(tieneCampos("<CampoTexto etiqueta='x' />"), true);
  assert.equal(tieneCampos("<input type='text' />"), true);
  assert.equal(tieneCampos("<ComboBuscable valor={v} />"), true);
  assert.equal(tieneCampos("<form onSubmit={x}>"), true);
  assert.equal(tieneCampos("// un Campo de texto y un input, sin JSX"), false);
  assert.equal(tieneCampos("<Tabla filas={f} />"), false);
});

test("tieneGuia: cuenta el USO de las piezas, no clases ni nombres parecidos", () => {
  assert.equal(tieneGuia("<FaltanDelPaso faltan={f} />"), true);
  assert.equal(tieneGuia("<TiraFicha pendientes={p} />"), true);
  assert.equal(tieneGuia("<EtiquetaAhora />"), true);
  assert.equal(tieneGuia("const g = useGuiaAlta();"), true);
  assert.equal(tieneGuia("irAlIdCampo(id)"), true);
  assert.equal(tieneGuia('import { x } from "@/lib/compra-guia";'), true);
  // las piezas de los modales
  assert.equal(tieneGuia("const guia = useGuiaCampos([]);"), true);
  assert.equal(tieneGuia('<CampoGuiado id="a" guia={guia}>'), true);
  assert.equal(tieneGuia("<PieGuia guia={guia} />"), true);
  // falsos positivos que se vieron en el repo: no son la guía de foco
  assert.equal(tieneGuia('<div className="fin-guia">'), false);
  assert.equal(tieneGuia('<label htmlFor="recepcion-guia">'), false);
  assert.equal(tieneGuia("// la MarcaCampo es una pieza"), false);
});

test("parsearRegistro lee los tres estados del registro", () => {
  const texto = `
    "/": PENDIENTE,
    "/productos/nuevo": { estado: "aplicada", evidencia: ["components/NuevoProductoForm.tsx"] },
    "/sin-acceso": { estado: "no-aplica", motivo: "Solo muestra un mensaje." },
    "/vender": PENDIENTE,
  `;
  const r = parsearRegistro(texto);
  assert.equal(r.get("/"), "pendiente");
  assert.equal(r.get("/productos/nuevo"), "aplicada");
  assert.equal(r.get("/sin-acceso"), "no-aplica");
  assert.equal(r.get("/vender"), "pendiente");
  assert.equal(r.size, 4);
});

test("parsearRegistro lee también los modales (claves «components/…» y «app/…»), con el comentario al final", () => {
  const texto = `
    "components/NuevaClientaModal.tsx": { estado: "aplicada", evidencia: ["components/NuevaClientaModal.tsx"] },
    "components/TrasladoCerrarModal.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
    "app/(app)/x/Modal.tsx": { estado: "no-aplica", motivo: "Un solo campo, no hay camino." },
  `;
  const r = parsearRegistro(texto);
  assert.equal(r.get("components/NuevaClientaModal.tsx"), "aplicada");
  assert.equal(r.get("components/TrasladoCerrarModal.tsx"), "pendiente");
  assert.equal(r.get("app/(app)/x/Modal.tsx"), "no-aplica");
});

test("esModal y contarControles", () => {
  assert.equal(esModal('<Modal titulo="x" onClose={c}>'), true);
  assert.equal(esModal("<ModalRuta titulo='x' />"), true);
  assert.equal(esModal("<Dialog.Content>"), true);
  assert.equal(esModal("// un modal cualquiera, sin JSX"), false);
  assert.equal(contarControles('<CampoTexto etiqueta="a" /><CampoSelect /><input /><Tabla />'), 3);
  assert.equal(contarControles("<Tabla />"), 0);
});

// Un mini-ERP: /a con formulario sin guía, /b con formulario con guía, /c solo un listado, /d y /e comparten un combo.
function mundo() {
  return new Map([
    [`${P}a/page.tsx`, `import { FormA } from "@/components/FormA"; import { ModalSinGuia } from "@/components/ModalSinGuia"; export default () => <><FormA /><ModalSinGuia /></>;`],
    [`${W}components/FormA.tsx`, `export const FormA = () => <CampoTexto etiqueta="x" />;`],
    [`${P}b/page.tsx`, `import { FormB } from "@/components/FormB"; import { ModalConGuia } from "@/components/ModalConGuia"; export default () => <><FormB /><ModalConGuia /></>;`],
    [`${W}components/FormB.tsx`, `export const FormB = () => <><CampoTexto etiqueta="x" /><FaltanDelPaso faltan={[]} /></>;`],
    [`${P}c/page.tsx`, `import { Lista } from "@/components/Lista"; export default () => <Lista />;`],
    [`${W}components/Lista.tsx`, `export const Lista = () => <Tabla filas={[]} />;`],
    [`${P}d/page.tsx`, `import { Combo } from "@/components/Combo"; export default () => <Combo />;`],
    [`${P}e/page.tsx`, `import { Combo } from "@/components/Combo"; export default () => <Combo />;`],
    [`${W}components/Combo.tsx`, `export const Combo = () => <ComboBuscable valor="" />;`],
    [`${W}components/ModalSuelto.tsx`, `export const ModalSuelto = () => <CampoTexto etiqueta="y" />;`],
    [`${W}components/ModalSinGuia.tsx`, `export const ModalSinGuia = () => <Modal titulo="m"><CampoTexto etiqueta="q" /><CampoTexto etiqueta="r" /></Modal>;`],
    [`${W}components/ModalConGuia.tsx`, `export const ModalConGuia = () => { const guia = useGuiaCampos([]); return <Modal titulo="m"><CampoGuiado id="q" guia={guia}><CampoTexto etiqueta="q" /></CampoGuiado></Modal>; };`],
    [`${W}components/guia-de-foco/CampoGuiado.tsx`, `export const CampoGuiado = () => <ConMarca />;`],
    [`${W}components/alta-producto/guia.tsx`, `export const MarcaCampo = () => <span />; export const X = () => <MarcaCampo />;`],
    [`${W}components/ui/campos.tsx`, `export const CampoTexto = () => <input />;`],
  ]);
}
const registro = new Map([
  ["/a", "pendiente"],
  ["/b", "pendiente"],
  ["/c", "pendiente"],
  ["/d", "aplicada"],
]);

test("analizar (tocadas): una pantalla con campos y sin guía sale «sin-guia» y solo se listan las tocadas", () => {
  const r = analizar({ archivos: mundo(), cambiados: new Set([`${W}components/FormA.tsx`]), registro, umbral: 2 });
  assert.deepEqual(r.pantallas.map((p) => [p.ruta, p.veredicto]), [["/a", "sin-guia"]]);
  assert.deepEqual(r.pantallas[0].tocados, [`${W}components/FormA.tsx`]);
});

test("analizar: con campos y con las piezas usadas, «con-guia»; y si el registro la tiene «pendiente», se pide promoverla", () => {
  const r = analizar({ archivos: mundo(), cambiados: new Set([`${W}components/FormB.tsx`]), registro, umbral: 2 });
  assert.equal(r.pantallas[0].veredicto, "con-guia");
  assert.equal(r.pantallas[0].registroAjuste, "promover-a-aplicada");
});

test("analizar: sin campos es «no-aplica»", () => {
  const r = analizar({ archivos: mundo(), cambiados: new Set([`${W}components/Lista.tsx`]), registro, umbral: 2 });
  assert.equal(r.pantallas[0].veredicto, "no-aplica");
});

test("analizar: una pantalla que falta en el registro se avisa", () => {
  const r = analizar({ archivos: mundo(), cambiados: new Set([`${W}components/FormA.tsx`]), registro: new Map(), umbral: 2 });
  assert.equal(r.pantallas[0].registroAjuste, "falta-en-el-registro");
});

test("analizar: lo compartido por muchas pantallas no las marca al tocarlo, ni cuenta como sus campos", () => {
  const r = analizar({ archivos: mundo(), cambiados: new Set([`${W}components/Combo.tsx`]), registro, umbral: 2 });
  assert.ok(r.compartidos.includes(`${W}components/Combo.tsx`));
  assert.deepEqual(r.pantallas, []);
});

test("analizar: la UI base (components/ui) no marca pantallas", () => {
  const r = analizar({ archivos: mundo(), cambiados: new Set([`${W}components/ui/campos.tsx`]), registro, umbral: 2 });
  assert.deepEqual(r.pantallas, []);
});

test("analizar: un archivo con campos que no llega a ninguna pantalla se avisa aparte", () => {
  const r = analizar({ archivos: mundo(), cambiados: new Set([`${W}components/ModalSuelto.tsx`]), registro, umbral: 2 });
  assert.deepEqual(r.pantallas, []);
  assert.deepEqual(r.sueltos, [{ archivo: `${W}components/ModalSuelto.tsx`, conGuia: false }]);
});

test("analizar (todas): recorre todas las pantallas aunque no se haya tocado nada", () => {
  const r = analizar({ archivos: mundo(), cambiados: new Set(), registro, alcance: "todas", umbral: 3 });
  assert.deepEqual(r.pantallas.map((p) => [p.ruta, p.veredicto]), [["/a", "sin-guia"], ["/b", "con-guia"], ["/c", "no-aplica"], ["/d", "sin-guia"], ["/e", "sin-guia"]]);
});

test("analizar: los archivos que definen la guía no cuentan como «tener guía»", () => {
  const archivos = mundo();
  archivos.set(`${W}components/FormA.tsx`, `import { X } from "@/components/alta-producto/guia"; export const FormA = () => <CampoTexto etiqueta="x" />;`);
  assert.ok(DEFINEN_LA_GUIA.has(`${W}components/alta-producto/guia.tsx`));
  const r = analizar({ archivos, cambiados: new Set([`${W}components/FormA.tsx`]), registro, umbral: 3 });
  assert.equal(r.pantallas[0].veredicto, "sin-guia");
});

test("analizar (--ruta): solo esa pantalla", () => {
  const r = analizar({ archivos: mundo(), registro, alcance: "todas", soloRuta: "/b", umbral: 3 });
  assert.deepEqual(r.pantallas.map((p) => p.ruta), ["/b"]);
});

test("informe: dice cuántas hay sin guía y las lista", () => {
  const r = analizar({ archivos: mundo(), cambiados: new Set([`${W}components/FormA.tsx`, `${W}components/ModalSuelto.tsx`]), registro, umbral: 3 });
  const t = informe(r, { alcance: "tocadas", base: "origin/main", nCambiados: 2 });
  assert.match(t, /1 SIN guía/);
  assert.match(t, /## Sin guía — hay que hacerla/);
  assert.match(t, /`\/a`/);
  assert.match(t, /Archivos con campos que no llegan a ninguna pantalla/);
});

test("modales: cada archivo que dibuja un <Modal> con campos se mira aparte, con su veredicto y desde qué pantallas se abre", () => {
  const r = analizar({ archivos: mundo(), cambiados: new Set([`${W}components/ModalSinGuia.tsx`, `${W}components/ModalConGuia.tsx`]), registro: new Map([["components/ModalConGuia.tsx", "pendiente"]]), umbral: 3 });
  assert.deepEqual(r.modales.map((m) => [m.archivo.replace(W, ""), m.veredicto]), [["components/ModalConGuia.tsx", "con-guia"], ["components/ModalSinGuia.tsx", "sin-guia"]]);
  const sin = r.modales.find((m) => m.veredicto === "sin-guia");
  assert.equal(sin.controles, 2);
  assert.deepEqual(sin.pantallas, ["/a"]);
  assert.equal(sin.registroAjuste, "falta-en-el-registro");
  assert.equal(r.modales.find((m) => m.veredicto === "con-guia").registroAjuste, "promover-a-aplicada");
});

test("modales: sus campos NO cuentan para la pantalla que los abre (ni su guía la salva)", () => {
  // /a solo trae campos propios en FormA (sin guía) y un modal SIN guía; /b tiene un modal CON guía: la pantalla /b no se vuelve «con guía» por eso.
  const r = analizar({ archivos: mundo(), cambiados: new Set(), registro, alcance: "todas", umbral: 3 });
  const por = Object.fromEntries(r.pantallas.map((p) => [p.ruta, p]));
  assert.equal(por["/a"].veredicto, "sin-guia");
  assert.ok(!por["/a"].conCampos.some((f) => f.includes("ModalSinGuia")));
  assert.ok(!por["/b"].conGuia.some((f) => f.includes("ModalConGuia")));
});

test("modales: un modal que no se tocó no aparece en el alcance «tocadas» pero sí en «todas»; --ruta filtra por la pantalla", () => {
  const cambiados = new Set([`${W}components/FormA.tsx`]);
  assert.deepEqual(analizar({ archivos: mundo(), cambiados, registro, umbral: 3 }).modales, []);
  assert.equal(analizar({ archivos: mundo(), cambiados, registro, alcance: "todas", umbral: 3 }).modales.length, 2); // ModalSinGuia y ModalConGuia (ModalSuelto solo se llama así: no dibuja un <Modal>)
  const soloA = analizar({ archivos: mundo(), registro, alcance: "todas", soloRuta: "/a", umbral: 3 });
  assert.deepEqual(soloA.modales.map((m) => m.archivo.replace(W, "")), ["components/ModalSinGuia.tsx"]);
});

test("modales: los archivos que definen las piezas no cuentan como modales ni como «tener guía»", () => {
  assert.ok(DEFINEN_LA_GUIA.has(`${W}components/guia-de-foco/CampoGuiado.tsx`));
  assert.ok(DEFINEN_LA_GUIA.has(`${W}components/guia-de-foco/useGuiaCampos.tsx`));
});

test("informe: lista los modales sin guía y dice cuántos controles trae cada uno", () => {
  const r = analizar({ archivos: mundo(), cambiados: new Set([`${W}components/ModalSinGuia.tsx`]), registro: new Map(), umbral: 3 });
  const t = informe(r, { alcance: "tocadas", base: "origin/main", nCambiados: 1 });
  assert.match(t, /Modales: 0 con guía · 1 SIN guía/);
  assert.match(t, /modal `components\/ModalSinGuia\.tsx` \(2 controles\)/);
  assert.match(t, /\| Modal \| Registro \| Controles \| Se abre desde \|/);
});

test("analizar: cambiar una pieza de la guía o la lógica de lib/ no marca a las pantallas que la alcanzan", () => {
  const archivos = mundo();
  archivos.set(`${W}lib/logica.ts`, "export const x = 1;");
  archivos.set(`${W}components/FormA.tsx`, `import { x } from "@/lib/logica"; import { MarcaCampo } from "@/components/alta-producto/guia"; export const FormA = () => <CampoTexto etiqueta="x" />;`);
  const r = analizar({ archivos, cambiados: new Set([`${W}components/alta-producto/guia.tsx`, `${W}components/guia-de-foco/CampoGuiado.tsx`, `${W}lib/logica.ts`]), registro, umbral: 3 });
  assert.deepEqual(r.pantallas, []);
});
