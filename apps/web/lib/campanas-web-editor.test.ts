import { describe, expect, it } from "vitest";
import { AMBIENTES_CAMPANA } from "@cayla-retail/shared";
import {
  accionesDelDiseno,
  enlaceDeVistaPrevia,
  vencimientoDicho,
  BORRADOR_VACIO,
  DONDE_TODO,
  PIEZAS_DONDE,
  borradorDe,
  coloresDelBorrador,
  conAcento,
  conAmbiente,
  conDonde,
  conImagen,
  conImagenVertical,
  conModo,
  conMovimiento,
  conPaleta,
  conTexto,
  hayDiseno,
  hayDonde,
  errorDeCampanas,
  faltanDelDiseno,
  leerFichaCampana,
  parcheDeCambios,
  type BorradorDiseno,
  type DisenoGuardado,
} from "./campanas-web-editor";

const RUTA_H = "campanas/11111111-2222-4333-8444-555555555555/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.webp";
const RUTA_V = "campanas/11111111-2222-4333-8444-555555555555/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee.webp";
const campana = { id: "c1", nombre: "Aniversario CAYLA", pct: 20, desde: "2026-10-12", hasta: "2026-10-25", estado: "vivo", prendas: 112, diseno: null };
const diseno = (p: Partial<DisenoGuardado> = {}): DisenoGuardado => ({
  modo: "ambiente", plantilla: "aniversario", paleta: 0, acento: null, franja: "rota", entrada: "telon", efecto: "destellos",
  intensidad: "poca", duracion: "una", cuenta: "siempre", titular: null, bajada: null, boton: null, donde: { ...DONDE_TODO }, imagenRuta: null, imagenVerticalRuta: null, estado: "borrador", version: 1, ...p,
});

describe("leerFichaCampana: lo que manda la base", () => {
  it("lee una campaña con su diseño completo", () => {
    const f = leerFichaCampana({
      hoy: "2026-10-21", campana,
      diseno: { modo: "ambiente", plantilla: "cyber", paleta: 2, acento: "#00aa55", franja: "marquesina", entrada: "telon", efecto: "copos", intensidad: "media", duracion: "continuo", cuenta: "ultimo", titular: "Hola", bajada: null, boton: null, estado: "programado", version: 4 },
    });
    expect(f?.campana.nombre).toBe("Aniversario CAYLA");
    expect(f?.diseno).toMatchObject({ plantilla: "cyber", paleta: 2, acento: "#00aa55", efecto: "copos", estado: "programado", version: 4, titular: "Hola", bajada: null });
  });

  it("una campaña sin diseño trae diseno null", () => {
    expect(leerFichaCampana({ hoy: "2026-10-21", campana, diseno: null })?.diseno).toBeNull();
  });

  it("una lectura rara es null (el editor lo dice, no abre uno vacío)", () => {
    expect(leerFichaCampana(null)).toBeNull();
    expect(leerFichaCampana({ hoy: "2026-10-21" })).toBeNull();
    expect(leerFichaCampana({ campana })).toBeNull();
    expect(leerFichaCampana({ hoy: "2026-10-21", campana: { nombre: "x" } })).toBeNull();
  });

  it("un diseño a medias es «sin diseño»; los datos sueltos raros toman su valor de fábrica", () => {
    expect(leerFichaCampana({ hoy: "2026-10-21", campana, diseno: { modo: "otro", estado: "borrador" } })?.diseno).toBeNull();
    const d = leerFichaCampana({ hoy: "2026-10-21", campana, diseno: { modo: "ambiente", plantilla: "cyber", estado: "borrador", paleta: "x", version: 0 } })?.diseno;
    expect(d).toMatchObject({ paleta: 0, franja: "rota", entrada: "telon", version: 1 });
  });
});

/** Un borrador completo con lo que importe a la prueba. */
const bor = (p: Partial<BorradorDiseno> = {}): BorradorDiseno => ({ ...BORRADOR_VACIO, donde: { ...DONDE_TODO }, ...p });

