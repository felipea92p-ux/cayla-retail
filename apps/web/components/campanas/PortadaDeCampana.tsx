import { ArrowRight } from "lucide-react";
import {
  CejaDeCampana,
  CuentaDeCampana,
  HeroeDePortada,
  fechaCorta,
  finDeCampana,
  partesCuenta,
  partirTitulo,
  pctTexto,
  type DisenoDeCampana,
  type PiezaDeHeroe,
  type Tema,
} from "@cayla-retail/portada";
import type { CampanaDePortada, PiezaDePortada } from "@/lib/campana-diseno";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { IsotipoCayla } from "@/components/ui/IsotipoCayla";
import { SinFoto } from "@/components/ui/PrendaCelda";

/** Hasta tres polaroids, como la tienda (`heroDelInicio`): la vista previa muestra las que de verdad pueden salir. */
const POLAROIDS = 3;

/**
 * La portada de la tienda online con una campaña, como la ve el cliente SIN cuenta (lo que ve casi todo el que llega): la franja de
 * arriba, la cabecera y el héroe. El héroe es la MISMA pieza de la tienda (`HeroeDePortada`, @cayla-retail/portada), con sus textos;
 * aquí solo se le pasan las piezas del ERP (la foto de cada prenda, el colibrí en vector) y botones que no llevan a ningún lado.
 * Se dibuja dentro de un `Lienzo`, a 1280 o a 375 px.
 */
export function PortadaDeCampana({
  campana,
  diseno,
  tema,
  piezas,
  celular = false,
  ahora,
}: {
  campana: CampanaDePortada;
  diseno: DisenoDeCampana;
  tema: Tema;
  piezas: readonly PiezaDePortada[];
  celular?: boolean;
  /** La hora del contador (ms); la vista previa no corre segundo a segundo. */
  ahora: number;
}) {
  const { nombre, pct, hasta } = campana;
  const fotos = piezas.slice(0, POLAROIDS).map(
    (p): PiezaDeHeroe => ({
      id: p.id,
      nombre: p.nombre,
      foto: <FotoDePolaroid pieza={p} />,
      derecha: <span className="t-polaroid-ver">Ver precio</span>,
    }),
  );
  return (
    <div className="tw-web" data-tema={tema} data-celular={celular ? "" : undefined}>
      <div className="tw-web-anuncio">
        {pct ? `${nombre} · −${pctTexto(pct)} %${hasta ? ` hasta el ${fechaCorta(hasta)}` : ""}` : `${nombre} · mira lo que elegimos`}
      </div>
      <div className="tw-web-cab">
        <span className="tw-web-logo">
          <IsotipoCayla />
          CAYLA
        </span>
        {!celular && (
          <span className="tw-web-nav">
            <span>Cómo separar</span>
            <span>Nuestras tiendas</span>
            <span>Club CAYLA</span>
          </span>
        )}
        <span className="flex-1" />
        <span className="tw-web-pildora">Entrar</span>
        {!celular && (
          <span className="tw-web-pildora" data-llena>
            <span>Crear mi cuenta</span>
          </span>
        )}
      </div>
      <HeroeDePortada
        clase={`t-portada${fotos.length > 0 ? " po-hero" : ""}`}
        colibri={<IsotipoCayla className="t-colibri" color="currentColor" />}
        ceja={<CejaDeCampana hasta={hasta} />}
        titulo={partirTitulo(nombre, diseno.corte)}
        descripcion={
          pct ? (
            <>
              <b>−{pctTexto(pct)} % en prendas elegidas.</b> Crea tu cuenta para ver los precios, cuánto hay en cada tienda y separar.
            </>
          ) : (
            <>
              <b>Prendas elegidas para {nombre}.</b> Crea tu cuenta para ver los precios, cuánto hay en cada tienda y separar.
            </>
          )
        }
        cuenta={hasta ? <CuentaDeCampana partes={partesCuenta(finDeCampana(hasta) - ahora)} /> : null}
        acciones={
          <>
            <span className="t-btn t-btn-claro">Crear mi cuenta</span>
            <span className="t-enlace">
              Ya tengo cuenta · Entrar <ArrowRight aria-hidden className="ic" />
            </span>
          </>
        }
        piezas={fotos}
        marca={pct ? `−${pctTexto(pct)}%` : null}
        lado={<ClubMini />}
        diseno={diseno}
        tema={tema}
      />
    </div>
  );
}

/** La foto de la prenda en su polaroid, o —sin foto, o si no carga— su categoría sobre su color. */
function FotoDePolaroid({ pieza }: { pieza: PiezaDePortada }) {
  const sinFoto = (
    <span className="tw-pieza-sin-foto">
      <SinFoto tamano="h-full w-full !rounded-none" colorHex={pieza.colorHex} prefijo={pieza.prefijo} familia={pieza.familia} categoria={pieza.categoria} />
    </span>
  );
  return (
    <span className="portada-foto">
      {pieza.foto ? <ImagenDePrenda src={pieza.foto} alt="" fill sizes="240px" fallback={sinFoto} fondo={pieza.colorHex ?? null} /> : sinFoto}
    </span>
  );
}

/** Lo que la tienda pone a la derecha cuando la campaña no tiene prendas que mostrar: la tarjeta del Club. */
function ClubMini() {
  return (
    <div className="tw-club-mini">
      <div className="tw-club-mini-tarjeta">
        <b>CAYLA</b>
        <span>Tu nombre aquí</span>
        <small>Club CAYLA</small>
      </div>
      <p>Crea tu cuenta y forma parte del Club CAYLA.</p>
    </div>
  );
}
