import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoAyuda } from "@/components/ayuda/EncabezadoAyuda";
import { NotaAyuda } from "@/components/ayuda/NotaAyuda";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { SegunSesion } from "@/components/cuenta/SegunSesion";
import { Icono } from "@/components/Icono";
import { reglasDelClub } from "@/lib/club-publico";
import { leerConfigDePuntosDelClub } from "@/lib/puntos-servidor";
import "../estilos/ayuda.css";

export const metadata: Metadata = {
  title: "Club CAYLA · CAYLA",
  description: "Gana puntos en cada compra en CAYLA, cámbialos por cupones y recibe puntos de regalo en tu cumpleaños.",
};

/**
 * El Club CAYLA, para todos (rediseño Premium, 2026-11-07): antes se explicaba repartido entre el Inicio, «Entrar», «Cómo separar» y los
 * Términos, y «Mi Club» (/cuenta/club) pide sesión. Aquí, las reglas de los puntos con las cifras de la caja (`reglasDelClub`) y lo que
 * sigue según la sesión: crear la cuenta o entrar, o ir a «Mi Club». El detalle legal sigue en los Términos del Club.
 */
export default async function ClubPublico() {
  const config = await leerConfigDePuntosDelClub();
  const reglas = reglasDelClub(config);
  return (
    <MarcoCuenta segunSesion conPie>
      <div className="t-ancho ay-pagina">
        <EncabezadoAyuda
          ceja="Club CAYLA"
          titulo={
            <>
              Tu cuenta es tu <em>invitación.</em>
            </>
          }
          bajada="Es gratis. Entras al Club al completar tu documento y tu celular, y desde ahí cada compra suma."
        />

        <section className="ay-bloque" aria-labelledby="club-puntos">
          <div className="ay-bloque-cab">
            <span className="t-ceja">Tus puntos</span>
            <h2 id="club-puntos" className="ay-h2">
              Cómo funcionan tus <em>puntos</em>
            </h2>
          </div>
          <div className="ay-puntos">
            {reglas.map((r) => (
              <NotaAyuda key={r.titulo} icono={r.icono} titulo={r.titulo} texto={r.texto} />
            ))}
          </div>
          <p className="ay-llamado-x">
            <Link className="ay-enlace" href="/terminos-del-club">
              Lee los Términos del Club <Icono nombre="flecha" />
            </Link>
          </p>
        </section>

        <SegunSesion
          visitante={
            <section className="ay-llamado" aria-labelledby="club-llamado">
              <div className="ay-llamado-tx">
                <span className="t-ceja">Para empezar</span>
                <h2 id="club-llamado" className="ay-h2">
                  Crea tu cuenta y forma parte del <em>Club CAYLA.</em>
                </h2>
                <p className="ay-llamado-x">El catálogo es de todos: la cuenta la creas cuando quieras separar algo o guardar tus favoritos.</p>
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
            <section className="ay-llamado" aria-labelledby="club-llamado">
              <div className="ay-llamado-tx">
                <span className="t-ceja">Tu Club</span>
                <h2 id="club-llamado" className="ay-h2">
                  Mira tus puntos y tus <em>cupones.</em>
                </h2>
                <p className="ay-llamado-x">En «Mi Club» ves tu saldo, su historial y lo que puedes canjear hoy.</p>
              </div>
              <div className="ay-llamado-acc">
                <Link className="t-btn" href="/cuenta/club">
                  Ver mi Club
                </Link>
              </div>
            </section>
          }
        />
      </div>
    </MarcoCuenta>
  );
}