describe("el borrador", () => {
  it("una campaña sin diseño abre vacía; con diseño de ambiente, con lo guardado", () => {
    expect(borradorDe({ diseno: null })).toEqual(BORRADOR_VACIO);
    expect(borradorDe({ diseno: diseno({ plantilla: "gato", paleta: 2, acento: "#aabbcc", efecto: "patitas" }) })).toEqual(bor({ plantilla: "gato", paleta: 2, acento: "#aabbcc", efecto: "patitas" }));
  });

  it("un diseño de un ambiente que el catálogo ya no conoce abre vacío (hay que volver a elegir)", () => {
    expect(borradorDe({ diseno: diseno({ plantilla: "halloween" }) })).toEqual(BORRADOR_VACIO);
  });

  it("un diseño de imagen propia abre en su modo, con sus imágenes y su color de botón", () => {
    const b = borradorDe({ diseno: diseno({ modo: "imagen", plantilla: null, acento: "#00aa55", imagenRuta: RUTA_H, imagenVerticalRuta: RUTA_V, franja: "quieta" }) });
    expect(b).toMatchObject({ modo: "imagen", plantilla: null, acento: "#00aa55", imagen: RUTA_H, imagenVertical: RUTA_V, franja: "quieta" });
  });

  it("elegir un ambiente trae su primera paleta, su efecto y su franja, y suelta el color propio", () => {
    const b = conAmbiente(bor({ plantilla: "cyber", paleta: 2, acento: "#00aa55", efecto: "copos", franja: "quieta", intensidad: "media", cuenta: "no" }), "gato");
    // el movimiento nace de fábrica con el ambiente (menos «dónde se ve», que no depende de él)
    expect(b).toEqual(bor({ plantilla: "gato", efecto: "patitas" }));
  });

  it("volver a elegir el mismo ambiente no cambia nada (no pierde la paleta que ya eligió)", () => {
    const b = bor({ plantilla: "gato", paleta: 2, acento: "#aabbcc", efecto: "patitas" });
    expect(conAmbiente(b, "gato")).toBe(b);
  });

  it("cambiar de paleta suelta el color propio; poner uno propio lo guarda en minúscula", () => {
    const b = bor({ plantilla: "cyber", paleta: 0, acento: "#00aa55", efecto: "destellos", franja: "marquesina" });
    expect(conPaleta(b, 1)).toMatchObject({ paleta: 1, acento: null });
    expect(conAcento(b, "#FF00AA").acento).toBe("#ff00aa");
    expect(conAcento(b, null).acento).toBeNull();
  });

  it("los colores del borrador son los de la paleta, o el acento propio", () => {
    expect(coloresDelBorrador(BORRADOR_VACIO)).toBeNull();
    expect(coloresDelBorrador({ ...BORRADOR_VACIO, plantilla: "cyber", paleta: 1 })).toEqual({ fondo: "#141413", texto: "#f2f1ed", acento: "#cbc7be" });
    expect(coloresDelBorrador({ ...BORRADOR_VACIO, plantilla: "cyber", acento: "#00aa55" })?.acento).toBe("#00aa55");
  });
});

