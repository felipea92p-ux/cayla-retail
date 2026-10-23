import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import { leerErrorStorage, objecionArchivo, tipoDeArchivo } from "@/lib/adjuntos-compra";
import { BUCKET_FOTOS_GASTO_VIAJE } from "@/lib/rendicion-reglas";
import {
  CARPETA_PAPELES,
  RPC_HABITUALES_PROVEEDOR,
  RPC_REGISTRAR_COMPRA_RAPIDA,
  leerHabituales,
  type Habitual,
  type MedioPagoCompra,
  type TipoPapel,
} from "@/lib/compra-rapida-reglas";

// Compras simple (ADR-0480, actividad 3): lo que «Compré ropa» le pide a la base desde el navegador. Los habituales se leen al elegir el
// proveedor (`fn_`: lectura, sin el loader a pantalla completa). La foto del papel se sube ANTES de guardar y su ruta va con la compra.
// Guardar lleva el identificador de la compra, que nace al abrir la pantalla: un doble clic o un reintento tras un corte devuelve lo que
// ya quedó, y con otros datos la base dice `compra_rapida_otros_datos`. Con la cuenta de una persona firma ella
// (`firmaOmitida("compra_rapida")`); desde una terminal, el combo «Responsable».

export type { ErrorDeBase };

/** Los habituales de un proveedor. `null` si no se pudo leer (la pantalla lo dice, no muestra «no le compras nada»). */
export async function cargarHabituales(proveedorId: string): Promise<Habitual[] | null> {
  const { data, error } = (await createClient().rpc(RPC_HABITUALES_PROVEEDOR as never, { p_proveedor_id: proveedorId } as never)) as unknown as {
    data: unknown;
    error: ErrorDeBase;
  };
  if (error) return null;
  return leerHabituales(data);
}

/** Sube la foto del papel. `motivo` dice, en palabras de tienda, por qué no se subió. */
export async function subirFotoPapel(archivo: File): Promise<{ ruta: string | null; motivo: string | null }> {
  const objecion = objecionArchivo(archivo);
  if (objecion) return { ruta: null, motivo: objecion };
  const tipo = tipoDeArchivo(archivo)!;
  const extension = (archivo.name.toLowerCase().split(".").pop() ?? "").replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const ruta = `${CARPETA_PAPELES}${crypto.randomUUID()}.${extension}`;
  const subida = await createClient().storage.from(BUCKET_FOTOS_GASTO_VIAJE).upload(ruta, archivo, { contentType: tipo, upsert: false });
  if (subida.error) return { ruta: null, motivo: leerErrorStorage(subida.error.message) };
  return { ruta, motivo: null };
}

export async function registrarCompraRapida(
  args: {
    p_id: string;
    p_proveedor_id: string;
    p_tipo: TipoPapel;
    p_monto: number;
    p_foto_ruta: string | null;
    p_lineas: unknown[];
    // Pagar ahora o después (20261023181000): cero y sin método si paga Compras desde Por pagar.
    p_pagado: number;
    p_medio: MedioPagoCompra | null;
  },
  firma: Firma | FirmaOmitida | null,
): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_REGISTRAR_COMPRA_RAPIDA as never, args as never), firma);
  return { error: error ?? null };
}
