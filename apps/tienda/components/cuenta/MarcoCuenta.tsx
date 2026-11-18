import { cuantosFavoritos, nombreDeLaCuenta } from "@/lib/cabecera-servidor";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { datosDeCabecera } from "@/lib/inicio";
import { leerPortada } from "@/lib/portada-servidor";
import { hayAlgoParaProbar } from "@/lib/probador-servidor";
import { anioActual } from "@/lib/hoy-servidor";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { anuncios } from "@/lib/portada";
import { Anuncio } from "../Anuncio";
import { BotonBolsa } from "../bolsa/BotonBolsa";
import { CampanitaApagada } from "../campanita/CampanitaApagada";
import { CampanitaConEspera } from "../campanita/Campanita";
import { Cabecera } from "../Cabecera";
import { CabeceraConCuenta } from "../CabeceraConCuenta";
import { Pie } from "../Pie";
import type { OpcionTienda } from "@/lib/sede-elegida";
import type { Portada } from "@/lib/portada";
import Link from "next/link";
import { Icono } from "../Icono";
import { ElegirPorCookie } from "./ElegirPorCookie";
import { EntradaDelDia } from "./EntradaDelDia";
import { SegunSesion } from "./SegunSesion";
import { MarcaDeVista } from "../Vistas";

/**
 * El marco de las páginas de la cuenta y de ayuda, el mismo de la portada: la franja de arriba (con la campaña vigente), la cabecera,
 * el contenido y, si se pide, el pie. La cabecera es la de la tienda (el menú, el buscador, los favoritos, «Mi cuenta» y la bolsa, armada
 * con el catálogo con «Todas»), con o sin cuenta; solo los formularios de entrar (crear, entrar, recuperar) llevan la del logo, y van sin
 * pie, como en la maqueta. El pie va después de <main> y llega solo al borde
 * de abajo en una página corta (pie.css).
 *
 * Una página pública que sirve a quien tiene cuenta y a quien no («Cómo separar», «Nuestras tiendas», la privacidad…) pasa
 * `segunSesion` en vez de leer las cookies ella misma: el marco sale armado por adelantado con la cabecera sin datos, y sus datos (el menú,
 * la bolsa, la cuenta) llegan por detrás, dentro de su `<Suspense>` (`SegunSesion`, ADR-0432).
 */
