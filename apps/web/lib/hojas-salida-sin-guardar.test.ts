import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Candado de «¿Salir sin guardar?» en las hojas (ADR-0136; hallazgo de /pantalla produccion-ordenes-nueva, 2026-10-13).
//
// El defecto. `<Modal>` anima su salida y RECIÉN DESPUÉS llama a `onClose`. Una hoja que pasa su pregunta por `onClose`
// (`onClose={() => salida.pedirAccion(cerrar)}`) la hace con la hoja YA CERRADA: Escape o un clic fuera muestran «¿Salir sin
// guardar?» sobre la pantalla de atrás y, con «Seguir editando», la hoja queda invisible pero abierta (en el DOM, con lo escrito
// intacto) y el diálogo sigue capturando la interacción: el menú y los botones dejan de responder hasta recargar y lo escrito se
// pierde. Se probó en el navegador el 2026-10-13 en «Nueva orden de producción»; «Registrar gasto» tenía el mismo patrón. Plan de
// campaña ya lo había arreglado el 2026-10-10 y `Modal.tsx` lo documenta en `antesDeCerrar`.
//
// La regla. Un `<Modal>` que pregunta antes de descartar lo hace por `antesDeCerrar={salida.pedirAccion}` (recibe el cierre animado
// y decide si lo llama), nunca por `onClose`. El botón «Cancelar» de adentro sí puede llamar `pedirAccion(...)` por su cuenta.
//
// Contrato. PROMETE: que ningún `<Modal>` de `components/` o `app/` pase `pedirAccion` ni `pedirSalir` dentro de su `onClose`.
// ASUME: la hoja es el `<Modal>` de `components/ui/Modal` y la pregunta viene de `useSalidaSinGuardar`. NO PROMETE: que cada hoja
// con campos pregunte (eso lo pide la casilla del PR y `/chaos`); abrir la hoja en el navegador sigue siendo la prueba final.

/** Las etiquetas `<Modal …>` de un archivo, con sus props completas (el `>` de una flecha `=>` dentro de `{}` no cierra la etiqueta). */
export function etiquetasModal(fuente: string): string[] {
  const salida: string[] = [];
  let desde = 0;
  for (;;) {
    const i = fuente.indexOf("<Modal", desde);
    if (i < 0) break;
    desde = i + 6;
    // `<ModalRuta`, `<Modals`… no son un `<Modal`: la letra que sigue no puede ser parte de un nombre.
    if (/[A-Za-z0-9_]/.test(fuente[i + 6] ?? "")) continue;
    let profundidad = 0;
    let comilla: string | null = null;
    let j = i + 6;
    for (; j < fuente.length; j++) {
      const c = fuente[j];
      if (comilla) {
        if (c === "\\") j++;
        else if (c === comilla) comilla = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") comilla = c;
      else if (c === "{") profundidad++;
      else if (c === "}") profundidad--;
      else if (c === ">" && profundidad === 0) break;
    }
    salida.push(fuente.slice(i, j + 1));
  }
  return salida;
}

/** El valor de una prop `nombre={…}` dentro de una etiqueta, o null si no está. */
export function valorDeProp(etiqueta: string, nombre: string): string | null {
  const m = new RegExp(`\\b${nombre}=\\{`).exec(etiqueta);
  if (!m) return null;
  let profundidad = 1;
  for (let j = m.index + m[0].length; j < etiqueta.length; j++) {
    if (etiqueta[j] === "{") profundidad++;
    else if (etiqueta[j] === "}" && --profundidad === 0) return etiqueta.slice(m.index + m[0].length, j);
  }
  return null;
}

/** ¿Esta etiqueta pasa la pregunta de salida por `onClose`? (el defecto). */
export function preguntaPorOnClose(etiqueta: string): boolean {
  const alCerrar = valorDeProp(etiqueta, "onClose");
  return alCerrar !== null && /\b(pedirAccion|pedirSalir)\b/.test(alCerrar);
}

const RAICES = ["components", "app"];
const ARCHIVOS = RAICES.flatMap((raiz) => {
  const dir = new URL(`../${raiz}/`, import.meta.url);
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ ruta: `${raiz}/${f}`, fuente: readFileSync(new URL(f, dir), "utf8") }));
}).filter(({ fuente }) => fuente.includes("useSalidaSinGuardar"));

describe("el escáner distingue lo bueno de lo malo (casos escritos a mano)", () => {
  it("marca la pregunta pasada por onClose, también en varias líneas y con una flecha dentro", () => {
    expect(preguntaPorOnClose(`<Modal titulo="x" onClose={() => avisoSalida.pedirAccion(onClose)} ancho="max-w-2xl">`)).toBe(true);
    expect(preguntaPorOnClose(`<Modal\n  variante="hoja"\n  titulo={titulo}\n  onClose={() => {\n    salida.pedirSalir("/x");\n  }}\n>`)).toBe(true);
  });
  it("no marca la forma buena (antesDeCerrar) ni un onClose sin pregunta", () => {
    expect(preguntaPorOnClose(`<Modal titulo="x" onClose={onClose} antesDeCerrar={avisoSalida.pedirAccion}>`)).toBe(false);
    expect(preguntaPorOnClose(`<Modal titulo="x" onClose={() => setAbierta(false)} antesDeCerrar={(cerrar) => pedirAccion(cerrar)}>`)).toBe(false);
    expect(preguntaPorOnClose(`<Modal titulo="x" onClose={onCerrar}>`)).toBe(false);
  });
  it("la etiqueta se corta donde cierra de verdad: una flecha `=>` dentro de llaves no la cierra", () => {
    const e = etiquetasModal(`return <Modal a={() => 1} b="c>d">hijo <b>negrita</b></Modal>;`);
    expect(e).toEqual([`<Modal a={() => 1} b="c>d">`]);
  });
  it("`<ModalRuta` y otros nombres que empiezan igual no cuentan como `<Modal`", () => {
    expect(etiquetasModal(`<ModalRuta onClose={() => pedirAccion(x)}>`)).toEqual([]);
  });
});

describe("ninguna hoja pregunta «¿Salir sin guardar?» por onClose", () => {
  it("encuentra las hojas que usan el hook (no mira una carpeta vacía) y a las que ya lo hacen bien", () => {
    const rutas = ARCHIVOS.map((a) => a.ruta);
    expect(rutas).toContain("components/GastoRapidoModal.tsx");
    expect(rutas).toContain("components/plan-compra/PlanCategoriaModal.tsx");
    expect(rutas).toContain("components/NuevaOrdenProduccionForm.tsx");
  });

  it.each(ARCHIVOS.map((a) => [a.ruta, a.fuente] as const))("%s", (ruta, fuente) => {
    const malas = etiquetasModal(fuente).filter(preguntaPorOnClose);
    expect(
      malas,
      `${ruta}: este <Modal> pasa la pregunta por \`onClose\`, que corre DESPUÉS de animar la salida: con «Seguir editando» la hoja queda invisible y la pantalla deja de responder. ` +
        "Usa `antesDeCerrar={salida.pedirAccion}` (ver Modal.tsx) y deja `onClose` para cerrar de verdad."
    ).toEqual([]);
  });
});
