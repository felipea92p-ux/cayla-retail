import { describe, expect, it } from "vitest";
import {
  comoPrincipal,
  conFotosNuevas,
  estadoDeColor,
  fotosDelColor,
  pasadaAColor,
  pendienteDeFoto,
  primeraEnSuColor,
  sePuedePonerPrimera,
  sinLaFoto,
  textoCuenta,
  textoEstadoColor,
  vistaDeFotos,
  type FotoLocal,
} from "./fotos-por-color-reglas";

// La prenda de la captura de Felipe (CMS-0001): Beige, Celeste, Gris antracita y Rosado; una foto por color, la de Celeste
// principal. `f(clave, color, principal)` arma una foto sin escribir la url cada vez.
const f = (clientKey: string, colorCodigo: string | null, esPrincipal = false): FotoLocal => ({ clientKey, id: clientKey, url: `${clientKey}.jpg`, esPrincipal, colorCodigo });
const claves = (fotos: readonly { clientKey: string }[]) => fotos.map((x) => x.clientKey);
const principales = (fotos: readonly FotoLocal[]) => fotos.filter((x) => x.esPrincipal).map((x) => x.clientKey);
const CAPTURA = [f("cel", "CEL", true), f("bei", "BEI"), f("gri", "GRI"), f("ros", "ROS")];
const COLORES = ["BEI", "CEL", "GRI", "ROS"];

describe("estadoDeColor — qué se ve en un color", () => {
  it("su foto, la general, o nada", () => {
    expect(estadoDeColor(2, 0)).toBe("con-fotos");
    expect(estadoDeColor(1, 1)).toBe("con-fotos"); // la propia gana a la general
    expect(estadoDeColor(0, 1)).toBe("usa-la-general");
    expect(estadoDeColor(0, 0)).toBe("sin-foto");
  });
});

describe("vistaDeFotos — una tarjeta por color de la prenda", () => {
  it("la prenda de la captura: 4 de 4 colores con foto y nada que avisar", () => {
    const v = vistaDeFotos(COLORES, CAPTURA);
    expect(v.tarjetas.map((t) => [t.codigo, t.estado])).toEqual([["BEI", "con-fotos"], ["CEL", "con-fotos"], ["GRI", "con-fotos"], ["ROS", "con-fotos"]]);
    expect([v.conFoto, v.total]).toEqual([4, 4]);
    expect(v.huerfanas).toEqual([]);
    expect(v.general.visible).toBe(true); // 4 colores: se ofrece «Todos los colores»
  });

  it("un color sin foto se marca, y con una general dice que la usa", () => {
    expect(vistaDeFotos(COLORES, [f("cel", "CEL", true)]).tarjetas.map((t) => t.estado)).toEqual(["sin-foto", "con-fotos", "sin-foto", "sin-foto"]);
    const conGeneral = vistaDeFotos(COLORES, [f("gen", null, true), f("cel", "CEL")]);
    expect(conGeneral.tarjetas.map((t) => t.estado)).toEqual(["usa-la-general", "con-fotos", "usa-la-general", "usa-la-general"]);
    expect(conGeneral.conFoto).toBe(1); // la general no cuenta como «foto propia»
  });

  it("los colores se toman en el orden de las variantes y sin repetir", () => {
    expect(vistaDeFotos(["ROS", "BEI", "ROS"], []).tarjetas.map((t) => t.codigo)).toEqual(["ROS", "BEI"]);
  });

  it("una foto de un color que la prenda ya no vende no se pierde: queda como huérfana", () => {
    const v = vistaDeFotos(COLORES, [...CAPTURA, f("oli", "OLI")]);
    expect(claves(v.huerfanas)).toEqual(["oli"]);
    expect(v.tarjetas.every((t) => !claves(t.fotos).includes("oli"))).toBe(true);
    expect(v.conFoto).toBe(4);
  });

  it("«Todos los colores» aparece con 2+ colores, o si ya hay fotos así; con un solo color no estorba", () => {
    expect(vistaDeFotos(["ROS"], [f("ros", "ROS", true)]).general.visible).toBe(false);
    expect(vistaDeFotos(["ROS"], [f("gen", null, true)]).general.visible).toBe(true); // ya existe: no se esconde
    expect(vistaDeFotos(["ROS", "BEI"], []).general.visible).toBe(true);
  });

  it("una prenda sin colores tiene una sola tarjeta: las fotos de la prenda", () => {
    const v = vistaDeFotos([null], [f("a", null, true)]);
    expect(v.tarjetas).toEqual([]);
    expect(v.general).toMatchObject({ visible: true, sinColores: true });
    expect(claves(v.general.fotos)).toEqual(["a"]);
    expect(v.total).toBe(0);
    expect(textoCuenta(v)).toBeNull();
  });

  it("sin colores, una foto con color no se pierde: es huérfana", () => {
    expect(claves(vistaDeFotos([], [f("x", "CEL", true)]).huerfanas)).toEqual(["x"]);
  });
});

