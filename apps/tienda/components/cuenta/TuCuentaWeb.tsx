import Link from "next/link";

// «Tu cuenta», al final de «Mi cuenta» (Felipe 2026-10-15): con qué correo entra, «Cambiar mi correo» y, discreto, «Eliminar mi cuenta».
// Su propio correo se ve entero (es suyo).
export function TuCuentaWeb({ correo }: { correo: string }) {
  return (
    <section className="c-bloque" aria-labelledby="tu-cuenta-t">
      <h2 id="tu-cuenta-t" className="c-bloque-t">
        Tu cuenta
      </h2>
      <div className="w-tu-cuenta">
        <p className="w-tu-cuenta-correo">
          <span className="w-texto-sec">Entras con</span> <b className="w-correo">{correo}</b>
        </p>
        <div className="w-tu-cuenta-acc">
          <Link className="t-btn t-btn-sec t-btn-chico" href="/cuenta/correo">
            Cambiar mi correo
          </Link>
          <Link className="t-enlace w-tu-cuenta-eliminar" href="/cuenta/eliminar">
            Eliminar mi cuenta
          </Link>
        </div>
      </div>
    </section>
  );
}
