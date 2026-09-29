import { describe, expect, it } from "vitest";
import { NACEN_SIN_UNIDADES } from "./variantes-ficha-reglas";
import {
  agruparCambios,
  CAMPOS_CUBIERTOS,
  cambioDeDato,
  cambiosDeVariante,
  formatoCosto,
  formatoPrecio,
  NOTA_CORREGIDAS,
  NOTA_DESACTIVADAS_CON_STOCK,
  resumenDeCambios,
  SIN_CAMBIOS,
  textoDeSalidaDeFicha,
  textoPendienteDeVariante,
  type FichaEditable,
  type NombresFicha,
  type VarianteFicha,
} from "./producto-cambios-reglas";

const nombres: NombresFicha = {
  categoria: (id) => `Categoría ${id}`,
  tejido: (id) => `Tejido ${id}`,
  patron: (id) => `Patrón ${id}`,
  marca: (id) => `Marca ${id}`,
  proveedor: (id) => `Proveedor ${id}`,
  temporada: (clave) => (clave === "" ? "Igual que su categoría (Verano)" : `Temporada ${clave}`),
  temporadaColor: (clave) => (clave === "" ? "Igual que su prenda" : `Temporada ${clave}`),
  color: (codigo) => `Color ${codigo}`,
  etiqueta: (id) => `Etiqueta ${id}`,
};

/** Color y talla de una variante: en las pruebas, la clave y el texto son el mismo. */
const id = (texto: string) => ({ clave: texto, texto });

const ficha = (): FichaEditable => ({
  referencia: "Camisa Lino",
  categoriaId: "c1",
  descripcion: "",
  estado: "activo",
  stockMinimo: "",
  temporada: "",
  permitirVentaSinStock: false,
  tejidoId: "t1",
  patronId: "p1",
  marcaId: "m1",
  proveedorId: "pr1",
  temporadaColor: {},
  fotos: [
    { id: "f1", url: "u1", esPrincipal: true, colorCodigo: null },
    { id: "f2", url: "u2", esPrincipal: false, colorCodigo: "BEI" },
  ],
  variantes: [
    { id: "v1", nombre: "Beige XS", activo: false, precio: "90", costo: "60", etiquetaIds: ["e1", "e2"], identidad: id("Beige XS") },
    { id: "v2", nombre: "Gris XS", activo: true, precio: "90", costo: "60", etiquetaIds: [], identidad: id("Gris XS") },
    { id: "v3", nombre: "Beige S", activo: true, precio: "90.5", costo: "", etiquetaIds: [], identidad: id("Beige S") },
  ],
});

const cambiar = (mutar: (f: FichaEditable) => void): FichaEditable => {
  const f = ficha();
  mutar(f);
  return f;
};

const resumen = (mutar: (f: FichaEditable) => void) => resumenDeCambios(ficha(), cambiar(mutar), nombres);

describe("resumenDeCambios — sin tocar nada", () => {
  it("una ficha igual a sí misma no tiene cambios", () => {
    const r = resumenDeCambios(ficha(), ficha(), nombres);
    expect(r).toEqual(SIN_CAMBIOS);
    expect(r.total).toBe(0);
  });
});

