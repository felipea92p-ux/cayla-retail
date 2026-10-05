/* ====================================================================
   El panel de una talla en Existencias (2026-10-05, maqueta `docs/maquetas/existencias-tactil-2026-10/`)

   Tocar una talla abre un panel con tres vistas (Esta talla · Todas · Ficha). En «Esta talla», siete acciones en tarjetas, cada una
   con lo que dice debajo de su nombre («8 en almacén») o por qué está apagada, y la que la pantalla sugiere resaltada. Este archivo
   decide esas siete tarjetas y el diagnóstico de la talla; el componente solo las dibuja. Lógica pura, con su prueba.

   Los nombres son los del sistema (ADR-0339): «Colgar en el piso» (la «Reponer» de la maqueta) y «Subir a almacén» (su «Retirar del
   piso»). Una acción que la persona no puede hacer por su rol no se dibuja (ADR-0161: nunca un botón que acabe en «Sin acceso»).
   «Apartar» y «Pedir a otra sede» se dibujan apagadas: Apartar vive en Vender, y Pedir aún no existe en la base.
   ==================================================================== */

import { estadoTalla, type FilaPrenda } from "./existencias-prendas";

export type ClaveAccionTalla = "colgar" | "subir" | "enviar" | "apartar" | "pedir" | "ajustar" | "ficha";

export type AccionTalla = {
  clave: ClaveAccionTalla;
  texto: string;
  /** Lo que dice debajo del nombre: qué hay, o por qué está apagada. */
  sub: string;
  ok: boolean;
  /** La que la pantalla recomienda para esta talla. */
  sugerida: boolean;
};

export type PermisosDeTalla = { puedeReponer: boolean; puedeEnviar: boolean; puedeAjustar: boolean };

type FilaDeTalla = FilaPrenda & { enRed?: readonly { sede: string; cantidad: number }[] };

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

export function accionesDeTalla(f: FilaDeTalla, p: PermisosDeTalla, separa: boolean): AccionTalla[] {
  const piso = f.pisoDisponible ?? 0;
  const alm = f.almacenDisponible ?? 0;
  const porColgar = separa && estadoTalla(f) === "por_colgar";
  const filas: AccionTalla[] = [];
  if (separa && p.puedeReponer) {
    filas.push({ clave: "colgar", texto: "Colgar en el piso", ok: alm > 0, sub: alm > 0 ? `${unidades(alm)} en almacén` : "Nada en almacén", sugerida: alm > 0 && porColgar });
    filas.push({ clave: "subir", texto: "Subir a almacén", ok: piso > 0, sub: piso > 0 ? `${unidades(piso)} en piso` : "Nada en piso", sugerida: false });
  }
  if (p.puedeEnviar) {
    filas.push({ clave: "enviar", texto: "Enviar a otra sede", ok: alm > 0, sub: alm > 0 ? `${unidades(alm)} en almacén` : "Nada en almacén", sugerida: false });
  }
  filas.push({ clave: "apartar", texto: "Apartar", ok: false, sub: "Se aparta desde Vender", sugerida: false });
  filas.push({ clave: "pedir", texto: "Pedir a otra sede", ok: false, sub: "Aún no disponible", sugerida: false });
  if (p.puedeAjustar) filas.push({ clave: "ajustar", texto: "Ajustar stock", ok: true, sub: "Corregir el número", sugerida: false });
  filas.push({ clave: "ficha", texto: "Ficha", ok: true, sub: "Precio, descripción, historial", sugerida: false });
  return filas;
}

export type DiagnosticoTalla = { tono: "ambar" | "pizarra" | "verde"; texto: string };

/** La frase de la talla, con los números de la maqueta: «Por colgar: hay 8 en almacén y ninguna en piso.», «Sin stock aquí · 3 en Lima»,
 *  «Disponible: 5 (2 en piso, 3 en almacén).». */
export function diagnosticoDeTalla(f: FilaDeTalla, separa: boolean): DiagnosticoTalla {
  const piso = f.pisoDisponible ?? 0;
  const alm = f.almacenDisponible ?? 0;
  if (f.disponible <= 0) {
    const otras = (f.enRed ?? []).filter((s) => s.cantidad > 0);
    return { tono: "pizarra", texto: otras.length ? `Sin stock aquí · ${otras.map((s) => `${s.cantidad} en ${s.sede}`).join(" · ")}.` : "Sin stock aquí ni en otra sede." };
  }
  if (separa && estadoTalla(f) === "por_colgar") return { tono: "ambar", texto: `Por colgar: hay ${unidades(alm)} en almacén y ninguna en piso.` };
  if (!separa) return { tono: "verde", texto: `Disponible: ${unidades(f.disponible)}.` };
  return { tono: "verde", texto: `Disponible: ${unidades(piso + alm)} (${piso} en piso, ${alm} en almacén).` };
}
