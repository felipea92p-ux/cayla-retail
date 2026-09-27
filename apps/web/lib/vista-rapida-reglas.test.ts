import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pasoConFlecha, type TeclaEnCajon } from "./vista-rapida-reglas";

// En el cajón de Por pagar, un ↓ dentro de «Registrar pago» (el monto, un combo) subía por React hasta el cajón, que
// pasaba al comprobante siguiente: el pago se desmontaba con lo escrito y el cajón quedaba mostrando otra factura.
// Estas pruebas fijan qué flecha es del cajón y cuál queda para quien la recibió.

const boton = { tagName: "BUTTON", isContentEditable: false };

/** Una ↓ limpia con el foco en un botón del cajón (el «Cerrar» que Radix enfoca al abrirlo); `cambios` la ensucia. */
const tecla = (cambios: Partial<TeclaEnCajon> = {}): TeclaEnCajon => ({
  key: "ArrowDown",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
  nacioEnElCajon: true,
  destino: boton,
  ...cambios,
});

describe("pasoConFlecha — la flecha es del cajón", () => {
  it("↓ pasa al registro siguiente y ↑ al anterior", () => {
    expect(pasoConFlecha(tecla())).toBe(1);
    expect(pasoConFlecha(tecla({ key: "ArrowUp" }))).toBe(-1);
  });

  it("con el foco en el propio cajón, en un enlace o en «Pagar»: todos son botones o bloques, no campos", () => {
    expect(pasoConFlecha(tecla({ destino: { tagName: "DIV", isContentEditable: false } }))).toBe(1);
    expect(pasoConFlecha(tecla({ destino: { tagName: "A", isContentEditable: false } }))).toBe(1);
    expect(pasoConFlecha(tecla({ destino: { tagName: "svg" } }))).toBe(1);
  });
});

describe("pasoConFlecha — la tecla no es del cajón", () => {
  it("el bug de Por pagar: la ↓ que sube desde «Registrar pago» (otro portal) no cambia de comprobante", () => {
    expect(pasoConFlecha(tecla({ nacioEnElCajon: false }))).toBeNull();
    expect(pasoConFlecha(tecla({ nacioEnElCajon: false, key: "ArrowUp" }))).toBeNull();
    // Ni sobre un campo del modal ni sobre uno de sus botones, aunque ninguno la haya usado.
    expect(pasoConFlecha(tecla({ nacioEnElCajon: false, destino: { tagName: "INPUT" } }))).toBeNull();
  });

  it("un control que ya la usó se la queda: la lista de un combo, la grilla de una fecha, las fichas de medio de pago", () => {
    expect(pasoConFlecha(tecla({ defaultPrevented: true }))).toBeNull();
    expect(pasoConFlecha(tecla({ defaultPrevented: true, key: "ArrowUp" }))).toBeNull();
  });

  it("en un campo la flecha mueve el cursor o cambia el valor", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "input", "textarea", "select"]) {
      expect(pasoConFlecha(tecla({ destino: { tagName, isContentEditable: false } })), tagName).toBeNull();
    }
    expect(pasoConFlecha(tecla({ destino: { tagName: "DIV", isContentEditable: true } }))).toBeNull();
  });

  it("con Ctrl, ⌘ o Alt es un atajo del navegador o del sistema (⌘↓ baja al final)", () => {
    expect(pasoConFlecha(tecla({ ctrlKey: true }))).toBeNull();
    expect(pasoConFlecha(tecla({ metaKey: true }))).toBeNull();
    expect(pasoConFlecha(tecla({ altKey: true }))).toBeNull();
  });

  it("las demás teclas no son del cajón: ← →, Enter, Escape, Tab, letras", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "Enter", "Escape", "Tab", " ", "j", "k", "PageDown"]) {
      expect(pasoConFlecha(tecla({ key })), key).toBeNull();
    }
  });
});

// Candado (como lib/hojas-escape.test.ts con Escape): un cajón que arma su propio `Dialog.Content` y pasa de registro
// con flechas lo hace con `useFlechasDelCajon`, que aplica la regla de arriba. Si un cajón vuelve a leer `ArrowDown`
// a mano en su `onKeyDown`, el primer modal que abra desde adentro trae de vuelta el bug de Por pagar.
//
// Contrato. PROMETE: que ningún `.tsx` con `<Dialog.Content` compara teclas contra "ArrowDown"/"ArrowUp", y que las
// cuatro vistas rápidas usan el hook. ASUME: las hojas son `.tsx` bajo `components/` o `app/`. NO PROMETE: que el
// hook esté en el `onKeyDown` correcto; abrir un modal desde el cajón en el navegador sigue siendo la prueba final.
// Si una hoja necesita una lista propia con flechas, esa lista va en su propio componente (o es un combo del sistema).

const HOJAS = ["components", "app"].flatMap((raiz) => {
  const dir = new URL(`../${raiz}/`, import.meta.url);
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ ruta: `${raiz}/${f}`, fuente: readFileSync(new URL(f, dir), "utf8") }));
}).filter(({ fuente }) => fuente.includes("<Dialog.Content"));

const VISTAS_RAPIDAS = ["PorPagarVistaRapida", "ProveedorVistaRapida", "RecepcionVistaRapida", "NotaCreditoVistaRapida"].map((n) => `components/${n}.tsx`);

describe("los cajones pasan sus flechas por useFlechasDelCajon", () => {
  it.each(VISTAS_RAPIDAS)("%s usa el hook en su Dialog.Content", (ruta) => {
    const hoja = HOJAS.find((h) => h.ruta === ruta);
    expect(hoja, `${ruta}: no se encontró como hoja con <Dialog.Content`).toBeDefined();
    expect(hoja?.fuente).toContain("useFlechasDelCajon(");
    expect(hoja?.fuente).toContain("onKeyDown={alFlecha}");
  });

  it.each(HOJAS.map((h) => [h.ruta, h.fuente] as const))("%s no lee las flechas a mano", (ruta, fuente) => {
    expect(fuente, `${ruta}: las flechas de un cajón van por useFlechasDelCajon`).not.toMatch(/["']Arrow(Down|Up)["']/);
  });
});
