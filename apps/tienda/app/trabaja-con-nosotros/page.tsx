import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoAyuda } from "@/components/ayuda/EncabezadoAyuda";
import { LineaDePasos } from "@/components/ayuda/LineaDePasos";
import { NotaAyuda } from "@/components/ayuda/NotaAyuda";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono, type NombreIcono } from "@/components/Icono";
import {
  AREAS,
  BENEFICIOS,
  CIFRAS_DE_LA_CASA,
  CONTACTO_DE_SELECCION,
  enlaceParaPostular,
  mensajeParaPostular,
  PASOS_DEL_PROCESO,
  remuneracionVigente,
  soles,
  type AreaClave,
} from "@/lib/empresa";
import { hoyDeLima } from "@/lib/hoy-servidor";
import { whatsappLegible } from "@/lib/tiendas";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../estilos/ayuda.css";
import "../estilos/empresa.css";

export const metadata: Metadata = {
  title: "Trabaja con nosotros · CAYLA",
  description: "Únete al equipo CAYLA en Trujillo, Arequipa o Lima: tiendas, Taller, almacén y oficina. Entras sin experiencia y creces por mérito.",
};

const ICONO_DEL_AREA: Record<AreaClave, NombreIcono> = { tiendas: "tienda", taller: "percha", almacen: "pedido", oficina: "persona" };

/**
 * «Trabaja con nosotros» (plan «La casa CAYLA en la web», fase 1, Felipe 2026-11-22). La web todavía no guarda postulaciones: «Postular»
 * abre WhatsApp con el mensaje ya escrito, al número de esa tienda (`tienda_sedes()`) o, para Taller, almacén y oficina, al de selección
 * del brochure. Así no nace un banco de datos en la web antes que la bandeja que lo responda (fase 3, con Dynamic como dueño). Lo que la
 * página afirma (cifras, remuneración, beneficios) sale de `lib/empresa.ts`, el mismo lugar que usa «Nuestra historia». Sin base, las
 * tiendas no salen y el área de Tiendas manda al número de selección: nadie se queda sin cómo postular.
 */
export default async function TrabajaConNosotros() {
  const [sedes, hoy] = await Promise.all([leerSedes(), hoyDeLima()]);
  const { actual, proxima } = remuneracionVigente(hoy);
  const seleccion = CONTACTO_DE_SELECCION.whatsapp;
  return (
    <MarcoCuenta segunSesion conPie>
      <div className="t-ancho ay-pagina">
        <EncabezadoAyuda
          ceja="Trabaja con nosotros"
          titulo={
            <>
              Únete al equipo <em>CAYLA.</em>
            </>
          }
          bajada="Entras sin experiencia previa y creces por mérito, no por antigüedad. Aquí no hay techo: hay rangos."
        />

        <ul className="emp-cifras" aria-label="CAYLA en cifras">
          {CIFRAS_DE_LA_CASA.map((c) => (
            <li key={c.texto} className="emp-cifra">
              <b>{c.valor}</b>
              <span>{c.texto}</span>
            </li>
          ))}
        </ul>

        <section className="ay-bloque" aria-labelledby="emp-areas">
          <div className="ay-bloque-cab">
            <span className="t-ceja">Elige dónde</span>
            <h2 id="emp-areas" className="ay-h2">
              Dónde puedes <em>trabajar</em>
            </h2>
          </div>
          <div className="ay-puntos emp-areas">
            {AREAS.map((area) => (
              <NotaAyuda key={area.clave} icono={ICONO_DEL_AREA[area.clave]} titulo={area.nombre} texto={area.donde ? `${area.puestos} En ${area.donde}.` : area.puestos}>
                <div className="emp-postular">
                  {area.clave === "tiendas" && sedes.length > 0 ? (
                    sedes.map((s) => (
                      <a key={s.id} className="ay-enlace" href={enlaceParaPostular(s.whatsapp, mensajeParaPostular(area, s.nombre))} target="_blank" rel="noopener noreferrer">
                        Postular en {s.nombre} <Icono nombre="flecha" />
                      </a>
                    ))
                  ) : (
                    <a className="ay-enlace" href={enlaceParaPostular(seleccion, mensajeParaPostular(area, area.clave === "taller" ? "Lima" : null))} target="_blank" rel="noopener noreferrer">
                      Postular por WhatsApp <Icono nombre="flecha" />
                    </a>
                  )}
                </div>
              </NotaAyuda>
            ))}
          </div>
        </section>

        <section className="ay-bloque" aria-labelledby="emp-ganas">
          <div className="ay-bloque-cab">
            <span className="t-ceja">Una escala publicada</span>
            <h2 id="emp-ganas" className="ay-h2">
              Lo que <em>ganas</em>
            </h2>
          </div>
          <div className="emp-sueldo">
            <div className="emp-sueldo-monto">
              <b>{soles(actual.monto)}</b>
              <span>al mes al entrar, en el rango Colibrí. La misma escala para todas las sedes y áreas, en planilla.</span>
              {proxima && <p className="emp-sueldo-sube">Sube a {soles(proxima.monto)} en {proxima.desde.anio}.</p>}
            </div>
            <ul className="emp-beneficios" aria-label="Lo que se suma">
              {BENEFICIOS.map((b) => (
                <li key={b.titulo} className="emp-beneficio">
                  <b>{b.titulo}</b>
                  <span>{b.texto}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="ay-bloque" aria-labelledby="emp-proceso">
          <div className="ay-bloque-cab">
            <span className="t-ceja">Te respondemos siempre</span>
            <h2 id="emp-proceso" className="ay-h2">
              Así es el <em>proceso</em>
            </h2>
          </div>
          <LineaDePasos pasos={PASOS_DEL_PROCESO.map((p) => ({ ...p, hecho: false }))} nombre="Los pasos para postular" />
        </section>

        <section className="ay-llamado" aria-labelledby="emp-llamado">
          <div className="ay-llamado-tx">
            <span className="t-ceja">Cuídate de las estafas</span>
            <h2 id="emp-llamado" className="ay-h2">
              Nunca cobramos por <em>postular.</em>
            </h2>
            <p className="ay-llamado-x">
              Solo te escribimos desde el WhatsApp de una tienda CAYLA o el de selección, {whatsappLegible(seleccion)}, y desde {CONTACTO_DE_SELECCION.correo}.
            </p>
          </div>
          <div className="ay-llamado-acc">
            <a className="t-btn" href={enlaceParaPostular(seleccion, "Hola, quiero trabajar en CAYLA. Mi nombre es ")} target="_blank" rel="noopener noreferrer">
              Escribir por WhatsApp
            </a>
            <Link className="ay-enlace" href="/nuestra-historia">
              Conoce nuestra historia <Icono nombre="flecha" />
            </Link>
          </div>
        </section>
      </div>
    </MarcoCuenta>
  );
}
