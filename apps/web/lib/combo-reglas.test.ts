import { describe, expect, it } from "vitest";
import {
  comboLlegoAlFinal,
  comboNecesitaBuscador,
  TAMANO_PAGINA_COMBO,
  UMBRAL_BUSCAR_COMBO,
  coincidenciaCombo,
  filtrarCombo,
  mismoNombreCombo,
  normalizarBusqueda,
  ordenarPorGrupo,
  primeraElegible,
  siguienteElegible,
  tramosPorGrupo,
} from "./combo-reglas";

describe("comboNecesitaBuscador", () => {
  it("no busca con el umbral exacto", () => {
    expect(comboNecesitaBuscador(UMBRAL_BUSCAR_COMBO)).toBe(false);
  });

  it("busca apenas se pasa del umbral", () => {
    expect(comboNecesitaBuscador(UMBRAL_BUSCAR_COMBO + 1)).toBe(true);
  });

  it("no busca con una lista corta", () => {
    expect(comboNecesitaBuscador(3)).toBe(false);
  });

  it("no busca sin opciones", () => {
    expect(comboNecesitaBuscador(0)).toBe(false);
  });
});

describe("comboLlegoAlFinal", () => {
  it("no llegó si sobra scroll", () => {
    expect(comboLlegoAlFinal({ scrollTop: 0, clientHeight: 200, scrollHeight: 1000 })).toBe(false);
  });

  it("llegó cuando el resto cabe en el margen por defecto", () => {
    expect(comboLlegoAlFinal({ scrollTop: 780, clientHeight: 200, scrollHeight: 1000 })).toBe(true);
  });

  it("respeta un margen propio", () => {
    expect(comboLlegoAlFinal({ scrollTop: 700, clientHeight: 200, scrollHeight: 1000 }, 100)).toBe(true);
    expect(comboLlegoAlFinal({ scrollTop: 650, clientHeight: 200, scrollHeight: 1000 }, 100)).toBe(false);
  });

  it("una lista que no se desplaza ya está en el fondo", () => {
    expect(comboLlegoAlFinal({ scrollTop: 0, clientHeight: 200, scrollHeight: 200 })).toBe(true);
  });
});

describe("umbrales", () => {
  it("8 y 50, los números que pidió Felipe", () => {
    expect(UMBRAL_BUSCAR_COMBO).toBe(8);
    expect(TAMANO_PAGINA_COMBO).toBe(50);
  });
});

describe("coincidenciaCombo", () => {
  const gris = { texto: "Gris", claves: ["plomo"] };
  const vino = { texto: "Vino", detalle: "Rojo", claves: ["guinda", "borgoña"] };

  it("por el texto o el detalle: responde sin clave que mostrar", () => {
    expect(coincidenciaCombo(gris, "gri")).toBe("");
    expect(coincidenciaCombo(vino, "rojo")).toBe("");
  });

  it("por un sinónimo: devuelve cuál, para que la lista lo muestre", () => {
    expect(coincidenciaCombo(gris, "plom")).toBe("plomo");
    expect(coincidenciaCombo(vino, "borgona")).toBe("borgoña");
  });

  it("si no responde por nada, null; sin texto escrito, todas responden", () => {
    expect(coincidenciaCombo(gris, "azul")).toBeNull();
    expect(coincidenciaCombo({ texto: "Azul" }, "plomo")).toBeNull();
    expect(coincidenciaCombo(gris, "")).toBe("");
    expect(coincidenciaCombo(gris, "  ..  ")).toBe("");
  });

  it("un sinónimo mal tipeado también responde, y dice cuál", () => {
    expect(coincidenciaCombo(gris, "plmo")).toBe("plomo");
  });
});

