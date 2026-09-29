import type { Familia } from "@cayla-retail/shared";
import { formasDeFamilia } from "@/components/IconoFamilia";
import { pintarFormas } from "@/components/IconoCategoria";
import { MuestraIcono, TONO_PIZARRA, TONOS, type DibujoIcono } from "@/components/MuestraEtiqueta";
import { formasDePrefijo } from "@/lib/icono-categoria-reglas";
import { tonoDeFamilia, type TonoCategoria } from "@/lib/categoria-tonos";

/**
 * La imagen de una categoría en Catálogo ▸ Categorías (spike `docs/maquetas/categorias-iconos-2026-09/`, Felipe 2026-09-29):
 * el mismo molde que las etiquetas y las temporadas (`MuestraIcono`: el dibujo grande al centro y dos ecos tenues a los
 * lados sobre el tinte del grupo), con el ícono de su prefijo y el tono de su familia. Así Categorías se ve hecha por la
 * misma mano que las seis pestañas de Atributos (ADR-0261).
 *
 * Los cinco tonos son los que ya existen (`TONOS` y `TONO_PIZARRA` de `MuestraEtiqueta`); cuál lleva cada familia:
 * `lib/categoria-tonos.ts`. Una categoría sin ícono propio se dibuja con el de su familia, en el mismo tono.
 */

const TONO: Record<TonoCategoria, { fondo: string; acento: string }> = {
  taupe: TONOS.campana,
  ambar: TONOS.urgencia,
  verde: TONOS.positivo,
  pizarra: TONO_PIZARRA,
  neutro: TONOS.neutral,
};

/** Los colores de una familia (el tinte y el trazo), para lo que se pinta fuera del banner, como la Vista rápida. */
export const tonoDeCategoria = (familia: Familia | null) => TONO[tonoDeFamilia(familia)];

/** Los íconos se dibujan en 24×24; el molde de `MuestraIcono` espera ±14 unidades centradas en (0,0): 28/24 y al centro. */
const ESCALA_AL_MOLDE = 28 / 24;

function dibujoDe(prefijo: string | null | undefined, familia: Familia | null): DibujoIcono {
  const formas = formasDePrefijo(prefijo);
  const Dibujo: DibujoIcono = (acento) => (
    <g
      transform={`scale(${ESCALA_AL_MOLDE}) translate(-12 -12)`}
      fill="none"
      stroke={acento}
      color={acento}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {formas ? pintarFormas(formas, true) : formasDeFamilia(familia)}
    </g>
  );
  return Dibujo;
}

export function MuestraCategoria({
  nombre,
  prefijo,
  familia,
  className,
}: {
  nombre: string;
  prefijo: string | null | undefined;
  familia: Familia | null;
  className?: string;
}) {
  const { fondo, acento } = tonoDeCategoria(familia);
  return <MuestraIcono dibujo={dibujoDe(prefijo, familia)} fondo={fondo} acento={acento} etiqueta={`Ilustración de la categoría ${nombre}`} className={className} />;
}
