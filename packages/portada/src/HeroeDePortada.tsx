import type { ComponentType, CSSProperties, ReactNode } from "react";
import { PRENDAS_MAX, coloresDelDiseno, paletaDelDiseno, piezasQueCaben, type DisenoDeCampana, type Sello } from "./diseno";
import { variablesDeLosDosTemas, variablesDePaleta, type Tema } from "./paletas";
import { INTENSIDAD, mascaraDePatron } from "./patrones";
import { largoDelNombre } from "./textos";

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

type Enlace = ComponentType<{ href: string; className?: string; style?: CSSProperties; "aria-label"?: string; children?: ReactNode }>;

/**
 * El héroe de la portada (ADR-0408, maqueta v4; en una sola pieza desde ADR-0436): el texto de la campaña a la izquierda y sus prendas
 * como polaroids que caen una vez a la derecha. La estructura y los estilos son de aquí; lo que cambia de un lugar a otro llega de
 * afuera: el colibrí (una imagen de Next en la tienda), el contador (un reloj que corre en la tienda), los botones y cómo lleva cada
 * polaroid a su prenda (`Enlace`: el `Link` de Next en la tienda). Sin prendas, a la derecha va `lado` (la tarjeta del Club, en la
 * portada sin cuenta).
 *
 * Con `diseno` (ADR-0436), la campaña se pinta con el suyo: sus colores, su fondo (liso, degradado o con un dibujo), cómo se acomodan las
 * prendas (tres polaroids, una foto grande, un mosaico de cuatro o solo letras), el tamaño del nombre, su frase y sus detalles (colibrí,
 * contador, el % gigante, el sello). Sin él, la portada de siempre. Las prendas llegan en su orden (`prendasElegidas`) y aquí se toman las
 * que caben en el acomodo (`piezasQueCaben`). El tamaño del nombre se elige por su largo (`largoDelNombre`), salvo sin campaña, donde los
 * títulos de la tienda («Lo nuevo de CAYLA») conservan el de siempre.
 * Con `tema` (la vista previa del ERP, que lo elige con su botón) los colores van ya resueltos para ese tema; sin `tema` (la tienda, que
 * no sabe en el servidor cómo la ve el cliente) van los de los dos temas y `heroe.css` elige según el tema de la tienda.
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
  diseno = null,
  tema,
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
  /** El descuento como se escribe en grande («−15%»): el calado detrás de las fotos, la teja del mosaico y el sello. */
  marca?: string | null;
  lado?: ReactNode;
  diseno?: DisenoDeCampana | null;
  /** El tema de los colores del diseño: la vista previa del ERP lo elige con su botón «Claro / Oscuro». Sin él, los dos (la tienda). */
  tema?: Tema;
}) {
  const [linea, cursiva] = titulo;
  const estilo = !diseno
    ? undefined
    : ((tema ? variablesDePaleta(coloresDelDiseno(diseno, tema)) : variablesDeLosDosTemas(paletaDelDiseno(diseno))) as CSSProperties);
  const acomodo = diseno?.acomodo ?? "polaroids";
  const mias = piezas.slice(0, piezasQueCaben(diseno));
  // El «−15%» calado: en la portada de siempre, detrás de las polaroids; con un diseño, solo si lo pidió.
  const gigante = (diseno?.pctGigante ?? true) ? marca : null;
  const sello = <SelloDeCampana sello={diseno?.sello ?? "ninguno"} marca={marca} />;
  let derecha: ReactNode = null;
  if (acomodo !== "letras") {
    if (mias.length === 0) derecha = lado;
    else if (acomodo === "grande") derecha = <FotoGrande pieza={mias[0]!} Enlace={Enlace} />;
    else if (acomodo === "mosaico") derecha = <Mosaico piezas={mias} Enlace={Enlace} marca={marca} />;
    else derecha = <Collage piezas={mias} Enlace={Enlace} marca={gigante} />;
  }
  // Con polaroids el % va dentro del collage (como siempre); con los otros acomodos, suelto en el héroe, donde no lo tapa la foto.
  const pctSuelto = gigante && (acomodo === "letras" || (acomodo !== "polaroids" && mias.length > 0)) ? gigante : null;
  return (
    <section
      className={`t-hero${clase ? ` ${clase}` : ""}${sinCampana ? " sin-campana" : ""}`}
      style={estilo}
      data-diseno={diseno && !tema ? "" : undefined}
      data-acomodo={diseno ? acomodo : undefined}
      data-fondo={diseno?.fondo}
      data-tamano={diseno?.tamano}
      data-largo={sinCampana ? undefined : largoDelNombre(`${linea} ${cursiva}`)}
    >
      {diseno?.fondo === "dibujo" && <PatronDelFondo diseno={diseno} />}
      {pctSuelto && (
        <span className="t-hero-pct" data-suelto="" aria-hidden="true">
          {pctSuelto}
        </span>
      )}
      {(diseno?.colibri ?? true) && colibri}
      <div className="t-hero-texto">
        {/* Con solo letras, el sello va arriba del texto, en su lugar: suelto en una esquina chocaría con un nombre largo. */}
        {acomodo === "letras" && sello}
        <span className="t-hero-ceja">{ceja}</span>
        {/* Las dos partes son bloques: el espacio entre ellas no se ve, pero el lector de pantalla lee «Día del Gato», no «Día delGato». */}
        <h1 className="t-hero-tit">
          {linea && <span>{linea}</span>}
          {cursiva && (
            <>
              {" "}
              <em>{cursiva}</em>
            </>
          )}
        </h1>
        {diseno?.frase ? <p className="t-hero-frase">{diseno.frase}</p> : null}
        <p className="t-hero-desc">{descripcion}</p>
        {(diseno?.cuenta ?? true) && cuenta}
        {acciones !== undefined && <div className="t-hero-acciones">{acciones}</div>}
      </div>
      {derecha ? (
        <div className="t-hero-lado">
          {derecha}
          {sello}
        </div>
      ) : (
        acomodo !== "letras" && sello
      )}
    </section>
  );
}

