import { Cabecera } from "../Cabecera";
import { MarcaDeEspera } from "../Vistas";
import "@/app/estilos/cuenta-mostrador.css";

/**
 * Lo que se ve mientras llega Entrar, Crear cuenta o una de las páginas para volver a entrar: lo mismo que ya se va a ver (el logo solo,
 * sin la franja de avisos, Felipe 2026-11-26) y la forma del formulario que brilla. Sin esto, la espera de toda la tienda (`app/loading.tsx`)
 * dibujaba un instante la franja roja y la cabecera con menú, que al llegar la página desaparecían.
 */
export function EsperaDeCuenta() {
  return (
    <>
      {/* Otra vista: el fundido al esqueleto. Antes de la caja, sin elementos encima (components/Vistas.tsx). */}
      <MarcaDeEspera />
      <div className="tienda">
        <Cabecera />
        {/* `data-esqueleto`: mientras está en la pantalla, la página de destino no llegó (lo mira la medición, ADR-0447). */}
        <main className="t-pagina" aria-busy="true" data-esqueleto="">
          <div className="cu-pantalla cu-espera" role="status">
            <span className="t-solo-lector">Cargando…</span>
            <div aria-hidden="true">
              <div className="cu-espera-linea cu-espera-ceja" />
              <div className="cu-espera-linea cu-espera-titulo" />
              <div className="cu-espera-campo" />
              <div className="cu-espera-campo" />
              <div className="cu-espera-campo cu-espera-boton" />
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
