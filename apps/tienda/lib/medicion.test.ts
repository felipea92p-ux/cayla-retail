import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ETIQUETA,
  leerEnvio,
  lineaDeRegistro,
  MEDIDAS_POR_ENVIO,
  RUTA_DE_MEDICION,
  RUTA_OTRA,
  RUTAS_MEDIDAS,
  rutaDeMedicion,
  SELECTOR_ESQUELETO,
} from "./medicion";
import { entraEnLaMuestra } from "./medicion-muestra";

const RAIZ = resolve(__dirname, "..");

/** Las páginas de `app/` como las ve el navegador: sin `page.tsx` y sin los grupos entre paréntesis. */
function paginasDeLaTienda(dir = join(RAIZ, "app")): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return paginasDeLaTienda(ruta);
    if (nombre !== "page.tsx") return [];
    const partes = relative(join(RAIZ, "app"), dir).split("/").filter((p) => p && !/^\(.*\)$/.test(p));
    return [`/${partes.join("/")}`];
  });
}

const vital = { n: "LCP", v: 1834.6, r: "/catalogo", id: "v5-1760700000000-1234567890123", suave: false };
const toque = { n: "toque", desde: "/catalogo", hacia: "/catalogo/[id]", respuesta: 182.4, pagina: 910.2, esqueleto: true, repetido: false };
const bueno = { envio: "0a1b2c3d", conexion: "4g", ancho: 393, m: [vital, toque] };

describe("la muestra", () => {
  it("entra 1 de cada 2 visitas (Felipe)", () => {
    expect(entraEnLaMuestra(0)).toBe(true);
    expect(entraEnLaMuestra(0.4999)).toBe(true);
    expect(entraEnLaMuestra(0.5)).toBe(false);
    expect(entraEnLaMuestra(0.9999)).toBe(false);
  });
});

describe("la página que se mide, sin la dirección", () => {
  it("la lista es la de las páginas de app/ (una página nueva se suma aquí, o se mediría como «otra»)", () => {
    expect([...RUTAS_MEDIDAS].sort()).toEqual(paginasDeLaTienda().sort());
  });

  it("quita los ids, lo que va tras el ? y el #", () => {
    expect(rutaDeMedicion("/catalogo/3f2a9c1e-77aa-4c1b-9d0e-1f2e3d4c5b6a")).toBe("/catalogo/[id]");
    expect(rutaDeMedicion("/catalogo?lista=nuevo&q=blusa%20roja")).toBe("/catalogo");
    expect(rutaDeMedicion("/cuenta/pedidos/W-000123#detalle")).toBe("/cuenta/pedidos/[numero]");
    expect(rutaDeMedicion("/bolsa/separado/W-000123/")).toBe("/bolsa/separado/[numero]");
    expect(rutaDeMedicion("/")).toBe("/");
    expect(rutaDeMedicion("")).toBe("/");
  });

  it("una parte fija gana a una variable: «Arma el tuyo» no es un look", () => {
    expect(rutaDeMedicion("/looks/arma")).toBe("/looks/arma");
    expect(rutaDeMedicion("/looks/look-de-verano")).toBe("/looks/[id]");
    expect(rutaDeMedicion("/looks/guardado/abc")).toBe("/looks/guardado/[id]");
  });

  it("lo que no es una página de la tienda es «otra», nunca la dirección", () => {
    expect(rutaDeMedicion("/wp-admin")).toBe(RUTA_OTRA);
    expect(rutaDeMedicion("/catalogo/abc/def")).toBe(RUTA_OTRA);
    expect(rutaDeMedicion("/api/medicion")).toBe(RUTA_OTRA);
  });
});

