import type { Prenda } from "@/lib/catalogo";
import { cuantosFavoritos, nombreDeLaCuenta } from "@/lib/cabecera-servidor";
import { datosDeCabecera } from "@/lib/inicio";
import { anioActual } from "@/lib/hoy-servidor";
import { hayAlgoParaProbar } from "@/lib/probador-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import { cuantasEnLaBolsa } from "@/lib/bolsa-servidor";
import { BotonBolsa } from "./bolsa/BotonBolsa";
import { CampanitaConEspera } from "./campanita/Campanita";
import { CabeceraConCuenta, type SeccionActual } from "./CabeceraConCuenta";
import { EntradaDelDia } from "./cuenta/EntradaDelDia";
import { soloTiendas, type OpcionTienda } from "@/lib/sede-elegida";
import { InstalarCayla } from "./instalar/InstalarCayla";
import { Pie } from "./Pie";
import { EnCamino } from "./EnCamino";
import { MarcaDeVista } from "./Vistas";

/**
 * El marco de las páginas de quien tiene cuenta (el Inicio, el catálogo, la ficha, «Arma tu look»): la cabecera con el buscador, el
 * menú, los favoritos y la bolsa, la tienda elegida en la cabecera, el contenido y el pie. La franja de
 * arriba la pone el layout. La cabecera se arma con el catálogo que la página ya leyó, filtrado por la tienda elegida: los conteos del
 * menú y el buscador dicen lo mismo que la página. La bolsa es un componente de servidor (lee su cookie) y entra a la cabecera, que es
 * del navegador, como una pieza ya dibujada.
 */
export async function MarcoCatalogo({
  prendas,
  sede,
  filtro = null,
  actual = null,
  children,
}: {
  /** Lo publicado en la tienda elegida (o todo, con «Todas»); vacío si la base no respondió. */
  prendas: readonly Prenda[];
  /** La clave de la tienda elegida (`?sede=`), o null con «Todas». */
  sede: string | null;
  filtro?: OpcionTienda[] | null;
  actual?: SeccionActual;
  children: React.ReactNode;
}) {
  // «Arma el tuyo» sale solo si hay algo que probar en esta tienda (la lectura guardada del probador, como el catálogo).
  const [favoritos, nombre, conProbador, sesion, enLaBolsa] = await Promise.all([
    cuantosFavoritos(),
    nombreDeLaCuenta(),
    hayAlgoParaProbar(prendas),
    leerSesion(),
    cuantasEnLaBolsa(),
  ]);
  // Sin sesión (o con una cookie ya vencida) la tienda se ve igual; solo cambia el menú de la persona y el pie.
  const conSesion = sesion.estado !== "sin_sesion";
  const datos = datosDeCabecera(prendas, sede, process.env.TIENDA_FOTOS_ORIGEN, conProbador);
  return (
    <>
      {/* Otra página, otra lista u otro menú: la pantalla se funde a la nueva. Primera, antes de todo elemento (components/Vistas.tsx). */}
      <MarcaDeVista />
      {/* Entrar a la web cuenta como actividad del Club: se anota una vez al día por sesión (y al iniciar sesión, en «Entrar»). */}
      <EntradaDelDia />
      <CabeceraConCuenta
        datos={datos}
        actual={actual}
        favoritos={favoritos}
        nombre={nombre}
        bolsa={<BotonBolsa />}
        campanita={conSesion ? <CampanitaConEspera prendas={prendas} hrefNuevo={datos.nuevo.href} /> : null}
        visitante={!conSesion}
        tiendas={soloTiendas(filtro)}
        prendasEnBolsa={enLaBolsa}
      />
      {/* Instalar CAYLA en el celular (ADR-0431): sale sola, una vez por visita y solo en el Inicio y el catálogo (lib/instalar.ts). */}
      <InstalarCayla />
      {/* La tienda se elige en la cabecera (siempre una; con una sola tienda en la web no hay nada que elegir). */}
      {/* Mientras se va a otra lista de esta misma página (de Lo nuevo a Más vendidos), su esqueleto (`EnCamino`). */}
      <main className="t-pagina t-pagina-catalogo">
        <EnCamino>{children}</EnCamino>
      </main>
      <Pie anio={await anioActual()} conCuenta={conSesion} sede={sede} />
    </>
  );
}
