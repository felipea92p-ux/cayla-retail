import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { rehacerCuenta } from "@/app/acciones/cuenta";
import { BeneficiosDelClub, NovedadesParaTi, TeAvisamos, TusFavoritos } from "@/components/club/BloquesDelClub";
import { AtajosDelPerfil } from "@/components/cuenta/AtajosDelPerfil";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { MisPedidosEnLaCuenta } from "@/components/cuenta/MisPedidosEnLaCuenta";
import { SeccionDelPerfil } from "@/components/cuenta/SeccionDelPerfil";
import { TuCuentaWeb } from "@/components/cuenta/TuCuentaWeb";
import { TarjetaClub } from "@/components/TarjetaClub";
import type { Prenda } from "@/lib/catalogo";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { leerMiClubEnBase } from "@/lib/club-servidor";
import { hoyLima } from "@/lib/cuentas";
import { MENSAJES } from "@/lib/cuentas-mensajes";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { hrefConVolver } from "@/lib/entrada";
import { conciliarCorreo } from "@/lib/mi-cuenta-servidor";
import { leerMisPedidos } from "@/lib/pedidos-servidor";
import { lineaDeMiembro, resumenAvisos, resumenClub, resumenFavoritos, resumenPedidos } from "@/lib/perfil";
import { anioLima } from "@/lib/portada";
import { leerSesion } from "@/lib/sesion-servidor";
import "../estilos/catalogo.css";
import "../estilos/club.css";
import "../estilos/mi-cuenta.css";
import "../estilos/perfil.css";

export const metadata: Metadata = { title: "Mi perfil · CAYLA", robots: { index: false, follow: false } };

/**
 * «Mi perfil» (maqueta v4, `vCuenta`; ordenada el 2026-10-15, Felipe: «podría estar mejor distribuido, más ordenado y entendible»). Arriba
 * el saludo y cuatro cuadros que dicen de un vistazo cómo están sus pedidos, su Club, sus favoritos y sus avisos, y llevan a su sección.
 * Después, una sección por tema, en el orden en que se buscan: Mis pedidos (los últimos; todos en `/cuenta/pedidos`) y Mi Club CAYLA (la
 * tarjeta y sus beneficios, con las reglas que cobra la caja), lado a lado en la computadora; Favoritos, Te avisamos cuando llegue y
 * Novedades para ti (lo que llegó desde su última visita), con las prendas en un carril; y al final Tu cuenta (el correo, «Cerrar sesión»
 * y «Eliminar mi cuenta»). Lo que el aviso del Inicio deja de mostrar con «Entendido» sigue siempre aquí. Si la base no contesta, el
 * perfil se ve igual y cada parte dice que no se pudo cargar.
 */
