import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cifrasVista } from "./frescura-pantalla";
import { analizarSede, leerFrescuraSede, type FrescuraSede } from "./frescura-reglas";
import { conteoVacio, pisoDeLaTienda, pisoPorFamilia, respuestaDelPiso, type ConteoPiso, type FamiliaPiso, type PuertaPiso } from "./frescura-piso";
import {
  lineaPorDecidir,
  pisoFrescuraParaElInicio,
  pisoQueSeVe,
  tendenciaVista,
  vistaFrescuraInicio,
  vistaPisoInicio,
  vistaPlanInicio,
  type AccesoPiso,
  type PisoFrescuraInicio,
  type PisoPlanInicio,
} from "./inicio-piso-reglas";

// «Tu piso» del Inicio (ADR-0395). Lo que se prueba: que la tarjeta dice LO MISMO que la pantalla de la que sale (la misma función, la misma frase), que
// nunca afirma un número que esa pantalla se niega a afirmar, que ofrece el paso que arregla lo que falta SOLO a quien puede darlo y que no lo repite, y
// quién ve cada mitad. NO prueba el dibujo (se mira en el navegador, a 1440 y a 375 px).

// La salida REAL de la base (la misma que usan frescura-contrato.test.ts y frescura-pantalla.test.ts), analizada como en el servidor.
const CRUDO = JSON.parse(readFileSync(new URL("./__fixtures__/frescura-sede.json", import.meta.url), "utf8")) as { fn_frescura_sede: unknown };
const LECTURA = leerFrescuraSede(CRUDO.fn_frescura_sede);
if (!LECTURA || !LECTURA.separaPiso) throw new Error("el archivo de la lectura real no se pudo leer");
const SEDE: FrescuraSede = analizarSede(LECTURA).sede;

const ABIERTA: PuertaPiso = { puedeHablar: true, aviso: "", pisoCuadrado: true, falta: null };
const SIN_CUADRAR: PuertaPiso = { puedeHablar: false, aviso: "", pisoCuadrado: false, falta: "piso_cuadrado" };
const SIN_ALMACEN: PuertaPiso = { puedeHablar: false, aviso: "", pisoCuadrado: true, falta: "almacen_contado" };

const TODO: AccesoPiso = { existencias: true, conteos: true };
const NADA: AccesoPiso = { existencias: false, conteos: false };

const unidades = (p: Partial<ConteoPiso>): ConteoPiso => ({ ...conteoVacio(), ...p });
const familia = (u: ConteoPiso): FamiliaPiso => {
  const total = u.fresca + u.vigente + u.envejeciendo + u.sin_saber;
  return { codigo: null, nombre: "Tienda", unidades: u, total, prendas: 1, soles: null, sinSaberPor: { ritmo: 0, fecha: 0, dudosa: 0, venta: 0 } };
};
/** Un piso armado a mano: la respuesta sale de la MISMA función que usa la pantalla. */
const pisoDe = (u: ConteoPiso, puerta: PuertaPiso = ABIERTA, p: Partial<PisoFrescuraInicio> = {}, antes: ConteoPiso | null = null): PisoFrescuraInicio => {
  const f = familia(u);
  return { respuesta: respuestaDelPiso(f, puerta, antes), tienda: { unidades: u, total: f.total }, porDecidir: 0, porDecidirFirme: true, aproximado: false, puerta, ...p };
};

