import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoAyuda } from "@/components/ayuda/EncabezadoAyuda";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono } from "@/components/Icono";
import { preguntasFrecuentes } from "@/lib/ayuda";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../estilos/ayuda.css";

export const metadata: Metadata = {
  title: "Preguntas frecuentes · CAYLA",
  description: "Lo que más nos preguntan: separar sin pagar en la web, cuánto se guarda lo que separas, cambios y tiendas.",
};

/**
 * Las preguntas frecuentes (rediseño Premium, 2026-11-07): las respuestas son las de «Cómo separar», «Cambios y devoluciones» y la bolsa,
 * con los plazos del ERP (`retail.tienda_ayuda()`) y las tiendas de la web (`preguntasFrecuentes`). Cada una se abre sola (`<details>`):
 * se lee sin JavaScript y el teclado la abre con Enter.
 */
export default async function PreguntasFrecuentes() {
  const [plazos, sedes] = await Promise.all([leerAyuda(), leerSedes()]);
  const preguntas = preguntasFrecuentes(
    plazos,
    sedes.map((s) => s.nombre),
  );
  return (
    <MarcoCuenta segunSesion conPie>
      <div className="t-ancho ay-pagina">
        <EncabezadoAyuda ceja="Ayuda" titulo={<>Preguntas <em>frecuentes</em></>} bajada="Con los mismos plazos y reglas que usa la tienda." />
        <div className="ay-faq">
          {preguntas.map((p) => (
            <details key={p.pregunta}>
              <summary>
                {p.pregunta}
                <Icono nombre="flecha" />
              </summary>
              <p>{p.respuesta}</p>
            </details>
          ))}
        </div>
        <p className="ay-faq-mas">
          <Link className="ay-enlace" href="/como-separar">
            Cómo separar, paso a paso <Icono nombre="flecha" />
          </Link>
          <Link className="ay-enlace" href="/club">
            Cómo funciona el Club <Icono nombre="flecha" />
          </Link>
        </p>
      </div>
    </MarcoCuenta>
  );
}