export default async function MiCuenta({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { aviso } = await searchParams;
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  if (sesion.estado === "sin_respuesta") {
    return <NoDisponible texto="No pudimos revisar tu sesión ahora. Vuelve a intentarlo en unos minutos." />;
  }

  // La cuenta, sus pedidos, el Club (que anota la visita) y el catálogo (para dibujar las prendas con su precio) a la vez.
  const [lectura, pedidos, club, catalogo] = await Promise.all([
    leerMiCuentaEnBase(sesion.usuarioId),
    leerMisPedidos(sesion.usuarioId),
    leerMiClubEnBase(sesion.usuarioId),
    leerCatalogo(null),
  ]);
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
              <span className="t-ceja">Mi perfil</span>
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
  // El correo de entrada: el que dice el proyecto de clientes manda (un código confirmado que la base no llegó a anotar se concilia).
  const correoDeEntrada = await conciliarCorreo(sesion.usuarioId, sesion.correo, cuenta.correo);
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

  const tarjeta = <TarjetaClub nombre={cuenta.nombre} desde={cuenta.clubDesde ?? anioLima()} />;
  // Una cuenta simple (ADR-0438) todavía no es del Club: en vez de beneficios y tarjeta, la invitación a completar sus datos.
  const esDelClub = cuenta.esDelClub;

  return (
    <MarcoCuenta conCuenta enPagina="cuenta" conPie>
      <div className="t-ancho">
        <div className="pf-perfil">
          <header className="pf-cab">
            <span className="t-ceja">Mi perfil</span>
            <h1>
              Hola, <em>{cuenta.nombreCorto}.</em>
            </h1>
            <p className="pf-cab-linea">{lineaDeMiembro(miClub?.club ?? null, esDelClub ? (cuenta.clubDesde ?? anioLima()) : null)}</p>
            {aviso === "avisos-sin-activar" && (
              // Recién creada la cuenta: marcó los avisos, pero su ficha del Club ya tenía otro celular (la web no lo cambia).
              <p className="w-nota" role="status">
                {MENSAJES.avisosSinActivar}
              </p>
            )}
          </header>

          <AtajosDelPerfil
            atajos={[
              { ancla: "pf-pedidos", icono: "pedido", nombre: "Mis pedidos", resumen: resumenPedidos(pedidos.estado === "ok" ? pedidos.pedidos : null) },
              { ancla: "pf-club", icono: "regalo", nombre: "Mi Club", resumen: resumenClub(miClub?.club ?? null, esDelClub) },
              { ancla: "pf-favoritos", icono: "corazon", nombre: "Favoritos", resumen: resumenFavoritos(miClub ? miClub.favoritos.length : null) },
              { ancla: "pf-avisos", icono: "campana", nombre: "Te avisamos", resumen: resumenAvisos(miClub?.esperas ?? null) },
            ]}
          />

          <div className="pf-cuerpo">
            <MisPedidosEnLaCuenta lectura={pedidos} origenFotos={origenFotos} />
            {miClub ? (
              <>
                {esDelClub ? (
                  <BeneficiosDelClub club={miClub.club} hoy={hoy} tarjeta={tarjeta} />
                ) : (
                  // Todavía no es del Club: lo que gana y el camino, sin tarjeta con un año que no es suyo.
                  <SeccionDelPerfil id="pf-club" titulo="Mi Club CAYLA" mitad>
                    <div className="pf-club">
                      <div className="pf-club-fila">
                        <div className="pf-beneficios">
                          <p className="w-texto-sec">
                            Con tu documento y tu celular entras al Club: descuento en tu cumpleaños y un vale de compra por cada año. Son los mismos
                            datos que pide «Separar», y se piden una sola vez.
                          </p>
                          <Link className="t-btn t-btn-chico" href={hrefConVolver("/cuenta/club", null)}>
                            Completar mis datos y entrar al Club
                          </Link>
                        </div>
                      </div>
                    </div>
                  </SeccionDelPerfil>
                )}
                <TusFavoritos
                  prendas={deIds(miClub.favoritos)}
                  cuantos={miClub.favoritos.length}
                  sinMostrar={catalogo ? miClub.favoritos.filter((id) => !porId.has(id)).length : 0}
                  origenFotos={origenFotos}
                />
                <TeAvisamos esperas={miClub.esperas} prendas={porId} origenFotos={origenFotos} />
                <NovedadesParaTi novedades={miClub.novedades} prendas={deIds(miClub.novedades.productos)} favoritos={favoritos} origenFotos={origenFotos} />
              </>
            ) : (
              // Sin el Club (la base no contestó): la tarjeta igual (es de la cuenta) y una sola nota para lo que falta.
              <SeccionDelPerfil id="pf-club" titulo="Mi Club CAYLA" mitad>
                <div className="pf-club">
                  <div className="pf-club-fila">
                    {tarjeta}
                    <div className="pf-beneficios" role="status">
                      <p className="w-texto-sec">No pudimos cargar tus beneficios, tus favoritos y tus avisos ahora. Vuelve a intentarlo en unos minutos.</p>
                      <Link className="t-btn t-btn-sec t-btn-chico c-reintentar" href="/cuenta">
                        Volver a intentar
                      </Link>
                    </div>
                  </div>
                </div>
              </SeccionDelPerfil>
            )}
            {/* Su correo de entrada, «Cambiar mi correo», «Cerrar sesión» y «Eliminar mi cuenta» (Felipe 2026-10-15). */}
            <TuCuentaWeb correo={correoDeEntrada} />
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
            <span className="t-ceja">Mi perfil</span>
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