describe("fotosDelColor — el orden con que las ve el resto del ERP (fotoDeVariante)", () => {
  it("la principal primero, después el orden guardado", () => {
    const fotos = [f("a", "CEL"), f("b", "CEL", true), f("c", "CEL"), f("z", "BEI")];
    expect(claves(fotosDelColor(fotos, "CEL"))).toEqual(["b", "a", "c"]);
  });
  it("las generales son las de color nulo", () => {
    expect(claves(fotosDelColor([f("g", null), f("a", "CEL")], null))).toEqual(["g"]);
  });
});

describe("agregar y quitar — siempre exactamente una principal", () => {
  it("la primera foto de todas queda principal; las siguientes no le quitan el lugar", () => {
    const una = conFotosNuevas([], [f("a", "CEL")]);
    expect(principales(una)).toEqual(["a"]);
    expect(principales(conFotosNuevas(una, [f("b", "BEI")]))).toEqual(["a"]);
  });

  it("varias nuevas a la vez sobre una prenda sin principal: solo la primera lo es", () => {
    expect(principales(conFotosNuevas([], [f("a", "CEL"), f("b", "BEI")]))).toEqual(["a"]);
  });

  it("quitar la principal pasa el lugar a la primera que quede", () => {
    const r = sinLaFoto(CAPTURA, "cel");
    expect(claves(r)).toEqual(["bei", "gri", "ros"]);
    expect(principales(r)).toEqual(["bei"]);
  });

  it("quitar una que no era principal no mueve la principal, y quitar la última deja la lista vacía", () => {
    expect(principales(sinLaFoto(CAPTURA, "ros"))).toEqual(["cel"]);
    expect(sinLaFoto([f("a", "CEL", true)], "a")).toEqual([]);
  });

  it("no toca la lista de entrada", () => {
    const copia = JSON.stringify(CAPTURA);
    sinLaFoto(CAPTURA, "cel");
    conFotosNuevas(CAPTURA, [f("n", "BEI")]);
    comoPrincipal(CAPTURA, "bei");
    pasadaAColor(CAPTURA, "bei", "ROS");
    primeraEnSuColor(CAPTURA, "bei");
    expect(JSON.stringify(CAPTURA)).toBe(copia);
  });
});

describe("comoPrincipal", () => {
  it("una sola principal en toda la prenda", () => {
    expect(principales(comoPrincipal(CAPTURA, "ros"))).toEqual(["ros"]);
  });
  it("una clave que no existe no deja la prenda sin principal", () => {
    expect(principales(comoPrincipal(CAPTURA, "nada"))).toEqual(["cel"]);
  });
});

describe("primeraEnSuColor / sePuedePonerPrimera — cuál se ve en el color", () => {
  const dos = [f("a", "CEL"), f("b", "CEL"), f("z", "BEI", true)];
  it("va antes de las demás de SU color y no cambia de color", () => {
    const r = primeraEnSuColor(dos, "b");
    expect(claves(fotosDelColor(r, "CEL"))).toEqual(["b", "a"]);
    expect(r.find((x) => x.clientKey === "b")?.colorCodigo).toBe("CEL");
    expect(principales(r)).toEqual(["z"]);
  });
  it("solo se ofrece cuando cambia algo", () => {
    expect(sePuedePonerPrimera(dos, "b")).toBe(true);
    expect(sePuedePonerPrimera(dos, "a")).toBe(false); // ya es la primera
    expect(sePuedePonerPrimera(dos, "z")).toBe(false); // es la única de su color
    // el color que tiene a la principal: la principal manda; lo que se elige es otra principal
    const conPrincipal = [f("a", "CEL", true), f("b", "CEL")];
    expect(sePuedePonerPrimera(conPrincipal, "b")).toBe(false);
    expect(sePuedePonerPrimera(dos, "no-existe")).toBe(false);
  });
});