describe("resumenDeCambios — variantes", () => {
  it("apagar una variante y prender otra son dos cambios, con su nombre y su posición", () => {
    const r = resumen((f) => {
      f.variantes[0].activo = true;
      f.variantes[1].activo = false;
    });
    expect(r.total).toBe(2);
    expect(r.cambios).toEqual([
      { tipo: "activa", indice: 0, nombre: "Beige XS" },
      { tipo: "desactiva", indice: 1, nombre: "Gris XS" },
    ]);
    expect(r.frases).toEqual(["1 variante se desactiva", "1 variante se activa"]);
    expect(r.frasesPasado).toEqual(["1 variante desactivada", "1 variante activada"]);
  });

  it("dice «variantes» en plural cuando son varias", () => {
    const r = resumen((f) => f.variantes.forEach((v) => (v.activo = !v.activo)));
    expect(r.frases).toEqual(["2 variantes se desactivan", "1 variante se activa"]);
  });

  it("un precio escrito de otra manera no es un cambio: 90, 90.0 y 90.00 son lo mismo", () => {
    expect(resumen((f) => (f.variantes[0].precio = "90.00")).total).toBe(0);
    expect(resumen((f) => (f.variantes[1].precio = "90.0")).total).toBe(0);
    expect(resumen((f) => (f.variantes[2].precio = "90.50")).total).toBe(0);
  });

  it("un precio distinto sí lo es, con el valor de antes y el de ahora", () => {
    const r = resumen((f) => (f.variantes[1].precio = "95"));
    expect(r.cambios).toEqual([{ tipo: "precio", indice: 1, nombre: "Gris XS", antes: "90", despues: "95" }]);
    expect(r.frases).toEqual(["1 precio cambia"]);
    expect(r.frasesPasado).toEqual(["1 precio cambiado"]);
  });

  it("un campo vacío no es cero: vaciar el precio es un cambio", () => {
    expect(resumen((f) => (f.variantes[0].precio = "")).cambios).toEqual([{ tipo: "precio", indice: 0, nombre: "Beige XS", antes: "90", despues: "" }]);
    expect(resumen((f) => (f.variantes[2].costo = "0")).total).toBe(1);
  });

  it("el costo cambia como el precio", () => {
    const r = resumen((f) => (f.variantes[0].costo = "58"));
    expect(r.cambios).toEqual([{ tipo: "costo", indice: 0, nombre: "Beige XS", antes: "60", despues: "58" }]);
    expect(r.frases).toEqual(["1 costo cambia"]);
  });

  it("las etiquetas se comparan como conjunto: cambiar el orden no cuenta, sumar o quitar sí", () => {
    expect(resumen((f) => (f.variantes[0].etiquetaIds = ["e2", "e1"])).total).toBe(0);
    const r = resumen((f) => (f.variantes[0].etiquetaIds = ["e2", "e3"]));
    expect(r.cambios).toEqual([{ tipo: "etiquetas", indice: 0, nombre: "Beige XS", suman: ["Etiqueta e3"], quitan: ["Etiqueta e1"] }]);
    expect(r.frases).toEqual(["1 variante cambia sus etiquetas"]);
  });

  it("corregir el color o la talla de una variante (ADR-0263) es un cambio: sin él, la barra no aparecería y no habría cómo guardarlo", () => {
    const r = resumen((f) => (f.variantes[1].identidad = id("Gris S")));
    expect(r.cambios).toEqual([{ tipo: "identidad", indice: 1, nombre: "Gris XS", antes: "Gris XS", despues: "Gris S" }]);
    expect(r.frases).toEqual(["1 variante cambia de color o talla"]);
    expect(r.frasesPasado).toEqual(["1 variante corregida de color o talla"]);
    expect(textoPendienteDeVariante(cambiosDeVariante(r, 1))).toBe("Color y talla: antes Gris XS");
    expect(agruparCambios(r.cambios)).toEqual([
      {
        clave: "identidad",
        titulo: "Color o talla corregidos",
        lineas: [{ texto: "Gris XS", antes: "Gris XS", despues: "Gris S" }],
        cantidad: 1,
        nota: NOTA_CORREGIDAS,
      },
    ]);
  });

  it("volver al color y la talla de al abrir deja la variante sin cambios", () => {
    expect(resumen((f) => (f.variantes[1].identidad = id("Gris XS"))).total).toBe(0);
  });

  it("una fila nueva es UN cambio, con lo que trae escrito; quitarla lo deja en cero", () => {
    const conFila = cambiar((f) => f.variantes.push({ id: null, nombre: "Rojo M", activo: true, precio: "80", costo: "50", etiquetaIds: [], identidad: id("Rojo M") }));
    const r = resumenDeCambios(ficha(), conFila, nombres);
    expect(r.cambios).toEqual([{ tipo: "nueva", indice: 3, nombre: "Rojo M", precio: "80" }]);
    expect(r.frases).toEqual(["1 variante se agrega"]);
    // Escribirle más cosas a la fila nueva no la cuenta dos veces.
    conFila.variantes[3].precio = "85";
    conFila.variantes[3].costo = "55";
    expect(resumenDeCambios(ficha(), conFila, nombres).total).toBe(1);
    conFila.variantes.pop();
    expect(resumenDeCambios(ficha(), conFila, nombres).total).toBe(0);
  });
});

