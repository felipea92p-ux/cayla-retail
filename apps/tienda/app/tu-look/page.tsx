import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { SegunSesion } from "@/components/cuenta/SegunSesion";
import { FormaDelEsqueleto } from "@/components/FormaDelEsqueleto";
import { Icono } from "@/components/Icono";
import { FiguraQuieta } from "@/components/probador/FiguraQuieta";
import { Recorte } from "@/components/probador/Recorte";
import {
  DOMINIO_A_LA_VISTA,
  hrefTuLook,
  listaDeNombres,
  piezasDeLaImagen,
  RUTA_TU_LOOK,
} from "@/lib/compartir-look";
import { prendasParaCompartir } from "@/lib/compartir-servidor";
import { hrefConVolver } from "@/lib/entrada";
import { etiquetaDelLook } from "@/lib/looks-guardados";
import { origenDeLaPeticion } from "@/lib/mi-cuenta-servidor";
import {
  codificarLook,
  colorDeLaPieza,
  hrefDelProbador,
  indizar,
  lookDeLaUrl,
  PARAMETRO_DEL_LOOK,
  presentes,
  type PrendaDelProbador,
} from "@/lib/probador";
import "../estilos/probador.css";
// El esqueleto de mientras llega es el de la ficha (la figura grande y sus datos), con sus clases.
import "../estilos/ficha.css";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** El look de la dirección y su código como lo escribe el probador (la misma lectura en la página y en sus datos para compartir). */
async function elLook(sp: Record<string, string | string[] | undefined>) {
  const prendas = await prendasParaCompartir();
  const look = prendas ? lookDeLaUrl(sp[PARAMETRO_DEL_LOOK], prendas) : null;
  const indice = indizar(prendas ?? []);
  return {
    prendas,
    look,
    indice,
    codigo: look ? codificarLook(look, indice) : null,
  };
}

// La vista previa del enlace (la que muestra WhatsApp): la imagen de `/tu-look/vista` con las prendas y, en el texto, sus nombres (de
// la base). Nada de lo que trae la dirección se escribe tal cual.
export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const [{ look, indice, codigo }, h] = await Promise.all([
    searchParams.then(elLook),
    headers(),
  ]);
  const nombres = look
    ? piezasDeLaImagen(look, indice).map((p) => p.nombre)
    : [];
  const origen = origenDeLaPeticion(h);
  const imagen = `${origen}${RUTA_TU_LOOK}/vista${codigo ? `?${PARAMETRO_DEL_LOOK}=${encodeURIComponent(codigo)}` : ""}`;
  const descripcion =
    nombres.length > 0
      ? `${listaDeNombres(nombres)}. Arma el tuyo en ${DOMINIO_A_LA_VISTA}.`
      : `Arma tu look en ${DOMINIO_A_LA_VISTA}.`;
  const titulo =
    nombres.length > 0 ? "Mira este look en CAYLA" : "Arma tu look en CAYLA";
  return {
    title: `${nombres.length > 0 ? "Mira este look" : "Arma tu look"} · CAYLA`,
    description: descripcion,
    openGraph: {
      title: titulo,
      description: descripcion,
      type: "website",
      url: `${origen}${codigo ? hrefTuLook(codigo) : RUTA_TU_LOOK}`,
      images: [{ url: imagen, width: 1200, height: 630, alt: titulo }],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descripcion,
      images: [imagen],
    },
  };
}

/**
 * Un look que alguien compartió (ADR-0434, actividad 9): público, sin cuenta y SIN precios ni cuánto hay (como la portada). La figura
 * con sus números y cada prenda con su color; sin cuenta, «Crea tu cuenta y arma el tuyo» (al terminar, el probador abre con este look)
 * o «Ya tengo cuenta»; con cuenta, «Pruébatelo en el probador». Lo que ya no está se salta; si no queda nada, la invitación sola.
 *
 * El marco se arma por adelantado, como en toda página pública (ADR-0432); el look depende de la dirección, así que llega por detrás,
 * en su `<Suspense>`, con el esqueleto de la ficha mientras tanto.
 */
