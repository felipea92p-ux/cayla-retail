import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { FormularioRecomendacion } from "@/components/recomendaciones/FormularioRecomendacion";
import { MisRecomendaciones } from "@/components/recomendaciones/MisRecomendaciones";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { quedanHoy } from "@/lib/recomendaciones";
import { leerMisRecomendaciones } from "@/lib/recomendaciones-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../estilos/club.css";
import "../estilos/recomendaciones.css";

export const metadata: Metadata = { title: "Recomendaciones · CAYLA", robots: { index: false, follow: false } };

// Todavía no se arma por adelantado (ADR-0432, fase 3): lee la cuenta antes de pintar nada. Sale de aquí cuando su cáscara esté lista.
export const instant = false;

/**
 * «Recomendaciones» (ADR-0408, Felipe 2026-10-15): «un apartado de recomendaciones donde el cliente puede escribir libremente cualquier
 * sugerencia adicional que pueda tener para la tienda o la empresa». Con cuenta (el proxy manda a «Entrar» a quien no la tiene), porque
 * va SIEMPRE con su nombre: CAYLA la lee en el ERP (Clientes ▸ Recomendaciones) y le responde aquí. A la izquierda, escribirla (sobre
 * qué tienda o CAYLA en general, el texto con sus letras contadas); a la derecha, «Lo que nos escribiste» con las respuestas.
 */
export default async function Recomendaciones() {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  if (sesion.estado === "sin_respuesta") {
    return <NoDisponible texto="No pudimos revisar tu sesión ahora. Vuelve a intentarlo en unos minutos." />;
  }

  // Su nombre (va con la recomendación), las suyas y las tiendas de la web, a la vez.
  const [cuenta, mias, sedes] = await Promise.all([leerMiCuentaEnBase(sesion.usuarioId), leerMisRecomendaciones(sesion.usuarioId), leerSedes()]);
  if (cuenta.estado === "sin_respuesta") {
    return <NoDisponible texto="No pudimos cargar tu cuenta ahora. Vuelve a intentarlo en unos minutos." />;
  }
  if (cuenta.estado === "sin_cuenta") redirect("/cuenta");

  const tope = mias.estado === "ok" ? mias.mias.tope : 3;
  return (
    <MarcoCuenta conCuenta conPie>
      <div className="t-ancho">
        <div className="r-pag">
          <div className="r-cab">
            <span className="t-ceja">Recomendaciones</span>
            <h1>
              Cuéntanos cómo <em>mejorar.</em>
            </h1>
            <p className="w-texto-sec">
              Una idea, algo que te gustaría encontrar en una tienda o algo que podamos hacer mejor. Lo lee el equipo de CAYLA.
            </p>
            <FormularioRecomendacion
              sedes={sedes.map((s) => ({ id: s.id, nombre: s.nombre }))}
              nombre={cuenta.cuenta.nombre}
              nombreCorto={cuenta.cuenta.nombreCorto}
              tope={tope}
              // Si la base no contestó cuántas lleva, se deja escribir: la base pone el tope igual al enviar.
              quedanHoy={mias.estado === "ok" ? quedanHoy(mias.mias) : tope}
            />
          </div>
          <MisRecomendaciones lectura={mias} />
        </div>
      </div>
    </MarcoCuenta>
  );
}

function NoDisponible({ texto }: { texto: string }) {
  return (
    <MarcoCuenta conCuenta>
      <div className="t-ancho t-angosto w-pagina-form">
        <div className="w-ficha">
          <div>
            <span className="t-ceja">Recomendaciones</span>
            <h1 className="w-titulo">Un momento</h1>
            <p className="w-texto-sec">{texto}</p>
          </div>
          <Link className="t-btn t-btn-ancho t-btn-sec" href="/recomendaciones">
            Volver a intentar
          </Link>
        </div>
      </div>
    </MarcoCuenta>
  );
}
