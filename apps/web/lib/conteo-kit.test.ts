import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EstadoLinea, type EstadoLineaConteo } from "../components/conteo/EstadoLinea";
import { PasosConteo } from "../components/conteo/PasosConteo";
import { ResumenConteo } from "../components/conteo/ResumenConteo";

// El kit visual compartido de Inventario ▸ Conteo (EstadoLinea, ResumenConteo, PasosConteo): las tres piezas que dibujan
// las pantallas de Contar, Revisar, Confirmar y el resultado. Estas pruebas fijan lo que las tres pantallas no deben
// reescribir cada una por su lado: el texto de cada estado y su tono (con TEXTO, nunca solo color), que una pendiente
// jamás sea roja, la barra de progreso accesible y el alto reservado. Los textos vienen de `lib/conteo-reglas.ts`
// (copy del contrato); aquí se comprueba que las piezas los pintan, no que la lib los redacte (eso lo prueba
// `conteo-reglas.test.ts`).
//
// Se renderiza a HTML estático (como `existencias-vacio.test.ts`): sin navegador. La transición Pendiente → Correcto
// necesita un DOM que reaccione y se mira en pantalla; aquí solo se comprueba que NO se anima al cargar.

const LIMPIO = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/ /g, " ").replace(/\s+/g, " ").trim();

const estado = (props: { estado: EstadoLineaConteo; debeHaber?: number; contada?: number | null; diferencia?: number | null; confirmada?: boolean }) =>
  renderToStaticMarkup(createElement(EstadoLinea, { debeHaber: 11, contada: null, diferencia: null, ...props }));

describe("EstadoLinea", () => {
  it("una pendiente dice «Pendiente» y es neutra: nunca roja ni verde", () => {
    const html = estado({ estado: "pendiente" });
    expect(LIMPIO(html)).toBe("Pendiente");
    expect(html).toContain("bg-sand");
    expect(html).not.toContain("bg-rojo");
    expect(html).not.toContain("bg-verde");
  });

  it("lo que coincide dice «Correcto» en verde suave", () => {
    const html = estado({ estado: "correcta", contada: 11, diferencia: 0 });
    expect(LIMPIO(html)).toBe("Correcto");
    expect(html).toContain("bg-verde/15");
  });

  it("una diferencia dice cuántas y va en rojo: «Faltan 2», «Falta 1» y «Hay 3 de más»", () => {
    const faltan = estado({ estado: "con_diferencia", contada: 9, diferencia: -2 });
    expect(LIMPIO(faltan)).toContain("Faltan 2");
    expect(faltan).toContain("bg-rojo/10");
    expect(LIMPIO(estado({ estado: "con_diferencia", contada: 10, diferencia: -1 }))).toContain("Falta 1");
    expect(LIMPIO(estado({ estado: "con_diferencia", contada: 14, diferencia: 3 }))).toContain("Hay 3 de más");
  });

  it("si `diferencia` no llega, sale de lo contado y de lo que debía haber", () => {
    expect(LIMPIO(estado({ estado: "con_diferencia", debeHaber: 11, contada: 9, diferencia: null }))).toContain("Faltan 2");
    expect(LIMPIO(estado({ estado: "con_diferencia", debeHaber: 4, contada: 7, diferencia: null }))).toContain("Hay 3 de más");
  });

  it("«En reconteo» va en ámbar, no en rojo", () => {
    const html = estado({ estado: "en_reconteo" });
    expect(LIMPIO(html)).toBe("En reconteo");
    expect(html).toContain("bg-ambar/15");
    expect(html).not.toContain("bg-rojo");
  });

  it("«Confirmado» solo se ve junto a una diferencia ya confirmada; antes, su lugar queda reservado e invisible", () => {
    const sinConfirmar = estado({ estado: "con_diferencia", contada: 9, diferencia: -2 });
    expect(sinConfirmar).toMatch(/<span aria-hidden="true" class="[^"]*invisible[^"]*">/);
    const confirmada = estado({ estado: "diferencia_confirmada", contada: 9, diferencia: -2 });
    expect(LIMPIO(confirmada)).toContain("Faltan 2");
    expect(LIMPIO(confirmada)).toContain("Confirmado");
    expect(confirmada).not.toContain("invisible");
    expect(confirmada).not.toContain('aria-hidden="true" class="inline-flex');
    // El llamador que pasa `con_diferencia` + confirmada ve lo mismo que con `diferencia_confirmada`.
    expect(estado({ estado: "con_diferencia", contada: 9, diferencia: -2, confirmada: true })).toBe(confirmada);
  });

  it("una línea correcta o pendiente no reserva ni muestra «Confirmado»", () => {
    expect(estado({ estado: "correcta", contada: 11, diferencia: 0 })).not.toContain("Confirmado");
    expect(estado({ estado: "pendiente" })).not.toContain("Confirmado");
  });

  it("es una región viva educada (`role=status`), marcada para el control de responsive, y al cargar no se anima", () => {
    for (const e of ["pendiente", "correcta", "con_diferencia", "en_reconteo", "diferencia_confirmada"] as const) {
      const html = estado({ estado: e, contada: e === "pendiente" || e === "en_reconteo" ? null : 9, diferencia: e === "correcta" ? 0 : -2 });
      expect(html).toContain('role="status"');
      expect(html).toContain("data-critico");
      // La transición corre solo cuando el estado CAMBIA a «correcta» desde pendiente: recién montada, ninguna se anima.
      expect(html).not.toContain("anim-asentar");
    }
  });
});

