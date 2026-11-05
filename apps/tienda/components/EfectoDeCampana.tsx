import type { CSSProperties } from "react";
import { particulasDeEfecto, type DuracionCampana, type EfectoCampana, type IntensidadCampana } from "@cayla-retail/shared";
import "@/app/estilos/campana-efectos.css";

/**
 * El efecto de una campaña sobre su portada (Tienda web ▸ Campañas): destellos, confeti, pétalos, copos, corazones, estrellas, hojas, burbujas
 * o patitas. Las partículas son las mismas de la vista previa del ERP (`particulasDeEfecto`) y se mueven con CSS puro (`campana-efectos.css`);
 * no hace falta JavaScript. Con «reducir movimiento» del aparato, la hoja de estilos lo esconde. Sin efecto, no dibuja nada.
 */
export function EfectoDeCampana({ efecto, intensidad, duracion }: { efecto: EfectoCampana; intensidad: IntensidadCampana; duracion: DuracionCampana }) {
  const particulas = particulasDeEfecto(efecto, intensidad, duracion);
  if (particulas.length === 0) return null;
  return (
    <div className={`cmp-fx cmp-fx-${efecto}`} style={{ "--n": duracion === "continuo" ? "infinite" : "1" } as CSSProperties} aria-hidden="true">
      {particulas.map((p, i) => (
        <i
          key={i}
          className={`cmp-c-${p.color}`}
          style={{ "--x": `${p.x}%`, "--y": `${p.y}%`, "--d": `${p.retraso}s`, "--t": `${p.dura}s`, "--s": `${p.tam}px`, "--dx": `${p.dx}px`, "--r": `${p.giro}deg` } as CSSProperties}
        />
      ))}
    </div>
  );
}
