import { describe, expect, it } from "vitest";
import { estadosDe, faltanDe, sePuedeConfirmar, siguienteDe } from "./guia-campos";
import { camposDeAvance, camposDeCambiarQuien } from "./orden-pagina-guia";
import { problemasFases, type FaseBorrador, type ProveedorServicio, type TarifaDeLista } from "./orden-fases-reglas";

describe("camposDeAvance — la guía coincide con lo que registrar_avance exige", () => {
  // `registrar_avance` rechaza una anotación sin ninguna cantidad (fn_produccion_lineas_cantidad) y exige a alguien que firme (fn_actor_persona_id(true)).
  const laBaseAcepta = (total: number, responsableListo: boolean) => total > 0 && responsableListo;

  it("recorre las combinaciones: «se puede confirmar» es exactamente «la base acepta»", () => {
    for (const total of [0, 1, 48]) for (const responsableListo of [true, false]) expect(sePuedeConfirmar(camposDeAvance({ total, responsableListo })), `${total}/${responsableListo}`).toBe(laBaseAcepta(total, responsableListo));
  });
  it("al abrir la hoja precargada con lo que falta, solo sigue «quién lo anota»", () => {
    const campos = camposDeAvance({ total: 48, responsableListo: false });
    expect(siguienteDe(campos)?.id).toBe("quien");
    expect(estadosDe(campos)).toEqual({ cantidades: "hecho", quien: "ahora" });
  });
  it("si se borra todo, sigue «cuántas» y dice qué hacer", () => {
    const campos = camposDeAvance({ total: 0, responsableListo: true });
    expect(siguienteDe(campos)).toMatchObject({ id: "cantidades", pendiente: "Escribe cuántas terminaste en cada talla y color." });
    expect(faltanDe(camposDeAvance({ total: 0, responsableListo: false })).map((c) => c.id)).toEqual(["cantidades", "quien"]);
  });
});

describe("camposDeCambiarQuien — la guía coincide con lo que la base rechazaría de una fase", () => {
  const HOY = "2026-10-19";
  const PROVEEDORES: ProveedorServicio[] = [
    { id: "p1", nombre: "Confecciones del Norte", rubro: "maquila", activo: true },
    { id: "p2", nombre: "Telas SAC", rubro: "tela", activo: true },
    { id: "p3", nombre: "Cerrado SAC", rubro: "maquila", activo: false },
  ];
  const LISTA: TarifaDeLista[] = [{ proveedorId: "p1", faseClave: "acabado", tarifa: 2, minimo: 100, fijo: 0, vigenteDesde: "2026-01-01" }];
  const base: FaseBorrador = { clave: "acabado", encendida: true, quien: "servicio", proveedorId: null, tarifa: "", fijo: "", minimo: "", fechaPrometida: "", posicion: null };

  it("sin el responsable, la fase es la misma que la de la hoja de Nueva orden: lo que dice problemasFases", () => {
    const casos: FaseBorrador[] = [
      { ...base, quien: "taller" },
      base,
      { ...base, proveedorId: "p1" },
      { ...base, proveedorId: "p1", tarifa: "2.5" },
      { ...base, proveedorId: "p2", tarifa: "2.5" },
      { ...base, proveedorId: "p3", tarifa: "2.5" },
      { ...base, proveedorId: "p1", tarifa: "2,5" },
      { ...base, proveedorId: "p1", tarifa: "2.5", fechaPrometida: "2026-10-01" },
      { ...base, proveedorId: "p1", tarifa: "2.5", fechaPrometida: "2026-10-30" },
    ];
    for (const fase of casos) {
      const faltas = problemasFases([fase], { hoy: HOY, proveedores: PROVEEDORES, lista: LISTA }).map((p) => p.texto);
      for (const responsableListo of [true, false]) {
        expect(sePuedeConfirmar(camposDeCambiarQuien({ faltas, responsableListo })), JSON.stringify(fase)).toBe(faltas.length === 0 && responsableListo);
      }
    }
  });
  it("dice lo primero que falta de la fase, con sus palabras", () => {
    const campos = camposDeCambiarQuien({ faltas: ["Si «Acabado» sale afuera, elige a quién."], responsableListo: true });
    expect(siguienteDe(campos)).toMatchObject({ id: "fase", pendiente: "Si «Acabado» sale afuera, elige a quién." });
    expect(estadosDe(camposDeCambiarQuien({ faltas: [], responsableListo: false }))).toEqual({ fase: "hecho", quien: "ahora" });
  });
});
