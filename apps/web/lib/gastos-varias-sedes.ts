// Gastos con varias sedes a la vez (Felipe 2026-10-24): la barra del telar deja marcar dos o más, y la base solo sabe mirar una
// ubicación (`p_ubicacion_id`), la empresa (`p_solo_empresa`) o todas. Sin migración: lo que trae su sede en cada fila se lee de
// todas y se filtra con `dentroDeVer`; lo que la base ya suma (`fn_gastos_panel`) o corta en N filas se pide parte por parte
// (`partesDeVer`) y se junta aquí. Las partes no se pisan —cada gasto, deuda o salida de caja es de una sola ubicación o de la
// empresa—, así que la suma da lo mismo que habría dado la base mirando esas sedes juntas.
import { SEDE_EMPRESA, type ClaveSede } from "./finanzas-telar-reglas";
import type { PanelGastos, UbicacionGastos, Ver } from "./gastos-reglas";

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Lo marcado en la barra → la vista de varias sedes. `null` si es una o ninguna: esa se lee como siempre (`leerVer`). Una clave
 * que no es una ubicación que la cuenta ve en Gastos se ignora; las sedes van en el orden en que llegan (el de la barra, así la
 * cabecera las nombra igual que los botones) y la empresa al final.
 */
export function verDeVarias(elegidas: readonly ClaveSede[], ubicaciones: readonly UbicacionGastos[]): Ver | null {
  const ubicacionIds = elegidas.filter((c) => ubicaciones.some((u) => u.id === c));
  const conEmpresa = elegidas.includes(SEDE_EMPRESA);
  if (ubicacionIds.length + (conEmpresa ? 1 : 0) < 2) return null;
  return { clave: [...ubicacionIds, ...(conEmpresa ? [SEDE_EMPRESA] : [])].join(","), ubicacionId: null, soloEmpresa: false, varias: { ubicacionIds, conEmpresa } };
}

/** Cada parte de lo que se mira, como una vista de una sola: lo que la base sabe leer. Una vista de una o de todas es su propia parte. */
export function partesDeVer(ver: Ver): Ver[] {
  if (!ver.varias) return [ver];
  return [
    ...ver.varias.ubicacionIds.map((id) => ({ clave: id, ubicacionId: id, soloEmpresa: false })),
    ...(ver.varias.conEmpresa ? [{ clave: SEDE_EMPRESA, ubicacionId: null, soloEmpresa: true }] : []),
  ];
}

/** ¿Una fila de esta ubicación (`null` = de la empresa) entra en lo que se mira? */
export function dentroDeVer(ver: Ver, ubicacionId: string | null): boolean {
  if (ver.varias) return ubicacionId === null ? ver.varias.conEmpresa : ver.varias.ubicacionIds.includes(ubicacionId);
  if (ver.soloEmpresa) return ubicacionId === null;
  return ver.ubicacionId === null || ver.ubicacionId === ubicacionId;
}

/** Junta los resúmenes de cada parte en uno: cifras sumadas y, por categoría y por sede, una fila de cada una (de la que más a la que menos). */
export function juntarPaneles(paneles: readonly PanelGastos[]): PanelGastos {
  const suma = (f: (p: PanelGastos) => number) => redondear(paneles.reduce((a, p) => a + f(p), 0));
  const cuenta = (f: (p: PanelGastos) => number) => paneles.reduce((a, p) => a + f(p), 0);
  const porCategoria = new Map<string, PanelGastos["porCategoria"][number]>();
  const porUbicacion = new Map<string | null, PanelGastos["porUbicacion"][number]>();
  for (const p of paneles) {
    for (const c of p.porCategoria) {
      const x = porCategoria.get(c.categoria);
      porCategoria.set(c.categoria, x ? { ...x, monto: redondear(x.monto + c.monto), n: x.n + c.n } : { ...c });
    }
    for (const u of p.porUbicacion) {
      const x = porUbicacion.get(u.ubicacionId);
      porUbicacion.set(u.ubicacionId, x ? { ...x, monto: redondear(x.monto + u.monto), n: x.n + u.n } : { ...u });
    }
  }
  const igv = suma((p) => p.igv);
  const igvPerdido = { n: cuenta((p) => p.igvPerdido.n), igv: suma((p) => p.igvPerdido.igv), deOtrosMeses: suma((p) => p.igvPerdido.deOtrosMeses) };
  return {
    total: suma((p) => p.total),
    igv,
    igvPerdido,
    igvDescontable: redondear(igv - igvPerdido.igv),
    n: cuenta((p) => p.n),
    boletas: cuenta((p) => p.boletas),
    sinComprobante: cuenta((p) => p.sinComprobante),
    porPagar: suma((p) => p.porPagar),
    nPorPagar: cuenta((p) => p.nPorPagar),
    egresosSinClasificar: cuenta((p) => p.egresosSinClasificar),
    egresosSinClasificarMonto: suma((p) => p.egresosSinClasificarMonto),
    porCategoria: [...porCategoria.values()].sort((a, b) => b.monto - a.monto),
    porUbicacion: [...porUbicacion.values()].sort((a, b) => b.monto - a.monto),
  };
}

/** Junta las listas de cada parte, de la más reciente a la más vieja, con el mismo tope que tenía cada una (la base corta en N filas). */
export function juntarRecientes<T>(listas: readonly (readonly T[])[], cuando: (fila: T) => string, tope: number): T[] {
  return listas
    .flat()
    .sort((a, b) => (cuando(a) < cuando(b) ? 1 : cuando(a) > cuando(b) ? -1 : 0))
    .slice(0, tope);
}

/**
 * Los nombres de lo que se mira, en una frase: «Trujillo y Lima», «Trujillo, el Taller y la empresa» (`enFrase`) o, arriba de la
 * cabecera, «Trujillo, Taller y Empresa». `corto` acorta el nombre de una ubicación como su hilo («Tienda Lima» → «Lima»).
 */
export function nombresDeVarias(ver: Ver, ubicaciones: readonly UbicacionGastos[], corto: (nombre: string) => string, enFrase: boolean): string {
  if (!ver.varias) return "";
  const nombres = ver.varias.ubicacionIds.map((id) => {
    const n = corto(ubicaciones.find((u) => u.id === id)?.nombre ?? "una sede");
    return enFrase && /^taller$/i.test(n) ? "el Taller" : n;
  });
  if (ver.varias.conEmpresa) nombres.push(enFrase ? "la empresa" : "Empresa");
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}` : (nombres[0] ?? "");
}
