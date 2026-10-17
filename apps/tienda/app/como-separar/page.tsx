import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoAyuda } from "@/components/ayuda/EncabezadoAyuda";
import { LineaDePasos } from "@/components/ayuda/LineaDePasos";
import { NotaAyuda } from "@/components/ayuda/NotaAyuda";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { SegunSesion } from "@/components/cuenta/SegunSesion";
import { Icono } from "@/components/Icono";
import { avisosParaSeparar, pasosParaSeparar } from "@/lib/ayuda";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { hrefLista } from "@/lib/catalogo";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../estilos/ayuda.css";

export const metadata: Metadata = {
  title: "Cómo separar · CAYLA",
  description: "Separa online sin pagar en la web, confírmalo por WhatsApp y recógelo en tu tienda CAYLA.",
};

/**
 * «Cómo separar» (ADR-0408, actividad 5; maqueta v4, `vComoSeparar`), con y sin cuenta (el pie de todas las páginas la enlaza). Las
 * tiendas son las de la web y los plazos, los del ERP (`retail.tienda_ayuda()`): nada escrito a mano que pueda quedar viejo. Sin base, los
 * pasos salen sin nombres y los avisos sin número. Revisión «a nivel mundial» (2026-10-16): el título grande con lo que es la página,
 * los cuatro pasos como la línea de tiempo de la portada y el Inicio (la misma pieza, `LineaDePasos`), los plazos de un pedido de a tres
 * y el llamado del final: sin cuenta, crearla (o entrar); con cuenta, el primer paso ya sale hecho y el llamado lleva a la ropa.
 */
export default async function ComoSeparar() {
  const [plazos, sedes] = await Promise.all([leerAyuda(), leerSedes()]);
  const { confirmar, pagar, recoger } = avisosParaSeparar(plazos);
  const nombresDeSedes = sedes.map((s) => s.nombre);
  return (
    <MarcoCuenta segunSesion conPie>
      <div className="t-ancho ay-pagina">
        <EncabezadoAyuda
          ceja="Ayuda"
          titulo={
            <>
              Separa online, <em>recoge en tu tienda.</em>
            </>
          }
          bajada="En la web no pagas nada: separas tus prendas, la tienda te lo confirma por WhatsApp y lo recoges en la tienda que elijas."
        />

        {/* El primer paso sale hecho para quien ya tiene cuenta. */}
        <SegunSesion
          visitante={<LineaDePasos pasos={pasosParaSeparar(nombresDeSedes, false)} />}
          conCuenta={<LineaDePasos pasos={pasosParaSeparar(nombresDeSedes, true)} />}
        />

        <section className="ay-bloque" aria-labelledby="ay-saber">
          <div className="ay-bloque-cab">
            <span className="t-ceja">Los plazos de tu pedido</span>
            <h2 id="ay-saber" className="ay-h2">
              Lo que tienes que <em>saber</em>
            </h2>
          </div>
          <div className="ay-puntos">
            <NotaAyuda icono="reloj" {...confirmar} />
            <NotaAyuda icono="ticket" {...pagar} />
            <NotaAyuda icono="tienda" {...recoger}>
              <Link className="ay-enlace" href="/tiendas">
                Ver dónde están nuestras tiendas <Icono nombre="flecha" />
              </Link>
            </NotaAyuda>
          </div>
        </section>

        <SegunSesion
          visitante={
            <section className="ay-llamado" aria-labelledby="ay-llamado">
              <div className="ay-llamado-tx">
                <span className="t-ceja">Club CAYLA</span>
                <h2 id="ay-llamado" className="ay-h2">
                  Crea tu cuenta y forma parte del <em>Club CAYLA.</em>
                </h2>
                <p className="ay-llamado-x">El catálogo es de todos: la cuenta la creas cuando quieras separar algo. Entras al Club al completar tu documento y tu celular.</p>
              </div>
              <div className="ay-llamado-acc">
                <Link className="t-btn" href="/crear-cuenta">
                  Crear mi cuenta
                </Link>
                <Link className="ay-enlace" href="/entrar">
                  Ya tengo cuenta · Entrar <Icono nombre="flecha" />
                </Link>
              </div>
            </section>
          }
          conCuenta={
            <section className="ay-llamado" aria-labelledby="ay-llamado">
              <div className="ay-llamado-tx">
                <span className="t-ceja">Tu cuenta está lista</span>
                <h2 id="ay-llamado" className="ay-h2">
                  Elige lo que te gusta y <em>sepáralo.</em>
                </h2>
                <p className="ay-llamado-x">En «Mis pedidos» ves cada separación, si ya la confirmaron y cuánto falta pagar.</p>
              </div>
              <div className="ay-llamado-acc">
                <Link className="t-btn" href={hrefLista({ categoria: null, orden: "destacado" })}>
                  Ver toda la tienda
                </Link>
                <Link className="ay-enlace" href="/cuenta/pedidos">
                  Ver mis pedidos <Icono nombre="flecha" />
                </Link>
              </div>
            </section>
          }
        />
      </div>
    </MarcoCuenta>
  );
}
