import type { Metadata } from "next";
import Link from "next/link";
import { NotaAyuda } from "@/components/ayuda/NotaAyuda";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { avisosParaSeparar, pasosParaSeparar } from "@/lib/ayuda";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { hrefLista } from "@/lib/catalogo";
import { haySesion } from "@/lib/sesion-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../estilos/ayuda.css";

export const metadata: Metadata = {
  title: "Cómo separar · CAYLA",
  description: "Separa online sin pagar en la web, confírmalo por WhatsApp y recógelo en tu tienda CAYLA.",
};

/**
 * «Cómo separar» (ADR-0408, actividad 5; maqueta v4, `vComoSeparar`): los cuatro pasos y los dos avisos, con y sin cuenta (el pie de
 * todas las páginas la enlaza). Las tiendas son las de la web y los plazos, los del ERP (`retail.tienda_ayuda()`): nada escrito a mano que
 * pueda quedar viejo. Sin base, los pasos salen sin nombres y los avisos sin número. Termina en lo que sigue (revisión 2026-10-15): sin
 * cuenta, crearla (o entrar); con cuenta, el primer paso ya sale hecho y el botón lleva a toda la tienda (como la bolsa vacía). Antes la
 * página acababa en las notas y no llevaba a ningún lado.
 */
export default async function ComoSeparar() {
  const [conCuenta, plazos, sedes] = await Promise.all([haySesion(), leerAyuda(), leerSedes()]);
  const { confirmar, recoger } = avisosParaSeparar(plazos);
  return (
    <MarcoCuenta conCuenta={conCuenta} conPie>
      <div className="t-ancho t-angosto w-pagina-form">
        <article className="w-ficha w-pagina-ayuda">
          <div>
            <span className="t-ceja">Ayuda</span>
            <h1 className="w-titulo">
              Separa online, <em>recoge en tu tienda.</em>
            </h1>
          </div>
          <ol className="w-pasos">
            {pasosParaSeparar(
              sedes.map((s) => s.nombre),
              conCuenta,
            ).map((p) => (
              <li key={p.titulo} data-hecho={p.hecho ? "" : undefined}>
                <span>
                  <b>{p.titulo}</b>
                  <small>{p.texto}</small>
                </span>
              </li>
            ))}
          </ol>
          <div className="w-ayuda-notas">
            <NotaAyuda icono="reloj" {...confirmar} />
            <NotaAyuda icono="tienda" {...recoger}>
              <Link className="t-enlace w-ayuda-enlace" href="/tiendas">
                Ver dónde están nuestras tiendas
              </Link>
            </NotaAyuda>
          </div>
          <div className="w-ayuda-acciones">
            {conCuenta ? (
              <Link className="t-btn t-btn-ancho" href={hrefLista({ categoria: null, orden: "destacado" })}>
                Ver toda la tienda
              </Link>
            ) : (
              <>
                <Link className="t-btn t-btn-ancho" href="/crear-cuenta">
                  Crear mi cuenta
                </Link>
                <Link className="t-enlace w-ayuda-enlace" href="/entrar">
                  Ya tengo cuenta · Entrar
                </Link>
              </>
            )}
          </div>
        </article>
      </div>
    </MarcoCuenta>
  );
}
