import Link from "next/link";
import { colorDeDibujo, formaDe, fotoOptimizable, fotosDeTarjeta, precioTarjeta, type Prenda } from "@/lib/catalogo";
import { FotoTarjeta } from "./FotoTarjeta";
import "@/app/estilos/collage.css";

/**
 * Las fotos del héroe como polaroids que caen una vez (maqueta v4, `heroCampana`): el Inicio, con el precio de cada prenda, y la portada
 * de quien todavía no tiene cuenta, SIN precio (Felipe 2026-10-16: «fotos sin precio»): en su lugar «Ver precio», que lleva a crear la
 * cuenta y, al terminarla, a esa prenda. `marca`: el «−12%» calado de la campaña detrás de las fotos.
 */
export function CollageDePrendas({
  piezas,
  href,
  conPrecio,
  origenFotos,
  marca = null,
}: {
  piezas: readonly Prenda[];
  /** A dónde lleva cada polaroid. */
  href: (p: Prenda) => string;
  conPrecio: boolean;
  origenFotos: string | undefined;
  marca?: string | null;
}) {
  if (piezas.length === 0) return null;
  return (
    <div className="t-collage">
      {piezas.map((p, i) => {
        const foto = fotosDeTarjeta(p)[0];
        const precio = conPrecio ? precioTarjeta(p) : null;
        return (
          <Link
            key={p.id}
            className={`t-polaroid p${i + 1}`}
            href={href(p)}
            // Lo que ya se ve, para la ficha que llega (`RecordarPrendaTocada`); sin cuenta no hay precio que adelantar.
            data-prenda={p.id}
            data-nombre={p.nombre}
            data-precio={precio?.principal}
            data-antes={precio?.anterior ?? undefined}
            data-oferta={precio?.oferta ? "si" : undefined}
            data-categoria={p.categoria?.nombre ?? undefined}
            aria-label={conPrecio ? `Ver ${p.nombre}` : `${p.nombre}: crea tu cuenta para ver su precio`}
          >
            <FotoTarjeta
              foto={foto}
              segunda={null}
              optimizar={[foto ? fotoOptimizable(foto, origenFotos) : false, false]}
              nombre={p.nombre}
              forma={formaDe(p.categoria?.prefijo)}
              color={colorDeDibujo(p)}
              tamanos="(min-width: 960px) 22vw, 45vw"
              pronto
            />
            <span className="t-polaroid-pie">
              <span>{p.nombre}</span>
              {precio ? <span className="num">{precio.principal}</span> : <span className="t-polaroid-ver">Ver precio</span>}
            </span>
          </Link>
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
