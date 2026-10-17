import { cuantosFavoritos, nombreDeLaCuenta } from "@/lib/cabecera-servidor";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { datosDeCabecera } from "@/lib/inicio";
import { leerPortada } from "@/lib/portada-servidor";
import { hayAlgoParaProbar } from "@/lib/probador-servidor";
import { anioActual } from "@/lib/hoy-servidor";
import { anuncios } from "@/lib/portada";
import { Anuncio } from "../Anuncio";
import { BotonBolsa } from "../bolsa/BotonBolsa";
import { Cabecera } from "../Cabecera";
import { CabeceraConCuenta } from "../CabeceraConCuenta";
import { Pie } from "../Pie";
import type { Portada } from "@/lib/portada";
import Link from "next/link";
import { Icono } from "../Icono";
import { ElegirPorCookie } from "./ElegirPorCookie";
import { EntradaDelDia } from "./EntradaDelDia";
import { SegunSesion } from "./SegunSesion";

/**
 * El marco de las páginas de la cuenta y de ayuda, el mismo de la portada: la franja de arriba (con la campaña vigente), la cabecera,
 * el contenido y, si se pide, el pie. Sin cuenta, la cabecera de la portada («Entrar», «Crear mi cuenta»); con cuenta, la de la tienda
 * (el menú, el buscador, los favoritos, «Mi cuenta» y la bolsa, armada con el catálogo con «Todas»). Los formularios (crear, entrar,
 * recuperar) van sin pie, como en la maqueta. El pie va después de <main> y llega solo al borde
 * de abajo en una página corta (pie.css).
 *
 * Una página pública que sirve a quien tiene cuenta y a quien no («Cómo separar», «Nuestras tiendas», la privacidad…) pasa
 * `segunSesion` en vez de leer las cookies ella misma: el marco sale armado por adelantado, con la cabecera y el pie de quien no tiene
 * cuenta, y la franja, la cabecera y el pie de quien sí la tiene llegan por detrás, dentro de su `<Suspense>` (`SegunSesion`, ADR-0432).
 */
export async function MarcoCuenta({
  children,
  conCuenta = false,
  segunSesion = false,
  enPagina,
  conPie = false,
}: {
  children: React.ReactNode;
  conCuenta?: boolean;
  /** La página es pública y sirve a los dos: el marco se arma por adelantado y se ajusta a la cuenta al llegar la visita. */
  segunSesion?: boolean;
  enPagina?: "entrar" | "crear-cuenta" | "cuenta";
  conPie?: boolean;
}) {
  if (segunSesion) {
    const [{ campana }, anio] = await Promise.all([leerPortada(), conPie ? anioActual() : Promise.resolve(0)]);
    const visitante = (
      <>
        <Anuncio frases={anuncios(campana, false)} />
        <Cabecera enPagina={enPagina === "cuenta" ? undefined : enPagina} />
      </>
    );
    return (
      <div className="tienda">
        <SegunSesion
          visitante={visitante}
          conCuenta={<ArranqueConCuenta campana={campana} enPagina={enPagina} />}
          // Mientras el servidor lee la cookie: quien trae sesión ve la cabecera de siempre sin los números ni el nombre (los de él
          // llegan por detrás) y quien no, la del visitante, que es la que se queda.
          mientras={
            <ElegirPorCookie
              visitante={visitante}
              conCuenta={
                <>
                  <Anuncio frases={anuncios(campana, true)} />
                  <CabeceraConCuenta
                    datos={datosDeCabecera([], null, undefined)}
                    actual={enPagina === "cuenta" ? "cuenta" : null}
                    bolsa={
                      <Link className="t-ico" href="/bolsa" data-bolsa aria-label="Tu bolsa">
                        <Icono nombre="bolsa" />
                      </Link>
                    }
                  />
                </>
              }
            />
          }
        />
        <main className="t-pagina">{children}</main>
        {conPie && <SegunSesion visitante={<Pie anio={anio} />} conCuenta={<Pie anio={anio} conCuenta />} />}
      </div>
    );
  }
  const [{ campana }, catalogo, favoritos, nombre] = await Promise.all([
    leerPortada(),
    conCuenta ? leerCatalogo(null) : Promise.resolve(null),
    conCuenta ? cuantosFavoritos() : Promise.resolve(null),
    conCuenta ? nombreDeLaCuenta() : Promise.resolve(null),
  ]);
  const conProbador = conCuenta ? await hayAlgoParaProbar(catalogo?.prendas ?? []) : false;
  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campana, conCuenta)} />
      {/* Entrar a la web cuenta como actividad del Club: se anota una vez al día por sesión (y al iniciar sesión, en «Entrar»). */}
      {conCuenta && <EntradaDelDia />}
      {conCuenta ? (
        <CabeceraConCuenta
          datos={datosDeCabecera(catalogo?.prendas ?? [], null, process.env.TIENDA_FOTOS_ORIGEN, conProbador)}
          actual={enPagina === "cuenta" ? "cuenta" : null}
          favoritos={favoritos}
          nombre={nombre}
          bolsa={<BotonBolsa />}
        />
      ) : (
        <Cabecera enPagina={enPagina === "cuenta" ? undefined : enPagina} />
      )}
      <main className="t-pagina">{children}</main>
      {conPie && <Pie anio={await anioActual()} conCuenta={conCuenta} />}
    </div>
  );
}

/** La franja y la cabecera de quien tiene cuenta, para el marco `segunSesion`: lo mismo que arma el marco de las páginas con cuenta,
 *  pero leído por detrás de la página (el catálogo para el menú es compartido; los favoritos y el nombre son de la persona). */
async function ArranqueConCuenta({ campana, enPagina }: { campana: Portada["campana"]; enPagina?: "entrar" | "crear-cuenta" | "cuenta" }) {
  const [catalogo, favoritos, nombre] = await Promise.all([leerCatalogo(null), cuantosFavoritos(), nombreDeLaCuenta()]);
  const conProbador = await hayAlgoParaProbar(catalogo?.prendas ?? []);
  return (
    <>
      <Anuncio frases={anuncios(campana, true)} />
      <EntradaDelDia />
      <CabeceraConCuenta
        datos={datosDeCabecera(catalogo?.prendas ?? [], null, process.env.TIENDA_FOTOS_ORIGEN, conProbador)}
        actual={enPagina === "cuenta" ? "cuenta" : null}
        favoritos={favoritos}
        nombre={nombre}
        bolsa={<BotonBolsa />}
      />
    </>
  );
}