describe("parcheDeCambios: solo lo que cambió", () => {
  const guardado = borradorDe({ diseno: diseno() });

  it("sin ambiente no hay nada que guardar", () => {
    expect(parcheDeCambios(null, BORRADOR_VACIO)).toBeNull();
    expect(parcheDeCambios(guardado, BORRADOR_VACIO)).toBeNull();
  });

  it("la primera vez manda lo mínimo para crear el diseño", () => {
    const ahora = conAmbiente(BORRADOR_VACIO, "navidad");
    expect(parcheDeCambios(null, ahora)).toEqual({
      modo: "ambiente", plantilla: "navidad", paleta: 0, acento: null, franja: "rota", entrada: "telon", efecto: "copos", intensidad: "poca", duracion: "una", cuenta: "siempre",
    });
  });

  it("sin cambios es null (el botón de guardar se apaga)", () => {
    expect(parcheDeCambios(guardado, { ...guardado })).toBeNull();
  });

  it("solo manda las llaves que cambiaron", () => {
    expect(parcheDeCambios(guardado, conPaleta(guardado, 2))).toEqual({ paleta: 2 });
    expect(parcheDeCambios(guardado, conAcento(guardado, "#112233"))).toEqual({ acento: "#112233" });
    expect(parcheDeCambios({ ...guardado, acento: "#112233" }, { ...guardado, acento: null })).toEqual({ acento: null });
  });

  it("lo que se aparta de fábrica en «dónde se ve» viaja con el primer guardado", () => {
    expect(parcheDeCambios(null, conDonde(conAmbiente(BORRADOR_VACIO, "gato"), "sello", false))).toMatchObject({ donde_sello: false });
    expect(parcheDeCambios(null, conAmbiente(BORRADOR_VACIO, "gato"))).not.toHaveProperty("donde_sello");
  });

  it("los textos viajan limpios: el espacio al final no es un cambio, y vaciar la caja es «sin texto»", () => {
    expect(parcheDeCambios(guardado, conTexto(guardado, "titular", "Hola"))).toEqual({ titular: "Hola" });
    expect(parcheDeCambios(guardado, conTexto(guardado, "titular", "   "))).toBeNull();
    const conTitular = { ...guardado, titular: "Hola" };
    expect(parcheDeCambios(conTitular, conTexto(conTitular, "titular", "Hola  "))).toBeNull();
    expect(parcheDeCambios(conTitular, conTexto(conTitular, "titular", ""))).toEqual({ titular: null });
    expect(parcheDeCambios(guardado, conTexto(conTexto(guardado, "bajada", " Una  línea "), "boton", "Ver"))).toEqual({ bajada: "Una línea", boton: "Ver" });
  });

  it("la primera vez, un texto escrito viaja y uno vacío no", () => {
    const b = conTexto(conAmbiente(BORRADOR_VACIO, "gato"), "titular", "Día del Gato ");
    expect(parcheDeCambios(null, b)).toMatchObject({ titular: "Día del Gato" });
    expect(parcheDeCambios(null, conAmbiente(BORRADOR_VACIO, "gato"))).not.toHaveProperty("titular");
  });

  it("cambiar de ambiente no borra lo que ya se escribió", () => {
    const b = conAmbiente(conTexto(conAmbiente(BORRADOR_VACIO, "gato"), "titular", "Mi campaña"), "navidad");
    expect(b.titular).toBe("Mi campaña");
  });

  it("cada pieza del movimiento y de «dónde se ve» viaja sola", () => {
    expect(parcheDeCambios(guardado, conMovimiento(guardado, "duracion", "continuo"))).toEqual({ duracion: "continuo" });
    expect(parcheDeCambios(guardado, conMovimiento(guardado, "efecto", "copos"))).toEqual({ efecto: "copos" });
    expect(parcheDeCambios(guardado, conMovimiento(guardado, "cuenta", "ultimo"))).toEqual({ cuenta: "ultimo" });
    expect(parcheDeCambios(guardado, conDonde(guardado, "bolsa", false))).toEqual({ donde_bolsa: false });
    expect(parcheDeCambios(conDonde(guardado, "bolsa", false), guardado)).toEqual({ donde_bolsa: true });
  });

  it("cambiar de ambiente manda lo que cambia: el ambiente, la paleta, el color propio y la franja (Black Week comparte el efecto)", () => {
    expect(parcheDeCambios({ ...guardado, paleta: 2, acento: "#112233" }, conAmbiente(guardado, "cyber"))).toEqual({
      plantilla: "cyber", paleta: 0, acento: null, franja: "marquesina",
    });
    expect(parcheDeCambios(guardado, conAmbiente(guardado, "gato"))).toEqual({ plantilla: "gato", efecto: "patitas" });
  });
});

