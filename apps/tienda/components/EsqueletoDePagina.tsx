import Link from "next/link";
import type { FormaEsqueleto } from "@/lib/esqueleto";
import { datosDeCabecera } from "@/lib/inicio";
import type { Campana } from "@/lib/portada";
import { CabeceraDeEspera } from "./CabeceraConCuenta";
import { FormaDelEsqueleto } from "./FormaDelEsqueleto";
import { HeroeDelInicio } from "./HeroeDelInicio";
import { Icono } from "./Icono";
import { MarcaDeEspera } from "./Vistas";
// Las formas usan las clases de su página (la ficha, «Mi perfil», los looks, la bolsa, Recomendaciones): sin esto, al venir de otra
// página, brillarían sin su forma. El Inicio trae las suyas con su héroe.
import "@/app/estilos/ficha.css";
import "@/app/estilos/perfil.css";
import "@/app/estilos/looks.css";
import "@/app/estilos/recomendaciones.css";

/**
 * Lo que se ve mientras llega una página con cuenta (los `loading.tsx` del catálogo, de la ficha, de «Mi perfil» y de la bolsa; Felipe
 * 2026-10-15: «cada que presiono un botón no da la sensación de carga» y «cuando presiono en una prenda para ver el detalle no da la
 * sensación de carga»). Nada que pregunte a la base, para salir al instante: la última cabecera que se vio (2026-10-17: «cuando cambia
 * de vista es muy abrupto»: la cabecera vacía perdía sus menús y sus números en cada toque), el héroe del Inicio con la campaña que ya
 * está guardada (`campana`, la de la franja) y la forma de la página que viene (`FormaDelEsqueleto`), que brilla (`.t-esqueleto`,
 * quieta con prefers-reduced-motion). Sin `forma`, la saca de la dirección.
 */
export function EsqueletoDePagina({ forma, campana = null }: { forma?: FormaEsqueleto; campana?: Campana | null }) {
  // El héroe del Inicio, con la campaña de verdad (la misma de la franja): si lo que viene es el Inicio, ya está escrito.
  const heroe = campana ? (
    <HeroeDelInicio hero={{ tipo: "campana", campana, piezas: [], campanaId: null }} sede={null} origenFotos={undefined} verCampana="" verNuevo={null} enEspera />
  ) : null;
  return (
    <>
      {/* Otra vista: la pantalla se funde de la página de antes al esqueleto. Primera, antes de todo elemento (components/Vistas.tsx). */}
      <MarcaDeEspera />
      {/* La última cabecera que se vio, igual (`CabeceraDeEspera`); recién abierta la pestaña, la vacía de siempre. */}
      <CabeceraDeEspera
        datos={datosDeCabecera([], null, process.env.TIENDA_FOTOS_ORIGEN)}
        bolsa={
          <Link className="t-ico" href="/bolsa" data-bolsa aria-label="Tu bolsa">
            <Icono nombre="bolsa" />
          </Link>
        }
      />
      <main className="t-pagina t-pagina-catalogo" aria-busy="true">
        <FormaDelEsqueleto forma={forma} heroe={heroe} />
      </main>
    </>
  );
}
