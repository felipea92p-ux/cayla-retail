// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A8): de las filas de `productos` y `proveedores` a
// `ProveedoresAnalisis`. Lógica pura, sin base ni React; la prueba es `analisis-proveedores-lectura.test.ts`.
//
// No confía en la forma (principio 9): una fila sin su id o sin su nombre se descarta —nunca se inventa un proveedor—, y si lo que llega
// no es una lista (la base respondió algo raro) devuelve null: quien llama lo dice como «no se pudo leer», nunca como «sin proveedor».

import type { ProveedoresAnalisis } from "./analisis-tipos";

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/**
 * Los nombres de los proveedores (de todo el directorio, también los archivados: un modelo puede seguir apuntando a uno) y el proveedor
 * del catálogo de cada modelo. null si `productos` o `proveedores` no son una lista, o si no llegó ni un proveedor.
 */
export function leerProveedoresAnalisis(productos: unknown, proveedores: unknown): ProveedoresAnalisis | null {
  if (!Array.isArray(productos) || !Array.isArray(proveedores)) return null;
  const nombres: ProveedoresAnalisis["nombres"] = {};
  for (const fila of proveedores) {
    if (!esObjeto(fila)) continue;
    const id = texto(fila.id);
    const nombre = texto(fila.nombre);
    if (!id || !nombre) continue;
    // Solo un `false` explícito lo da por archivado: una fila sin la columna no se trata como baja.
    nombres[id] = { nombre: nombre.trim(), activo: fila.activo !== false };
  }
  const delCatalogo: ProveedoresAnalisis["delCatalogo"] = {};
  for (const fila of productos) {
    if (!esObjeto(fila)) continue;
    const id = texto(fila.id);
    const proveedor = texto(fila.proveedor_id);
    if (id && proveedor) delCatalogo[id] = proveedor;
  }
  // Un directorio sin ni un proveedor no es un estado real del ERP: es lo que devuelve la base cuando la cuenta ya no pasa la puerta de lectura
  // (una política de filas responde cero filas, no un error). Leerlo como dato pondría «Sin proveedor» a todos los modelos por una falla.
  if (Object.keys(nombres).length === 0) return null;
  return { nombres, delCatalogo };
}

/**
 * Solo lo que la pantalla puede usar: el proveedor del catálogo de los modelos que tiene delante y los nombres de a quienes apuntan (el del
 * catálogo y el de la última compra). El directorio entero y el catálogo entero (cientos de pares) no tienen por qué viajar al navegador.
 */
export function recortarProveedores(p: ProveedoresAnalisis, modelos: readonly { productoId: string; proveedorId: string | null }[]): ProveedoresAnalisis {
  const delCatalogo: ProveedoresAnalisis["delCatalogo"] = {};
  const quienes = new Set<string>();
  for (const m of modelos) {
    const del = p.delCatalogo[m.productoId];
    if (del) {
      delCatalogo[m.productoId] = del;
      quienes.add(del);
    }
    if (m.proveedorId) quienes.add(m.proveedorId);
  }
  const nombres: ProveedoresAnalisis["nombres"] = {};
  for (const id of quienes) {
    const x = p.nombres[id];
    if (x) nombres[id] = x;
  }
  return { nombres, delCatalogo };
}
