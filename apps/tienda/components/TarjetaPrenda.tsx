import Link from "next/link";
import {
  colorDeDibujo,
  formaDe,
  fotoOptimizable,
  fotosDeTarjeta,
  hrefDePrenda,
  insigniasDeTarjeta,
  muestras,
  precioTarjeta,
  type Prenda,
} from "@/lib/catalogo";
import type { NotaStock } from "@/lib/stock";
import { BotonFavorito } from "./club/BotonFavorito";
import { aplicaA, type DisenoDeLaTienda } from "@/lib/diseno-campana";
import { FotoTarjeta } from "./FotoTarjeta";
import { RapidoDeTarjeta } from "./RapidoDeTarjeta";

/**
 * La tarjeta de una prenda en la grilla (maqueta v4, `tarjeta`): su foto (o su silueta), sus insignias (el puesto en Más vendidos, la
 * campaña y «Nuevo»), el corazón de favoritos arriba a la derecha (actividad 12), «Agregar» con la talla al pasar el mouse (actividad
 * 7, desde 960 px), su nombre, el precio que paga el cliente en la tienda elegida (con el precio del modelo tachado si hay descuento),
 * sus colores y la nota de cuánto hay («Quedan 2 en Lima», «Solo en Trujillo», `notaDeStock`). La foto y el nombre llevan a su
 * ficha, con la tienda elegida. El corazón sabe solo si está guardado (`ProveedorGuardados`, en el marco del catálogo); fuera de él
 * («Mi cuenta») se lo dice `guardado`.
 */
const CLASE_INSIGNIA = {
  puesto: "t-insignia",
  oferta: "t-insignia oferta",
  nuevo: "t-insignia cp-insignia-nuevo",
  empresa: "t-insignia cp-insignia-nuevo",
} as const;

export function TarjetaPrenda({
  prenda,
  sede,
  origenFotos,
  nota = null,
  puesto = null,
  sinNuevo = false,
  guardado,
  arriba = false,
  diseno = null,
}: {
  prenda: Prenda;
  sede: string | null;
  origenFotos: string | undefined;
  nota?: NotaStock | null;
  /** «N.º 2»: su puesto en la lista de Más vendidos que se está viendo. */
  puesto?: number | null;
  /** En Lo nuevo no hace falta decir «Nuevo» en cada tarjeta. */
  sinNuevo?: boolean;
  /** Si el corazón ya está guardado; sin él, lo dice el marco del catálogo. */
  guardado?: boolean;
  /** Va en la primera fila de la lista (se ve sin bajar): su foto se pide apenas llega la página. */
  arriba?: boolean;
  /** El diseño de la campaña (Tienda web ▸ Campañas): viste el sello de descuento de las prendas de ESA campaña. Sin él, el de siempre. */
  diseno?: DisenoDeLaTienda | null;
}) {
  const [foto, segunda] = fotosDeTarjeta(prenda);
  const precio = precioTarjeta(prenda);
  const insignias = insigniasDeTarjeta(prenda, { puesto, sinNuevo });
  const { visibles, mas } = muestras(prenda);
  const href = hrefDePrenda(prenda, sede);
  // Las insignias van dentro de la foto, que el lector salta: el nombre las dice también («Falda Luna, −12 %, nuevo»).
  const insigniasDichas = insignias.map((i) => (i.clave === "puesto" ? `${i.texto} en más vendidos` : i.clave === "nuevo" ? "nuevo" : i.texto)).join(", ");
  return (
    // Lo que la tarjeta ya muestra, para que la ficha llegue con eso mismo mientras carga (`RecordarPrendaTocada`, lib/prenda-tocada.ts).
    <article
      className="t-card"
      data-prenda={prenda.id}
      data-nombre={prenda.nombre}
      data-precio={precio.principal}
      data-antes={precio.anterior ?? undefined}
      data-oferta={precio.oferta ? "si" : undefined}
      data-categoria={prenda.categoria?.nombre ?? undefined}
    >
      <div className="t-card-media">
        {/* La foto repite el enlace del nombre: fuera del Tab y del lector, para que la prenda sea UNA parada con el teclado. */}
        <Link href={href} className="t-card-enlace" tabIndex={-1} aria-hidden="true">
          <FotoTarjeta
            foto={foto}
            segunda={segunda}
            optimizar={[foto ? fotoOptimizable(foto, origenFotos) : false, segunda ? fotoOptimizable(segunda, origenFotos) : false]}
            nombre={prenda.nombre}
            forma={formaDe(prenda.categoria?.prefijo)}
            color={colorDeDibujo(prenda)}
            pronto={arriba}
          />
          {insignias.length > 0 && (
            <span className="t-insignias">
              {/* «Nuevo» va claro (2026-10-16): con casi todo el catálogo nuevo, un sello negro en cada foto le quitaba la vista a la prenda.
                  La empresa es esa misma insignia con su nombre (ADR-0465): debajo de «Nuevo», o arriba si la tarjeta no lo tiene. */}
              {insignias.map((i) => (
                <span
                  key={i.clave}
                  className={CLASE_INSIGNIA[i.clave]}
                  // El sello de descuento de la campaña con diseño (si el líder lo dejó encendido): su color, que se lee sobre la foto.
                  style={i.clave === "oferta" && diseno?.donde.sello && aplicaA(diseno, prenda.campana?.nombre) ? { background: diseno.sello.fondo, color: diseno.sello.texto } : undefined}
                >
                  {i.texto}
                </span>
              ))}
            </span>
          )}
        </Link>
        <RapidoDeTarjeta productoId={prenda.id} sede={sede} />
        <BotonFavorito productoId={prenda.id} nombre={prenda.nombre} guardado={guardado} />
      </div>
      <div className="t-card-info">
        <Link href={href} className="t-card-nom">
          {prenda.nombre}
          {insigniasDichas && <span className="t-sr">, {insigniasDichas}</span>}
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