describe("ResumenConteo", () => {
  const r = { variantes: 37, verificadas: 18, pendientes: 19, conDiferencia: 2 };

  it("«completo»: progreso, barra accesible y la línea de cifras", () => {
    const html = renderToStaticMarkup(createElement(ResumenConteo, { resumen: r }));
    const t = LIMPIO(html);
    expect(t).toContain("18 de 37 variantes verificadas");
    expect(t).toContain("37 variantes · 18 verificadas · 19 pendientes · 2 con diferencia");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="18"');
    expect(html).toContain('aria-valuemax="37"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuetext="18 de 37 variantes verificadas"');
    expect(html).toContain("width:49%");
  });

  it("«con diferencia» se omite si no hay, pero su lugar se reserva para que la línea no salte", () => {
    const html = renderToStaticMarkup(createElement(ResumenConteo, { resumen: { ...r, conDiferencia: 0 }, variante: "cifras" }));
    // Lo que se lee (y lo que oye un lector de pantalla) no trae la cola…
    expect(html).toMatch(/<span aria-hidden="true" class="invisible">[^<]*con diferencia[^<]*<\/span>/);
    expect(LIMPIO(html.replace(/<span aria-hidden="true" class="invisible">[^<]*<\/span>/, ""))).toBe("37 variantes · 18 verificadas · 19 pendientes");
    // …y con diferencias la cola es visible y sin reserva.
    const con = renderToStaticMarkup(createElement(ResumenConteo, { resumen: r, variante: "cifras" }));
    expect(con).not.toContain("invisible");
    expect(LIMPIO(con)).toBe("37 variantes · 18 verificadas · 19 pendientes · 2 con diferencia");
  });

  it("«progreso» es solo el texto y la barra (y lo que va a su derecha); «cifras» no lleva barra", () => {
    const progreso = renderToStaticMarkup(createElement(ResumenConteo, { resumen: r, variante: "progreso", lateral: "Guardado" }));
    expect(LIMPIO(progreso)).toBe("18 de 37 variantes verificadas Guardado");
    expect(progreso).toContain('role="progressbar"');
    const cifras = renderToStaticMarkup(createElement(ResumenConteo, { resumen: r, variante: "cifras" }));
    expect(cifras).not.toContain("progressbar");
  });

  it("cada pantalla tiene UNA barra: ninguna variante dibuja dos", () => {
    for (const variante of ["completo", "progreso", "cifras", "revision", "resultado"] as const) {
      const html = renderToStaticMarkup(createElement(ResumenConteo, { resumen: r, variante }));
      expect((html.match(/role="progressbar"/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it("singular: «0 de 1 variante verificada»", () => {
    const html = renderToStaticMarkup(createElement(ResumenConteo, { resumen: { variantes: 1, verificadas: 0, pendientes: 1, conDiferencia: 0 }, variante: "progreso" }));
    expect(LIMPIO(html)).toBe("0 de 1 variante verificada");
    expect(html).toContain("width:0%");
  });

  it("«revision»: el total y el desglose, con los ceros dichos", () => {
    const html = renderToStaticMarkup(createElement(ResumenConteo, { resumen: { variantes: 37, verificadas: 37, pendientes: 0, conDiferencia: 3 }, variante: "revision" }));
    expect(LIMPIO(html)).toBe("37 variantes 34 correctas · 3 con diferencia · 0 pendientes");
    expect(html).not.toContain("progressbar");
  });

  it("«revision» usa `correctas` si llega y no lo recalcula", () => {
    const html = renderToStaticMarkup(createElement(ResumenConteo, { resumen: { variantes: 10, verificadas: 8, pendientes: 2, conDiferencia: 1, correctas: 7 }, variante: "revision" }));
    expect(LIMPIO(html)).toBe("10 variantes 7 correctas · 1 con diferencia · 2 pendientes");
  });

  it("«resultado»: lo verificado, lo que coincidió y lo corregido; el cierre parcial suma lo que quedó sin verificar", () => {
    const completo = renderToStaticMarkup(createElement(ResumenConteo, { resumen: { variantes: 37, verificadas: 37, pendientes: 0, conDiferencia: 3 }, variante: "resultado" }));
    expect(LIMPIO(completo)).toBe("37 variantes verificadas · 34 coincidieron · 3 fueron corregidas");
    const parcial = renderToStaticMarkup(createElement(ResumenConteo, { resumen: { variantes: 37, verificadas: 25, pendientes: 12, conDiferencia: 3 }, variante: "resultado", parcial: true }));
    expect(LIMPIO(parcial)).toBe("25 variantes verificadas · 22 coincidieron · 3 fueron corregidas · 12 quedaron sin verificar (conteo parcial)");
    // Sin `parcial`, aunque queden pendientes, no se dice «parcial».
    const noParcial = renderToStaticMarkup(createElement(ResumenConteo, { resumen: { variantes: 37, verificadas: 25, pendientes: 12, conDiferencia: 3 }, variante: "resultado" }));
    expect(LIMPIO(noParcial)).not.toContain("parcial");
  });

  it("la barra nunca pasa de 100 % ni se rompe con cero variantes", () => {
    const de = (resumen: { variantes: number; verificadas: number; pendientes: number; conDiferencia: number }) => renderToStaticMarkup(createElement(ResumenConteo, { resumen, variante: "progreso" }));
    expect(de({ variantes: 5, verificadas: 9, pendientes: 0, conDiferencia: 0 })).toContain("width:100%");
    expect(de({ variantes: 0, verificadas: 0, pendientes: 0, conDiferencia: 0 })).toContain("width:0%");
  });
});

describe("PasosConteo", () => {
  const de = (actual: "contar" | "revisar" | "confirmar") => renderToStaticMarkup(createElement(PasosConteo, { actual }));

  it("dice «Paso N de 3» y los tres nombres en su orden", () => {
    const html = de("revisar");
    expect(LIMPIO(html)).toContain("Paso 2 de 3");
    const nombres = ["Contar", "Revisar", "Confirmar"].map((n) => LIMPIO(html).indexOf(n));
    expect(nombres.every((i) => i >= 0)).toBe(true);
    expect([...nombres].sort((a, b) => a - b)).toEqual(nombres);
    expect(html).toContain('aria-label="Pasos del conteo"');
  });

  it("marca UN paso actual y dice el estado de los demás con texto", () => {
    const html = de("revisar");
    expect((html.match(/aria-current="step"/g) ?? []).length).toBe(1);
    const t = LIMPIO(html);
    expect(t).toMatch(/Contar Hecho\./);
    expect(t).toMatch(/Revisar Paso actual\./);
    expect(t).toMatch(/Confirmar Falta\./);
  });

  it("el primer paso no tiene hechos y el último los tiene todos", () => {
    expect(LIMPIO(de("contar"))).not.toContain("Hecho.");
    expect((LIMPIO(de("confirmar")).match(/Hecho\./g) ?? []).length).toBe(2);
    expect(LIMPIO(de("contar"))).toContain("Paso 1 de 3");
    expect(LIMPIO(de("confirmar"))).toContain("Paso 3 de 3");
  });
});

describe("las tres piezas, por dentro", () => {
  const fuente = (archivo: string) => readFileSync(join(__dirname, "../components/conteo", archivo), "utf8");
  const ARCHIVOS = ["EstadoLinea.tsx", "ResumenConteo.tsx", "PasosConteo.tsx"];

  it("ningún color suelto: solo tokens de globals.css", () => {
    for (const a of ARCHIVOS) {
      const sinComentarios = fuente(a).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(sinComentarios, a).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(sinComentarios, a).not.toMatch(/\b(?:rgb|rgba|hsl|oklch)\(/);
      expect(sinComentarios, a).not.toMatch(/(?:text|bg|border|outline|ring|fill|stroke)-\[#/);
    }
  });

  it("solo EstadoLinea es de cliente (necesita recordar el estado anterior); las otras sirven en Server Components", () => {
    expect(fuente("EstadoLinea.tsx").startsWith('"use client"')).toBe(true);
    expect(fuente("ResumenConteo.tsx")).not.toContain("use client");
    expect(fuente("PasosConteo.tsx")).not.toContain("use client");
  });

  it("EstadoLinea exporta solo el componente (un Server Component nunca debe llamar una función de un archivo de cliente)", () => {
    expect((fuente("EstadoLinea.tsx").match(/^export (?:async )?function /gm) ?? []).length).toBe(1);
    expect(fuente("EstadoLinea.tsx")).not.toMatch(/^export (?:const|let|var) /m);
  });

  it("ninguna pieza toca la base ni la red: son presentacionales", () => {
    for (const a of ARCHIVOS) {
      expect(fuente(a), a).not.toMatch(/supabase|fetch\(|\.rpc\(|\.from\(/);
    }
  });

  it("ninguna dice lo que el rediseño quitó ni usa el vocabulario prohibido", () => {
    const prohibidas = /a ciegas|prendas contadas|unidades anotadas|discrepancia|reconciliaci|divergencia|variaci[oó]n|conviene contar|empleado|jefe|sucursal/i;
    for (const a of ARCHIVOS) expect(fuente(a), a).not.toMatch(prohibidas);
    for (const html of [estado({ estado: "pendiente" }), renderToStaticMarkup(createElement(PasosConteo, { actual: "contar" })), renderToStaticMarkup(createElement(ResumenConteo, { resumen: { variantes: 3, verificadas: 1, pendientes: 2, conDiferencia: 0 } }))]) {
      expect(LIMPIO(html)).not.toMatch(prohibidas);
    }
  });
});
