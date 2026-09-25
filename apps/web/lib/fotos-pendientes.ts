"use client";

import type { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { subirFotoProducto } from "@/lib/producto-fotos";

/**
 * Las fotos de un producto dado de alta SIN CONEXIÓN (ADR-0209, paso 2). La operación del alta viaja en la cola de
 * `localStorage`, pero las fotos son archivos: no caben ahí. Se guardan en IndexedDB (el navegador guarda un `File` tal
 * cual) bajo el MISMO token de la operación, y el sincronizador las sube recién cuando la base creó el producto —
 * igual que el alta en línea, que sube las fotos después de crear (`NuevoProductoForm`).
 *
 * Ciclo: `guardarFotos(token)` al encolar → `marcarCreado(token, productoId)` al subir el alta → `subirFotosListas()`
 * en cada pasada las sube y borra. Si se descarta el alta rechazada, `borrarFotos(token)`. Nada acá lanza: un
 * navegador sin IndexedDB degrada a «las fotos no se guardaron», nunca a perder el alta.
 */

type FotoGuardada = { archivo: File; colorCodigo: string | null };
type Entrada = { token: string; nombre: string; fotos: FotoGuardada[]; productoId: string | null };

const BASE = "cayla-offline";
const ALMACEN = "fotos-alta";

function abrir(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN, { keyPath: "token" });
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function conAlmacen<T>(modo: IDBTransactionMode, hacer: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await abrir();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ALMACEN, modo);
      const req = hacer(tx.objectStore(ALMACEN));
      tx.oncomplete = () => resolve(req.result ?? null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Guarda las fotos elegidas en el alta que quedó en la cola. `false` si el navegador no pudo. */
export async function guardarFotos(token: string, nombre: string, fotos: FotoGuardada[]): Promise<boolean> {
  if (fotos.length === 0) return true;
  const entrada: Entrada = { token, nombre, fotos, productoId: null };
  return (await conAlmacen("readwrite", (s) => s.put(entrada))) !== null;
}

/** La base ya creó el producto: sus fotos quedan listas para subir. */
export async function marcarCreado(token: string, productoId: string): Promise<void> {
  const e = await conAlmacen<Entrada | undefined>("readonly", (s) => s.get(token) as IDBRequest<Entrada | undefined>);
  if (e) await conAlmacen("readwrite", (s) => s.put({ ...e, productoId }));
}

export async function borrarFotos(token: string): Promise<void> {
  await conAlmacen("readwrite", (s) => s.delete(token));
}

/**
 * Sube las fotos de los productos que ya existen en la base. Devuelve lo que pasó con cada uno para avisarlo. Sin red,
 * no toca nada y lo intenta en la próxima pasada; otro error (archivo inválido, sin permiso) se avisa y se borra —
 * reintentarlo cada 30 s no lo arregla, y el producto ya existe: la foto se agrega desde su ficha.
 */
export async function subirFotosListas(supabase: ReturnType<typeof createClient>): Promise<{ nombre: string; productoId: string; subidas: number; fallidas: string[] }[]> {
  const todas = (await conAlmacen<Entrada[]>("readonly", (s) => s.getAll() as IDBRequest<Entrada[]>)) ?? [];
  const resultados: { nombre: string; productoId: string; subidas: number; fallidas: string[] }[] = [];
  for (const e of todas) {
    if (!e.productoId) continue;
    const filas: { producto_id: string; url: string; orden: number; es_principal: boolean; color_codigo: string | null }[] = [];
    const fallidas: string[] = [];
    let sinRed = false;
    for (const f of e.fotos) {
      const r = await subirFotoProducto(supabase, f.archivo);
      if ("error" in r) {
        if (esFalloDeRed({ message: r.error })) {
          sinRed = true;
          break;
        }
        fallidas.push(`${f.archivo.name}: ${r.error}`);
        continue;
      }
      filas.push({ producto_id: e.productoId, url: r.url, orden: filas.length, es_principal: filas.length === 0, color_codigo: f.colorCodigo });
    }
    // Sin red a mitad: se reintenta TODO en la próxima pasada (un archivo huérfano en Storage no rompe nada; una foto
    // repetida en la ficha, sí — por eso las filas se escriben solo cuando subieron todas las que podían).
    if (sinRed) continue;
    let subidas = 0;
    if (filas.length > 0) {
      const { error } = await supabase.from("producto_fotos").insert(filas);
      if (error && esFalloDeRed(error)) continue;
      if (error) fallidas.push(traducirError(error, "guardar las fotos"));
      else subidas = filas.length;
    }
    await borrarFotos(e.token);
    resultados.push({ nombre: e.nombre, productoId: e.productoId, subidas, fallidas });
  }
  return resultados;
}