export default function TuLook({ searchParams }: Props) {
  return (
    <MarcoCuenta segunSesion conPie>
      <Suspense fallback={<FormaDelEsqueleto forma="ficha" />}>
        <ElLookCompartido searchParams={searchParams} />
      </Suspense>
    </MarcoCuenta>
  );
}

async function ElLookCompartido({ searchParams }: Props) {
  const { prendas, look, indice, codigo } = await elLook(await searchParams);
  const probador = hrefDelProbador(null, codigo);
  return (
    <div className="t-ancho">
      {prendas === null ? (
        <div className="t-vacio" role="status">
          <Icono nombre="tienda" />
          <h3>No pudimos abrir este look</h3>
          <p>
            Es un problema de conexión de nuestro lado. Vuelve a intentarlo en
            un momento.
          </p>
          <Link
            className="t-btn"
            href={codigo ? hrefTuLook(codigo) : RUTA_TU_LOOK}
          >
            Volver a intentar
          </Link>
        </div>
      ) : !look ? (
        <div className="t-vacio">
          <Icono nombre="chispas" />
          <h3>Este look ya no está</h3>
          <p>
            Sus prendas se agotaron o ya no están en la tienda online. Arma el
            tuyo con lo que hay hoy.
          </p>
          <Llamado probador={probador} />
        </div>
      ) : (
        <div className="lg tl">
          <div className="lg-figura">
            <FiguraQuieta
              look={look}
              indice={indice}
              ancho={560}
              numeros
              etiqueta={etiquetaDelLook(look, indice)}
              pronto
            />
          </div>
          <div className="lg-info">
            <span className="t-ceja">Un look armado en CAYLA</span>
            <h1 className="tl-titulo">
              Mira este <em>look</em>
            </h1>
            <ol className="lg-piezas">
              {presentes(look).flatMap((z, i) => {
                const p: PrendaDelProbador | undefined = indice.get(
                  look[z]!.id,
                );
                if (!p) return [];
                const c = colorDeLaPieza(p, look[z]!);
                return [
                  <li key={z} className="lg-pieza">
                    <b aria-hidden="true">{i + 1}</b>
                    <span className="lg-pieza-foto" aria-hidden="true">
                      <span>
                        <Recorte foto={c.foto} tamanos="54px" />
                      </span>
                    </span>
                    <span className="lg-pieza-txt">
                      <span className="tl-nombre">{p.nombre}</span>
                      <span className="lg-pieza-color">
                        <span
                          className="pb-punto-color"
                          data-color-dato
                          style={c.hex ? { background: c.hex } : undefined}
                          aria-hidden="true"
                        />
                        {c.nombre}
                      </span>
                    </span>
                  </li>,
                ];
              })}
            </ol>
            <Llamado probador={probador} />
            <p className="lg-nota">
              Con tu cuenta ves los precios, las tallas y en qué tienda hay, y
              lo separas sin pagar para recogerlo en tu tienda.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Sin cuenta, crearla (o entrar) y volver al probador con este look; con cuenta, el probador directo. */
function Llamado({ probador }: { probador: string }) {
  return (
    <SegunSesion
      visitante={
        <div className="tl-llamado">
          <Link
            className="t-btn"
            href={hrefConVolver("/crear-cuenta", probador)}
          >
            Crea tu cuenta y arma el tuyo
          </Link>
          <Link className="t-enlace" href={hrefConVolver("/entrar", probador)}>
            Ya tengo cuenta
          </Link>
        </div>
      }
      conCuenta={
        <div className="tl-llamado">
          <Link className="t-btn" href={probador}>
            Pruébatelo en el probador
          </Link>
        </div>
      }
    />
  );
}
