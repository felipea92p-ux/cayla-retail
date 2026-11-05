import { describe, expect, it } from "vitest";
import type { Aniversario, Cumple, Espera, MiClub } from "./club";
import { lineaDeMiembro, resumenAvisos, resumenFavoritos, resumenPedidos } from "./perfil";
import type { Pedido } from "./pedidos";

const ped = (estado: Pedido["estado"], listoParaRecoger = false) => ({ estado, listoParaRecoger });

const cumple = (c: Partial<Cumple> = {}): Cumple => ({ estado: "proximo", dia: 12, mes: 5, pct: 10, hasta: null, canjeadoEl: null, ...c });
const aniv = (a: Partial<Aniversario> = {}): Aniversario => ({
  estado: "en_camino",
  valeMonto: null,
  valeVence: null,
  valeCanjeadoEl: null,
  proximo: "2027-10-15",
  anioCuenta: false,
  compras: 2,
  monto: 150,
  comprasMeta: 6,
  montoMeta: 600,
  siguienteMonto: 20,
  dias: 60,
  ...a,
});
const club = (c: Partial<MiClub["club"]> = {}): MiClub["club"] => ({ activa: true, conPublicidad: false, cumple: cumple(), aniversario: aniv(), ...c });

const espera = (e: Partial<Espera> = {}): Espera => ({
  id: "e1",
  varianteId: "v1",
  productoId: "p1",
  producto: "Short Mom",
  color: null,
  talla: "32",
  sede: null,
  creadaEn: "2026-10-15T10:00:00+00:00",
  seVe: true,
  llego: false,
  hayEn: [],
  ...e,
});

describe("el cuadro de «Mis pedidos»", () => {
  it("sin respuesta de la base, lo dice sin inventar un estado", () => {
    expect(resumenPedidos(null)).toEqual({ texto: "No se pudo cargar", tono: "neutro" });
  });

  it("sin pedidos, o sin ninguno abierto", () => {
    expect(resumenPedidos([])).toEqual({ texto: "Todavía ninguno", tono: "neutro" });
    expect(resumenPedidos([ped("entregado"), ped("vencido"), ped("anulado")])).toEqual({ texto: "Ninguno en curso", tono: "neutro" });
  });

  it("uno en curso dice en qué está, con la misma insignia de su fila", () => {
    expect(resumenPedidos([ped("por_confirmar"), ped("entregado")])).toEqual({ texto: "Por confirmar", tono: "ambar" });
    expect(resumenPedidos([ped("confirmado")])).toEqual({ texto: "Confirmado · falta pagar", tono: "verde" });
    expect(resumenPedidos([ped("pagado")])).toEqual({ texto: "Pagado", tono: "verde" });
  });

  it("lo listo para recoger va primero; varios en curso, cuántos", () => {
    expect(resumenPedidos([ped("por_confirmar"), ped("pagado", true)])).toEqual({ texto: "Listo para recoger", tono: "verde" });
    expect(resumenPedidos([ped("pagado", true), ped("pagado", true)])).toEqual({ texto: "2 listos para recoger", tono: "verde" });
    expect(resumenPedidos([ped("por_confirmar"), ped("confirmado"), ped("entregado")])).toEqual({ texto: "2 en curso", tono: "neutro" });
  });
});

describe("los cuadros de «Favoritos» y «Te avisamos»", () => {
  it("favoritos: cuántos guardó", () => {
    expect(resumenFavoritos(0).texto).toBe("Ninguno todavía");
    expect(resumenFavoritos(1).texto).toBe("1 guardado");
    expect(resumenFavoritos(12).texto).toBe("12 guardados");
    expect(resumenFavoritos(null).texto).toBe("No se pudo cargar");
  });

  it("avisos: lo que llegó va primero, en verde; si no, cuántas esperan", () => {
    expect(resumenAvisos([espera(), espera({ llego: true })])).toEqual({ texto: "¡Ya llegó!", tono: "verde" });
    expect(resumenAvisos([espera({ llego: true }), espera({ llego: true })])).toEqual({ texto: "¡Ya llegaron 2!", tono: "verde" });
    expect(resumenAvisos([espera(), espera()])).toEqual({ texto: "2 en espera", tono: "neutro" });
  });

  it("avisos: lo que ya no está en la web no espera nada", () => {
    expect(resumenAvisos([espera({ seVe: false })])).toEqual({ texto: "Ninguno por ahora", tono: "neutro" });
    expect(resumenAvisos([])).toEqual({ texto: "Ninguno por ahora", tono: "neutro" });
    expect(resumenAvisos(null).texto).toBe("No se pudo cargar");
  });

  it("todo texto de un cuadro cabe en medio celular (dos renglones como mucho)", () => {
    const textos = [
      resumenPedidos([ped("confirmado")]),
      resumenPedidos([ped("pagado", true), ped("pagado", true)]),
      resumenAvisos([espera({ llego: true }), espera({ llego: true }), espera({ llego: true })]),
    ].map((r) => r.texto);
    for (const t of textos) expect(t.length).toBeLessThanOrEqual(30);
  });
});

describe("la línea bajo el saludo", () => {
  it("desde cuándo es del Club; sin ficha activa, eso", () => {
    expect(lineaDeMiembro(club(), 2026)).toBe("Miembro del Club CAYLA desde 2026");
    expect(lineaDeMiembro(null, 2025)).toBe("Miembro del Club CAYLA desde 2025");
    expect(lineaDeMiembro(club({ activa: false }), 2026)).toBe("Tu ficha del Club CAYLA no está activa.");
  });
});