describe("resumenDeCambios — fotos", () => {
  it("subir una foto y quitar otra son dos cambios", () => {
    const r = resumen((f) => (f.fotos = [f.fotos[0], { id: null, url: "u3", esPrincipal: false, colorCodigo: null }]));
    expect(r.cambios).toEqual([
      { tipo: "fotos_suman", cantidad: 1 },
      { tipo: "fotos_quitan", cantidad: 1 },
    ]);
    expect(r.frases).toEqual(["las fotos cambian"]);
    expect(r.frasesPasado).toEqual(["fotos actualizadas"]);
  });

  it("cambiar cuál es la principal, el color de una foto o el orden, también cuenta", () => {
    expect(resumen((f) => f.fotos.forEach((x) => (x.esPrincipal = !x.esPrincipal))).cambios).toEqual([{ tipo: "foto_principal" }]);
    expect(resumen((f) => (f.fotos[0].colorCodigo = "NEG")).cambios).toEqual([{ tipo: "fotos_color", cantidad: 1 }]);
    expect(resumen((f) => (f.fotos = [f.fotos[1], f.fotos[0]])).cambios).toEqual([{ tipo: "fotos_orden" }]);
  });

  it("una foto recién subida se reconoce por su dirección, no por un id que todavía no tiene", () => {
    const antes = ficha();
    antes.fotos.push({ id: null, url: "u3", esPrincipal: false, colorCodigo: null });
    const ahora = ficha();
    ahora.fotos.push({ id: null, url: "u3", esPrincipal: false, colorCodigo: null });
    expect(resumenDeCambios(antes, ahora, nombres).total).toBe(0);
  });
});

describe("resumenDeCambios — datos de la prenda", () => {
  it("cada dato dice qué era y qué es ahora, con nombres y no con ids", () => {
    const r = resumen((f) => {
      f.referencia = "Camisa Lino Verano";
      f.categoriaId = "c2";
      f.marcaId = "m2";
      f.descripcion = "Lino lavado";
      f.tejidoId = "";
      f.estado = "descontinuado";
      f.stockMinimo = "5";
      f.temporada = "verano";
      f.permitirVentaSinStock = true;
    });
    const dato = (campo: Parameters<typeof cambioDeDato>[1]) => cambioDeDato(r, campo);
    expect(dato("referencia")).toMatchObject({ etiqueta: "Nombre", antes: "Camisa Lino", despues: "Camisa Lino Verano" });
    expect(dato("categoria")).toMatchObject({ antes: "Categoría c1", despues: "Categoría c2" });
    expect(dato("marcaProveedor")).toMatchObject({ antes: "Marca m1 · Proveedor pr1", despues: "Marca m2 · Proveedor pr1" });
    expect(dato("descripcion")).toMatchObject({ antes: "(sin descripción)", despues: "«Lino lavado»" });
    expect(dato("tejido")).toMatchObject({ antes: "Tejido t1", despues: "ninguno" });
    expect(dato("estado")).toMatchObject({ antes: "Activo", despues: "Descontinuado" });
    expect(dato("stockMinimo")).toMatchObject({ antes: "sin definir", despues: "5" });
    expect(dato("temporada")).toMatchObject({ antes: "Igual que su categoría (Verano)", despues: "Temporada verano" });
    expect(dato("ventaSinStock")).toMatchObject({ antes: "no", despues: "sí" });
    expect(dato("patron")).toBeNull();
    expect(r.frases).toEqual(["9 datos de la prenda cambian"]);
  });

  it("los espacios sobrantes no son un cambio", () => {
    expect(resumen((f) => (f.referencia = "  Camisa Lino ")).total).toBe(0);
    expect(resumen((f) => (f.descripcion = "   ")).total).toBe(0);
  });

  it("un stock mínimo escrito como 05 es el mismo 5", () => {
    const antes = { ...ficha(), stockMinimo: "5" };
    const ahora = { ...ficha(), stockMinimo: "05" };
    expect(resumenDeCambios(antes, ahora, nombres).total).toBe(0);
  });
});

describe("resumenDeCambios — temporada por color", () => {
  it("dar a un color su propia temporada es un cambio, y quitársela otro", () => {
    const r = resumen((f) => (f.temporadaColor = { BEI: "invierno" }));
    expect(r.cambios).toEqual([{ tipo: "temporada_color", color: "Color BEI", antes: "Igual que su prenda", despues: "Temporada invierno" }]);
    expect(r.frases).toEqual(["1 temporada por color cambia"]);
  });

  it("un color sin entrada y uno con la clave vacía son lo mismo: ambos siguen a su prenda", () => {
    expect(resumen((f) => (f.temporadaColor = { BEI: "" })).total).toBe(0);
  });
});