/** El estampado del fondo «Con dibujo»: una máscara con el dibujo, pintada con el acento de la campaña, tan visible como su intensidad. */
function PatronDelFondo({ diseno }: { diseno: DisenoDeCampana }) {
  const mascara = mascaraDePatron(diseno.patron);
  return <span className="t-hero-patron" aria-hidden="true" style={{ maskImage: mascara, WebkitMaskImage: mascara, opacity: INTENSIDAD[diseno.intensidad] }} />;
}

/** El sello girado: el descuento («−15% · Web y tiendas»), «Solo por días» o «Lo nuevo». Sin descuento, el del descuento no sale. */
function SelloDeCampana({ sello, marca }: { sello: Sello; marca: string | null }) {
  if (sello === "descuento" && marca) {
    return (
      <span className="t-hero-sello">
        <span>
          <b>{marca}</b>
          <small>Web y tiendas</small>
        </span>
      </span>
    );
  }
  if (sello === "dias" || sello === "nuevo") {
    return (
      <span className="t-hero-sello" data-texto="">
        <span>
          <b>{sello === "dias" ? "Solo por días" : "Lo nuevo"}</b>
        </span>
      </span>
    );
  }
  return null;
}

/** Una prenda que, con `href` y `Enlace` (la tienda), lleva a su prenda; sin ellos (la vista previa del ERP), solo se ve. */
function PiezaEnlazada({ pieza, Enlace, clase, estilo, children }: { pieza: PiezaDeHeroe; Enlace: Enlace | undefined; clase: string; estilo?: CSSProperties; children: ReactNode }) {
  if (pieza.href && Enlace) {
    return (
      <Enlace className={clase} style={estilo} href={pieza.href} aria-label={pieza.etiqueta ?? pieza.nombre}>
        {children}
      </Enlace>
    );
  }
  return (
    <div className={clase} style={estilo}>
      {children}
    </div>
  );
}

/** «Foto grande»: una prenda protagonista que ocupa todo el lado derecho, con su nombre y lo de la derecha (el precio) en una píldora. */
function FotoGrande({ pieza, Enlace }: { pieza: PiezaDeHeroe; Enlace: Enlace | undefined }) {
  return (
    <PiezaEnlazada pieza={pieza} Enlace={Enlace} clase="t-grande">
      {pieza.foto}
      <span className="t-grande-pie">
        <span>{pieza.nombre}</span>
        <span aria-hidden="true">·</span>
        {pieza.derecha}
      </span>
    </PiezaEnlazada>
  );
}

/** «Mosaico»: hasta cuatro prendas en orden (tres en el celular); si son menos y hay descuento, una teja con el «−15%». */
function Mosaico({ piezas, Enlace, marca }: { piezas: readonly PiezaDeHeroe[]; Enlace: Enlace | undefined; marca: string | null }) {
  return (
    <div className="t-mosaico">
      {piezas.map((p, i) => (
        <PiezaEnlazada key={p.id} pieza={p} Enlace={Enlace} clase="t-teja" estilo={{ ["--i" as string]: i }}>
          {p.foto}
        </PiezaEnlazada>
      ))}
      {piezas.length < PRENDAS_MAX && marca && (
        <span className="t-teja t-teja-pct" style={{ ["--i" as string]: piezas.length }} aria-hidden="true">
          {marca}
        </span>
      )}
    </div>
  );
}

/** Las fotos como polaroids (hasta tres: `p1`, `p2`, `p3` las acomodan) y el descuento calado detrás. */
function Collage({ piezas, Enlace, marca }: { piezas: readonly PiezaDeHeroe[]; Enlace: Enlace | undefined; marca: string | null }) {
  return (
    <div className="t-collage">
      {piezas.map((p, i) => (
        <PiezaEnlazada key={p.id} pieza={p} Enlace={Enlace} clase={`t-polaroid p${i + 1}`}>
          {p.foto}
          <span className="t-polaroid-pie">
            <span>{p.nombre}</span>
            {p.derecha}
          </span>
        </PiezaEnlazada>
      ))}
      {marca && (
        <span className="t-hero-pct" aria-hidden="true">
          {marca}
        </span>
      )}
    </div>
  );
}