describe("normalizarBusqueda", () => {
  it("junta espacios, baja mayúsculas y quita tildes y la ñ", () => {
    expect(normalizarBusqueda("  La   Femme ")).toBe("la femme");
    expect(normalizarBusqueda("Crepé AÑIL")).toBe("crepe anil");
  });

  it("separa la letra pegada al número, en los dos sentidos", () => {
    expect(normalizarBusqueda("Femme21")).toBe("femme 21");
    expect(normalizarBusqueda("3XL")).toBe("3 xl");
  });

  it("los signos valen por un espacio", () => {
    expect(normalizarBusqueda("CORPORACION LA FEMME21 S.A.C.")).toBe("corporacion la femme 21 s a c");
    expect(normalizarBusqueda("T-shirt")).toBe("t shirt");
  });

  it("nada o puro signo queda vacío", () => {
    expect(normalizarBusqueda(null)).toBe("");
    expect(normalizarBusqueda(" .. / ")).toBe("");
  });
});

// El caso que motivó la regla (2026-09-29): la marca y su proveedor, tal como están en producción.
describe("filtrarCombo · el buscador de marca y proveedor de Nuevo producto", () => {
  const pareja = (texto: string, proveedor: string) => ({ texto, detalle: `la trae ${proveedor}` });
  const lista = [
    pareja("CAYLA", "Taller Lima"),
    pareja("Divas Now", "Divas SAC"),
    pareja("Kristell", "Importaciones Kristell EIRL"),
    pareja("La Femme 21", "Liz Vanesa Soto Quispe"),
    pareja("La Femme 21", "CORPORACION LA FEMME21 S.A.C."),
    pareja("Lino Sur", "Textiles del Sur"),
    pareja("Moda Viva", "Inversiones Viva"),
  ];
  const buscar = (q: string) => filtrarCombo(lista, q, (o) => o).map((o) => `${o.texto} · ${o.detalle}`);
  const femme = ["La Femme 21 · la trae Liz Vanesa Soto Quispe", "La Femme 21 · la trae CORPORACION LA FEMME21 S.A.C."];

  it("«La   Femme21» —tres espacios y el número pegado— encuentra las dos parejas", () => {
    expect(buscar("La   Femme21")).toEqual(femme);
  });

  it("cualquier forma de escribirlo: mayúsculas, sin espacios, pegado o con el número primero", () => {
    for (const q of ["la femme 21", "LA FEMME21", "femme 21", "femme21", "21 femme", "lafemme21", "lafemme 21", "  La  Femme  21  "]) {
      expect(buscar(q), q).toEqual(femme);
    }
  });

  it("por proveedor: sin tildes, sin S.A.C. y con el nombre a medias", () => {
    expect(buscar("corporacion")).toEqual([femme[1]]);
    expect(buscar("liz vanesa")).toEqual([femme[0]]);
    expect(buscar("taller lima")).toEqual(["CAYLA · la trae Taller Lima"]);
  });

  it("con un error de tipeo (letra de más, de menos, cambiada o dos vecinas cambiadas)", () => {
    for (const q of ["La Feme 21", "La Femmee 21", "La Fenme 21", "la fmeme 21", "femm21"]) {
      expect(buscar(q), q).toEqual(femme);
    }
  });

  it("con un error de tipeo mientras todavía se escribe", () => {
    expect(buscar("femn")).toEqual(femme);
    expect(buscar("kristel")).toEqual(["Kristell · la trae Importaciones Kristell EIRL"]);
  });

  it("si algo coincide tal cual, lo aproximado no se cuela", () => {
    // «cayla» es exacto: no aparece nada que solo se le parezca. Y «lino» no arrastra a «Kristell» ni a «Viva».
    expect(buscar("cayla")).toEqual(["CAYLA · la trae Taller Lima"]);
    expect(buscar("lino")).toEqual(["Lino Sur · la trae Textiles del Sur"]);
  });

  it("los números no se corrigen: otra numeración es otra marca", () => {
    expect(buscar("La Femme 22")).toEqual([]);
    expect(buscar("La Femme 2")).toEqual(femme);
  });

  it("con palabras cortas no hay corrección: una letra ya es otra palabra", () => {
    expect(buscar("cyl")).toEqual([]);
    expect(buscar("zzzz")).toEqual([]);
  });

  it("sin texto (o solo signos), la lista entera y en su orden", () => {
    expect(buscar("")).toHaveLength(lista.length);
    expect(buscar("  ")).toHaveLength(lista.length);
    expect(buscar(" . ")).toHaveLength(lista.length);
  });

  it("primero lo que aparece tal cual, luego las palabras sueltas, luego sin espacios", () => {
    const items = [{ texto: "Sur Lino" }, { texto: "Linosur" }, { texto: "Lino Sur" }];
    // «lino sur»: tal cual → «Lino Sur»; sus palabras sueltas → «Sur Lino»; sin espacios → «Linosur».
    expect(filtrarCombo(items, "lino sur", (o) => o).map((o) => o.texto)).toEqual(["Lino Sur", "Sur Lino", "Linosur"]);
  });

  it("los aproximados van del más al menos parecido, aunque la lista los traiga al revés", () => {
    const items = [{ texto: "Camisa Rosa" }, { texto: "Camisa Rossa" }];
    // «camissa rossa» no está tal cual en ninguno: «Camisa Rossa» tiene 1 error (camisa), «Camisa Rosa» tiene 2.
    expect(filtrarCombo(items, "camissa rossa", (o) => o).map((o) => o.texto)).toEqual(["Camisa Rossa", "Camisa Rosa"]);
  });

  it("encuentra por sinónimo y por sinónimo mal tipeado", () => {
    const colores = [{ texto: "Gris", claves: ["plomo"] }, { texto: "Vino", claves: ["guinda"] }];
    expect(filtrarCombo(colores, "plomo", (o) => o)).toEqual([colores[0]]);
    expect(filtrarCombo(colores, "guinba", (o) => o)).toEqual([colores[1]]);
  });
});