describe("todo lo editable cuenta", () => {
  // Tipado contra `keyof FichaEditable`: si la ficha gana un campo y aquí no se lo prueba, no compila.
  const tocar: Record<keyof FichaEditable, (f: FichaEditable) => void> = {
    referencia: (f) => (f.referencia = "Otra"),
    categoriaId: (f) => (f.categoriaId = "c9"),
    descripcion: (f) => (f.descripcion = "algo"),
    estado: (f) => (f.estado = "descontinuado"),
    stockMinimo: (f) => (f.stockMinimo = "7"),
    temporada: (f) => (f.temporada = "verano"),
    permitirVentaSinStock: (f) => (f.permitirVentaSinStock = true),
    tejidoId: (f) => (f.tejidoId = "t9"),
    patronId: (f) => (f.patronId = "p9"),
    marcaId: (f) => (f.marcaId = "m9"),
    proveedorId: (f) => (f.proveedorId = "pr9"),
    temporadaColor: (f) => (f.temporadaColor = { BEI: "invierno" }),
    fotos: (f) => (f.fotos = []),
    variantes: (f) => (f.variantes[0].precio = "1"),
  };

  it("la lista de campos cubiertos y la ficha de prueba tienen exactamente los mismos campos", () => {
    expect(Object.keys(CAMPOS_CUBIERTOS).sort()).toEqual(Object.keys(ficha()).sort());
    expect(Object.keys(tocar).sort()).toEqual(Object.keys(ficha()).sort());
  });

  it.each(Object.keys(tocar) as (keyof FichaEditable)[])("tocar «%s» deja un cambio que guardar", (campo) => {
    expect(resumen(tocar[campo]).total).toBeGreaterThanOrEqual(1);
  });
});

describe("agruparCambios — lo que lee la hoja «Revisa y guarda los cambios»", () => {
  it("ordena los grupos igual siempre y no saca los vacíos", () => {
    const r = resumen((f) => {
      f.referencia = "Camisa Lino Verano";
      f.variantes[0].activo = true;
      f.variantes[1].activo = false;
      f.variantes[1].precio = "95";
      f.variantes[2].etiquetaIds = ["e1"];
      f.fotos = [];
      f.variantes.push({ id: null, nombre: "Rojo M", activo: true, precio: "80.5", costo: "", etiquetaIds: [], identidad: id("Rojo M") });
    });
    const grupos = agruparCambios(r.cambios);
    expect(grupos.map((g) => g.clave)).toEqual(["desactivan", "activan", "agregan", "precios", "etiquetas", "fotos", "datos"]);
    expect(grupos.map((g) => g.titulo)).toEqual(["Se desactivan", "Se activan", "Se agregan", "Precios", "Etiquetas", "Fotos", "Datos de la prenda"]);
    expect(grupos.find((g) => g.clave === "agregan")?.lineas).toEqual([{ texto: "Rojo M", detalle: "S/ 80.50" }]);
    expect(grupos.find((g) => g.clave === "precios")?.lineas).toEqual([{ texto: "Gris XS", antes: "S/ 90", despues: "S/ 95" }]);
    expect(grupos.find((g) => g.clave === "etiquetas")?.lineas).toEqual([{ texto: "Beige S", detalle: "+ Etiqueta e1" }]);
    expect(grupos.find((g) => g.clave === "fotos")?.lineas).toEqual([{ texto: "Se quitan 2 fotos" }, { texto: "Cambia la foto principal" }]);
  });

  it("sin cambios no hay grupos", () => {
    expect(agruparCambios(SIN_CAMBIOS.cambios)).toEqual([]);
  });
});