describe("pasadaAColor — a otro color de la prenda, o a «Todos los colores»", () => {
  it("cambia el color y no toca la principal", () => {
    const r = pasadaAColor(CAPTURA, "bei", "ROS");
    expect(r.find((x) => x.clientKey === "bei")?.colorCodigo).toBe("ROS");
    expect(principales(r)).toEqual(["cel"]);
    expect(r).toHaveLength(4);
  });

  it("queda al final de las de su nuevo color: no le roba la portada a la que ya estaba", () => {
    const antes = [f("nueva", "BEI"), f("ros1", "ROS"), f("ros2", "ROS"), f("cel", "CEL", true)];
    const r = pasadaAColor(antes, "nueva", "ROS");
    expect(claves(fotosDelColor(r, "ROS"))).toEqual(["ros1", "ros2", "nueva"]);
  });

  it("a un color sin fotos va al final de la lista; a «Todos los colores» es color nulo", () => {
    expect(claves(pasadaAColor(CAPTURA, "cel", "BEI")).at(-1)).not.toBe("cel"); // BEI ya tenía la suya: va tras ella
    expect(pasadaAColor(CAPTURA, "gri", null).find((x) => x.clientKey === "gri")?.colorCodigo).toBeNull();
    expect(claves(pasadaAColor([f("a", "CEL", true), f("b", "BEI")], "a", "ROS"))).toEqual(["b", "a"]);
  });

  it("pasarla al color que ya tiene, o una clave que no existe, no cambia nada", () => {
    expect(pasadaAColor(CAPTURA, "bei", "BEI")).toEqual(CAPTURA);
    expect(pasadaAColor(CAPTURA, "nada", "ROS")).toEqual(CAPTURA);
  });

  it("sacar la foto de un color huérfano lo resuelve: deja de haber huérfanas", () => {
    const fotos = [...CAPTURA, f("oli", "OLI")];
    expect(vistaDeFotos(COLORES, pasadaAColor(fotos, "oli", "GRI")).huerfanas).toEqual([]);
  });
});

describe("pendienteDeFoto — lo que la barra «sin guardar» cuenta, marcado en la foto", () => {
  const guardadas = new Map<string, string | null>([["cel", "CEL"], ["bei", "BEI"]]);
  it("nueva si todavía no existe, movida si cambió de color, nada si sigue como estaba", () => {
    expect(pendienteDeFoto(f("nueva", "ROS"), guardadas)).toBe("nueva");
    expect(pendienteDeFoto(f("bei", "ROS"), guardadas)).toBe("movida");
    expect(pendienteDeFoto(f("bei", "BEI"), guardadas)).toBeNull();
    expect(pendienteDeFoto(f("cel", null), guardadas)).toBe("movida"); // pasada a «Todos los colores»
  });
});

describe("los textos", () => {
  it("la cuenta dice cuántos colores tienen foto, y avisa que el resto se ve sin foto solo si nada los cubre", () => {
    const v = vistaDeFotos(COLORES, [f("cel", "CEL", true)]);
    expect(textoCuenta(v)).toBe("1 de 4 colores con foto · los demás se ven sin foto");
    expect(textoCuenta(vistaDeFotos(COLORES, [f("g", null, true), f("cel", "CEL")]))).toBe("1 de 4 colores con foto");
    expect(textoCuenta(vistaDeFotos(["ROS"], [f("ros", "ROS", true)]))).toBe("1 de 1 color con foto");
    expect(textoCuenta(vistaDeFotos(COLORES, CAPTURA))).toBe("4 de 4 colores con foto");
  });

  it("lo que dice cada tarjeta", () => {
    expect(textoEstadoColor("con-fotos", 1)).toBe("1 foto");
    expect(textoEstadoColor("con-fotos", 3)).toBe("3 fotos");
    expect(textoEstadoColor("usa-la-general", 0)).toBe("usa la general");
    expect(textoEstadoColor("sin-foto", 0)).toBe("Sin foto");
  });
});