describe("lo que la ruta acepta", () => {
  it("un envío bueno sale armado de nuevo, con los números redondeados", () => {
    expect(leerEnvio(bueno)).toEqual({
      envio: "0a1b2c3d",
      conexion: "4g",
      ancho: 390,
      m: [
        { ...vital, v: 1835 },
        { ...toque, respuesta: 182, pagina: 910 },
      ],
    });
    expect(leerEnvio({ ...bueno, conexion: null, ancho: null })).toMatchObject({ conexion: null, ancho: null });
    expect(leerEnvio({ ...bueno, m: [{ ...vital, n: "CLS", v: 0.12345 }] })?.m[0]).toMatchObject({ v: 0.123 });
  });

  it("lo que llega de más no se escribe", () => {
    const conDeMas = { ...bueno, correo: "alguien@ejemplo.com", m: [{ ...vital, sesion: "abc" }] };
    const leido = leerEnvio(conDeMas);
    expect(JSON.stringify(leido)).not.toContain("alguien");
    expect(JSON.stringify(leido)).not.toContain("sesion");
  });

  it.each([
    ["sin envío", { ...bueno, envio: undefined }],
    ["un envío que no es el id al azar", { ...bueno, envio: "<script>" }],
    ["otra conexión", { ...bueno, conexion: "5g" }],
    ["un ancho imposible", { ...bueno, ancho: 99999 }],
    ["sin medidas", { ...bueno, m: [] }],
    ["demasiadas medidas", { ...bueno, m: Array.from({ length: MEDIDAS_POR_ENVIO + 1 }, () => vital) }],
    ["otra métrica", { ...bueno, m: [{ ...vital, n: "FID" }] }],
    ["una dirección en vez de la página", { ...bueno, m: [{ ...vital, r: "/catalogo?q=mi%20nombre" }] }],
    ["un valor negativo", { ...bueno, m: [{ ...vital, v: -1 }] }],
    ["un valor que no es número", { ...bueno, m: [{ ...vital, v: "1200" }] }],
    ["un id con texto libre", { ...bueno, m: [{ ...vital, id: "hola, soy un texto libre que no es un id" }] }],
    ["un toque que llega antes de responder", { ...bueno, m: [{ ...toque, pagina: 100, respuesta: 200 }] }],
    ["un toque de más de 30 s", { ...bueno, m: [{ ...toque, pagina: 40_000 }] }],
    ["un toque a una dirección", { ...bueno, m: [{ ...toque, hacia: "/catalogo/abc" }] }],
    ["un toque sin decir si se repitió", { ...bueno, m: [{ ...toque, repetido: undefined }] }],
    ["nada", null],
    ["un texto", "medicion"],
  ])("rechaza %s", (_motivo, cuerpo) => {
    expect(leerEnvio(cuerpo)).toBeNull();
  });

  it("la línea del registro empieza con la etiqueta y trae la hora del servidor", () => {
    const linea = lineaDeRegistro(leerEnvio(bueno)!, 1_760_700_000_000);
    expect(linea.startsWith(`${ETIQUETA} {`)).toBe(true);
    expect(JSON.parse(linea.slice(ETIQUETA.length + 1))).toMatchObject({ t: 1_760_700_000_000, envio: "0a1b2c3d", m: [{ n: "LCP" }, { n: "toque" }] });
  });
});

describe("las piezas que la medición necesita de la tienda", () => {
  it("el esqueleto de página lleva la marca que la medición busca", () => {
    expect(SELECTOR_ESQUELETO).toBe("[data-esqueleto]");
    expect(readFileSync(join(RAIZ, "components/EsqueletoDePagina.tsx"), "utf8")).toMatch(/<main [^>]*data-esqueleto=/);
  });

  it("el proxy no mira la ruta de la medición (un envío no toca la sesión) y sí las páginas", () => {
    // Se lee del archivo (proxy.ts importa con `@/`, que las pruebas no resuelven): su `matcher` es una expresión regular de JavaScript.
    const texto = readFileSync(join(RAIZ, "proxy.ts"), "utf8");
    const patron = JSON.parse(texto.match(/matcher: \[("(?:[^"\\]|\\.)*")\]/)![1]) as string;
    const pasa = (ruta: string) => new RegExp(`^${patron}$`).test(ruta);
    expect(pasa(RUTA_DE_MEDICION)).toBe(false);
    expect(pasa("/catalogo")).toBe(true);
    expect(pasa("/api/tallas")).toBe(true);
  });

  it("la medición está montada en el layout de toda la tienda", () => {
    expect(readFileSync(join(RAIZ, "app/layout.tsx"), "utf8")).toMatch(/<Medicion \/>/);
  });

  it("la visita que no entra a la muestra no baja lo que mide: web-vitals vive solo en el archivo que se carga aparte", () => {
    const compuerta = readFileSync(join(RAIZ, "components/Medicion.tsx"), "utf8");
    expect(compuerta).not.toMatch(/from "next\/web-vitals"|from "\.\/MedicionActiva"|from "@\/lib\/medicion"/);
    expect(compuerta).toMatch(/dynamic\(\(\) => import\("\.\/MedicionActiva"\)/);
    expect(readFileSync(join(RAIZ, "components/MedicionActiva.tsx"), "utf8")).toMatch(/from "next\/web-vitals"/);
  });
});
