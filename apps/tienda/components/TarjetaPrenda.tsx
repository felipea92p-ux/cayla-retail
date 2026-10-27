import Link from "next/link";
import {
  colorDeDibujo,
  formaDe,
  fotoOptimizable,
  fotosDeTarjeta,
  hrefDePrenda,
  insigniasAsignadasDeTarjeta,
  insigniasDeTarjeta,
  muestras,
  precioTarjeta,
  type Prenda,
} from "@/lib/catalogo";
import type { Coincidencia } from "@/lib/filtros-lista";
import type { NotaStock } from "@/lib/stock";
import { BotonFavorito } from "./club/BotonFavorito";
import { aplicaA, type DisenoDeLaTienda } from "@/lib/diseno-campana";
import { FilaDeInsignias } from "./FilaDeInsignias";
import { FotoTarjeta } from "./FotoTarjeta";
import { RapidoDeTarjeta } from "./RapidoDeTarjeta";

/**
 * La tarjeta de una prenda en la grilla (maqueta v4, `tarjeta`): su foto (o su silueta), sus insignias (el puesto en Más vendidos, la
 * campaña y «Nuevo», y las que se le asignaron en Catálogo ▸ Insignias: hasta 3 en total y un «+N», ADR-0489), el corazón de favoritos arriba a la derecha (actividad 12), «Agregar» con la talla al pasar el mouse (actividad
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
  coincide = null,
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
  /** Con color o talla elegidos en los filtros (ADR-0512): por qué está en la lista («En Negro · talla M»), qué muestras marcar y con qué color
   *  y talla abre su ficha. Su foto y su dibujo se ven en el color elegido. Sin filtros, la tarjeta de siempre. */
  coincide?: Coincidencia | null;
}) {
  const [foto, segunda] = fotosDeTarjeta(prenda, coincide?.color);
  const precio = precioTarjeta(prenda);
  const insignias = insigniasDeTarjeta(prenda, { puesto, sinNuevo });
  // La empresa baja sola, debajo de la fila; todo lo demás va en la fila.
  const empresa = insignias.find((i) => i.clave === "empresa");
  const enLaFila = insignias.filter((i) => i.clave !== "empresa");
  // Las asignadas en Catálogo ▸ Insignias: hasta 3 EN TOTAL con lo de arriba (la empresa no cuenta) y lo que no cabe, en un «+N».
  const { visibles: asignadas, mas: masInsignias, nombres } = insigniasAsignadasDeTarjeta(prenda, { puesto, sinNuevo });
  const { visibles, mas } = muestras(prenda, 5, coincide?.codigos);
  const href = hrefDePrenda(prenda, sede, coincide ?? {});
  // Las insignias van dentro de la foto, que el lector salta: el nombre las dice también («Falda Luna, −12 %, nuevo»).
  const insigniasDichas = [
    ...insignias.map((i) => (i.clave === "puesto" ? `${i.texto} en más vendidos` : i.clave === "nuevo" ? "nuevo" : i.texto)),
    ...nombres, // todas las asignadas, también las que no caben en la foto
  ].join(", ");
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
            color={colorDeDibujo(prenda, coincide?.color)}
            pronto={arriba}
          />
          {(insignias.length > 0 || asignadas.length > 0 || masInsignias > 0) && (
            <span className="t-insignias">
              {(enLaFila.length > 0 || asignadas.length > 0 || masInsignias > 0) && (
                // TODAS en UNA fila (Felipe, 2026-10-23): el descuento, «Nuevo» y el puesto, las asignadas en Catálogo ▸ Insignias y el «+N», con la misma cara.
                // Se ven las que caben enteras en el ancho de esta tarjeta; el resto va al «+N» (`FilaDeInsignias` mide en el navegador).
                <FilaDeInsignias
                  chips={[
                    // «Nuevo» va claro (2026-10-16): con casi todo el catálogo nuevo, un sello negro en cada foto le quitaba la vista a la prenda.
                    ...enLaFila.map((i) => ({
                      id: i.clave,
                      texto: i.texto,
                      clase: `${CLASE_INSIGNIA[i.clave]} propia`,
                      // El sello de descuento de la campaña con diseño (si el líder lo dejó encendido): su color, que se lee sobre la foto.
                      estilo: i.clave === "oferta" && diseno?.donde.sello && aplicaA(diseno, prenda.campana?.nombre) ? { background: diseno.sello.fondo, color: diseno.sello.texto } : undefined,
                    })),
                    ...asignadas.map((i) => ({ id: i.id, texto: i.nombre, clase: "t-insignia asignada" })),
                  ]}
                  masBase={masInsignias}
                  nombresMasBase={nombres.slice(asignadas.length)}
                />
              )}
              {/* La empresa (ADR-0465) no es una insignia más: va SOLA debajo de la fila, la sola que baja (en Lima, donde operan CAYLA y Claurè). */}
              {empresa && <span className={CLASE_INSIGNIA.empresa}>{empresa.texto}</span>}
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
                  <i key={c.codigo} title={c.nombre} data-color-dato data-elegido={coincide?.codigos.includes(c.codigo) ? "" : undefined} style={c.hex ? { background: c.hex } : undefined} />
                ))}
                {mas > 0 && <small>+{mas}</small>}
              </span>
            )}
            {nota && <span className={`t-card-nota ${nota.tono}`}>{nota.texto}</span>}
          </div>
        )}
        {/* Por qué está en la lista filtrada: los colores y tallas elegidos que tiene (no todos los suyos). */}
        {coincide && <div className="t-card-coincide">{coincide.texto}</div>}
      </div>
    </article>
  );
}