describe("qué falta para poder programar", () => {
  it("sin ambiente falta elegir uno", () => {
    expect(faltanDelDiseno(BORRADOR_VACIO)).toEqual([{ paso: "ambiente", texto: "elegir un ambiente" }]);
  });

  it("con cualquier ambiente y paleta del catálogo no falta nada (todas se leen)", () => {
    for (const a of AMBIENTES_CAMPANA) for (let p = 0; p < 3; p++) expect(faltanDelDiseno({ ...conAmbiente(BORRADOR_VACIO, a.clave), paleta: p })).toEqual([]);
  });

  it("un color propio que no se lee hace faltar «un color que se lea bien»", () => {
    const b = conAcento(conAmbiente(BORRADOR_VACIO, "cyber"), "#1a1a19");
    expect(faltanDelDiseno(b)).toEqual([{ paso: "colores", texto: "un color que se lea bien" }]);
    expect(faltanDelDiseno(conAcento(b, null))).toEqual([]);
  });

  it("un color propio que no es #rrggbb también falta", () => {
    const b = { ...conAmbiente(BORRADOR_VACIO, "cyber"), acento: "rojo" };
    expect(faltanDelDiseno(b)).toEqual([{ paso: "colores", texto: "un color que sea #rrggbb" }]);
  });

  it("sin ninguna pieza encendida en «dónde se ve» falta elegir dónde se ve; con una basta", () => {
    const apagado = PIEZAS_DONDE.reduce((b, k) => conDonde(b, k, false), conAmbiente(BORRADOR_VACIO, "cyber"));
    expect(hayDonde(apagado)).toBe(false);
    expect(faltanDelDiseno(apagado)).toEqual([{ paso: "donde", texto: "elegir dónde se ve" }]);
    expect(faltanDelDiseno(conDonde(apagado, "franja", true))).toEqual([]);
  });

  it("si faltan los colores y el dónde se ve, lista los dos en el orden de las pantallas", () => {
    const b = PIEZAS_DONDE.reduce((x, k) => conDonde(x, k, false), conAcento(conAmbiente(BORRADOR_VACIO, "cyber"), "#1a1a19"));
    expect(faltanDelDiseno(b).map((f) => f.paso)).toEqual(["colores", "donde"]);
  });
});

describe("errores de la base en palabras de tienda", () => {
  it("conoce los cuatro de las campañas y no se traga los demás", () => {
    expect(errorDeCampanas("campana_cambio_otro")?.titulo).toBe("Alguien cambió esta campaña");
    expect(errorDeCampanas("ERROR: campana_terminada")?.titulo).toBe("Esa campaña ya terminó");
    expect(errorDeCampanas("campana_no_existe")?.titulo).toBe("Esa campaña ya no existe");
    expect(errorDeCampanas("campana_diseno_datos_invalidos Ese diseño no es válido (campana_disenos_paleta)")?.titulo).toBe("El diseño no es válido");
    expect(errorDeCampanas("otra cosa")).toBeNull();
  });
});

