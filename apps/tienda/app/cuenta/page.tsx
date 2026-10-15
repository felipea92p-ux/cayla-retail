import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { rehacerCuenta, salir } from "@/app/acciones/cuenta";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { TarjetaClub } from "@/components/TarjetaClub";
import { MENSAJES } from "@/lib/cuentas";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { anioLima } from "@/lib/portada";
import { leerSesion } from "@/lib/sesion-servidor";

export const metadata: Metadata = { title: "Mi cuenta · CAYLA", robots: { index: false, follow: false } };

/**
 * «Mi cuenta», por ahora mínima (maqueta, `vCuenta`, la cabecera de la página): el saludo, la tarjeta del Club y «Salir». Los
 * pedidos, los beneficios, las novedades y los datos llegan con sus actividades. Al entrar o crear la cuenta se llega aquí (el
 * Inicio con el catálogo lo arma otra actividad).
 */
export default async function MiCuenta({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { aviso } = await searchParams;
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  if (sesion.estado === "sin_respuesta") {
    return <NoDisponible texto="No pudimos revisar tu sesión ahora. Vuelve a intentarlo en unos minutos." />;
  }

  const lectura = await leerMiCuentaEnBase(sesion.usuarioId);
  if (lectura.estado === "sin_respuesta") {
    return <NoDisponible texto="No pudimos cargar tu cuenta ahora. Vuelve a intentarlo en unos minutos." />;
  }
  if (lectura.estado === "sin_cuenta") {
    // El usuario existe en el proyecto de clientes, pero la base no tiene su cuenta: la creación quedó a medias.
    return (
      <MarcoCuenta conCuenta enPagina="cuenta">
        <div className="t-ancho t-angosto w-pagina-form">
          <div className="w-ficha">
            <div>
              <span className="t-ceja">Mi cuenta</span>
              <h1 className="w-titulo">
                Tu cuenta <em>no terminó de crearse.</em>
              </h1>
              <p className="w-texto-sec">Algo falló mientras la creabas y no quedó guardada. Vuelve a crearla: tu correo queda libre para usarlo otra vez.</p>
            </div>
            <form action={rehacerCuenta}>
              <button className="t-btn t-btn-ancho" type="submit">
                Crear mi cuenta otra vez
              </button>
            </form>
          </div>
        </div>
      </MarcoCuenta>
    );
  }

  const { cuenta } = lectura;
  return (
    <MarcoCuenta conCuenta enPagina="cuenta" conPie>
      <div className="t-ancho t-angosto">
        <div className="t-cuenta-pag">
          <div className="t-cuenta-cab">
            <span className="t-ceja">Mi cuenta</span>
            <h1>
              Hola, <em>{cuenta.nombreCorto}.</em>
            </h1>
            <TarjetaClub nombre={cuenta.nombre} desde={cuenta.clubDesde ?? anioLima()} />
            <p className="w-texto-sec">
              Eres miembro del Club CAYLA.{cuenta.cumple ? ` Tu descuento de cumpleaños llega el ${cuenta.cumple}.` : ""}
            </p>
            {aviso === "avisos-sin-activar" && (
              // Recién creada la cuenta: marcó los avisos, pero su ficha del Club ya tenía otro celular (la web no lo cambia).
              <p className="w-nota" role="status">
                {MENSAJES.avisosSinActivar}
              </p>
            )}
            <form action={salir}>
              <button className="t-enlace" type="submit">
                Salir de mi cuenta
              </button>
            </form>
          </div>
        </div>
      </div>
    </MarcoCuenta>
  );
}

function NoDisponible({ texto }: { texto: string }) {
  return (
    <MarcoCuenta conCuenta enPagina="cuenta">
      <div className="t-ancho t-angosto w-pagina-form">
        <div className="w-ficha">
          <div>
            <span className="t-ceja">Mi cuenta</span>
            <h1 className="w-titulo">Un momento</h1>
            <p className="w-texto-sec">{texto}</p>
          </div>
          <Link className="t-btn t-btn-ancho t-btn-sec" href="/cuenta">
            Volver a intentar
          </Link>
        </div>
      </div>
    </MarcoCuenta>
  );
}
