import Image from "next/image";
import type { FotoDelColor } from "@/lib/probador";

/**
 * El recorte de una prenda (el PNG sin fondo que sale del ERP, ADR-0434): llena su caja sin deformarse. Sin texto alternativo propio: lo
 * dice el botón que lo lleva («1. Arriba: Top Estela, Rosa pálido»). Lo que se ve sin bajar (la figura) se pide apenas llega la página.
 * `alTerminar`: avisa cuando la foto ya se puede pintar, o cuando se supo que no va a llegar (la figura deja de esperarla en los dos casos).
 */
export function Recorte({ foto, tamanos, pronto = false, alTerminar }: { foto: FotoDelColor; tamanos: string; pronto?: boolean; alTerminar?: () => void }) {
  return (
    <Image
      src={foto.url}
      alt=""
      fill
      sizes={tamanos}
      unoptimized={!foto.optimizar}
      loading={pronto ? "eager" : undefined}
      fetchPriority={pronto ? "high" : undefined}
      draggable={false}
      className="pb-recorte"
      onLoad={alTerminar}
      onError={alTerminar}
    />
  );
}