describe("mismoNombreCombo", () => {
  it("es el nombre que la base considera igual: espacios juntados, sin mayúsculas ni tildes", () => {
    expect(mismoNombreCombo("La   Femme 21", "la femme 21")).toBe(true);
    expect(mismoNombreCombo("Crepé", "CREPE")).toBe(true);
  });

  it("«Femme21» no es «Femme 21» para la base: no se esconde el registrar por eso", () => {
    expect(mismoNombreCombo("Femme21", "Femme 21")).toBe(false);
  });

  it("vacío nunca es igual a nada", () => {
    expect(mismoNombreCombo("", "")).toBe(false);
    expect(mismoNombreCombo("  ", "")).toBe(false);
  });
});

describe("opciones que se ven pero no se eligen", () => {
  // Como el combo de cuentas: dos bancos, un cajón con la caja cerrada y otro abierto.
  const cuentas = [{ deshabilitada: false }, { deshabilitada: false }, { deshabilitada: true }, { deshabilitada: false }];

  it("las flechas saltan la bloqueada, en las dos direcciones", () => {
    expect(siguienteElegible(cuentas, 1, 1)).toBe(3);
    expect(siguienteElegible(cuentas, 3, -1)).toBe(1);
  });

  it("en el borde, o sin otra elegible, se quedan donde están", () => {
    expect(siguienteElegible(cuentas, 3, 1)).toBe(3);
    expect(siguienteElegible(cuentas, 0, -1)).toBe(0);
    expect(siguienteElegible([{ deshabilitada: false }, { deshabilitada: true }], 0, 1)).toBe(0);
  });

  it("Inicio y Fin van a la primera y la última elegibles; sin ninguna, −1", () => {
    const bordes = [{ deshabilitada: true }, { deshabilitada: false }, { deshabilitada: false }, { deshabilitada: true }];
    expect(primeraElegible(bordes)).toBe(1);
    expect(primeraElegible(bordes, true)).toBe(2);
    expect(primeraElegible([{ deshabilitada: true }])).toBe(-1);
  });

  it("sin `deshabilitada` todas se eligen: el combo de siempre no cambia", () => {
    const simples = [{}, {}, {}];
    expect(siguienteElegible(simples, 0, 1)).toBe(1);
    expect(primeraElegible(simples, true)).toBe(2);
  });
});

