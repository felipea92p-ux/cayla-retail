import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// La hoja de la empresa aliada (Configuración ▸ Empresa y tiendas, ADR-0683), dos hallazgos de /chaos del 2026-11-21 (semilla 683):
// · NAV-04 (gravedad 3): Escape, el velo o Cancelar cerraban la hoja con todo lo escrito (nombre, RUC, tiendas, cuentas) sin preguntar.
// · TEC-06 (gravedad 4): al cerrarla, el foco caía en <body>: la hoja se monta sin «disparador» de Radix y `<Modal>` solo devuelve el foco
//   si se le dice adónde (`alCerrarEnfocar`). Con teclado había que recorrer otra vez toda la pantalla.
// Esta prueba vigila las dos cosas en el código; abrir la hoja en el navegador sigue siendo la prueba final (`/chaos`, NAV-04 y TEC-06).

const raiz = join(__dirname, "..", "components/vitrinas-sedes");
const hoja = readFileSync(join(raiz, "HojaEmpresaAliada.tsx"), "utf8");
const lista = readFileSync(join(raiz, "EmpresasAliadas.tsx"), "utf8");

describe("hoja de la empresa aliada: no se pierde lo escrito sin preguntar", () => {
  it("la hoja pregunta antes de cerrar con cambios, por `antesDeCerrar` (nunca por `onClose`)", () => {
    expect(hoja).toMatch(/useSalidaSinGuardar\(/);
    expect(hoja).toMatch(/antesDeCerrar=\{avisoSalida\.pedirAccion\}/);
    // Cancelar recibe el `cerrar` de <Modal>, que no pasa por `antesDeCerrar`: pregunta por su cuenta (en el navegador, sin esto se cerraba).
    expect(hoja).toMatch(/onClick=\{\(\) => avisoSalida\.pedirAccion\(cerrar\)\}/);
    // El candado general (`hojas-salida-sin-guardar.test.ts`) ya vigila que nadie la pase por `onClose`.
  });

  it("al guardar bien, la pregunta se retira antes de cerrar (si no, «¿Salir sin guardar?» saldría tras guardar)", () => {
    expect(hoja).toMatch(/retirarYa\(\)/);
  });
});

describe("hoja de la empresa aliada: al cerrarla, el foco vuelve al botón que la abrió", () => {
  it("la lista recuerda el botón al pulsarlo («Agregar» y el lápiz) y la hoja se lo pasa a <Modal>", () => {
    expect((lista.match(/origen\.current = e(\?)?\.currentTarget/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(lista).toMatch(/<HojaEmpresaAliada[\s\S]*?volverA=\{origen\}/);
    expect(hoja).toMatch(/alCerrarEnfocar=\{volverA\}/);
  });
});
