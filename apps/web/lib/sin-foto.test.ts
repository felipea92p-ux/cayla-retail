import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { categoriaDe } from "./categoria-de-prenda";

// Candado de la regla «una prenda sin foto se dice de UNA sola manera» (ADR-0333, Felipe 2026-10-04): el ícono de su categoría sobre
// su color (`MosaicoPrenda`). El isotipo de CAYLA (`/cayla-isotipo.png`) es la MARCA —tickets, etiquetas, loader, cartel del club—;
// puesto como relleno de una miniatura decía «sin foto» igual en 25 prendas y no distinguía una de otra. Una regla que solo vive en un
// documento se olvida: esta prueba falla si un archivo nuevo dibuja el isotipo, así que dibujarlo ahí tiene que ser una decisión a la vista.

/** Los únicos archivos que dibujan el isotipo, y para qué: todos son marca, ninguno es relleno de una prenda. */
const USOS_DE_MARCA: Readonly<Record<string, string>> = {
  "components/BoletaA4.tsx": "encabezado de la boleta impresa",
  "components/CambioTicket.tsx": "logo del ticket de cambio",
  "components/ComprobantesListaVacia.tsx": "dibujo de la lista de comprobantes vacía",
  "components/EtiquetaPrecio.tsx": "comentario: el colibrí de la etiqueta va en vector",
  "components/ProformaA4.tsx": "encabezado de la proforma impresa",
  "components/ReciboTermico.tsx": "logo del recibo térmico",
  "components/clientas/CartelClub.tsx": "cartel del club",
  "components/ui/Espera.tsx": "el loader a pantalla completa (ADR-0149)",
  "components/ui/IsotipoCayla.tsx": "comentario: el color de marca se muestreó del PNG",
};

function archivos(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, salida);
    else if (/\.(tsx?|css)$/.test(nombre) && !/\.test\./.test(nombre)) salida.push(ruta);
  }
  return salida;
}

describe("el isotipo es marca, no relleno de una prenda sin foto", () => {
  const raiz = process.cwd();
  const que = ["components", "app"].flatMap((d) => archivos(join(raiz, d)));
  const conIsotipo = que.filter((f) => readFileSync(f, "utf8").includes("cayla-isotipo")).map((f) => f.slice(raiz.length + 1));

  it("solo lo dibujan los archivos de marca de la lista", () => {
    const sobran = conIsotipo.filter((f) => !(f in USOS_DE_MARCA));
    expect(sobran, `Estos archivos usan /cayla-isotipo.png y no son de marca: ${sobran.join(", ")}. Una prenda sin foto se dibuja con <SinFoto> / <MiniaturaPrenda> (ícono de su categoría sobre su color). Si de verdad es marca, agrégalo a USOS_DE_MARCA con su motivo.`).toEqual([]);
  });

  it("y cada archivo de la lista sigue usándolo (la lista no acumula polvo)", () => {
    const sinUso = Object.keys(USOS_DE_MARCA).filter((f) => !conIsotipo.includes(f));
    expect(sinUso, `Ya no usan el isotipo; quítalos de USOS_DE_MARCA: ${sinUso.join(", ")}`).toEqual([]);
  });
});

describe("categoriaDe: lo de la categoría que lleva una fila de prenda", () => {
  it("toma el prefijo, la familia y el nombre con los nombres de las filas del ERP", () => {
    expect(categoriaDe({ categoria: "Camisas y Blusas", categoriaPrefijo: "CMS", categoriaFamilia: "indumentaria" })).toEqual({ prefijo: "CMS", familia: "indumentaria", categoria: "Camisas y Blusas" });
  });

  it("una fila que no trae la categoría, o ninguna fila, devuelve todo vacío: la miniatura dibuja la percha", () => {
    const vacio = { prefijo: undefined, familia: undefined, categoria: undefined };
    expect(categoriaDe({})).toEqual(vacio);
    expect(categoriaDe(null)).toEqual(vacio);
    expect(categoriaDe(undefined)).toEqual(vacio);
  });

  it("respeta el null de una prenda cuya categoría se borró (no inventa un valor)", () => {
    expect(categoriaDe({ categoria: null, categoriaPrefijo: null, categoriaFamilia: null })).toEqual({ prefijo: null, familia: null, categoria: null });
  });
});
