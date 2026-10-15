import Link from "next/link";
import type { CSSProperties } from "react";
import { colorDeDibujo, formaDe, fotoOptimizable, fotosDeTarjeta, hrefDePrenda, type Prenda } from "@/lib/catalogo";
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
import { FotoTarjeta } from "../FotoTarjeta";
import { Icono, type NombreIcono } from "../Icono";
import { TarjetaPrenda } from "../TarjetaPrenda";
import { QuitarEspera } from "./QuitarEspera";

// Los bloques del Club en «Mi cuenta» (ADR-0408, actividad 12; maqueta v4, `vCuenta`), en el orden de la maqueta: Mis beneficios
// del club · Novedades para ti · Favoritos · Te avisamos cuando llegue. («Mis pedidos», que va antes, es de la actividad 7.) Lo que
// dicen sale de lib/club.ts; las prendas, del catálogo de la tienda (el mismo precio y las mismas fotos que la lista), con la misma
// tarjeta y el mismo corazón de la tienda. «Mi cuenta» no vive en el marco del catálogo: a cada tarjeta se le dice si está guardada.

function Bloque({ titulo, guia, children }: { titulo: string; guia: string; children: React.ReactNode }) {
  return (
    <section className="c-bloque" aria-labelledby={`club-${guia}`} data-club={guia}>
      <h2 className="c-bloque-t" id={`club-${guia}`}>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Fila({ icono, b, children }: { icono: NombreIcono; b: Beneficio; children?: React.ReactNode }) {
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

/** Mis beneficios del club: el cumpleaños y el vale, con las reglas que cobra la caja. Sin ficha activa, una nota. */
export function BeneficiosDelClub({ club, hoy }: { club: MiClub["club"]; hoy: Dia }) {
  return (
    <Bloque titulo="Mis beneficios del club" guia="beneficios">
      {club.activa ? (
        <>
          <Fila icono="regalo" b={beneficioCumple(club.cumple, club.conPublicidad, hoy)} />
          <Fila icono="ticket" b={beneficioAniversario(club.aniversario, club.conPublicidad, hoy)} />
          <p className="w-texto-sec">
            Se usan en caja, con tu DNI, uno por compra.{" "}
            <Link className="t-enlace" href="/terminos-del-club">
              Cómo funciona el Club
            </Link>
          </p>
        </>
      ) : (
        <p className="w-nota">
          Tu ficha del Club CAYLA no está activa, así que aquí no vemos tus beneficios. Acércate a cualquier tienda CAYLA y la revisan contigo.
        </p>
      )}
    </Bloque>
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
  return (
    <Bloque titulo="Novedades para ti" guia="novedades">
      <div className="c-novedad">
        <Icono nombre="chispa" />
        <span>
          <b>{tituloNovedades(novedades)}</b>
          <small>{textoNovedades(novedades)}</small>
        </span>
      </div>
      {enCarril.length > 0 && (
        <div className="c-carril">
          {enCarril.map((p) => (
            <TarjetaPrenda key={p.id} prenda={p} sede={null} origenFotos={origenFotos} guardado={favoritos.has(p.id)} />
          ))}
        </div>
      )}
      {novedades.total > enCarril.length && (
        <Link className="t-enlace c-ver" href="/catalogo">
          Ver toda la ropa
        </Link>
      )}
    </Bloque>
  );
}

/** Favoritos: lo que guardó con el corazón, lo último primero. */
export function TusFavoritos({
  prendas,
  sinMostrar,
  origenFotos,
}: {
  prendas: Prenda[];
  /** Cuántos de sus favoritos ya no se ven en la tienda online. */
  sinMostrar: number;
  origenFotos: string | undefined;
}) {
  return (
    <Bloque titulo="Favoritos" guia="favoritos">
      {prendas.length > 0 ? (
        <div className="c-carril">
          {prendas.map((p) => (
            <TarjetaPrenda key={p.id} prenda={p} sede={null} origenFotos={origenFotos} guardado />
          ))}
        </div>
      ) : (
        <p className="w-texto-sec">
          Toca el corazón de una prenda para guardarla aquí.{" "}
          <Link className="t-enlace" href="/catalogo">
            Ver toda la ropa
          </Link>
        </p>
      )}
      {sinMostrar > 0 && (
        <p className="w-texto-sec">{sinMostrar === 1 ? "Uno de tus favoritos ya no está en la tienda online." : `${sinMostrar} de tus favoritos ya no están en la tienda online.`}</p>
      )}
    </Bloque>
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
    <Bloque titulo="Te avisamos cuando llegue" guia="avisos">
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
    </Bloque>
  );
}
