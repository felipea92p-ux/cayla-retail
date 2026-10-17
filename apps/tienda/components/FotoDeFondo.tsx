import Image from "next/image";
import { fotoOptimizable } from "@/lib/catalogo";

/**
 * La foto del fondo de una campaña «Con foto» (ADR-0436, actividad 8), para `HeroeDePortada`: a todo el ancho, con el optimizador de
 * imágenes de la tienda cuando viene de nuestro almacén (si no, tal cual). El acomodo y el velo que la oscurece son de la pieza compartida.
 */
export function FotoDeFondo({ src }: { src: string }) {
  return <Image src={src} alt="" fill sizes="100vw" unoptimized={!fotoOptimizable(src, process.env.TIENDA_FOTOS_ORIGEN, "retail-campanas-fotos")} />;
}