describe("el modo «Mi propia imagen»", () => {
  const conFoto = (b: BorradorDiseno = BORRADOR_VACIO) => conImagen(conModo(b, "imagen"), RUTA_H);

  it("pasar a imagen: nace con su movimiento de fábrica y sin color propio; sin imagen aún no hay diseño", () => {
    const b = conModo(conAmbiente(BORRADOR_VACIO, "gato"), "imagen");
    expect(b).toMatchObject({ modo: "imagen", acento: null, franja: "quieta", entrada: "telon", efecto: "ninguno", cuenta: "siempre" });
    expect(hayDiseno(b)).toBe(false);
    expect(parcheDeCambios(null, b)).toBeNull();
    expect(faltanDelDiseno(b)).toEqual([{ paso: "ambiente", texto: "subir la imagen" }]);
  });

  it("subir la imagen crea el diseño: modo imagen, su ruta y nada de ambiente ni de textos", () => {
    const b = conImagenVertical(conFoto(), RUTA_V);
    const p = parcheDeCambios(null, conTexto(b, "titular", "Hola"))!;
    expect(p).toMatchObject({ modo: "imagen", imagen_ruta: RUTA_H, imagen_vertical_ruta: RUTA_V });
    expect(p).not.toHaveProperty("plantilla");
    expect(p).not.toHaveProperty("titular");
    expect(faltanDelDiseno(b)).toEqual([]);
  });

  it("los colores son los del botón: el de fábrica o el propio, y se leen", () => {
    expect(coloresDelBorrador(conFoto())?.acento).toBe("#9e1d32");
    expect(coloresDelBorrador(conAcento(conFoto(), "#00aa55"))?.acento).toBe("#00aa55");
    expect(coloresDelBorrador(conModo(BORRADOR_VACIO, "imagen"))).toBeNull();
  });

  it("un botón gris de en medio no se lee: falta «un color que se lea bien»", () => {
    expect(faltanDelDiseno(conAcento(conFoto(), "#777777"))).toEqual([{ paso: "colores", texto: "un color que se lea bien" }]);
  });

  it("de un ambiente guardado a imagen: el parche pone la plantilla en null y trae la imagen (lo que la base exige)", () => {
    const guardado = borradorDe({ diseno: diseno() });
    const p = parcheDeCambios(guardado, conFoto(guardado))!;
    expect(p).toMatchObject({ modo: "imagen", plantilla: null, imagen_ruta: RUTA_H });
  });

  it("de imagen guardada a ambiente: el parche trae el modo y la plantilla", () => {
    const guardado = borradorDe({ diseno: diseno({ modo: "imagen", plantilla: null, imagenRuta: RUTA_H }) });
    const vuelta = conAmbiente(guardado, "navidad");
    expect(parcheDeCambios(guardado, vuelta)).toMatchObject({ modo: "ambiente", plantilla: "navidad" });
    // volver al ambiente no borra la imagen ya subida (el parche no la toca)
    expect(parcheDeCambios(guardado, vuelta)).not.toHaveProperty("imagen_ruta");
  });

  it("ir y volver de modo no pierde lo escrito ni las imágenes subidas", () => {
    const b = conModo(conImagenVertical(conFoto(conTexto(conAmbiente(BORRADOR_VACIO, "gato"), "titular", "Mi campaña")), RUTA_V), "ambiente");
    expect(b).toMatchObject({ modo: "ambiente", plantilla: "gato", titular: "Mi campaña", imagen: RUTA_H, imagenVertical: RUTA_V });
    expect(conModo(b, "ambiente")).toBe(b);
  });

  it("quitar la vertical viaja como null; quitar la horizontal deja sin diseño y suelta también la vertical", () => {
    const guardado = borradorDe({ diseno: diseno({ modo: "imagen", plantilla: null, imagenRuta: RUTA_H, imagenVerticalRuta: RUTA_V }) });
    expect(parcheDeCambios(guardado, conImagenVertical(guardado, null))).toEqual({ imagen_vertical_ruta: null });
    const sin = conImagen(guardado, null);
    expect(sin.imagenVertical).toBeNull();
    expect(parcheDeCambios(guardado, sin)).toBeNull();
  });

  it("cambiar la imagen viaja sola", () => {
    const guardado = borradorDe({ diseno: diseno({ modo: "imagen", plantilla: null, imagenRuta: RUTA_H }) });
    expect(parcheDeCambios(guardado, conImagen(guardado, RUTA_V))).toEqual({ imagen_ruta: RUTA_V });
  });
});

