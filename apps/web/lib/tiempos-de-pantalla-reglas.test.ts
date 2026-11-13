import { describe, expect, it } from "vitest";
import { MS_TOPE_DESTINO } from "./navegacion-al-instante";
import {
  armarLote,
  destinoDeLaNavegacion,
  leerLote,
  lineaDeRegistro,
  pasoDelCronometro,
  patronDeRuta,
  type CronometroEnCurso,
  type TiempoDePantalla,
} from "./tiempos-de-pantalla-reglas";

const AQUI = { pathname: "/vender", origin: "https://erp.cayla.pe" };
const SEDE = "3f2c1a9e-8b7d-4c6e-9f10-2a3b4c5d6e7f";
const ID = "0b6e4c2a-1f3d-4e5a-8b9c-7d6e5f4a3b2c";

describe("destinoDeLaNavegacion (ADR-0654): solo se mide cambiar de pantalla", () => {
  it("otra pantalla de la app: su pathname, sin el `?…`", () => {
    expect(destinoDeLaNavegacion("/inventario?sede=x&q=blusa", "push", AQUI)).toBe("/inventario");
    expect(destinoDeLaNavegacion("https://erp.cayla.pe/productos/abc", "replace", AQUI)).toBe("/productos/abc");
  });

  it("la misma pantalla con otro filtro, búsqueda o mes NO es cambiar de módulo", () => {
    expect(destinoDeLaNavegacion("/vender?q=blusa", "replace", AQUI)).toBeNull();
    expect(destinoDeLaNavegacion("/vender", "push", AQUI)).toBeNull();
  });

  it("«atrás» y «adelante» dibujan la copia guardada: no se miden", () => {
    expect(destinoDeLaNavegacion("/inventario", "traverse", AQUI)).toBeNull();
  });

  it("otro sitio o una dirección rota: no se mide", () => {
    expect(destinoDeLaNavegacion("https://otro.com/inventario", "push", AQUI)).toBeNull();
    expect(destinoDeLaNavegacion("http://[::1", "push", AQUI)).toBeNull();
  });
});

describe("pasoDelCronometro: llega cuando la pantalla nueva está a la vista sin esqueleto", () => {
  const c: CronometroEnCurso = { inicio: 1000, desde: "/vender", vioEsqueleto: false };
  const vista = { pathname: "/inventario", hayEsqueleto: false, pathnameDelMarco: "/inventario" };

  it("con el esqueleto del marco (la pestaña aún dice la pantalla de antes) sigue, y anota que lo vio", () => {
    const r = pasoDelCronometro(c, { ...vista, ahora: 1100, pathname: "/vender", hayEsqueleto: true, pathnameDelMarco: "/vender" });
    expect(r).toEqual({ estado: "sigue", cronometro: { ...c, vioEsqueleto: true } });
  });

  it("con el `loading.tsx` a la vista (dirección nueva, esqueleto) sigue", () => {
    expect(pasoDelCronometro(c, { ...vista, ahora: 1400, hayEsqueleto: true }).estado).toBe("sigue");
  });

  it("dirección nueva sin esqueleto y el marco al día: llegó, con los ms desde el clic", () => {
    expect(pasoDelCronometro({ ...c, vioEsqueleto: true }, { ...vista, ahora: 2734.4 })).toEqual({ estado: "llego", ms: 1734, sinEsqueleto: false });
  });

  it("sin haber visto nunca un esqueleto (la copia del router): llegó y lo dice", () => {
    expect(pasoDelCronometro(c, { ...vista, ahora: 1090 })).toEqual({ estado: "llego", ms: 90, sinEsqueleto: true });
  });

  it("la dirección cambió pero el marco todavía no anotó la ruta (o no es el ERP): sigue, nunca un patrón viejo", () => {
    expect(pasoDelCronometro(c, { ...vista, ahora: 1200, pathnameDelMarco: "/vender" }).estado).toBe("sigue");
    expect(pasoDelCronometro(c, { ...vista, ahora: 1200, pathnameDelMarco: null }).estado).toBe("sigue");
  });

  it("el tope es el del esqueleto del marco (ADR-0628): justo en el tope cuenta, pasado se descarta", () => {
    expect(pasoDelCronometro(c, { ...vista, ahora: 1000 + MS_TOPE_DESTINO })).toEqual({ estado: "llego", ms: MS_TOPE_DESTINO, sinEsqueleto: true });
    expect(pasoDelCronometro(c, { ...vista, ahora: 1001 + MS_TOPE_DESTINO })).toEqual({ estado: "descarta" });
    // Aunque siga esperando: lo que no llegó en 15 s no es una pantalla lenta, es una que no llegó.
    expect(pasoDelCronometro(c, { ...vista, ahora: 1001 + MS_TOPE_DESTINO, hayEsqueleto: true })).toEqual({ estado: "descarta" });
  });

  it("el primer cuadro puede venir con una hora apenas anterior al clic: nunca ms negativos", () => {
    expect(pasoDelCronometro(c, { ...vista, ahora: 995 })).toEqual({ estado: "llego", ms: 0, sinEsqueleto: true });
  });
});

