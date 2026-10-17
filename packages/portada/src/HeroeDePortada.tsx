import type { ComponentType, ReactNode } from "react";

/**
 * Una prenda del héroe, como polaroid: su foto (o su dibujo, si no tiene), su nombre y, al pie, lo que va a la derecha (el precio, o
 * «Ver precio» en la portada sin cuenta). Con `href`, la polaroid lleva a algún lado; sin él (la vista previa del ERP), no.
 */
export type PiezaDeHeroe = {
  id: string;
  nombre: string;
  foto: ReactNode;
  derecha: ReactNode;
  href?: string;
  /** Lo que lee el lector de pantalla al llegar a la polaroid (con `href`). */
  etiqueta?: string;
};

type Enlace = ComponentType<{ href: string; className?: string; "aria-label"?: string; children?: ReactNode }>;

/**
 * El héroe de la portada (ADR-0408, maqueta v4; en una sola pieza desde ADR-0436): el texto de la campaña a la izquierda y sus prendas
 * como polaroids que caen una vez a la derecha. La estructura y los estilos son de aquí; lo que cambia de un lugar a otro llega de
 * afuera: el colibrí (una imagen de Next en la tienda), el contador (un reloj que corre en la tienda), los botones y cómo lleva cada
 * polaroid a su prenda (`Enlace`: el `Link` de Next en la tienda). Sin prendas, a la derecha va `lado` (la tarjeta del Club, en la
 * portada sin cuenta).
 *
 * No guarda estado ni lee nada: se puede dibujar en el servidor (la tienda) o dentro de un componente del navegador (la vista previa).
 */
export function HeroeDePortada({
  clase,
  sinCampana = false,
  colibri,
  ceja,
  titulo,
  descripcion,
  cuenta = null,
  acciones,
  piezas = [],
  Enlace,
  marca = null,
  lado = null,
}: {
  /** Lo que la página le agrega al héroe (`t-portada`, `t-hero-inicio`): sus ajustes de lugar viven en sus propios estilos. */
  clase?: string;
  /** Sin campaña que anunciar, el fondo oscuro de la marca en vez del de la campaña. */
  sinCampana?: boolean;
  colibri: ReactNode;
  ceja: ReactNode;
  /** El nombre en dos partes: la primera línea y la palabra en cursiva (vacía si el nombre es una sola palabra). */
  titulo: readonly [string, string];
  descripcion: ReactNode;
  cuenta?: ReactNode;
  /** Con `undefined` no hay fila de botones; con `null`, la fila queda vacía (mantiene su aire). */
  acciones?: ReactNode;
  piezas?: readonly PiezaDeHeroe[];
  Enlace?: Enlace;
  /** El «−15%» calado detrás de las fotos. */
  marca?: string | null;
  lado?: ReactNode;
}) {
  const [linea, cursiva] = titulo;
  return (
    <section className={`t-hero${clase ? ` ${clase}` : ""}${sinCampana ? " sin-campana" : ""}`}>
      {colibri}
      <div className="t-hero-texto">
        <span className="t-hero-ceja">{ceja}</span>
        {/* Las dos partes son bloques: el espacio entre ellas no se ve, pero el lector de pantalla lee «Día del Gato», no «Día delGato». */}
        <h1 className="t-hero-tit">
          <span>{linea}</span>
          {cursiva && (
            <>
              {" "}
              <em>{cursiva}</em>
            </>
          )}
        </h1>
        <p className="t-hero-desc">{descripcion}</p>
        {cuenta}
        {acciones !== undefined && <div className="t-hero-acciones">{acciones}</div>}
      </div>
      {piezas.length > 0 ? <Collage piezas={piezas} Enlace={Enlace} marca={marca} /> : lado}
    </section>
  );
}

/** Las fotos como polaroids (hasta tres: `p1`, `p2`, `p3` las acomodan) y el descuento calado detrás. */
function Collage({ piezas, Enlace, marca }: { piezas: readonly PiezaDeHeroe[]; Enlace: Enlace | undefined; marca: string | null }) {
  return (
    <div className="t-collage">
      {piezas.map((p, i) => {
        const clase = `t-polaroid p${i + 1}`;
        const contenido = (
          <>
            {p.foto}
            <span className="t-polaroid-pie">
              <span>{p.nombre}</span>
              {p.derecha}
            </span>
          </>
        );
        if (p.href && Enlace) {
          return (
            <Enlace key={p.id} className={clase} href={p.href} aria-label={p.etiqueta}>
              {contenido}
            </Enlace>
          );
        }
        return (
          <div key={p.id} className={clase}>
            {contenido}
          </div>
        );
      })}
      {marca && (
        <span className="t-hero-pct" aria-hidden="true">
          {marca}
        </span>
      )}
    </div>
  );
}