describe("accionesDelDiseno: qué se puede hacer con el diseño ahora", () => {
  const guardadoOk = borradorDe({ diseno: diseno() });
  const ahora = (b: BorradorDiseno = guardadoOk) => ({ terminada: false, estado: "borrador" as const, guardado: guardadoOk, ahora: b });

  it("un borrador guardado, sin cambios sueltos y que se lee, se puede programar (y tiene vista previa)", () => {
    expect(accionesDelDiseno(ahora())).toEqual({ programar: true, porQueNoProgramar: null, aBorrador: false, vistaPrevia: true });
  });

  it("sin diseño guardado no se programa ni tiene vista previa", () => {
    const a = accionesDelDiseno({ terminada: false, estado: null, guardado: null, ahora: conAmbiente(BORRADOR_VACIO, "aniversario") });
    expect(a).toEqual({ programar: false, porQueNoProgramar: "Guarda el borrador primero.", aBorrador: false, vistaPrevia: false });
  });

  it("con cambios sin guardar no se programa: primero se guarda (lo que se programa es lo guardado)", () => {
    const a = accionesDelDiseno(ahora(conPaleta(guardadoOk, 1)));
    expect(a.programar).toBe(false);
    expect(a.porQueNoProgramar).toBe("Guarda tus cambios antes de programar.");
    expect(a.vistaPrevia).toBe(true);
  });

  it("un diseño guardado que no se lee (color propio casi igual al fondo) no se programa y dice qué falta", () => {
    const malo = conAcento(borradorDe({ diseno: diseno({ plantilla: "cyber" }) }), "#1a1a19");
    const a = accionesDelDiseno({ terminada: false, estado: "borrador", guardado: malo, ahora: malo });
    expect(a.programar).toBe(false);
    expect(a.porQueNoProgramar).toBe("Falta: un color que se lea bien.");
  });

  it("sin ninguna pieza encendida no se programa", () => {
    let b = guardadoOk;
    for (const k of PIEZAS_DONDE) b = conDonde(b, k, false);
    const a = accionesDelDiseno({ terminada: false, estado: "borrador", guardado: b, ahora: b });
    expect(a.programar).toBe(false);
    expect(a.porQueNoProgramar).toBe("Falta: elegir dónde se ve.");
  });

  it("un diseño ya programado se puede volver a borrador, no se vuelve a programar y no dice por qué no", () => {
    expect(accionesDelDiseno({ ...ahora(), estado: "programado" })).toEqual({ programar: false, porQueNoProgramar: null, aBorrador: true, vistaPrevia: true });
  });

  it("una campaña que terminó no se programa, no vuelve a borrador ni tiene vista previa", () => {
    expect(accionesDelDiseno({ ...ahora(), terminada: true })).toEqual({ programar: false, porQueNoProgramar: "La campaña ya terminó.", aBorrador: false, vistaPrevia: false });
    expect(accionesDelDiseno({ ...ahora(), terminada: true, estado: "programado" }).aBorrador).toBe(false);
  });

  it("con imagen propia: programable cuando la imagen está guardada", () => {
    const img = conImagen(conModo(BORRADOR_VACIO, "imagen"), RUTA_H);
    expect(accionesDelDiseno({ terminada: false, estado: "borrador", guardado: img, ahora: img }).programar).toBe(true);
  });
});

describe("enlaceDeVistaPrevia y vencimientoDicho", () => {
  const llave = "0123456789abcdef".repeat(3);

  it("arma la dirección con el origen de la tienda y la llave, sin importar un «/» al final ni una ruta", () => {
    expect(enlaceDeVistaPrevia("https://tienda.cayla.pe", llave)).toBe(`https://tienda.cayla.pe/vista-previa/${llave}`);
    expect(enlaceDeVistaPrevia("https://tienda.cayla.pe/", llave)).toBe(`https://tienda.cayla.pe/vista-previa/${llave}`);
    expect(enlaceDeVistaPrevia("http://localhost:3100/inicio", llave)).toBe(`http://localhost:3100/vista-previa/${llave}`);
  });

  it("sin tienda, con una dirección rara o con una llave que no es de 48 letras de 0 a f, no hay enlace", () => {
    expect(enlaceDeVistaPrevia(null, llave)).toBeNull();
    expect(enlaceDeVistaPrevia("tienda.cayla.pe", llave)).toBeNull();
    expect(enlaceDeVistaPrevia("javascript:alert(1)", llave)).toBeNull();
    expect(enlaceDeVistaPrevia("https://tienda.cayla.pe", "corta")).toBeNull();
    expect(enlaceDeVistaPrevia("https://tienda.cayla.pe", llave.toUpperCase())).toBeNull();
    expect(enlaceDeVistaPrevia("https://tienda.cayla.pe", `${llave}/../x`)).toBeNull();
  });

  it("dice hasta qué día vale, en la hora de Lima", () => {
    expect(vencimientoDicho("2026-10-28T19:00:00Z")).toBe("hasta el 28 oct");
    // a las 03:00 UTC todavía es el día anterior en Lima
    expect(vencimientoDicho("2026-10-29T03:00:00Z")).toBe("hasta el 28 oct");
    expect(vencimientoDicho("no es una fecha")).toBeNull();
  });

  it("los errores nuevos de la base salen en palabras de tienda", () => {
    expect(errorDeCampanas("campana_diseno_incompleto")?.titulo).toBe("Falta una pieza de la tienda");
    expect(errorDeCampanas("campana_sin_diseno")?.titulo).toContain("todavía no tiene diseño");
    expect(errorDeCampanas("campana_previa_demasiadas")?.titulo).toContain("20 enlaces");
  });
});
