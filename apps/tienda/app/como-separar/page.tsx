import type { Metadata } from "next";
import { Icono, type NombreIcono } from "@/components/Icono";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { avisosParaSeparar, pasosParaSeparar } from "@/lib/ayuda";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { haySesion } from "@/lib/sesion-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../estilos/ayuda.css";

export const metadata: Metadata = {
  title: "Cómo separar · CAYLA",
  description: "Separa online sin pagar en la web, confírmalo por WhatsApp y recógelo en tu tienda CAYLA.",
};

/**
 * «Cómo separar» (ADR-0408, actividad 5; maqueta v4, `vComoSeparar`): los cuatro pasos y los dos avisos, con y sin cuenta (el pie de la
 * portada la enlaza). Las tiendas son las de la web y los plazos, los del ERP (`retail.tienda_ayuda()`): nada escrito a mano que pueda
 * quedar viejo. Sin base, los pasos salen sin nombres y los avisos sin número.
 */
export default async function ComoSeparar() {
  const [conCuenta, plazos, sedes] = await Promise.all([haySesion(), leerAyuda(), leerSedes()]);
  const { confirmar, pagar, recoger } = avisosParaSeparar(plazos);
  return (
    <MarcoCuenta conCuenta={conCuenta} conPie>
      <div className="t-ancho t-angosto w-pagina-form">
        <article className="w-ficha w-pagina-ayuda">
          <h1 className="w-titulo">
            Separa online, <em>recoge en tu tienda.</em>
          </h1>
          <ol className="w-pasos">
            {pasosParaSeparar(sedes.map((s) => s.nombre)).map((p) => (
              <li key={p.titulo}>
                <span>
                  <b>{p.titulo}</b>
                  <small>{p.texto}</small>
                </span>
              </li>
            ))}
          </ol>
          <Nota icono="reloj" {...confirmar} />
          <Nota icono="ticket" {...pagar} />
          <Nota icono="tienda" {...recoger} />
        </article>
      </div>
    </MarcoCuenta>
  );
}

function Nota({ icono, titulo, texto }: { icono: NombreIcono; titulo: string; texto: string }) {
  return (
    <div className="w-info">
      <Icono nombre={icono} />
      <span>
        <b>{titulo}</b>
        <small>{texto}</small>
      </span>
    </div>
  );
}
