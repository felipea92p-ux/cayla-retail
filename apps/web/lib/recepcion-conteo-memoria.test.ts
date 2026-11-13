import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conLoMasNuevo, conteosRecordados, recordarConteos } from "./recepcion-conteo-memoria";
import { claveDe, type ConteoDeLinea, type ConteosDelEnvio } from "./recepcion-conteo-reglas";

// Recibir ▸ Contar al volver con «atrás» (medido en local el 2026-11-11, ENV-001244): Next dibuja la página que guardó su router, con lo
// contado de cuando se leyó, y el siguiente toque guardaba encima de ese número viejo. La pestaña recuerda lo que guardó o releyó
// (`recepcion-conteo-memoria.ts`) y la pantalla arranca de ahí.
//
// Contrato (3 líneas). PROMETE: que la mezcla nunca muestra una línea más vieja que la que la pestaña ya conoce, y que `RecibirContando`
// arranca de la memoria y anota en ella cada guardado y cada relectura. ASUME: una memoria por proceso de prueba (cada caso usa su propio
// envío). NO PROMETE: lo que pasa en el navegador (el router, el clic): eso se mide a mano, con «atrás», en escritorio y a 375 px.

const linea = (p: Partial<ConteoDeLinea> = {}): ConteoDeLinea => ({
  despachoItemId: null,
  extraPosicion: 1,
  proveedor: null,
  categoria: null,
  marca: null,
  contadas: 5,
  separado: { prendas: [], nuevas: [] },
  costoUnitario: null,
  costosPrendas: {},
  version: 3,
  contadoPor: null,
  contadoEn: null,
  enStock: 0,
  sinSeparar: 0,
  pendientes: [],
  ...p,
});

const envio = (despachoId: string, conteos: ConteoDeLinea[]): ConteosDelEnvio => ({
  despachoId,
  estado: "abierto",
  origen: "sin_aviso",
  proveedorPorConfirmar: false,
  proveedores: [],
  conteos,
  cierres: [],
  reabrir: null,
});

const deLaLinea = (c: ConteosDelEnvio | null, extraPosicion: number) => c?.conteos.find((x) => x.extraPosicion === extraPosicion) ?? null;

describe("lo que la pestaña recuerda de un envío que se cuenta", () => {
  it("al volver con «atrás», la línea arranca del número que se guardó, no del que trae la página guardada", () => {
    // La página que guardó el router: 5, versión 3. Después se tocó «Una más» y la base contestó 6, versión 4.
    const paginaGuardada = envio("atras", [linea({ contadas: 5, version: 3 })]);
    recordarConteos("atras", [linea({ contadas: 6, version: 4 })]);
    // Se va a otra pantalla y vuelve: la pantalla se monta de nuevo con la página guardada y lo que recuerda la pestaña.
    const alVolver = deLaLinea(conLoMasNuevo(paginaGuardada, conteosRecordados("atras")), 1);
    expect(alVolver?.contadas).toBe(6);
    // El siguiente toque sale de esa versión: la base no lo toma por un número pisado.
    expect(alVolver?.version).toBe(4);
  });

  it("un modelo anotado después de la lectura de la página no desaparece al volver", () => {
    const paginaGuardada = envio("nuevo-modelo", [linea({ extraPosicion: 1 })]);
    recordarConteos("nuevo-modelo", [linea({ extraPosicion: 2, contadas: 12, version: 1 })]);
    const alVolver = conLoMasNuevo(paginaGuardada, conteosRecordados("nuevo-modelo"));
    expect(alVolver?.conteos.map((c) => claveDe(c))).toEqual(["extra:1", "extra:2"]);
    expect(deLaLinea(alVolver, 2)?.contadas).toBe(12);
  });

  it("lo recordado no retrocede: una respuesta vieja que llega tarde no pisa la más nueva", () => {
    recordarConteos("tarde", [linea({ contadas: 7, version: 5 })]);
    recordarConteos("tarde", [linea({ contadas: 6, version: 4 })]);
    expect(conteosRecordados("tarde")["extra:1"]?.contadas).toBe(7);
  });

  it("si la página trae una versión más alta (contó otra persona), manda la página", () => {
    recordarConteos("otra-persona", [linea({ contadas: 6, version: 4 })]);
    const paginaNueva = envio("otra-persona", [linea({ contadas: 9, version: 5 })]);
    expect(deLaLinea(conLoMasNuevo(paginaNueva, conteosRecordados("otra-persona")), 1)?.contadas).toBe(9);
  });

  it("con la misma versión manda la página: trae al día lo que ya entró al stock", () => {
    recordarConteos("empate", [linea({ contadas: 6, version: 4, enStock: 0 })]);
    const paginaNueva = envio("empate", [linea({ contadas: 6, version: 4, enStock: 6 })]);
    expect(deLaLinea(conLoMasNuevo(paginaNueva, conteosRecordados("empate")), 1)?.enStock).toBe(6);
  });

  it("con la misma versión, la memoria se queda con la lectura que llega (se leyó después)", () => {
    recordarConteos("relectura", [linea({ version: 4, enStock: 0 })]);
    recordarConteos("relectura", [linea({ version: 4, enStock: 6 })]);
    expect(conteosRecordados("relectura")["extra:1"]?.enStock).toBe(6);
  });

  it("lo de un envío no se mezcla con otro, y sin nada recordado la página queda como vino", () => {
    recordarConteos("envio-a", [linea({ contadas: 6, version: 4 })]);
    expect(conteosRecordados("envio-b")).toEqual({});
    const pagina = envio("envio-b", [linea({ contadas: 5, version: 3 })]);
    expect(conLoMasNuevo(pagina, conteosRecordados("envio-b"))).toEqual(pagina);
  });

  it("sin lectura de la página no inventa una", () => {
    recordarConteos("sin-pagina", [linea()]);
    expect(conLoMasNuevo(null, conteosRecordados("sin-pagina"))).toBeNull();
  });
});

describe("la pantalla de Contar usa esa memoria", () => {
  const fuente = readFileSync(new URL("../components/recepcion-conteo/RecibirContando.tsx", import.meta.url), "utf8");
  const pagina = readFileSync(new URL("../app/(app)/recibir/envio/[id]/page.tsx", import.meta.url), "utf8");

  it("la página manda un identificador nuevo en cada carga, y la pantalla pide la página de nuevo si dibuja una copia", () => {
    expect(pagina).toContain("carga={idDeCarga()}");
    expect(fuente).toMatch(/anotarCarga\(`recibir:\$\{detalle\.id\}`, carga\)[\s\S]{0,260}router\.refresh\(\)/);
  });

  it("arranca de lo que la pestaña recuerda del envío, no en blanco", () => {
    expect(fuente).toMatch(/useState<Record<string, ConteoDeLinea>>\(\(\) => conteosRecordados\(detalle\.id\)\)/);
  });

  it("anota cada línea que la base confirma al guardar", () => {
    expect(fuente).toContain("recordarConteos(detalle.id, [guardado.conteo])");
  });

  it("anota lo que relee de la base (después de cerrar, reabrir o «Hacer ahora»)", () => {
    expect(fuente).toContain("recordarConteos(detalle.id, c.conteos)");
  });

  it("dibuja con la mezcla probada arriba, no con una propia", () => {
    expect(fuente).toContain("conLoMasNuevo(base, locales)");
  });
});
