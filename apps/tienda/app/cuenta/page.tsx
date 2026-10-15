import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { rehacerCuenta, salir } from "@/app/acciones/cuenta";
import { BeneficiosDelClub, NovedadesParaTi, TeAvisamos, TusFavoritos } from "@/components/club/BloquesDelClub";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { TarjetaClub } from "@/components/TarjetaClub";
import type { Prenda } from "@/lib/catalogo";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { fraseDeLaCabecera } from "@/lib/club";
import { leerMiClubEnBase } from "@/lib/club-servidor";
import { hoyLima, MENSAJES } from "@/lib/cuentas";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { anioLima } from "@/lib/portada";
import { leerSesion } from "@/lib/sesion-servidor";
import "../estilos/catalogo.css";
import "../estilos/club.css";

export const metadata: Metadata = { title: "Mi cuenta · CAYLA", robots: { index: false, follow: false } };

/**
 * «Mi cuenta» (maqueta v4, `vCuenta`): a la izquierda el saludo, la tarjeta del Club y «Salir» (fija al bajar, desde 960 px); a la
 * derecha, los bloques del Club de ESA persona (actividad 12): Mis beneficios del club (su cumpleaños y su vale, con las reglas que
 * cobra la caja), Novedades para ti (lo que llegó desde su última visita), Favoritos y Te avisamos cuando llegue. «Mis pedidos»
 * (actividad 7, `/cuenta/pedidos`) va ANTES de los beneficios y lo pone la integración. Si la base no contesta, la cuenta se ve
 * igual y los bloques del Club dicen que no se pudieron cargar.
 */
export default async function MiCuenta({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { aviso } = await searchParams;
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  if (sesion.estado === "sin_respuesta") {
    return <NoDisponible texto="No pudimos revisar tu sesión ahora. Vuelve a intentarlo en unos minutos." />;
  }

  // La cuenta, el Club (que anota la visita) y el catálogo (para dibujar las prendas con su precio) a la vez.
  const [lectura, club, catalogo] = await Promise.all([leerMiCuentaEnBase(sesion.usuarioId), leerMiClubEnBase(sesion.usuarioId), leerCatalogo(null)]);
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
  const hoy = hoyLima();
  const miClub = club.estado === "ok" ? club.club : null;
  // Las prendas del catálogo por su modelo: el mismo precio (con «Todas», el mayor) y las mismas fotos que la lista.
  const porId = new Map<string, Prenda>((catalogo?.prendas ?? []).map((p) => [p.id, p]));
  const deIds = (ids: readonly string[]) => ids.flatMap((id) => {
    const p = porId.get(id);
    return p ? [p] : [];
  });
  const favoritos = new Set(miClub?.favoritos ?? []);
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;

  return (
    <MarcoCuenta conCuenta enPagina="cuenta" conPie>
      <div className="t-ancho">
        <div className="t-cuenta-pag c-con-club">
          <div className="t-cuenta-cab">
            <span className="t-ceja">Mi cuenta</span>
            <h1>
              Hola, <em>{cuenta.nombreCorto}.</em>
            </h1>
            <TarjetaClub nombre={cuenta.nombre} desde={cuenta.clubDesde ?? anioLima()} />
            <p className="w-texto-sec">
              {miClub
                ? fraseDeLaCabecera(miClub.club, hoy)
                : `Eres miembro del Club CAYLA.${cuenta.cumple ? ` Tu descuento de cumpleaños llega el ${cuenta.cumple}.` : ""}`}
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

          <div className="c-bloques">
            {miClub ? (
              <>
                <BeneficiosDelClub club={miClub.club} hoy={hoy} />
                <NovedadesParaTi novedades={miClub.novedades} prendas={deIds(miClub.novedades.productos)} favoritos={favoritos} origenFotos={origenFotos} />
                <TusFavoritos
                  prendas={deIds(miClub.favoritos)}
                  sinMostrar={catalogo ? miClub.favoritos.filter((id) => !porId.has(id)).length : 0}
                  origenFotos={origenFotos}
                />
                <TeAvisamos esperas={miClub.esperas} prendas={porId} origenFotos={origenFotos} />
              </>
            ) : (
              <div className="c-bloque" role="status">
                <h2 className="c-bloque-t">Tu Club CAYLA</h2>
                <p className="w-texto-sec">No pudimos cargar tus beneficios, tus novedades y tus favoritos ahora. Vuelve a intentarlo en unos minutos.</p>
                <Link className="t-btn t-btn-sec t-btn-chico c-reintentar" href="/cuenta">
                  Volver a intentar
                </Link>
              </div>
            )}
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
