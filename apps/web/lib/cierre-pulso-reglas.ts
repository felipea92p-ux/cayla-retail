// Cierre de mes en camino A («La respuesta», Felipe 2026-10-15): arriba de la matriz, «¿puedo cerrar octubre?» con lo que
// falta en una cifra, el anillo de lo que ya está y las primeras cosas por resolver, cada una con su enlace. Lógica pura
// sobre `fn_cierre_panel` (`PanelCierre`): no repite ningún chequeo, solo los cuenta y los pone en orden.

import { enlaceChequeo, estadoConsolidado, textoChequeo, type Chequeo, type PanelCierre, type Unidad } from "./cierre-reglas";
import { mesNombre } from "./resultados-reglas";

export type CosaDelCierre = {
  clave: string;
  unidad: string;
  titulo: string;
  detalle: string;
  bloquea: boolean;
  href: string | null;
};

export type PulsoCierre = {
  estado: "cerrado" | "listo" | "faltan";
  mes: string;
  /** Lo que bloquea el cierre, sumado en las unidades abiertas. */
  faltan: number;
  /** Chequeos que bloquean y ya pasaron, sobre los que bloquean en total (las unidades abiertas); con el mes cerrado, todo. */
  hechos: number;
  total: number;
  pct: number;
  /** Unidades abiertas que ya se pueden cerrar. */
  listas: string[];
  cosas: CosaDelCierre[];
  frase: string;
  explica: string;
};

const cuentaHuella = (c: Chequeo) => c.clave !== "huella";

export function pulsoCierre(p: PanelCierre): PulsoCierre {
  const mes = mesNombre(p.mes);
  const cons = estadoConsolidado(p);
  const abiertas = p.unidades.filter((u) => u.estado !== "cerrado");
  const cosas: CosaDelCierre[] = abiertas
    .flatMap((u) => u.chequeos.filter((c) => !c.ok && cuentaHuella(c)).map((c) => ({ u, c })))
    .sort((a, b) => Number(b.c.bloquea) - Number(a.c.bloquea))
    .map(({ u, c }) => {
      const t = textoChequeo(c, p.mes);
      return { clave: `${u.clave}:${c.clave}`, unidad: u.nombre, titulo: t.titulo, detalle: t.detalle, bloquea: c.bloquea, href: enlaceChequeo(c, u, p.mes) };
    });
  const bloqueantes = (u: Unidad) => u.chequeos.filter((c) => c.bloquea && cuentaHuella(c));
  const total = abiertas.reduce((s, u) => s + bloqueantes(u).length, 0);
  const hechos = abiertas.reduce((s, u) => s + bloqueantes(u).filter((c) => c.ok).length, 0);
  const faltan = total - hechos;
  const listas = abiertas.filter((u) => u.bloqueantes === 0).map((u) => u.nombre);

  if (cons.estado === "cerrado") {
    return { estado: "cerrado", mes: p.mes, faltan: 0, hechos: total, total, pct: 100, listas: [], cosas, frase: `${cap(mes)} ya está cerrado.`, explica: "El mes quedó congelado con su huella; nadie puede registrar ni cambiar nada con esa fecha. Si hace falta, se reabre con motivo." };
  }
  if (cons.estado === "listo") {
    return { estado: "listo", mes: p.mes, faltan: 0, hechos: total, total, pct: 100, listas: ["CAYLA entera"], cosas, frase: `Puedes cerrar ${mes} de CAYLA entera.`, explica: "Todas las tiendas, el Taller y lo de la empresa ya cerraron: solo falta el cierre de CAYLA entera." };
  }
  const pct = total > 0 ? Math.round((hechos / total) * 100) : 0;
  if (faltan === 0) {
    return { estado: "faltan", mes: p.mes, faltan: 0, hechos, total, pct, listas, cosas, frase: `Puedes cerrar ${mes}.`, explica: `${enumerar(listas)} ${listas.length === 1 ? "ya está lista" : "ya están listas"}: ningún chequeo frena el cierre. Lo que avisa sin frenar queda guardado con el cierre.` };
  }
  return {
    estado: "faltan", mes: p.mes, faltan, hechos, total, pct, listas, cosas,
    frase: faltan === 1 ? `Te falta 1 cosa para cerrar ${mes}.` : `Te faltan ${faltan} cosas para cerrar ${mes}.`,
    explica: `${hechos} de ${total} chequeos ya pasaron${listas.length ? `; ${enumerar(listas)} ${listas.length === 1 ? "ya se puede cerrar" : "ya se pueden cerrar"}` : ""}. Cada cosa que falta lleva a la pantalla donde se arregla.`,
  };
}

const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
function enumerar(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}
