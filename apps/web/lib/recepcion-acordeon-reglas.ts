// El acordeón de categorías de Recibir (rediseño «B», Felipe 2026-10-29): cada categoría se abre y muestra las prendas que se anotaron al
// comprar, con cuántas eran y cuántas ya se identificaron. Es solo para ver el detalle: no se cuenta «una más» a la categoría desde aquí
// (Felipe: «eso te lo desglosa para que puedas ver más detallado»). Lo que se separó y no estaba anotado también sale, para que la lista
// diga todo lo que hay en la categoría. Las cuentas salen de lo separado, igual que «¿Qué … son?»; aquí no se decide nada nuevo.

import { anotadasDelGrupo, type GrupoDeLineas } from "./recepcion-grupos-reglas";

export type EstadoPrendaAcordeon = "lista" | "a-medias" | "por-identificar" | "fuera";

export type PrendaDelAcordeon = {
  clave: string;
  nombre: string;
  /** Cuántas se anotaron al comprar; `null` si no estaba anotada. */
  esperadas: number | null;
  /** Cuántas ya se dijo que son esta prenda (en «¿Qué … son?»). */
  identificadas: number;
  estado: EstadoPrendaAcordeon;
};

const normaliza = (d: string): string => d.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

function estadoDe(esperadas: number | null, identificadas: number): EstadoPrendaAcordeon {
  if (esperadas == null) return "fuera";
  if (identificadas >= esperadas) return "lista";
  return identificadas > 0 ? "a-medias" : "por-identificar";
}

/** Las prendas de una categoría, en el orden de la compra y después lo que no estaba anotado. */
export function prendasDelAcordeon(g: GrupoDeLineas): PrendaDelAcordeon[] {
  const usadasCatalogo = new Set<string>();
  const usadasNombre = new Set<string>();
  const filas: PrendaDelAcordeon[] = anotadasDelGrupo(g).map(({ prenda }) => {
    let identificadas = 0;
    if (prenda.productoId) {
      usadasCatalogo.add(prenda.productoId);
      identificadas = g.separado.prendas.find((p) => p.productoId === prenda.productoId)?.cantidad ?? 0;
    } else {
      const clave = normaliza(prenda.nombre);
      usadasNombre.add(clave);
      identificadas = g.separado.nuevas.filter((n) => n.descripcion && normaliza(n.descripcion) === clave).reduce((a, n) => a + n.cantidad, 0);
    }
    return {
      clave: prenda.productoId ?? `nombre:${normaliza(prenda.nombre)}`,
      nombre: prenda.nombre,
      esperadas: prenda.cantidad,
      identificadas,
      estado: estadoDe(prenda.cantidad, identificadas),
    };
  });
  for (const p of g.separado.prendas) {
    if (usadasCatalogo.has(p.productoId) || p.cantidad <= 0) continue;
    filas.push({ clave: p.productoId, nombre: p.nombre ?? p.codigo ?? "Prenda del catálogo", esperadas: null, identificadas: p.cantidad, estado: "fuera" });
  }
  for (const n of g.separado.nuevas) {
    if (!n.descripcion || n.cantidad <= 0 || usadasNombre.has(normaliza(n.descripcion))) continue;
    usadasNombre.add(normaliza(n.descripcion));
    filas.push({ clave: `nueva:${normaliza(n.descripcion)}`, nombre: n.descripcion, esperadas: null, identificadas: n.cantidad, estado: "fuera" });
  }
  return filas;
}

/** La línea bajo el nombre de la categoría: «1 de 2 contadas · 2 prendas», «sin contar · 1 prenda», «3 contadas» (sin aviso). */
export function resumenDeCategoria(g: GrupoDeLineas, nPrendas: number): string {
  const hayConteo = g.lineas.some((l) => l.conteo !== null);
  const conteo = !hayConteo ? "sin contar" : g.dijeron != null ? `${g.contadas} de ${g.dijeron} contadas` : `${g.contadas} ${g.contadas === 1 ? "contada" : "contadas"}`;
  return nPrendas > 0 ? `${conteo} · ${nPrendas} ${nPrendas === 1 ? "prenda" : "prendas"}` : conteo;
}