// ADR-0263: la sección de variantes manda los ejes de cada una (color y talla por separado), sus unidades, y puede cambiar
// muchas a la vez (corregir un color entero, un precio en bloque, «Agregar color»). La hoja lo dice en pocas líneas.
describe("agruparCambios — correcciones, precios en bloque y variantes nuevas (ADR-0263)", () => {
  /** Una variante con sus ejes, como la arma `variantesParaResumen`. */
  const conEjes = (idVar: string | null, color: string, talla: string, extra: Partial<VarianteFicha> = {}): VarianteFicha => ({
    id: idVar,
    nombre: `${color} ${talla}`.trim(),
    activo: true,
    precio: "90",
    costo: "60",
    etiquetaIds: [],
    identidad: {
      clave: `${color}|${talla}`,
      texto: `${color} ${talla}`.trim(),
      ejes: { color: { clave: color, texto: color }, talla: { clave: talla, texto: talla || "sin talla" } },
    },
    ...extra,
  });
  const prenda = (variantes: VarianteFicha[]): FichaEditable => ({ ...ficha(), variantes });
  const antes = prenda([conEjes("a", "Sin color", "S"), conEjes("b", "Sin color", "M"), conEjes("c", "Sin color", "L"), conEjes("d", "Azul", "S")]);

  it("tres variantes del mismo color corregidas al mismo color son UNA línea, con sus tallas al lado", () => {
    const ahora = prenda([conEjes("a", "Negro", "S"), conEjes("b", "Negro", "M"), conEjes("c", "Negro", "L"), conEjes("d", "Azul", "S")]);
    const r = resumenDeCambios(antes, ahora, nombres);
    expect(r.total).toBe(3);
    expect(r.cambios[0]).toEqual({
      tipo: "identidad",
      indice: 0,
      nombre: "Negro S",
      antes: "Sin color S",
      despues: "Negro S",
      color: { antes: "Sin color", despues: "Negro" },
      queda: "S",
    });
    const [grupo] = agruparCambios(r.cambios);
    expect(grupo).toEqual({
      clave: "identidad",
      titulo: "Color o talla corregidos",
      lineas: [{ texto: "3 variantes pasan de Sin color a Negro", detalle: "S, M, L" }],
      cantidad: 3,
      nota: NOTA_CORREGIDAS,
    });
  });

  it("una talla corregida dice de qué talla a cuál; si cambian las dos cosas, la variante entera", () => {
    const ahora = prenda([conEjes("a", "Sin color", "XS"), conEjes("b", "Sin color", "M"), conEjes("c", "Sin color", "L"), conEjes("d", "Rojo", "M")]);
    const lineas = agruparCambios(resumenDeCambios(antes, ahora, nombres).cambios)[0].lineas;
    expect(lineas).toEqual([{ texto: "1 variante pasa de talla S a XS" }, { texto: "Azul S pasa a ser Rojo M" }]);
  });

  it("quitarle la talla se dice «sin talla», y no se repite al lado", () => {
    const ahora = prenda([conEjes("a", "Sin color", ""), conEjes("b", "Sin color", "M"), conEjes("c", "Sin color", "L"), conEjes("d", "Azul", "S")]);
    expect(agruparCambios(resumenDeCambios(antes, ahora, nombres).cambios)[0].lineas).toEqual([{ texto: "1 variante pasa de talla S a sin talla" }]);
  });

  it("un precio en bloque es una línea con cuántas y cuáles; la insignia cuenta las variantes, no las líneas", () => {
    const ahora = prenda(antes.variantes.map((v) => ({ ...v, precio: v.id === "d" ? "120" : "99.90" })));
    const precios = agruparCambios(resumenDeCambios(antes, ahora, nombres).cambios).find((g) => g.clave === "precios");
    expect(precios).toEqual({
      clave: "precios",
      titulo: "Precios",
      lineas: [
        { texto: "3 variantes: Sin color S, Sin color M, Sin color L", antes: "S/ 90", despues: "S/ 99.90" },
        { texto: "Azul S", antes: "S/ 90", despues: "S/ 120" },
      ],
      cantidad: 4,
    });
  });

  it("muchas variantes se nombran cortas: las tres primeras y cuántas más", () => {
    const muchas = prenda(["XS", "S", "M", "L", "XL", "XXL"].map((t) => conEjes(t, "Negro", t)));
    const ahora = prenda(muchas.variantes.map((v) => ({ ...v, costo: "55" })));
    const costos = agruparCambios(resumenDeCambios(muchas, ahora, nombres).cambios)[0];
    expect(costos.lineas).toEqual([{ texto: "6 variantes: Negro XS, Negro S, Negro M y 3 más", antes: "S/ 60", despues: "S/ 55" }]);
  });

  it("«Agregar color» son variantes nuevas con el mismo precio: una línea, y la nota de que nacen sin unidades", () => {
    const ahora = prenda([...antes.variantes, conEjes(null, "Verde", "S"), conEjes(null, "Verde", "M")]);
    const agregan = agruparCambios(resumenDeCambios(antes, ahora, nombres).cambios)[0];
    expect(agregan).toEqual({
      clave: "agregan",
      titulo: "Se agregan",
      lineas: [{ texto: "2 variantes: Verde S, Verde M", detalle: "S/ 90" }],
      cantidad: 2,
      nota: NACEN_SIN_UNIDADES,
    });
  });

  it("desactivar una variante con unidades dice cuántas tiene y que siguen en el inventario", () => {
    const ahora = prenda(antes.variantes.map((v) => (v.id === "a" ? { ...v, activo: false, unidades: 17 } : v.id === "b" ? { ...v, activo: false, unidades: 0 } : v)));
    const r = resumenDeCambios(antes, ahora, nombres);
    expect(r.cambios).toEqual([
      { tipo: "desactiva", indice: 0, nombre: "Sin color S", unidades: 17 },
      { tipo: "desactiva", indice: 1, nombre: "Sin color M" },
    ]);
    expect(agruparCambios(r.cambios)).toEqual([
      {
        clave: "desactivan",
        titulo: "Se desactivan",
        lineas: [{ texto: "Sin color S", detalle: "17 u. en stock" }, { texto: "Sin color M" }],
        cantidad: 2,
        nota: NOTA_DESACTIVADAS_CON_STOCK,
      },
    ]);
  });

  it("sin unidades no hay nota: no hay nada que siga en el inventario", () => {
    const ahora = prenda(antes.variantes.map((v) => (v.id === "a" ? { ...v, activo: false } : v)));
    expect(agruparCambios(resumenDeCambios(antes, ahora, nombres).cambios)[0].nota).toBeUndefined();
  });
});

