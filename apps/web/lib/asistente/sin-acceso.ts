// «Pregúntale a CAYLA» (ADR-0536, actividad 4): cuando lo que la persona pregunta vive en una pantalla que su rol no ve. Sin React ni
// red: se prueba en `sin-acceso.test.ts`.
//
// Felipe (2026-10-26): la IA dice QUIÉN puede («eso lo hace quien tiene Inventario ▸ Existencias; pídeselo a tu líder de equipo»), sin
// llevarla ni enseñarle la pantalla, y la pregunta igual cuenta (dice qué accesos pide la gente). Por eso el texto lo arma el servidor
// con esta regla y no la IA: así nunca explica los pasos de una pantalla ajena.

import { moduloDeRuta } from "../actividad-reglas";
import { normalizar } from "../guias/reglas";
import type { Guia } from "../guias/tipos";
import { MODULOS, type ClaveModulo } from "../modulos";

/**
 * Las rutas de las guías que esta cuenta NO puede abrir: pantallas fijas (sin `[id]`) de un módulo que su rol no tiene. Una pantalla
 * sin módulo (depende de la sede o de un permiso) no entra: ahí no sabríamos decir a quién pedírsela.
 */
export function rutasFueraDelMenu({ guias, modulos }: { guias: readonly Guia[]; modulos: readonly ClaveModulo[] }): string[] {
  const tiene = new Set(modulos);
  return guias
    .filter((g) => !/[[(]/.test(g.ruta))
    .filter((g) => {
      const modulo = moduloDeRuta(g.ruta);
      return modulo !== null && !tiene.has(modulo);
    })
    .map((g) => g.ruta);
}

/** «Inventario ▸ Existencias», como en Roles y accesos; un módulo suelto («Inicio») o sin nombre conocido, solo su nombre. */
function nombreCompleto(clave: ClaveModulo): string {
  const m = MODULOS.find((x) => x.clave === clave);
  if (!m) return clave;
  return m.grupo === "General" || m.grupo === m.nombre ? m.nombre : `${m.grupo} ▸ ${m.nombre}`;
}

/** El módulo de la pantalla de una guía, o `null` si no tiene. */
export function moduloDeLaGuia(guia: Guia): ClaveModulo | null {
  return moduloDeRuta(guia.ruta);
}

/**
 * Lo que ve la persona: dónde se hace y quién se lo puede dar. Nunca los pasos. «Inventario ▸ Existencias» si la pantalla se llama
 * como su módulo; si no, «Rótulos (Catálogo ▸ Productos)».
 */
export function textoSinAcceso(guia: Guia): string {
  const modulo = moduloDeLaGuia(guia);
  const nombre = normalizar(MODULOS.find((m) => m.clave === modulo)?.nombre ?? "");
  const titulo = normalizar(guia.titulo);
  // «Conteo» y el módulo «Conteos» son lo mismo dicho dos veces: basta el módulo.
  const mismoNombre = !!nombre && (nombre.startsWith(titulo) || titulo.startsWith(nombre));
  const donde = !modulo ? guia.titulo : mismoNombre ? nombreCompleto(modulo) : `${guia.titulo} (${nombreCompleto(modulo)})`;
  return `Eso se hace en ${donde}, y tu rol todavía no lo tiene. Pídeselo a tu líder de equipo: es quien decide qué ve cada rol.`;
}
