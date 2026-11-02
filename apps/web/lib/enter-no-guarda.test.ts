import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hayQueFrenarElEnter } from "../components/ui/enterNoGuarda";

// Guardar es un acto explícito: un Enter de costumbre no crea un avío, una tela ni una orden.
//
// EL PROBLEMA (medido en el navegador el 2026-10-31, con teclado de verdad). En HTML, un `<form>` con un botón
// `type="submit"` se envía al pulsar Enter en CUALQUIER `<input>` de texto de adentro. En «Nuevo avío», con la hoja
// completa, **un solo Enter en el campo del nombre creaba el avío y cerraba la hoja** — y esa hoja fija la unidad
// para siempre al primer lote. `/chaos` lo había encontrado y se lo atribuyó al combo; la medición dice que no: el
// combo solo es una de las puertas, y la grande es el envío implícito del formulario.
//
// LA REGLA no es nueva: este mismo gesto estaba copiado A MANO en SEIS formularios del repo, con sus comentarios
// diciendo lo mismo («Crear un producto es un acto explícito»; «Enter NUNCA envía el formulario desde una celda»).
// Lo que faltaba era que fuera UNA pieza y que las hojas que la necesitan la tuvieran.
//
// Decide por `tagName`, un texto, y no con `instanceof HTMLInputElement`: las pruebas de este repo corren SIN DOM,
// y una regla que no se puede probar no es una regla.

describe("qué Enter se frena", () => {
  it("el de un campo de texto, que es el que envía el formulario sin que nadie lo pida", () => {
    expect(hayQueFrenarElEnter("Enter", "INPUT", false)).toBe(true);
  });
  it("el de un textarea NO: ahí Enter es un salto de línea", () => {
    expect(hayQueFrenarElEnter("Enter", "TEXTAREA", false)).toBe(false);
  });
  it("el de un botón NO: ahí Enter ES «pulsa esto», incluido el de guardar", () => {
    expect(hayQueFrenarElEnter("Enter", "BUTTON", false)).toBe(false);
  });
  it("uno que otro control ya usó (un combo que eligió de su lista) se deja en paz", () => {
    expect(hayQueFrenarElEnter("Enter", "INPUT", true)).toBe(false);
  });
  it("y ninguna otra tecla se toca", () => {
    for (const t of ["Tab", "Escape", "ArrowDown", " ", "a", "NumpadEnter"]) {
      expect(hayQueFrenarElEnter(t, "INPUT", false), t).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// El candado: que no nazca la hoja número once
// ---------------------------------------------------------------------------------------------------------------
// Seis formularios lo tenían copiado a mano y diez hojas que guardan algo caro no lo tenían. Esta prueba exige que
// toda hoja con un `<form onSubmit>` lleve la guardia; lo que de verdad quiere enviarse con Enter (un buscador, el
// login) se declara abajo, con su motivo.

const FUERA: Record<string, string> = {
  "components/BuscadorVentas.tsx": "es un buscador: Enter ES buscar",
  "components/asistente/Asistente.tsx": "se le habla escribiendo; Enter manda la frase",
  "app/(app)/buscar/page.tsx": "formulario de búsqueda nativo (method=get)",
  "app/login/page.tsx": "entrar con Enter es lo que espera cualquiera",
};

const ARCHIVOS = ["components", "app"].flatMap((raiz) => {
  const dir = new URL(`../${raiz}/`, import.meta.url);
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ ruta: `${raiz}/${f}`, fuente: readFileSync(new URL(f, dir), "utf8") }));
});

/** Un formulario que guarda: tiene `<form` y un `onSubmit`. */
const CON_FORM = ARCHIVOS.filter((a) => /<form[\s>]/.test(a.fuente) && a.fuente.includes("onSubmit"));

describe("ninguna hoja que guarda se envía con un Enter de costumbre", () => {
  it("el escáner encuentra los formularios (si no, no vigila nada)", () => {
    expect(CON_FORM.length).toBeGreaterThan(20);
    expect(CON_FORM.map((a) => a.ruta)).toContain("components/insumos-taller/NuevoAvioModal.tsx");
  });

  // La deuda de antes de la regla. Son 146 formularios y repartirlos es un despliegue módulo por módulo, no un PR:
  // este cierra las hojas de Insumos y Compras que `/chaos` señaló, y deja contadas las demás. **Una hoja NUEVA no
  // puede nacer aquí**: el número solo baja, y si sube, esta prueba se pone en rojo y dice cuál se coló.
  const PENDIENTES_HOY = 130;

  it("una hoja nueva que guarda no puede nacer sin la guardia", () => {
    const sinGuardia = CON_FORM.filter((a) => !a.fuente.includes("enterNoGuarda") && !(a.ruta in FUERA)).map((a) => a.ruta);
    expect(
      sinGuardia.length,
      sinGuardia.length > PENDIENTES_HOY
        ? `Hay ${sinGuardia.length} formularios sin la guardia del Enter y antes había ${PENDIENTES_HOY}. Si el tuyo es nuevo, ponle «onKeyDown={enterNoGuarda}» al <form>; si de verdad tiene que enviarse con Enter, decláralo en FUERA con su motivo.`
        : `Quedan ${sinGuardia.length} y la cuenta dice ${PENDIENTES_HOY}: baja PENDIENTES_HOY a ${sinGuardia.length}.`,
    ).toBe(PENDIENTES_HOY);
  });

  it("las hojas que `/chaos` señaló ya la llevan", () => {
    const cerradas = [
      "components/insumos-taller/NuevoAvioModal.tsx",
      "components/insumos-taller/NuevaTelaModal.tsx",
      "components/insumos-taller/EditarTelaModal.tsx",
      "components/ordenes-compra/NuevaOrdenCompra.tsx",
      "components/ordenes-insumo/NuevaOrdenInsumo.tsx",
      "components/ordenes-compra/GastoDelViaje.tsx",
      "components/mi-plata/PapelesPorCompletar.tsx",
      "components/RolesModales.tsx",
      "components/RecepcionEnvio.tsx",
      "components/conteo/AltaAlVuelo.tsx",
    ];
    for (const ruta of cerradas) {
      const a = ARCHIVOS.find((x) => x.ruta === ruta);
      expect(a, `${ruta} ya no existe`).toBeTruthy();
      expect(a!.fuente.includes("enterNoGuarda"), `${ruta} perdió la guardia del Enter`).toBe(true);
    }
  });

  it("y las seis que ya lo hacían a mano usan la pieza, no su copia", () => {
    // ADR-0358, «una función, una pieza»: el mismo gesto copiado seis veces era seis sitios donde se podía quedar atrás.
    for (const ruta of [
      "components/ProductoForm.tsx",
      "components/NuevoProductoForm.tsx",
      "components/ordenes-compra/RegistrarComprobanteOrden.tsx",
      "components/ordenes-insumo/RegistrarComprobanteOrdenInsumo.tsx",
      "components/recepcion-envio/FormularioRecepcion.tsx",
      "components/recepcion-envio/HojaPrenda.tsx",
    ]) {
      const a = ARCHIVOS.find((x) => x.ruta === ruta);
      expect(a, `${ruta} ya no existe`).toBeTruthy();
      expect(a!.fuente.includes("enterNoGuarda"), `${ruta} todavía trae su copia a mano`).toBe(true);
    }
  });

  it("y lo que está fuera sigue existiendo (una exención de un archivo borrado es ruido)", () => {
    for (const ruta of Object.keys(FUERA)) {
      expect(ARCHIVOS.map((a) => a.ruta), `${ruta} ya no existe: quítalo de FUERA`).toContain(ruta);
    }
  });
});
