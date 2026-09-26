"use client";

import { useRouter } from "next/navigation";
import { avisar } from "@/components/ui/Avisos";
import { useColaOffline } from "@/lib/useColaOffline";
import { borrarFotos, marcarCreado, subirFotosListas } from "@/lib/fotos-pendientes";

/** Las RPC que la cola de Productos puede ejecutar (ADR-0210, paso 2). Las dos son idempotentes por
 *  `productos.token_cliente`: reintentar devuelve el mismo producto (y, con stock, no lo vuelve a cargar). Desde ADR-0212 el
 *  alta encola `crear_producto_con_stock_inicial`; `crear_producto_con_variantes` se queda en la lista para que un alta
 *  guardada sin conexión ANTES de publicar esa versión (sigue en el `localStorage` de ese equipo) no se descarte como
 *  inválida al volver la red. */
export const RPCS_PRODUCTOS = ["crear_producto_con_stock_inicial", "crear_producto_con_variantes"] as const;

/**
 * La cola sin conexión del alta de producto. El código (`PREFIJO-NNNN`) y el de barras los reparte la base al subir,
 * nunca el navegador (Felipe, 2026-09-25: dos sedes sin red chocarían): mientras espera, la prenda está «pendiente de
 * código». Al subir, el aviso lleva a la ficha; las fotos guardadas aparte (`fotos-pendientes.ts`) suben después.
 */
export function useColaProductos({ subir = false }: { subir?: boolean } = {}) {
  const router = useRouter();
  return useColaOffline("productos", RPCS_PRODUCTOS, {
    subir,
    alSubir: async (op, data) => {
      const productoId = typeof data === "string" ? data : null;
      if (productoId) await marcarCreado(op.token, productoId);
      avisar.exito("Subió un producto guardado sin conexión", {
        detalle: `${op.resumen}. Ya tiene su código.`,
        accion: productoId ? { texto: "Ver la ficha", onClick: () => router.push(`/productos/${productoId}/editar`) } : undefined,
      });
      router.refresh();
    },
    trasPasada: async (supabase) => {
      for (const r of await subirFotosListas(supabase)) {
        if (r.fallidas.length > 0) avisar.error(`Fotos de ${r.nombre}: ${r.fallidas.length === 1 ? "una no subió" : `${r.fallidas.length} no subieron`}`, { detalle: `${r.fallidas.join(" · ")}. Agrégalas desde la ficha.` });
        else if (r.subidas > 0) avisar.exito(`Subieron las fotos de ${r.nombre}`, { detalle: `${r.subidas} foto${r.subidas === 1 ? "" : "s"}.` });
      }
    },
    alDescartar: (token) => void borrarFotos(token),
  });
}
