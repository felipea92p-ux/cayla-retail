import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Los proveedores que existen solo para pagar un servicio (luz, agua, internet: rubro «Gastos», ADR-0452) no se ofrecen donde se elige a
// quién se le COMPRA o se le RECIBE mercadería (actualización 2026-10-21, Felipe). Esta prueba vigila que ninguna de esas pantallas
// pierda el filtro por un cambio que no sabía de él, y que el alta «+ Agregar proveedor» nunca se dibuje DENTRO de un <form>: un
// `submit` que sube desde un modal llegaría al «Guardar» de la pantalla (CLAUDE.md, ADR-0128).
//
// Quedan fuera A PROPÓSITO (ahí la luz sí es legítima; ver el ADR): Por pagar, Finanzas ▸ Gastos y el gasto rápido de Caja, Gastos fijos,
// Notas de crédito, los filtros de documentos y el directorio de Proveedores.

const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");
/** El código sin comentarios: que una mención en un comentario o un texto no dé un verde falso. */
const codigo = (ruta: string) => leer(ruta).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/([^:"'`])\/\/.*$/gm, "$1");

const PANTALLAS_DE_MERCADERIA = [
  "components/ordenes-compra/NuevaOrdenCompra.tsx", // Nueva y Editar orden de compra
  "app/(app)/compras/nueva/page.tsx", // Registrar factura de proveedor
  "components/LlegoMercaderia.tsx", // Recibir ▸ Llegó mercadería
  "components/recepcion-conteo/LlegoSinAviso.tsx", // Recibir ▸ Llegó sin aviso
  "lib/marcas-datos.ts", // alta de producto, editar producto y conteo al vuelo (ElegirMarcaProveedor)
  "app/(app)/productos/marcas/page.tsx", // Marcas ▸ «¿Quién la trae?»
];

describe("los proveedores solo de gastos no se ofrecen para comprar ni recibir mercadería", () => {
  for (const ruta of PANTALLAS_DE_MERCADERIA) {
    it(`${ruta} usa proveedoresParaPedir`, () => {
      expect(codigo(ruta)).toMatch(/proveedoresParaPedir\(/);
    });
  }

  it("donde hay algo que conservar, se lo pasan (el elegido, el de la URL, quien ya trae una marca)", () => {
    expect(codigo("components/ordenes-compra/NuevaOrdenCompra.tsx")).toMatch(/proveedoresParaPedir\(proveedores,\s*\[/);
    expect(codigo("components/LlegoMercaderia.tsx")).toMatch(/proveedoresParaPedir\(directorioCompleto,\s*proveedorId\)/);
    expect(codigo("components/recepcion-conteo/LlegoSinAviso.tsx")).toMatch(/proveedoresParaPedir\(todos,\s*proveedorId\)/);
    expect(codigo("app/(app)/compras/nueva/page.tsx")).toMatch(/proveedoresParaPedir\(activos,\s*proveedorDeLaUrl\)/);
    expect(codigo("lib/marcas-datos.ts")).toMatch(/proveedoresParaPedir\(activos,\s*enUso\)/);
    expect(codigo("app/(app)/productos/marcas/page.tsx")).toMatch(/proveedoresParaPedir\(activos,\s*enUso\)/);
  });

  it("las listas que alimentan esas pantallas traen los rubros (sin ellos el filtro no ve a nadie)", () => {
    expect(leer("lib/compras.ts")).toMatch(/from\("proveedores"\)\.select\("id, nombre, ruc, rubros"\)/);
    expect(leer("lib/ordenes-compra.ts")).toMatch(/from\("proveedores"\)\.select\("id, nombre, ruc, rubros[,"]/);
    expect(leer("lib/marcas-datos.ts")).toMatch(/from\("proveedores"\)\.select\("id, nombre, rubros"\)/);
    expect(leer("app/(app)/productos/marcas/page.tsx")).toMatch(/from\("proveedores"\)\.select\("id, nombre, rubros"\)/);
  });

  it("Recibir le pasa los rubros a sus dos puertas (el campo es opcional en ellas: sin esto el filtro fallaría en silencio)", () => {
    const pagina = codigo("app/(app)/recibir/page.tsx");
    expect(pagina.match(/rubros: p\.rubros/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("el alta nunca ofrece «Gastos» como botón de rubro", () => {
    expect(codigo("components/useAltaDeProveedor.tsx")).toMatch(/rubrosSinGastos\(/);
    expect(codigo("components/LlegoMercaderia.tsx")).toMatch(/rubrosSinGastos\(/);
  });
});

describe("«+ Agregar proveedor» se dibuja fuera del <form>", () => {
  // Quien usa `useAltaDeProveedor` dibuja `alta.modal` DESPUÉS de cerrar su <form> (o fuera de él).
  for (const ruta of ["components/CompraFormV2.tsx", "components/recepcion-conteo/LlegoSinAviso.tsx"]) {
    it(`${ruta}: alta.modal va después del </form>`, () => {
      const fuente = leer(ruta);
      expect(fuente).toMatch(/\{alta\.modal\}/);
      expect(fuente.lastIndexOf("{alta.modal}")).toBeGreaterThan(fuente.lastIndexOf("</form>"));
    });
  }

  it("Nueva orden dibuja su «Registrar proveedor» fuera del <form> de la orden", () => {
    const fuente = leer("components/ordenes-compra/NuevaOrdenCompra.tsx");
    expect(fuente.indexOf("<RegistrarProveedorOrden")).toBeGreaterThan(fuente.lastIndexOf("</form>"));
  });

  it("Llegó mercadería dibuja su ProveedorModal fuera del <form> de la llegada", () => {
    const fuente = leer("components/LlegoMercaderia.tsx");
    expect(fuente.indexOf("<ProveedorModal")).toBeGreaterThan(fuente.lastIndexOf("</form>"));
  });

  it("la pieza no refresca la página al guardar (sería un disparador de remontes al editar)", () => {
    expect(leer("components/useAltaDeProveedor.tsx")).not.toMatch(/router\.refresh|useRouter/);
  });
});