describe("tramosPorGrupo", () => {
  it("agrupa las seguidas del mismo grupo y conserva el índice plano", () => {
    const opciones = [{ grupo: "Bancos" }, { grupo: "Bancos" }, { grupo: "Cajones" }];
    expect(tramosPorGrupo(opciones).map((t) => [t.grupo, t.items.map((x) => x.i)])).toEqual([
      ["Bancos", [0, 1]],
      ["Cajones", [2]],
    ]);
  });

  it("una opción suelta arriba («Aún no llegan») va sin título, antes del grupo", () => {
    const opciones = [{}, { grupo: "No van a llegar" }, { grupo: "No van a llegar" }];
    expect(tramosPorGrupo(opciones).map((t) => [t.grupo, t.items.length])).toEqual([
      [undefined, 1],
      ["No van a llegar", 2],
    ]);
  });

  it("sin grupos, un solo tramo sin título: la lista de siempre", () => {
    expect(tramosPorGrupo([{}, {}]).map((t) => [t.grupo, t.items.length])).toEqual([[undefined, 2]]);
    expect(tramosPorGrupo([])).toEqual([]);
  });
});

describe("ordenarPorGrupo · buscar no parte un tramo ni repite su título (revisión 2026-10-05)", () => {
  // El caso de la revisión: dos exactas y una parecida; «lisboa palazzo» acierta MEJOR en la parecida que en una exacta.
  const opciones = [
    { texto: "Pantalón Palazzo Lisboa", grupo: "Igual a lo que anotó caja" },
    { texto: "Pantalón Lisboa Palazzo Recto", grupo: "Igual a lo que anotó caja" },
    { texto: "Pantalón Lisboa Palazzo", grupo: "Color parecido" },
  ];
  const buscar = (q: string) =>
    ordenarPorGrupo(
      filtrarCombo(opciones, q, (o) => o),
      opciones,
      (o) => o.grupo,
    );

  it("el filtro solo intercala los tramos (por eso existe esto)", () => {
    const sinOrdenar = filtrarCombo(opciones, "lisboa palazzo", (o) => o);
    expect(tramosPorGrupo(sinOrdenar).map((t) => t.grupo)).toEqual(["Igual a lo que anotó caja", "Color parecido", "Igual a lo que anotó caja"]);
  });

  it("con el orden por grupo, cada título sale una sola vez y en el orden de la lista", () => {
    expect(tramosPorGrupo(buscar("lisboa palazzo")).map((t) => t.grupo)).toEqual(["Igual a lo que anotó caja", "Color parecido"]);
  });

  it("dentro de cada grupo manda el filtro: el mejor acierto primero", () => {
    const filtradas = filtrarCombo(opciones, "lisboa palazzo", (o) => o).filter((o) => o.grupo === "Igual a lo que anotó caja");
    expect(buscar("lisboa palazzo").filter((o) => o.grupo === "Igual a lo que anotó caja")).toEqual(filtradas);
  });

  it("sin buscar, o sin grupos, la lista queda igual", () => {
    expect(buscar("")).toEqual(opciones);
    const sueltas = [{ texto: "b" }, { texto: "a" }];
    expect(ordenarPorGrupo(sueltas, sueltas, () => undefined)).toEqual(sueltas);
  });

  it("un grupo que llega primero en lo filtrado pero va después en la lista vuelve a su lugar", () => {
    const todas = [{ g: "A", n: 1 }, { g: "B", n: 2 }, { g: "A", n: 3 }];
    expect(ordenarPorGrupo([todas[1], todas[2], todas[0]], todas, (o) => o.g).map((o) => o.n)).toEqual([3, 1, 2]);
  });
});
