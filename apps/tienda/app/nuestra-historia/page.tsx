import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoAyuda } from "@/components/ayuda/EncabezadoAyuda";
import { LineaDePasos } from "@/components/ayuda/LineaDePasos";
import { NotaAyuda } from "@/components/ayuda/NotaAyuda";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono, type NombreIcono } from "@/components/Icono";
import { hrefLista } from "@/lib/catalogo";
import { CIFRAS_DE_LA_CASA, HITOS, INVERSION_INICIAL, VALORES } from "@/lib/empresa";
import "../estilos/ayuda.css";
import "../estilos/empresa.css";

export const metadata: Metadata = {
  alternates: { canonical: "/nuestra-historia" },
  title: "Nuestra historia",
  description: `CAYLA nació en Trujillo con ${INVERSION_INICIAL}. Hoy está en Trujillo, Arequipa y Lima, con su propio Taller.`,
};

const ICONO_DEL_GRUPO: Record<string, NombreIcono> = { Carácter: "persona", Oficio: "percha", Impacto: "corazon" };

/**
 * «Nuestra historia» (plan «La casa CAYLA en la web», fase 1, Felipe 2026-11-22). El relato, las cifras y los nueve valores salen del
 * Brochure Institucional 2026 a través de `lib/empresa.ts`, el mismo lugar que usa «Trabaja con nosotros»: una cifra no se escribe dos
 * veces. Los hitos van en la línea de pasos de las páginas de ayuda (son una secuencia en el tiempo). Sin años todavía: el brochure no los
 * trae, y un año inventado es peor que ninguno. Igual para todos, se arma por adelantado y no lee la base.
 */
export default function NuestraHistoria() {
  return (
    <MarcoCuenta segunSesion conPie>
      <div className="t-ancho ay-pagina">
        <EncabezadoAyuda
          ceja="Nuestra historia"
          titulo={
            <>
              No vendemos ropa. <em>Transformamos.</em>
            </>
          }
          bajada={`CAYLA nació en una calle de Trujillo con ${INVERSION_INICIAL}. Hoy está en tres ciudades, sin deuda y reinvirtiendo cada sol.`}
        />

        <ul className="emp-cifras" aria-label="CAYLA en cifras">
          {CIFRAS_DE_LA_CASA.map((c) => (
            <li key={c.texto} className="emp-cifra">
              <b>{c.valor}</b>
              <span>{c.texto}</span>
            </li>
          ))}
        </ul>

        <section className="ay-bloque" aria-labelledby="emp-camino">
          <div className="ay-bloque-cab">
            <span className="t-ceja">De Trujillo a tres ciudades</span>
            <h2 id="emp-camino" className="ay-h2">
              Cómo llegamos <em>aquí</em>
            </h2>
          </div>
          <LineaDePasos pasos={HITOS.map((h) => ({ ...h, hecho: false }))} nombre="Nuestra historia" />
        </section>

        <section className="ay-bloque" aria-labelledby="emp-valores">
          <div className="ay-bloque-cab">
            <span className="t-ceja">Nueve valores</span>
            <h2 id="emp-valores" className="ay-h2">
              Lo que <em>creemos</em>
            </h2>
          </div>
          <div className="ay-puntos">
            {VALORES.map((g) => (
              <NotaAyuda key={g.grupo} icono={ICONO_DEL_GRUPO[g.grupo] ?? "chispa"} titulo={g.grupo} texto={`${g.pregunta}: ${g.valores.join(", ")}.`} />
            ))}
          </div>
        </section>

        <section className="ay-llamado" aria-labelledby="emp-llamado">
          <div className="ay-llamado-tx">
            <span className="t-ceja">Trabaja con nosotros</span>
            <h2 id="emp-llamado" className="ay-h2">
              ¿Quieres construir <em>con nosotros?</em>
            </h2>
            <p className="ay-llamado-x">Entras sin experiencia previa y creces por mérito, en tiendas, el Taller, el almacén o la oficina.</p>
          </div>
          <div className="ay-llamado-acc">
            <Link className="t-btn" href="/trabaja-con-nosotros">
              Ver cómo postular
            </Link>
            <Link className="ay-enlace" href={hrefLista({ categoria: null, orden: "destacado" })}>
              Ver la tienda <Icono nombre="flecha" />
            </Link>
          </div>
        </section>
      </div>
    </MarcoCuenta>
  );
}