describe("patronDeRuta: a los registros va el módulo, nunca el id", () => {
  it("una pantalla sin parámetros queda igual", () => {
    expect(patronDeRuta("/inventario/traslados", {})).toBe("/inventario/traslados");
    expect(patronDeRuta("/", {})).toBe("/");
  });

  it("cada parámetro pasa a su nombre entre corchetes", () => {
    expect(patronDeRuta(`/productos/${ID}`, { id: ID })).toBe("/productos/[id]");
    expect(patronDeRuta(`/compras/factura/${ID}`, { compraId: ID })).toBe("/compras/factura/[compraId]");
    expect(patronDeRuta("/produccion/ordenes/OP-0042", { numero: "OP-0042" })).toBe("/produccion/ordenes/[numero]");
  });

  it("un parámetro con caracteres codificados se reconoce igual", () => {
    expect(patronDeRuta("/club/San%20Isidro", { tienda: "San Isidro" })).toBe("/club/[tienda]");
  });

  it("el «atrapa todo» de la ranura `@modal` no tapa la pantalla (useParams lo mezcla: medido en Proveedores)", () => {
    expect(patronDeRuta("/compras/proveedores", { catchAll: ["proveedores"] })).toBe("/compras/proveedores");
    expect(patronDeRuta(`/compras/proveedores/${ID}`, { catchAll: ["proveedores", ID], id: ID })).toBe("/compras/proveedores/[id]");
    expect(patronDeRuta(`/compras/proveedores/${ID}`, { catchAll: ["proveedores", ID] })).toBe("/compras/proveedores/[id]");
  });

  it("si los parámetros no llegaron, un uuid o un número suelto igual se tapa", () => {
    expect(patronDeRuta(`/productos/${ID}/historial`, {})).toBe("/productos/[id]/historial");
    expect(patronDeRuta("/inventario/conteo/1234", {})).toBe("/inventario/conteo/[id]");
  });

  it("un parámetro sin valor no toca nada", () => {
    expect(patronDeRuta("/productos", { id: undefined, resto: [] })).toBe("/productos");
  });
});

const T: TiempoDePantalla = { ruta: "/productos/[id]", ms: 812, sedeId: SEDE, sinEsqueleto: false, version: "98b9137f3a1c" };

describe("armarLote: un envío solo cuando hay qué mandar, de a 50", () => {
  it("cola vacía: no se llama al servidor", () => {
    expect(armarLote([])).toBeNull();
  });

  it("hasta 50 por envío; lo demás espera al siguiente", () => {
    const lote = armarLote(Array.from({ length: 73 }, () => T));
    expect(lote?.cuantas).toBe(50);
    expect(leerLote(lote!.cuerpo)).toHaveLength(50);
  });

  it("ida y vuelta: lo que arma el navegador es lo que lee el servidor", () => {
    expect(leerLote(armarLote([T, { ...T, sedeId: "global", sinEsqueleto: true }])!.cuerpo)).toEqual([T, { ...T, sedeId: "global", sinEsqueleto: true }]);
  });
});

describe("leerLote: el servidor solo cree lo que tiene la forma exacta", () => {
  const cuerpo = (tiempos: unknown) => JSON.stringify({ tiempos });

  it("un cuerpo que no es un lote no es nada, y nunca lanza", () => {
    for (const texto of ["", "<html>login</html>", "null", "42", "[]", "{}", '{"tiempos":7}', '{"tiempos":"x"}']) {
      expect(leerLote(texto)).toEqual([]);
    }
  });

  it("se queda con las buenas y suelta las malas, sin tirar el lote", () => {
    const malas = [
      null,
      { ...T, ruta: "/productos?q=Ana%20Torres" }, // la dirección con su búsqueda: jamás a los registros
      { ...T, ruta: "productos" },
      { ...T, ruta: "/" + "x".repeat(130) },
      { ...T, ms: -1 },
      { ...T, ms: MS_TOPE_DESTINO + 1 },
      { ...T, ms: 12.5 },
      { ...T, ms: "812" },
      { ...T, sedeId: "Trujillo" },
      { ...T, sedeId: undefined },
      { ...T, sinEsqueleto: "no" },
      { ...T, version: "con espacios" },
      { ...T, version: "x".repeat(13) },
    ];
    expect(leerLote(cuerpo([T, ...malas, T]))).toEqual([T, T]);
  });

  it("la sede llega en minúsculas; un lote enorme no se lee", () => {
    expect(leerLote(cuerpo([{ ...T, sedeId: SEDE.toUpperCase() }]))[0]?.sedeId).toBe(SEDE);
    expect(leerLote(cuerpo(Array.from({ length: 400 }, () => T)))).toEqual([]);
  });
});

describe("lineaDeRegistro: una línea JSON por medición, sin nada personal", () => {
  it("lleva el evento, la ruta, los ms, la sede, si hubo esqueleto y la versión; nada más", () => {
    expect(JSON.parse(lineaDeRegistro(T))).toEqual({
      evento: "tiempo_de_pantalla",
      ruta: "/productos/[id]",
      ms: 812,
      sede_id: SEDE,
      sin_esqueleto: false,
      version: "98b9137f3a1c",
    });
  });
});