describe("las filas de la tabla", () => {
  it("cada fila recibe solo sus cambios, y dice qué le va a pasar", () => {
    const r = resumen((f) => {
      f.variantes[1].activo = false;
      f.variantes[1].precio = "95";
      f.variantes[2].costo = "40";
    });
    expect(cambiosDeVariante(r, 0)).toEqual([]);
    expect(textoPendienteDeVariante(cambiosDeVariante(r, 1))).toBe("Se desactiva al guardar · Precio: antes S/ 90");
    expect(textoPendienteDeVariante(cambiosDeVariante(r, 2))).toBe("Costo: antes sin costo");
    expect(textoPendienteDeVariante([])).toBe("");
  });

  it("una fila nueva dice que se agrega", () => {
    const conFila = cambiar((f) => f.variantes.push({ id: null, nombre: "Rojo M", activo: true, precio: "80", costo: "", etiquetaIds: [], identidad: id("Rojo M") }));
    const r = resumenDeCambios(ficha(), conFila, nombres);
    expect(textoPendienteDeVariante(cambiosDeVariante(r, 3))).toBe("Se agrega al guardar");
  });
});

describe("textoDeSalidaDeFicha — lo que dice «¿Salir sin guardar?»", () => {
  it("dice cuántos cambios se pierden y de qué prenda", () => {
    expect(textoDeSalidaDeFicha(3, "Camisa Lino")).toBe("Tienes 3 cambios sin guardar en «Camisa Lino». Si sales ahora, se pierden.");
  });
  it("dice «1 cambio» en singular", () => {
    expect(textoDeSalidaDeFicha(1, "Blusa")).toBe("Tienes 1 cambio sin guardar en «Blusa». Si sales ahora, se pierden.");
  });
});

describe("formatoPrecio y formatoCosto", () => {
  it("enteros sin decimales, fracciones con dos, y el vacío se dice", () => {
    expect(formatoPrecio("90")).toBe("S/ 90");
    expect(formatoPrecio("90.5")).toBe("S/ 90.50");
    expect(formatoPrecio("")).toBe("sin precio");
    expect(formatoPrecio("  ")).toBe("sin precio");
    expect(formatoCosto("")).toBe("sin costo");
    expect(formatoCosto("60")).toBe("S/ 60");
  });
});
