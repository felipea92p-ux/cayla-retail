import Link from "next/link";
import {
  colorDeDibujo,
  formaDe,
  fotoOptimizable,
  fotosDeTarjeta,
  hrefDePrenda,
  insigniaOferta,
  muestras,
  precioTarjeta,
  type Prenda,
} from "@/lib/catalogo";
import type { NotaStock } from "@/lib/stock";
import { FotoTarjeta } from "./FotoTarjeta";

/**
 * La tarjeta de una prenda en la grilla (maqueta v4, `tarjeta`): su foto (o su silueta), sus insignias (el puesto en Más vendidos, la
 * campaña y «Nuevo»), su nombre, el precio que paga el cliente en la tienda elegida (con el precio del modelo tachado si hay
 * descuento), sus colores y la nota de cuánto hay («Quedan 2 en Lima», «Solo en Trujillo», `notaDeStock`). La foto y el nombre llevan
 * a su ficha, con la tienda elegida. Lo que la maqueta suma después —el corazón de favoritos y «Agregar»— llega con sus actividades
 * (12 y 7).
 */
export function TarjetaPrenda({
  prenda,
  sede,
  origenFotos,
  nota = null,
  puesto = null,
  sinNuevo = false,
}: {
  prenda: Prenda;
  sede: string | null;
  origenFotos: string | undefined;
  nota?: NotaStock | null;
  /** «N.º 2»: su puesto en la lista de Más vendidos que se está viendo. */
  puesto?: number | null;
  /** En Lo nuevo no hace falta decir «Nuevo» en cada tarjeta. */
  sinNuevo?: boolean;
}) {
  const [foto, segunda] = fotosDeTarjeta(prenda);
  const precio = precioTarjeta(prenda);
  const oferta = insigniaOferta(prenda);
  const nueva = Boolean(prenda.nuevo) && !sinNuevo;
  const { visibles, mas } = muestras(prenda);
  const href = hrefDePrenda(prenda, sede);
  return (
    <article className="t-card">
      {/* La foto repite el enlace del nombre: fuera del Tab y del lector, para que cada tarjeta sea UNA parada con el teclado. */}
      <Link href={href} className="t-card-media" tabIndex={-1} aria-hidden="true">
        <FotoTarjeta
          foto={foto}
          segunda={segunda}
          optimizar={[foto ? fotoOptimizable(foto, origenFotos) : false, segunda ? fotoOptimizable(segunda, origenFotos) : false]}
          nombre={prenda.nombre}
          forma={formaDe(prenda.categoria?.prefijo)}
          color={colorDeDibujo(prenda)}
        />
        {(puesto || oferta || nueva) && (
          <span className="t-insignias">
            {puesto && <span className="t-insignia">N.º {puesto}</span>}
            {oferta && <span className="t-insignia oferta">{oferta}</span>}
            {nueva && <span className="t-insignia nuevo">Nuevo</span>}
          </span>
        )}
      </Link>
      <div className="t-card-info">
        <Link href={href} className="t-card-nom">
          {prenda.nombre}
        </Link>
        <span className={`t-precio${precio.oferta ? " oferta" : ""}`}>
          <b className="num">{precio.principal}</b>
          {precio.anterior && (
            <s className="num">
              <span className="t-sr">Antes </span>
              {precio.anterior}
            </s>
          )}
        </span>
        {(visibles.length > 0 || nota) && (
          <div className="t-card-pie">
            {visibles.length > 0 && (
              <span className="t-muestras" role="img" aria-label={`${prenda.colores.length === 1 ? "Color" : "Colores"}: ${prenda.colores.map((c) => c.nombre).join(", ")}`}>
                {visibles.map((c) => (
                  <i key={c.codigo} title={c.nombre} data-color-dato style={c.hex ? { background: c.hex } : undefined} />
                ))}
                {mas > 0 && <small>+{mas}</small>}
              </span>
            )}
            {nota && <span className={`t-card-nota ${nota.tono}`}>{nota.texto}</span>}
          </div>
        )}
      </div>
    </article>
  );
}
