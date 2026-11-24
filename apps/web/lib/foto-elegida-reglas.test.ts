import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { avisoDeFotosMalas, formatoPorFirma, nombreComoJpg, queDeclara, seAvisa, textoDeFalla, type FallaDeFoto } from "./foto-elegida-reglas";

// Nació del «Chaleco Dad» (2026-11-16): dos fotos soltadas en «Fotos y colores» quedaron como tarjetas rotas que decían, en inglés,
// «An error occured reading the Blob argument to createImageBitmap». Estas pruebas cuidan que toda foto se juzgue por lo que ES y que
// ninguna falla llegue a la pantalla con el texto del navegador.

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (t: string) => Array.from(t, (c) => c.charCodeAt(0));
/** Los primeros 16 bytes de un archivo ISO-BMFF (HEIC, AVIF) con su marca. */
const ftyp = (marca: string) => bytes(0, 0, 0, 0x18, ...ascii("ftyp"), ...ascii(marca), 0, 0, 0, 0);

describe("formatoPorFirma — la foto es lo que dicen sus bytes, no su nombre", () => {
  it("reconoce JPEG, PNG y WebP", () => {
    expect(formatoPorFirma(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(formatoPorFirma(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(formatoPorFirma(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))).toBe("webp");
  });

  it("reconoce la foto del iPhone (HEIC) por todas sus marcas, y AVIF", () => {
    for (const marca of ["heic", "heix", "hevc", "mif1", "msf1"]) expect(formatoPorFirma(ftyp(marca))).toBe("heic");
    expect(formatoPorFirma(ftyp("avif"))).toBe("avif");
  });

  it("un video (también ISO-BMFF) no es una foto", () => {
    expect(formatoPorFirma(ftyp("qt  "))).toBeNull();
    expect(formatoPorFirma(ftyp("isom"))).toBeNull();
  });

  it("un texto, un PDF o un archivo cortado no son una foto, y no lanza con pocos bytes", () => {
    expect(formatoPorFirma(bytes(...ascii("%PDF-1.7")))).toBeNull();
    expect(formatoPorFirma(bytes(...ascii("hola")))).toBeNull();
    expect(formatoPorFirma(bytes())).toBeNull();
    expect(formatoPorFirma(bytes(0xff, 0xd8))).toBeNull();
  });
});

describe("queDeclara — qué se lee y qué se rechaza sin leer", () => {
  it("JPG, PNG y WebP se guardan; HEIC, HEIF y AVIF se convierten", () => {
    expect(queDeclara("image/jpeg", "a.jpg")).toBe("guardable");
    expect(queDeclara("IMAGE/PNG", "a.png")).toBe("guardable");
    expect(queDeclara("image/heic", "IMG_0412.HEIC")).toBe("convertible");
    expect(queDeclara("image/avif", "a.avif")).toBe("convertible");
  });

  it("sin tipo (una foto arrastrada desde otra app) se lee y deciden sus bytes, salvo lo que claramente no es foto", () => {
    expect(queDeclara("", "foto")).toBe("sin-tipo");
    expect(queDeclara("application/octet-stream", "IMG_0412.HEIC")).toBe("sin-tipo");
    expect(queDeclara("", "factura.pdf")).toBe("otro");
    expect(queDeclara("", "video.MOV")).toBe("otro");
  });

  it("un GIF, un PDF o un video declarados no se leen", () => {
    expect(queDeclara("image/gif", "a.gif")).toBe("otro");
    expect(queDeclara("application/pdf", "a.pdf")).toBe("otro");
    expect(queDeclara("video/quicktime", "a.mov")).toBe("otro");
  });
});

describe("textoDeFalla — cada falla, en palabras de tienda", () => {
  const todas: FallaDeFoto[] = ["tipo", "vacia", "pesada", "no-se-lee", "no-es-imagen", "no-se-abre", "otro-formato", "no-cabe"];

  it("toda falla tiene su texto, corto, que termina en punto y sin inglés técnico", () => {
    for (const f of todas) {
      const t = textoDeFalla(f, 6 * 1024 * 1024);
      expect(t.length).toBeGreaterThan(10);
      expect(t.length).toBeLessThanOrEqual(120);
      expect(t.endsWith(".")).toBe(true);
      expect(t).not.toMatch(/blob|bitmap|error|failed|decode|undefined|NaN/i);
    }
  });

  it("la que no se pudo leer dice la causa de casi siempre (la nube) y qué hacer", () => {
    expect(textoDeFalla("no-se-lee")).toMatch(/Google Drive o iCloud/);
    expect(textoDeFalla("no-se-lee")).toMatch(/Ábrela una vez/);
  });

  it("la que el navegador no abre da el mismo consejo que las fotos de campañas y tiendas", () => {
    expect(textoDeFalla("otro-formato")).toContain("Ajustes ▸ Cámara ▸ Formatos ▸ Más compatible");
  });

  it("el peso se dice en MB con un decimal", () => {
    expect(textoDeFalla("pesada", 6.4 * 1024 * 1024)).toBe("Pesa 6.4 MB; el máximo es 5 MB.");
  });

  it("solo lo que nadie ve venir va a Sentry (un PDF elegido por error no)", () => {
    expect(todas.filter(seAvisa)).toEqual(["no-se-lee", "no-es-imagen", "no-se-abre", "otro-formato", "no-cabe"]);
  });
});

describe("nombreComoJpg y avisoDeFotosMalas", () => {
  it("la foto convertida conserva su nombre con .jpg", () => {
    expect(nombreComoJpg("IMG_0412.HEIC")).toBe("IMG_0412.jpg");
    expect(nombreComoJpg("sin-extension")).toBe("sin-extension.jpg");
    expect(nombreComoJpg(".heic")).toBe("foto.jpg");
  });

  it("varias fotos malas van en UN aviso que dice cuál y por qué", () => {
    expect(avisoDeFotosMalas([])).toBeNull();
    expect(avisoDeFotosMalas([{ nombre: "a.jpg", texto: "La foto está dañada. Prueba con otra." }])).toEqual({
      titulo: "Una foto no se puede usar",
      detalle: "a.jpg: La foto está dañada. Prueba con otra.",
    });
    expect(avisoDeFotosMalas([{ nombre: "a", texto: "x." }, { nombre: "b", texto: "y." }])?.titulo).toBe("2 fotos no se pueden usar");
  });
});

/** Todos los .ts/.tsx de una carpeta, sin pruebas. */
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [ruta] : [];
  });
}

