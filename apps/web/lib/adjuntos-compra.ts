import type { createClient } from "@/lib/supabase/client";
import { ADJUNTOS_BUCKET, ADJUNTOS_MAX_BYTES, ADJUNTOS_TIPOS, tamanoLegible } from "@/lib/compras-reglas";
import { firmar, type Firma } from "@/lib/responsable-reglas";

// Subida de adjuntos de factura desde el NAVEGADOR (20260914180000_compras_adjuntos.sql).
// No pasa por Next: el archivo va directo del navegador al bucket, y recién
// después se registra la fila por RPC — la fila es lo que hace existir al
// adjunto para el sistema; un objeto sin fila es basura invisible.
//
// Vive aparte de compras.ts (que importa next/headers y no puede entrar al
// navegador) y de compras-reglas.ts (que es puro y no debería saber de
// Supabase). Recibe el cliente del navegador ya creado (lib/supabase/client.ts,
// que apunta al schema `retail`) para no abrir otro.

type Cliente = ReturnType<typeof createClient>;

export type ResultadoSubida = {
  subidos: string[];
  /** Nombre del archivo y por qué falló, en lenguaje de mostrador. */
  fallidos: { nombre: string; motivo: string }[];
  /** El primer rechazo de la base al registrar una fila (para `responsable.despues`), o `null` si no hubo. */
  errorRegistro: { code?: string | null; hint?: string | null; message?: string | null } | null;
};

/** Qué tiene de malo un archivo antes de intentar subirlo — o null si va bien. */
export function objecionArchivo(f: File): string | null {
  // El navegador a veces no reconoce HEIC y manda tipo vacío: se acepta por la
  // extensión y se declara el tipo a mano al subir.
  const tipo = tipoDeArchivo(f);
  if (!tipo) return "Solo se aceptan PDF o imágenes (JPG, PNG, WebP, HEIC).";
  if (f.size <= 0) return "El archivo está vacío.";
  if (f.size > ADJUNTOS_MAX_BYTES) return `Pesa ${tamanoLegible(f.size)}; el máximo es ${tamanoLegible(ADJUNTOS_MAX_BYTES)}.`;
  return null;
}

export function tipoDeArchivo(f: File): string | null {
  if ((ADJUNTOS_TIPOS as readonly string[]).includes(f.type)) return f.type;
  const ext = f.name.toLowerCase().split(".").pop();
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "pdf" && !f.type) return "application/pdf";
  if ((ext === "jpg" || ext === "jpeg") && !f.type) return "image/jpeg";
  return null;
}

// La ruta lleva el id de la compra como carpeta (la RPC y un check de la
// tabla lo exigen) y un uuid delante del nombre para que dos "factura.pdf"
// no choquen. El nombre se limpia a ASCII simple: Storage no acepta
// cualquier carácter en la clave del objeto.
function rutaPara(compraId: string, f: File): string {
  const limpio = f.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 80);
  return `${compraId}/${crypto.randomUUID()}-${limpio || "archivo"}`;
}

/**
 * `firma`: quién hace la operación (combo «Responsable», ADR-0161/0162). `registrar_adjunto_compra` firma con esa
 * persona y, como el responsable es obligatorio, sin firma la base rechaza el registro de la fila.
 */
export async function subirAdjuntosCompra(
  supabase: Cliente,
  compraId: string,
  archivos: File[],
  firma: Firma | null,
): Promise<ResultadoSubida> {
  const resultado: ResultadoSubida = { subidos: [], fallidos: [], errorRegistro: null };
  for (const f of archivos) {
    const objecion = objecionArchivo(f);
    if (objecion) {
      resultado.fallidos.push({ nombre: f.name, motivo: objecion });
      continue;
    }
    const tipo = tipoDeArchivo(f)!;
    const ruta = rutaPara(compraId, f);
    const subida = await supabase.storage.from(ADJUNTOS_BUCKET).upload(ruta, f, { contentType: tipo, upsert: false });
    if (subida.error) {
      resultado.fallidos.push({ nombre: f.name, motivo: leerErrorStorage(subida.error.message) });
      continue;
    }
    const registro = await firmar(
      supabase.rpc("registrar_adjunto_compra", {
        p_compra_id: compraId,
        p_ruta: ruta,
        p_nombre: f.name,
        p_tipo: tipo,
        p_bytes: f.size,
      }),
      firma,
    );
    if (registro.error) {
      // El objeto quedó en el bucket sin fila: invisible para el sistema.
      resultado.errorRegistro ??= registro.error;
      resultado.fallidos.push({ nombre: f.name, motivo: registro.error.message });
      continue;
    }
    resultado.subidos.push(f.name);
  }
  return resultado;
}

// Los mensajes de Storage vienen en inglés técnico; se traducen los que una
// colaboradora puede encontrarse. El resto se muestra tal cual, pero con
// contexto.
function leerErrorStorage(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("bucket not found")) return "El almacén de adjuntos no está configurado en este entorno.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed"))
    return "No se pudo conectar con el almacén de archivos. Revisa la conexión e inténtalo de nuevo.";
  if (m.includes("payload too large") || m.includes("exceeded the maximum allowed size")) return "El archivo pesa más de lo permitido (10 MB).";
  if (m.includes("mime type") || m.includes("not supported")) return "Ese tipo de archivo no está permitido.";
  if (m.includes("row-level security") || m.includes("unauthorized")) return "No tienes permiso para subir archivos.";
  return `No se pudo subir: ${mensaje}`;
}
