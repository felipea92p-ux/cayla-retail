import Link from "next/link";
import { datosDeCabecera } from "@/lib/inicio";
import { CabeceraConCuenta } from "./CabeceraConCuenta";
import { Icono } from "./Icono";

/**
 * Lo que se ve mientras llega una página con cuenta (los `loading.tsx` del catálogo, de «Mi cuenta» y de la bolsa; Felipe 2026-10-15:
 * «cada que presiono un botón no da la sensación de carga»). Solo piezas fijas, sin leer nada, para salir al instante: la cabecera de
 * siempre sin los números de favoritos y de la bolsa (piden la sesión y la base) ni el nombre, y una forma de la página que viene: la
 * grilla de prendas (catálogo) o una lista de filas (cuenta, bolsa), que brillan (`.t-esqueleto`, quietas con prefers-reduced-motion).
 */
export function EsqueletoDePagina({ forma }: { forma: "grilla" | "lista" }) {
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
        <div className="t-ancho t-esqueleto" role="status">
          <span className="t-solo-lector">Cargando…</span>
          {forma === "grilla" ? (
            <div className="t-grilla" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="t-card">
                  <div className="t-card-foto" />
                  <div className="t-esqueleto-linea" />
                  <div className="t-esqueleto-linea" />
                </div>
              ))}
            </div>
          ) : (
            <div className="t-esqueleto-lista" aria-hidden="true">
              <div className="t-esqueleto-titulo" />
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="t-esqueleto-fila">
                  <div className="t-card-foto" />
                  <div>
                    <div className="t-esqueleto-linea" />
                    <div className="t-esqueleto-linea" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
