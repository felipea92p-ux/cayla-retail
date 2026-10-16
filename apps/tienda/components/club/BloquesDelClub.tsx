import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { colorDeDibujo, formaDe, fotoOptimizable, fotosDeTarjeta, hrefDePrenda, hrefLista, type Prenda } from "@/lib/catalogo";
import {
  beneficioAniversario,
  beneficioCumple,
  detalleEspera,
  estadoEspera,
  NOVEDADES_EN_EL_CARRIL,
  ordenarEsperas,
  textoNovedades,
  tituloNovedades,
  type Beneficio,
  type Espera,
  type MiClub,
} from "@/lib/club";
import type { Dia } from "@/lib/cuentas";
import { claveDeSede } from "@/lib/sede-elegida";
import { CarrilConFlechas } from "../CarrilConFlechas";
import { SeccionDelPerfil } from "../cuenta/SeccionDelPerfil";
import { FotoTarjeta } from "../FotoTarjeta";
import { Icono, type NombreIcono } from "../Icono";
import { TarjetaPrenda } from "../TarjetaPrenda";
import { QuitarEspera } from "./QuitarEspera";

// Los bloques del Club en «Mi perfil» (ADR-0408, actividad 12; ordenados el 2026-10-15): Mi Club CAYLA (la tarjeta y los beneficios) ·
// Favoritos · Te avisamos cuando llegue · Novedades para ti. («Mis pedidos», que va antes, es de la actividad 7.) Lo que dicen sale de
// lib/club.ts; las prendas, del catálogo de la tienda (el mismo precio y las mismas fotos que la lista), con la misma tarjeta, el mismo
// corazón y el mismo carril con flechas del Inicio. «Mi perfil» no vive en el marco del catálogo: a cada tarjeta se le dice si está guardada.

/** Cuántos favoritos se ven en «Mi perfil»; todos, en la lista de favoritos del catálogo («Ver todos»). */
const FAVORITOS_EN_EL_PERFIL = 12;

/** «Ver todos», «Cómo funciona»: el enlace de la derecha del título de una sección, con su flecha. */
function VerMas({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="t-ver" href={href}>
      {children} <Icono nombre="flecha" />
    </Link>
  );
}

/** Las prendas de una sección en un carril: se desliza con el dedo; con el mouse, sus flechas. */
function Carril({ children }: { children: ReactNode }) {
  return (
    <CarrilConFlechas className="pf-carril">
      <div className="t-carril">{children}</div>
    </CarrilConFlechas>
  );
}

function Fila({ icono, b, children }: { icono: NombreIcono; b: Beneficio; children?: ReactNode }) {
  return (
    <div className="c-novedad" data-disponible={b.disponible || undefined}>
      <Icono nombre={icono} />
      <span>
        <b>{b.titulo}</b>
        <small>{b.texto}</small>
        {b.avance !== null && (
          <span
            className="c-barra"
            role="progressbar"
            aria-label="Lo que llevas este año para tu vale"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(b.avance * 100)}
          >
            <i style={{ "--avance": `${Math.round(b.avance * 100)}%` } as CSSProperties} />
          </span>
        )}
        {children}
      </span>
      {b.disponible && <span className="c-chip">Disponible</span>}
    </div>
  );
}

/**
 * Mi Club CAYLA: su tarjeta y sus dos beneficios (el cumpleaños y el vale), con las reglas que cobra la caja. Sin ficha activa, la
 * tarjeta y una nota. `tarjeta` la dibuja la página (es del navegador: se inclina con el mouse).
 */
export function BeneficiosDelClub({ club, hoy, tarjeta }: { club: MiClub["club"]; hoy: Dia; tarjeta: ReactNode }) {
  return (
    <SeccionDelPerfil id="pf-club" titulo="Mi Club CAYLA" accion={<VerMas href="/terminos-del-club">Cómo funciona</VerMas>} mitad>
      <div className="pf-club">
        <div className="pf-club-fila">
          {tarjeta}
          <div className="pf-beneficios">
            {club.activa ? (
              <>
                <Fila icono="regalo" b={beneficioCumple(club.cumple, club.conPublicidad, hoy)} />
                <Fila icono="ticket" b={beneficioAniversario(club.aniversario, club.conPublicidad, hoy)} />
                <p className="w-texto-sec">Se usan en caja, con tu DNI, uno por compra.</p>
              </>
            ) : (
              <p className="w-nota">
                Tu ficha del Club CAYLA no está activa, así que aquí no vemos tus beneficios. Acércate a cualquier tienda CAYLA y la revisan
                contigo.
              </p>
            )}
          </div>
        </div>
      </div>
    </SeccionDelPerfil>
  );
}