describe("Frescura: la tarjeta sale de la lectura real de una tienda y dice lo que dice la pantalla", () => {
  it("toda la tienda es la misma con o sin el catálogo de familias (el Inicio no lo lee)", () => {
    const sinFamilias = pisoFrescuraParaElInicio(SEDE, ABIERTA).tienda;
    const conUnaFamilia = pisoDeLaTienda(pisoPorFamilia(SEDE.prendas, { familiaDe: () => "ropa", familias: [{ codigo: "ropa", nombre: "Ropa", orden: 1 }] }));
    expect(sinFamilias).not.toBeNull();
    expect(sinFamilias?.unidades).toEqual(conUnaFamilia?.unidades);
    expect(sinFamilias?.total).toBe(conUnaFamilia?.total);
  });

  it("«por decidir» es el MISMO número del chip de la pantalla (cifras.porDecidir), no otra cuenta", () => {
    expect(pisoFrescuraParaElInicio(SEDE, ABIERTA).porDecidir).toBe(cifrasVista(SEDE.cifras).porDecidir);
  });

  it("con la puerta cerrada la respuesta no afirma, y es la frase de la pantalla con su razón", () => {
    const p = pisoFrescuraParaElInicio(SEDE, SIN_CUADRAR);
    expect(p.respuesta.afirma).toBe(false);
    expect(p.respuesta.respuesta).toBe("Todavía no se puede saber: falta cuadrar el piso.");
    expect(p.aproximado).toBe(true);
  });

  it("sin la puerta (la lectura de preparación falló: null) tampoco afirma y no inventa una razón", () => {
    const p = pisoFrescuraParaElInicio(SEDE, null);
    expect(p.respuesta.afirma).toBe(false);
    expect(p.respuesta.respuesta).toBe("Todavía no se puede saber.");
  });

  it("lo que lee de la sede no se pasa al navegador: solo cifras chicas y planas", () => {
    const p = pisoFrescuraParaElInicio(SEDE, ABIERTA);
    expect(Object.keys(p).sort()).toEqual(["aproximado", "porDecidir", "porDecidirFirme", "puerta", "respuesta", "tienda"]);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it("si lo ya decidido no se pudo leer, «por decidir» deja de ser firme", () => {
    const sinLectura = { ...SEDE, decisiones: { estado: "sin_lectura" as const, aviso: "" } };
    expect(pisoFrescuraParaElInicio(sinLectura, ABIERTA).porDecidirFirme).toBe(false);
    expect(pisoFrescuraParaElInicio(SEDE, ABIERTA).porDecidirFirme).toBe(SEDE.decisiones.estado === "ok");
  });

  it("si las ventas sin registrar no se pudieron leer, la barra es aproximada aunque la puerta esté abierta", () => {
    expect(pisoFrescuraParaElInicio({ ...SEDE, dudasFallo: true }, ABIERTA).aproximado).toBe(true);
  });
});

describe("Frescura: qué se dice cuando SE puede afirmar", () => {
  it("el número grande es el % fresco (el de la frase), con su barra y su línea", () => {
    const v = vistaFrescuraInicio(pisoDe(unidades({ fresca: 41, vigente: 22, envejeciendo: 20, sin_saber: 5 })), TODO);
    expect(v.tipo).toBe("dato");
    if (v.tipo !== "dato") return;
    // 41 de 88 = 46,6: los porcentajes enteros suman 100 (el resto mayor se lo lleva «envejeciendo» y «aún no se sabe»), así que «fresca» queda en 46.
    expect(v.valor).toBe("46 %");
    expect(v.unidad).toBe("de lo colgado está fresco");
    expect(v.segmentos.map((s) => s.valor)).toEqual([41, 22, 20, 5]);
    expect(v.linea).toBe("46 % fresca · 25 % vigente · 23 % envejeciendo · 6 % aún no se sabe");
  });

  it("los porcentajes siempre suman 100 (la línea no dice 99)", () => {
    const v = vistaFrescuraInicio(pisoDe(unidades({ fresca: 1, vigente: 1, envejeciendo: 1 })), TODO);
    if (v.tipo !== "dato") throw new Error("debía afirmar");
    const suma = [...v.linea.matchAll(/(\d+) %/g)].reduce((s, m) => s + Number(m[1]), 0);
    expect(suma).toBe(100);
  });

  it("la tendencia contra hace 4 semanas viaja con el dato, con las palabras de la pantalla", () => {
    const hoy = unidades({ fresca: 30, vigente: 40, envejeciendo: 30 });
    const antes = unidades({ fresca: 60, vigente: 30, envejeciendo: 10 });
    const v = vistaFrescuraInicio(pisoDe(hoy, ABIERTA, {}, antes), TODO);
    expect(v.tipo === "dato" && v.tendencia).toEqual({ texto: "Más viejo que hace 4 semanas", tono: "ambar" });
    const mejor = vistaFrescuraInicio(pisoDe(antes, ABIERTA, {}, hoy), TODO);
    expect(mejor.tipo === "dato" && mejor.tendencia).toEqual({ texto: "Más fresco que hace 4 semanas", tono: "verde" });
  });

  it("«igual que hace 4 semanas» o sin comparación no avisa nada", () => {
    expect(tendenciaVista("igual")).toBeNull();
    expect(tendenciaVista(null)).toBeNull();
    const v = vistaFrescuraInicio(pisoDe(unidades({ fresca: 50, vigente: 30, envejeciendo: 20 })), TODO);
    expect(v.tipo === "dato" && v.tendencia).toBeNull();
  });

  it("la marca «aproximado» viaja con el dato", () => {
    const v = vistaFrescuraInicio(pisoDe(unidades({ fresca: 50, vigente: 30, envejeciendo: 20 }), ABIERTA, { aproximado: true }), TODO);
    expect(v.tipo === "dato" && v.aproximado).toBe(true);
  });
});

describe("Frescura: qué se dice cuando NO se puede afirmar", () => {
  it("mucho «aún no se sabe»: ningún número; el titular y la pregunta de la pantalla con su respuesta", () => {
    const v = vistaFrescuraInicio(pisoDe(unidades({ fresca: 10, vigente: 10, envejeciendo: 5, sin_saber: 75 })), TODO);
    expect(v.tipo).toBe("todavia");
    if (v.tipo !== "todavia") return;
    expect(v.titular).toBe("Todavía no se sabe");
    expect(v.frase).toMatch(/^¿Tu piso está fresco\? Todavía no se puede decir/);
    expect(JSON.stringify(v)).not.toMatch(/\d+ %/);
  });

  it("puerta cerrada: ningún número aunque haya mucho colgado y poco gris, y el botón es el de la puerta", () => {
    const v = vistaFrescuraInicio(pisoDe(unidades({ fresca: 60, vigente: 30, envejeciendo: 10 }), SIN_CUADRAR), TODO);
    expect(v.tipo).toBe("todavia");
    if (v.tipo !== "todavia") return;
    expect(v.frase).toBe("¿Tu piso está fresco? Todavía no se puede saber: falta cuadrar el piso.");
    expect(v.paso).toEqual({ texto: "Cuadrar el piso", href: "/inventario/cuadrar" });
  });

  it("el botón sale de la MISMA regla de Análisis y Frescura: cada puerta, su paso; y a quien no ve esa pantalla, ninguno", () => {
    const u = unidades({ fresca: 60, vigente: 30, envejeciendo: 10 });
    expect(vistaFrescuraInicio(pisoDe(u, SIN_ALMACEN), TODO)).toMatchObject({ paso: { texto: "Contar el almacén", href: "/inventario/conteo" } });
    expect(vistaFrescuraInicio(pisoDe(u, SIN_CUADRAR), NADA)).toMatchObject({ tipo: "todavia", paso: null });
    expect(vistaFrescuraInicio(pisoDe(u, SIN_ALMACEN), { existencias: true, conteos: false })).toMatchObject({ paso: null });
    expect(vistaFrescuraInicio(pisoDe(u, null), TODO)).toMatchObject({ paso: null });
  });

  it("nada colgado: «Nada colgado», jamás «0 % fresco»", () => {
    const v = vistaFrescuraInicio({ ...pisoDe(unidades({})), tienda: null, respuesta: respuestaDelPiso(null, ABIERTA) }, TODO);
    expect(v).toMatchObject({ tipo: "todavia", titular: "Nada colgado", frase: "¿Tu piso está fresco? Todavía no hay nada colgado." });
  });
});

describe("«por decidir»: prendas, nunca unidades, y solo lo que se puede afirmar", () => {
  it("con algo por decidir: «N prendas esperan tu decisión» (singular y plural)", () => {
    expect(lineaPorDecidir(1, true, true)).toEqual({ texto: "1 prenda espera tu decisión", hay: true });
    expect(lineaPorDecidir(3, true, false)).toEqual({ texto: "3 prendas esperan tu decisión", hay: true });
  });

  it("si lo decidido no se pudo leer: «Hasta N», porque puede contar lo que ya se decidió", () => {
    expect(lineaPorDecidir(3, false, true)).toEqual({ texto: "Hasta 3 prendas por decidir", hay: true });
  });

  it("«Nada por decidir» solo cuando el piso afirma y la lectura es firme; si no, calla (no se puede saber)", () => {
    expect(lineaPorDecidir(0, true, true)).toEqual({ texto: "Nada por decidir", hay: false });
    expect(lineaPorDecidir(0, true, false)).toBeNull();
    expect(lineaPorDecidir(0, false, true)).toBeNull();
  });
});

describe("Plan del piso: qué se dice", () => {
  const plan = (p: Partial<PisoPlanInicio> = {}): PisoPlanInicio => ({ colgadas: 334, capacidad: 600, cuadrado: true, provisional: false, sinGrupoColgadas: 0, ...p });

  it("piso cuadrado: «334 de 600 prendas» y cuán lleno está, con la frase del Plan del piso", () => {
    expect(vistaPlanInicio(plan(), TODO)).toEqual({ tipo: "medida", valor: "334", unidad: "de 600 prendas", frase: "Tu riel está a medio llenar (56 % ocupado).", pie: [] });
  });

  it("piso por cuadrar: NO hay «56 %», ni «lugares libres», ni «a medio llenar»: se dice qué falta y cuál es el paso", () => {
    const v = vistaPlanInicio(plan({ cuadrado: false }), TODO);
    expect(v).toMatchObject({
      tipo: "porCuadrar",
      titular: "Por cuadrar",
      frase: "Falta contar tu piso. Según el sistema cuelgan 334 prendas, pero de verdad pueden ser muchas más.",
      paso: { texto: "Cuadrar el piso", href: "/inventario/cuadrar" },
    });
    expect(JSON.stringify(v)).not.toMatch(/%|libre|medio llenar|ocupado/);
  });

  it("por cuadrar y a quien no ve Existencias: sin botón (nunca uno que termine en «Sin acceso»)", () => {
    expect(vistaPlanInicio(plan({ cuadrado: false }), NADA)).toMatchObject({ tipo: "porCuadrar", paso: null });
  });

  it("por cuadrar con UNA prenda: «cuelga 1 prenda» (el verbo concuerda), en las dos frases", () => {
    expect(vistaPlanInicio(plan({ cuadrado: false, colgadas: 1 }), TODO).frase).toBe("Falta contar tu piso. Según el sistema cuelga 1 prenda, pero de verdad pueden ser muchas más.");
    expect(vistaPlanInicio(plan({ cuadrado: false, colgadas: 601 }), TODO).frase).toBe("Falta contar tu piso. Según el sistema ya cuelga 1 prenda más de las que caben en el riel, y de verdad pueden ser más.");
  });

  it("por cuadrar y aun así cuelga más de lo que cabe: se dice, porque el sistema suele quedarse corto", () => {
    expect(vistaPlanInicio(plan({ cuadrado: false, colgadas: 700 }), TODO).frase).toBe(
      "Falta contar tu piso. Según el sistema ya cuelgan 100 prendas más de las que caben en el riel, y de verdad pueden ser más.",
    );
  });

  it("cuadrado y de más: «Cuelgan N prendas más de las que caben», nunca un porcentaje mayor que 100", () => {
    const v = vistaPlanInicio(plan({ colgadas: 650 }), TODO);
    expect(v.frase).toBe("Cuelgan 50 prendas más de las que caben en el riel.");
    expect(v.frase).not.toMatch(/%/);
  });

  it("una sola prenda de más va en singular", () => {
    expect(vistaPlanInicio(plan({ colgadas: 601 }), TODO).frase).toBe("Cuelgan 1 prenda más de las que caben en el riel.");
  });

  it("capacidad provisional y categorías sin grupo van al pie, en ese orden, en las dos formas", () => {
    expect(vistaPlanInicio(plan({ provisional: true, sinGrupoColgadas: 4 }), TODO).pie).toEqual(["Capacidad provisional", "No cuenta 4 prendas de categorías sin grupo: no se sabe si cuelgan en el riel."]);
    expect(vistaPlanInicio(plan({ cuadrado: false, provisional: true }), TODO).pie).toEqual(["Capacidad provisional"]);
  });

  it("el riel casi vacío no dice «0 %» (dos prendas de 600 redondean a cero: «menos de 1 %»)", () => {
    expect(vistaPlanInicio(plan({ colgadas: 2 }), TODO).frase).toBe("Tu riel está casi vacío (menos de 1 % ocupado).");
  });
});

describe("las dos juntas: el paso se dice UNA vez", () => {
  const bloqueadas = {
    frescura: pisoDe(unidades({ fresca: 60, vigente: 30, envejeciendo: 10 }), SIN_CUADRAR),
    plan: { colgadas: 334, capacidad: 600, cuadrado: false, provisional: false, sinGrupoColgadas: 0 },
  };

  it("las dos bloqueadas por cuadrar el piso (lo normal hoy): el botón queda en la de arriba y la de abajo solo lleva a su pantalla", () => {
    const v = vistaPisoInicio(bloqueadas, TODO);
    expect(v.frescura).toMatchObject({ tipo: "todavia", paso: { texto: "Cuadrar el piso" } });
    expect(v.plan).toMatchObject({ tipo: "porCuadrar", paso: null });
  });

  it("si Frescura no puede dar el paso, el del Plan se queda (nadie queda sin botón por deduplicar)", () => {
    const v = vistaPisoInicio({ ...bloqueadas, frescura: pisoDe(unidades({ fresca: 60, vigente: 30, envejeciendo: 10 }), SIN_ALMACEN) }, { existencias: true, conteos: false });
    expect(v.frescura).toMatchObject({ tipo: "todavia", paso: null });
    expect(v.plan).toMatchObject({ tipo: "porCuadrar", paso: { texto: "Cuadrar el piso" } });
  });

  it("bloqueadas por cosas distintas, cada una conserva el suyo", () => {
    const v = vistaPisoInicio({ ...bloqueadas, frescura: pisoDe(unidades({ fresca: 60, vigente: 30, envejeciendo: 10 }), SIN_ALMACEN) }, TODO);
    expect(v.frescura).toMatchObject({ paso: { texto: "Contar el almacén" } });
    expect(v.plan).toMatchObject({ paso: { texto: "Cuadrar el piso" } });
  });

  it("solo una mitad: la otra es null (no se inventa)", () => {
    expect(vistaPisoInicio({ frescura: null, plan: bloqueadas.plan }, TODO).frescura).toBeNull();
    expect(vistaPisoInicio({ frescura: bloqueadas.frescura, plan: null }, TODO).plan).toBeNull();
  });
});

describe("quién ve «Tu piso»", () => {
  const ve = (ubicacionTipo: "tienda" | "almacen" | "taller", terminal: boolean, modulos: string[]) => pisoQueSeVe({ ubicacionTipo, terminal, modulos });

  it("una tienda con los dos módulos ve las dos mitades", () => {
    expect(ve("tienda", false, ["frescura", "plan_piso", "vender"])).toEqual({ frescura: true, plan: true, alguno: true });
  });

  it("cada mitad solo con SU módulo", () => {
    expect(ve("tienda", false, ["frescura"])).toEqual({ frescura: true, plan: false, alguno: true });
    expect(ve("tienda", false, ["plan_piso"])).toEqual({ frescura: false, plan: true, alguno: true });
  });

  it("sin ninguno de los dos módulos, nada (ni el rótulo)", () => {
    expect(ve("tienda", false, ["vender", "existencias"])).toEqual({ frescura: false, plan: false, alguno: false });
  });

  it("una terminal no la ve, tenga los módulos que tenga", () => {
    expect(ve("tienda", true, ["frescura", "plan_piso"]).alguno).toBe(false);
  });

  it("parado en el Taller o en un Almacén no: el piso es de las tiendas", () => {
    expect(ve("taller", false, ["frescura", "plan_piso"]).alguno).toBe(false);
    expect(ve("almacen", false, ["frescura", "plan_piso"]).alguno).toBe(false);
  });
});