describe("toda foto de prenda que se elige pasa por la puerta", () => {
  const base = join(__dirname, "..");
  const leer = (r: string) => readFileSync(join(base, r), "utf8");
  const GATE = /abrirFotosElegidas\(|abrirFotoElegida\(/;

  // Lo que entrega una foto de prenda ya abierta: la puerta misma, o un gancho que la llama (y que se vigila abajo).
  const GANCHOS = /abrirFotosElegidas\(|abrirFotoElegida\(|useSubirFotos\(|catalogo\.abrir\(|useCatalogoIA(Alta)?\(/;

  /**
   * Todo archivo de la web que recibe archivos del navegador (un `<input type="file">`, `<BotonFoto>` o lo que se suelta), decidido UNA vez.
   * «puerta»: fotos de prenda; tienen que pasar por la puerta o por un gancho que la usa. «aparte»: otra subida con su propia validación.
   * Un archivo nuevo que recibe archivos hace fallar la prueba hasta que alguien decida cuál es (antes la lista era a mano y un archivo nuevo
   * pasaba en verde: lo encontró la revisión del 2026-11-16).
   */
  const RECIBEN_ARCHIVOS: Record<string, "puerta" | { aparte: string }> = {
    "components/alta-producto/FotosYColores.tsx": "puerta",
    "components/alta-producto/FotosAlta.tsx": { aparte: "es el botón (`BotonFoto`): entrega los archivos a quien lo usa, y esos se vigilan aquí" },
    "components/ficha-producto/AgregarColoresModal.tsx": "puerta",
    "components/ficha-producto/FotosPorColor.tsx": "puerta",
    "components/ficha-producto/HojaCatalogoIA.tsx": "puerta",
    "components/ficha-producto/PanelDelTaller.tsx": "puerta",
    "components/laboratorio/LaboratorioFotos.tsx": "puerta",
    "components/AdjuntosCompra.tsx": { aparte: "adjuntos de una compra (PDF o foto), su propia validación" },
    "components/ConfiguracionTiendaWeb.tsx": { aparte: "foto de la fachada de una tienda: `prepararFotoDeTienda`" },
    "components/DetalleMuestraModal.tsx": { aparte: "muestra de un tejido o patrón: `muestra-atributo.ts`" },
    "components/PerfilModal.tsx": { aparte: "foto de perfil de una persona" },
    "components/barrido-piso/HojaApartar.tsx": { aparte: "foto rápida de una prenda sin etiqueta para reconocerla después (barrido del piso), no del catálogo: `reducirMuestra`" },
    "components/campanas-web/EditorCampana.tsx": { aparte: "imagen de una campaña: `imagen-de-campana.ts`" },
    "components/existencias/FlujoTalla.tsx": { aparte: "foto de una prenda dañada (cuarentena), no del catálogo" },
    "components/finanzas/SubirPropuestaSireModal.tsx": { aparte: "archivo de SUNAT (SIRE), no es una foto" },
    "components/finanzas/dinero/CuadrarConExtracto.tsx": { aparte: "extracto del banco, no es una foto" },
    "components/finanzas/gastos/FotoDelComprobante.tsx": { aparte: "foto de un comprobante de gasto" },
    "components/fondos/FotoDelGasto.tsx": { aparte: "foto de un gasto de fondo" },
    "components/mi-plata/TarjetaFoto.tsx": { aparte: "foto de un recibo personal" },
    "components/recepcion-conteo/PapelesDeLaCompra.tsx": { aparte: "papeles de una compra (guía, factura)" },
    "components/recepcion-conteo/PlacaDelModelo.tsx": { aparte: "es el botón «Tomar foto» (ADR-0699): entrega el archivo a `ContarEnvio` (`tomarFoto`), que lo abre con `abrirFotoElegida` antes de usarlo" },
    "components/sellos/ElegirDibujoDeInsignia.tsx": { aparte: "dibujo de una insignia: `imagen-de-insignia.ts`" },
  };

  const recibenHoy = [...archivos(join(base, "components")), ...archivos(join(base, "app"))]
    .filter((r) => /type="file"|<BotonFoto\b|dataTransfer\??\.files/.test(readFileSync(r, "utf8")))
    .map((r) => r.slice(base.length + 1))
    .sort();

  it("todo archivo que recibe archivos está decidido (y nada decidido dejó de existir)", () => {
    expect(recibenHoy).toEqual(Object.keys(RECIBEN_ARCHIVOS).sort());
  });

  it("las entradas de fotos de prenda abren la foto, o la pasan a un gancho que la abre", () => {
    for (const [r, clase] of Object.entries(RECIBEN_ARCHIVOS)) if (clase === "puerta") expect(leer(r), r).toMatch(GANCHOS);
  });

  it("los ganchos abren la foto antes de usarla", () => {
    expect(leer("components/ficha-producto/useSubirFotos.ts")).toMatch(GATE);
    // Los dos ganchos de «Catálogo con IA» abren por `fotosParaLaHoja`, que llama a la puerta.
    expect(leer("components/ficha-producto/useCatalogoIA.tsx")).toMatch(/async function fotosParaLaHoja[\s\S]*?abrirFotosElegidas\(/);
    expect(leer("components/ficha-producto/useCatalogoIA.tsx")).toMatch(/abrir: \(archivos, color\) => \{[\s\S]*?fotosParaLaHoja\(archivos\)/);
    expect(leer("components/alta-producto/useCatalogoIAAlta.tsx")).toMatch(/abrir: \(archivos, color\) => \{[\s\S]*?fotosParaLaHoja\(archivos\)/);
  });

  it("ninguna pieza fuera de `producto-fotos.ts` vuelve a validar una foto solo por lo que dice ser", () => {
    const conObjecion = [...archivos(join(base, "components")), ...archivos(join(base, "app")), ...archivos(join(base, "lib"))].filter((r) =>
      /objecionFotoProducto\(/.test(readFileSync(r, "utf8")),
    );
    expect(conObjecion.map((r) => r.slice(base.length + 1))).toEqual(["lib/producto-fotos.ts"]);
  });
});
