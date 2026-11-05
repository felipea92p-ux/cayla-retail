import { describe, expect, it } from "vitest";
import { AMBIENTES_CAMPANA } from "@cayla-retail/shared";
import { BORRADOR_VACIO, PIEZAS_DONDE, conAcento, conAmbiente, conDonde, conMovimiento, conPaleta, faltanDelDiseno, type BorradorDiseno } from "./campanas-web-editor";
import { camposDeDiseno, faltanDelDisenoEnLaGuia } from "./campanas-web-guia";
import { faltanDe, siguienteDe } from "./guia-campos";

const R = { responsableListo: true, responsableMotivo: null };

// «Falta» de la guía sale de lo que la validación real ya bloquea: esta prueba recorre todos los estados del borrador y exige que coincidan.
const ESCENARIOS: { nombre: string; b: BorradorDiseno }[] = [
  { nombre: "vacío", b: BORRADOR_VACIO },
  ...AMBIENTES_CAMPANA.flatMap((a) =>
    [0, 1, 2].map((p) => ({ nombre: `${a.clave} paleta ${p}`, b: conPaleta(conAmbiente(BORRADOR_VACIO, a.clave), p) })),
  ),
  { nombre: "color propio que se lee", b: conAcento(conAmbiente(BORRADOR_VACIO, "cyber"), "#00aa55") },
  { nombre: "color propio que no se lee", b: conAcento(conAmbiente(BORRADOR_VACIO, "cyber"), "#1a1a19") },
  { nombre: "color propio que no es #rrggbb", b: { ...conAmbiente(BORRADOR_VACIO, "cyber"), acento: "rojo" } },
  { nombre: "sin ninguna pieza en «dónde se ve»", b: PIEZAS_DONDE.reduce((b, k) => conDonde(b, k, false), conAmbiente(BORRADOR_VACIO, "cyber")) },
  { nombre: "una sola pieza en «dónde se ve»", b: conDonde(PIEZAS_DONDE.reduce((b, k) => conDonde(b, k, false), conAmbiente(BORRADOR_VACIO, "cyber")), "sello", true) },
  { nombre: "colores que no se leen y nada en «dónde se ve»", b: PIEZAS_DONDE.reduce((b, k) => conDonde(b, k, false), conAcento(conAmbiente(BORRADOR_VACIO, "cyber"), "#1a1a19")) },
];

describe("la guía de foco del editor dice lo mismo que la validación", () => {
  for (const e of ESCENARIOS) {
    it(e.nombre, () => {
      const enLaGuia = faltanDelDisenoEnLaGuia(e.b);
      const real = faltanDelDiseno(e.b);
      expect(enLaGuia.length > 0, JSON.stringify({ enLaGuia, real })).toBe(real.length > 0);
    });
  }

  it("sin ambiente sigue «Ambiente» y luego «Colores» y «Dónde se ve»; con ambiente y paleta ya no falta nada del diseño", () => {
    const vacio = camposDeDiseno(BORRADOR_VACIO, R);
    expect(siguienteDe(vacio)?.id).toBe("ambiente");
    expect(faltanDe(vacio).map((c) => c.id)).toEqual(["ambiente", "colores", "donde"]);
    const listo = camposDeDiseno(conAmbiente(BORRADOR_VACIO, "gato"), R);
    expect(faltanDe(listo)).toEqual([]);
  });

  it("el color propio es opcional: nunca bloquea ni se lista como falta", () => {
    const c = camposDeDiseno(conAmbiente(BORRADOR_VACIO, "gato"), R).find((x) => x.id === "acento")!;
    expect(c.requerido).toBe(false);
    expect(c.hecho).toBe(false);
    expect(faltanDe([c])).toEqual([]);
  });

  it("sin responsable falta quién lo cambia, con el motivo que da el combo", () => {
    const c = camposDeDiseno(conAmbiente(BORRADOR_VACIO, "gato"), { responsableListo: false, responsableMotivo: "Elige quién está de turno." });
    expect(faltanDe(c).map((x) => `${x.id}:${x.pendiente}`)).toEqual(["responsable:Elige quién está de turno."]);
  });
});

describe("el movimiento en la guía", () => {
  it("es opcional: nunca bloquea ni se lista como falta, y se marca hecho solo cuando se apartó del de fábrica", () => {
    const base = conAmbiente(BORRADOR_VACIO, "gato");
    const antes = camposDeDiseno(base, R).find((c) => c.id === "movimiento")!;
    expect(antes.requerido).toBe(false);
    expect(antes.hecho).toBe(false);
    const despues = camposDeDiseno(conMovimiento(base, "duracion", "continuo"), R).find((c) => c.id === "movimiento")!;
    expect(despues.hecho).toBe(true);
    expect(faltanDe([despues])).toEqual([]);
  });
});