/** Novedades para ti (propuesta i): lo que llegó desde su última visita, sin mensajes de publicidad. */
export function NovedadesParaTi({
  novedades,
  prendas,
  favoritos,
  origenFotos,
}: {
  novedades: MiClub["novedades"];
  /** Las prendas del catálogo de esas novedades, en su orden (las que ya no se ven no llegan). */
  prendas: Prenda[];
  favoritos: ReadonlySet<string>;
  origenFotos: string | undefined;
}) {
  const enCarril = prendas.slice(0, NOVEDADES_EN_EL_CARRIL);
  const verMas =
    novedades.total > 0 ? (
      <VerMas href={hrefLista({ categoria: null, orden: "destacado", lista: "nuevo" })}>Ver lo nuevo</VerMas>
    ) : (
      <VerMas href="/catalogo">Ver la tienda</VerMas>
    );
  return (
    <SeccionDelPerfil id="pf-novedades" titulo="Novedades para ti" accion={verMas}>
      <p className="pf-sec-sub">
        <Icono nombre="chispa" />
        <span>
          <b>{tituloNovedades(novedades)}</b> {textoNovedades(novedades)}
        </span>
      </p>
      {enCarril.length > 0 && (
        <Carril>
          {enCarril.map((p) => (
            <TarjetaPrenda key={p.id} prenda={p} sede={null} origenFotos={origenFotos} guardado={favoritos.has(p.id)} />
          ))}
        </Carril>
      )}
    </SeccionDelPerfil>
  );
}

/** Favoritos: lo que guardó con el corazón, lo último primero. Los que no caben en el carril, en la lista de favoritos del catálogo. */
export function TusFavoritos({
  prendas,
  cuantos,
  sinMostrar,
  origenFotos,
}: {
  prendas: Prenda[];
  /** Cuántos guardó (los mismos que cuenta el corazón de la cabecera). */
  cuantos: number;
  /** Cuántos de sus favoritos ya no se ven en la tienda online. */
  sinMostrar: number;
  origenFotos: string | undefined;
}) {
  return (
    <SeccionDelPerfil
      id="pf-favoritos"
      titulo="Favoritos"
      cuenta={cuantos}
      accion={prendas.length > 0 ? <VerMas href={hrefLista({ categoria: null, orden: "destacado", lista: "favoritos" })}>Ver todos</VerMas> : null}
    >
      {prendas.length > 0 ? (
        <Carril>
          {prendas.slice(0, FAVORITOS_EN_EL_PERFIL).map((p) => (
            <TarjetaPrenda key={p.id} prenda={p} sede={null} origenFotos={origenFotos} guardado />
          ))}
        </Carril>
      ) : (
        <p className="w-texto-sec">
          Toca el corazón de una prenda para guardarla aquí.{" "}
          <Link className="t-enlace" href="/catalogo">
            Ver toda la tienda
          </Link>
        </p>
      )}
      {sinMostrar > 0 && (
        <p className="w-texto-sec">{sinMostrar === 1 ? "Uno de tus favoritos ya no está en la tienda online." : `${sinMostrar} de tus favoritos ya no están en la tienda online.`}</p>
      )}
    </SeccionDelPerfil>
  );
}

function FotoDeEspera({ espera, prenda, origenFotos }: { espera: Espera; prenda: Prenda | undefined; origenFotos: string | undefined }) {
  // La foto de su color; si ese color no tiene, la principal del modelo (propuesta c). Sin catálogo, su silueta en su color.
  const delColor = prenda?.colores.find((c) => c.codigo === espera.color?.codigo)?.foto ?? null;
  const foto = delColor ?? (prenda ? fotosDeTarjeta(prenda)[0] : null);
  return (
    <span className="c-espera-foto" aria-hidden="true">
      <FotoTarjeta
        foto={foto}
        segunda={null}
        optimizar={[foto ? fotoOptimizable(foto, origenFotos) : false, false]}
        nombre={espera.producto}
        forma={formaDe(prenda?.categoria?.prefijo)}
        color={espera.color?.hex ?? (prenda ? colorDeDibujo(prenda) : null)}
      />
    </span>
  );
}

/** Te avisamos cuando llegue: lo que pidió con «Avísame», si ya llegó y dónde hay. */
export function TeAvisamos({ esperas, prendas, origenFotos }: { esperas: Espera[]; prendas: ReadonlyMap<string, Prenda>; origenFotos: string | undefined }) {
  return (
    <SeccionDelPerfil id="pf-avisos" titulo="Te avisamos cuando llegue" cuenta={esperas.length}>
      {esperas.length > 0 ? (
        <div className="c-esperas">
          {ordenarEsperas(esperas).map((e) => {
            const prenda = prendas.get(e.productoId);
            const estado = estadoEspera(e);
            const sede = e.sede?.nombre ? claveDeSede(e.sede.nombre) : null;
            return (
              <div key={e.id} className="c-espera" data-estado={estado.tono}>
                <FotoDeEspera espera={e} prenda={prenda} origenFotos={origenFotos} />
                <span className="c-espera-txt">
                  <b>{e.producto}</b>
                  <small>{detalleEspera(e)}</small>
                  <span className={`c-espera-estado ${estado.tono}`}>
                    {estado.tono === "llego" && <Icono nombre="check" />}
                    {estado.texto}
                  </span>
                  {estado.tono === "llego" && prenda && (
                    <Link className="t-enlace c-ver" href={hrefDePrenda(prenda, sede)}>
                      Verla en la tienda
                    </Link>
                  )}
                </span>
                <QuitarEspera esperaId={e.id} prenda={e.producto} />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="w-texto-sec">Cuando una talla no esté en la tienda que eliges, toca «Avísame» y aparece aquí.</p>
      )}
    </SeccionDelPerfil>
  );
}
