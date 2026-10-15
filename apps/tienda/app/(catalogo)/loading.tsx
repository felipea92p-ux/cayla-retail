import Link from "next/link";
import { CabeceraConCuenta } from "@/components/CabeceraConCuenta";
import { Icono } from "@/components/Icono";
import { datosDeCabecera } from "@/lib/inicio";

// Mientras llega una página con cuenta (Inicio, Catálogo, una ficha, Looks…), Next muestra esto al instante (Felipe 2026-10-15: «cada
// que presiono un botón no da la sensación de carga»: tocar una prenda o una categoría no hacía nada visible hasta que llegaba la
// página siguiente, 1 o 2 s después). Solo piezas fijas, sin leer nada: la cabecera de siempre sin los números de favoritos y de la
// bolsa (piden la sesión y la base), y la grilla con tarjetas vacías que brillan (`.t-esqueleto`, quieta con prefers-reduced-motion).
export default function CargandoCatalogo() {
  return (
    <>
      <CabeceraConCuenta
        datos={datosDeCabecera([], null, process.env.TIENDA_FOTOS_ORIGEN)}
        actual={null}
        favoritos={null}
        bolsa={
          <Link className="t-ico" href="/bolsa" data-bolsa aria-label="Tu bolsa">
            <Icono nombre="bolsa" />
          </Link>
        }
      />
      <main className="t-pagina t-pagina-catalogo" aria-busy="true">
        <div className="t-ancho t-esqueleto" role="status">
          <span className="t-solo-lector">Cargando…</span>
          <div className="t-grilla" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="t-card">
                <div className="t-card-foto" />
                <div className="t-esqueleto-linea" />
                <div className="t-esqueleto-linea" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