export async function MarcoCuenta({
  children,
  conCuenta = false,
  segunSesion = false,
  enPagina,
  conPie = false,
  visitante = false,
  tiendas = null,
  prendasEnBolsa = 0,
}: {
  children: React.ReactNode;
  conCuenta?: boolean;
  /** La página es pública y sirve a los dos: el marco se arma por adelantado y se ajusta a la cuenta al llegar la visita. */
  segunSesion?: boolean;
  enPagina?: "entrar" | "crear-cuenta" | "cuenta";
  conPie?: boolean;
  /** Con `conCuenta`: la página de la tienda (la bolsa) la ve también quien NO tiene sesión. Lleva la misma cabecera, pero su persona
   *  ofrece «Entrar» y «Crear mi cuenta», sin nombre, sin anotar la entrada y con el pie de quien aún no tiene cuenta. */
  visitante?: boolean;
  /** La tienda que se mira, para elegirla en la cabecera (la bolsa, ADR-0465: en la bolsa también se ve en qué tienda se está). Con menos de
   *  dos tiendas en la web, nada. */
  tiendas?: OpcionTienda[] | null;
  /** Cuántas prendas lleva la bolsa: cambiar de tienda la vacía, y el selector lo avisa antes. */
  prendasEnBolsa?: number;
}) {
  if (segunSesion) {
    const [{ campana }, anio, { diasParaCambiar }] = await Promise.all([leerPortada(), conPie ? anioActual() : Promise.resolve(0), leerAyuda()]);
    // La cabecera mientras llegan sus datos: la misma de la tienda, sin nombre, sin números y sin leer ninguna cookie (la página se guarda armada).
    const enEspera = (comoVisitante: boolean) => (
      <>
        <Anuncio frases={anuncios(campana, diasParaCambiar)} />
        <CabeceraConCuenta
          datos={datosDeCabecera([], null, undefined)}
          actual={enPagina === "cuenta" ? "cuenta" : null}
          deEspera
          visitante={comoVisitante}
          campanita={comoVisitante ? null : <CampanitaApagada />}
          bolsa={
            <Link className="t-ico" href="/bolsa" data-bolsa aria-label="Tu bolsa">
              <Icono nombre="bolsa" />
            </Link>
          }
        />
      </>
    );
    return (
      <>
        {/* Otra página: la pantalla se funde a la nueva. Antes de la caja, sin elementos encima (components/Vistas.tsx). */}
        <MarcaDeVista />
        <div className="tienda">
          <SegunSesion
            visitante={<ArranqueDeLaTienda campana={campana} enPagina={enPagina} visitante />}
            conCuenta={<ArranqueDeLaTienda campana={campana} enPagina={enPagina} />}
            // Mientras el servidor lee la cookie, la misma cabecera sin datos: según la cookie, con o sin lo de la cuenta.
            mientras={<ElegirPorCookie visitante={enEspera(true)} conCuenta={enEspera(false)} />}
          />
          <main className="t-pagina">{children}</main>
          {conPie && <SegunSesion visitante={<Pie anio={anio} />} conCuenta={<Pie anio={anio} conCuenta />} />}
        </div>
      </>
    );
  }
  const [{ campana }, catalogo, favoritos, nombre] = await Promise.all([
    leerPortada(),
    conCuenta ? leerCatalogo(null) : Promise.resolve(null),
    conCuenta && !visitante ? cuantosFavoritos() : Promise.resolve(null),
    conCuenta && !visitante ? nombreDeLaCuenta() : Promise.resolve(null),
  ]);
  const conProbador = conCuenta ? await hayAlgoParaProbar(catalogo?.prendas ?? []) : false;
  const conSesion = conCuenta && !visitante;
  const datosCabecera = conCuenta ? datosDeCabecera(catalogo?.prendas ?? [], null, process.env.TIENDA_FOTOS_ORIGEN, conProbador) : null;
  return (
    <>
      {/* Otra página: la pantalla se funde a la nueva. Antes de la caja, sin elementos encima (components/Vistas.tsx). */}
      <MarcaDeVista />
      <div className="tienda">
        <Anuncio frases={anuncios(campana, (await leerAyuda()).diasParaCambiar)} />
        {/* Entrar a la web cuenta como actividad del Club: se anota una vez al día por sesión (y al iniciar sesión, en «Entrar»). */}
        {conSesion && <EntradaDelDia />}
        {datosCabecera ? (
          <CabeceraConCuenta
            datos={datosCabecera}
            actual={enPagina === "cuenta" ? "cuenta" : null}
            favoritos={favoritos}
            nombre={nombre}
            bolsa={<BotonBolsa />}
            campanita={conSesion ? <CampanitaConEspera prendas={catalogo?.prendas ?? []} hrefNuevo={datosCabecera.nuevo.href} /> : null}
            visitante={visitante}
            tiendas={tiendas}
            prendasEnBolsa={prendasEnBolsa}
          />
        ) : (
          <Cabecera enPagina={enPagina === "cuenta" ? undefined : enPagina} />
        )}
        <main className="t-pagina">{children}</main>
        {conPie && <Pie anio={await anioActual()} conCuenta={conSesion} />}
      </div>
    </>
  );
}

/** La franja y la cabecera de la tienda, para el marco `segunSesion`: lo mismo que arma el marco de las páginas con cuenta, pero leído por
 *  detrás de la página (el catálogo para el menú es compartido; los favoritos y el nombre, solo si hay cuenta). */
async function ArranqueDeLaTienda({ campana, enPagina, visitante = false }: { campana: Portada["campana"]; enPagina?: "entrar" | "crear-cuenta" | "cuenta"; visitante?: boolean }) {
  const [catalogo, favoritos, nombre] = await Promise.all([leerCatalogo(null), visitante ? null : cuantosFavoritos(), visitante ? null : nombreDeLaCuenta()]);
  const conProbador = await hayAlgoParaProbar(catalogo?.prendas ?? []);
  const datos = datosDeCabecera(catalogo?.prendas ?? [], null, process.env.TIENDA_FOTOS_ORIGEN, conProbador);
  return (
    <>
      <Anuncio frases={anuncios(campana, (await leerAyuda()).diasParaCambiar)} />
      {!visitante && <EntradaDelDia />}
      <CabeceraConCuenta
        datos={datos}
        actual={enPagina === "cuenta" ? "cuenta" : null}
        favoritos={favoritos}
        nombre={nombre}
        bolsa={<BotonBolsa />}
        campanita={visitante ? null : <CampanitaConEspera prendas={catalogo?.prendas ?? []} hrefNuevo={datos.nuevo.href} />}
        visitante={visitante}
      />
    </>
  );
}
