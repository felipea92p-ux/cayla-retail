import Link from "next/link";

/** Cuando la base o el proyecto de clientes no contestan: la página no se cae y dice qué hacer (principio 9). */
export function CuentaNoDisponible({ texto, volverA }: { texto: string; volverA: string }) {
  return (
    <div className="w-ficha">
      <div>
        <span className="t-ceja">Mi perfil</span>
        <h1 className="w-titulo">Un momento</h1>
        <p className="w-texto-sec">{texto}</p>
      </div>
      <Link className="t-btn t-btn-ancho t-btn-sec" href={volverA}>
        Volver a intentar
      </Link>
    </div>
  );
}
