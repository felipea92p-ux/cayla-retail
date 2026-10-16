import Link from "next/link";
import type { FormaEsqueleto } from "@/lib/esqueleto";
import { datosDeCabecera } from "@/lib/inicio";
import { CabeceraConCuenta } from "./CabeceraConCuenta";
import { FormaDelEsqueleto } from "./FormaDelEsqueleto";
import { Icono } from "./Icono";
// Las formas usan las clases de su página (la ficha y «Mi perfil»): sin esto, al venir de otra página, brillarían sin su forma.
import "@/app/estilos/ficha.css";
import "@/app/estilos/perfil.css";

/**
 * Lo que se ve mientras llega una página con cuenta (los `loading.tsx` del catálogo, de la ficha, de «Mi perfil» y de la bolsa; Felipe
 * 2026-10-15: «cada que presiono un botón no da la sensación de carga» y «cuando presiono en una prenda para ver el detalle no da la
 * sensación de carga»). Solo piezas fijas, sin leer nada, para salir al instante: la cabecera de siempre sin los números de favoritos y
 * de la bolsa (piden la sesión y la base) ni el nombre, y la forma de la página que viene (`FormaDelEsqueleto`: la grilla de prendas,
 * la ficha, «Mi perfil» o una lista), que brilla (`.t-esqueleto`, quieta con prefers-reduced-motion). Sin `forma`, la saca de la dirección.
 */
export function EsqueletoDePagina({ forma }: { forma?: FormaEsqueleto }) {
  return (
    <>
      <CabeceraConCuenta
        datos={datosDeCabecera([], null, process.env.TIENDA_FOTOS_ORIGEN)}
        bolsa={
          <Link className="t-ico" href="/bolsa" data-bolsa aria-label="Tu bolsa">
            <Icono nombre="bolsa" />
          </Link>
        }
      />
      <main className="t-pagina t-pagina-catalogo" aria-busy="true">
        <FormaDelEsqueleto forma={forma} />
      </main>
    </>
  );
}
