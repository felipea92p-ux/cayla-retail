import Link from "next/link";
import { Cabecera } from "@/components/Cabecera";
import { Icono } from "@/components/Icono";

/** Una dirección que no existe: lo dice en una línea y lleva de vuelta a la portada. */
export default function NoEncontrada() {
  return (
    <div className="tienda">
      <Cabecera />
      <main className="t-pagina">
        <div className="t-ancho">
          <div className="t-vacio">
            <Icono nombre="tienda" />
            <h3>Esta página no está</h3>
            <p>Puede que el enlace esté mal escrito o que la página ya no exista.</p>
            <Link className="t-btn" href="/">
              Volver a la portada
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
