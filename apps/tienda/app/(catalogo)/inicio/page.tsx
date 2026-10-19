import type { Metadata } from "next";
import Link from "next/link";
import { AsiSeSepara } from "@/components/AsiSeSepara";
import { AvisoAlEntrar } from "@/components/AvisoAlEntrar";
import { CarrilConFlechas } from "@/components/CarrilConFlechas";
import { HeroeDelInicio } from "@/components/HeroeDelInicio";
import { Icono } from "@/components/Icono";
import { TarjetaLook } from "@/components/looks/TarjetaLook";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { PendienteDelEnlace } from "@/components/PendienteDelEnlace";
import { SeccionClub } from "@/components/SeccionClub";
import { TarjetaPrenda } from "@/components/TarjetaPrenda";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import {
  campanasDe,
  filtrarYOrdenar,
  hrefLista,
  leerCampana,
  type Prenda,
} from "@/lib/catalogo";
import { leerBeneficiosDelClub, leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { hoyLima } from "@/lib/cuentas";
import { heroDelInicio } from "@/lib/inicio";
import { avisoAlEntrar, avisosDeRespuestas } from "@/lib/inicio-aviso";
import { avisosVistos, leerAvisosDelClub } from "@/lib/inicio-aviso-servidor";
import { leerMisRecomendaciones } from "@/lib/recomendaciones-servidor";
import { hrefLooks } from "@/lib/looks";
import { leerLooks } from "@/lib/looks-servidor";
import { leerPortada } from "@/lib/portada-servidor";
import { anioLima, fechaCorta, pctTexto } from "@/lib/portada";
import { claveDeSede, sedesEnOrden } from "@/lib/sede-elegida";
import { sedeDeLaPagina } from "@/lib/sede-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import { hayEnTienda, notaDeStock } from "@/lib/stock";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../../estilos/tiendas.css";
import "../../estilos/looks.css";
import "../../estilos/inicio.css";

export const metadata: Metadata = { title: "Inicio · CAYLA" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** El Inicio con la tienda elegida (`?sede=`) y, si se eligió, la campaña de las ofertas (`?oferta=`). */
const hrefInicio = (sede: string | null, oferta: string | null = null) => {
  const q = new URLSearchParams();
  if (sede) q.set("sede", sede);
  if (oferta) q.set("oferta", oferta);
  const s = q.toString();
  return s ? `/inicio?${s}` : "/inicio";
};

// El Inicio de la tienda, para todos (maqueta v4, `vInicio`; sin cuenta desde el 2026-10-17): arriba, si tiene algo del Club a su favor que todavía no cerró, el aviso al
// entrar (Felipe, 2026-10-14: es adonde se llega al iniciar sesión); el héroe de la campaña vigente (o «Lo nuevo» si no hay), las
// categorías, Lo nuevo, «Arma tu look» (si hay looks), las ofertas de cada campaña, los más vendidos (sin cifras), cómo se separa, el Club
// y nuestras tiendas. Todo respeta la tienda elegida en «Ver lo que hay en»: el precio es el de esa tienda y, si hay una elegida, solo
// sale lo que hay en ella. Una sola lectura del catálogo (`tienda_catalogo` ya trae Lo nuevo y el puesto en Más vendidos); se lee en
// cada visita.
export default async function Inicio({ searchParams }: Props) {
  const sp = await searchParams;
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = await sedeDeLaPagina(sp, sedes, "/inicio", claveDeSede);
  const [catalogo, { campana }, sesion, lecturaLooks, beneficios] = await Promise.all([
    leerCatalogo(pedida?.id ?? null),
    leerPortada(),
    leerSesion(),
    leerLooks(pedida?.id ?? null),
    leerBeneficiosDelClub(),
  ]);
  const [lectura, avisosDelClub, mias, vistos] =
    sesion.estado === "con_sesion"
      ? await Promise.all([
          leerMiCuentaEnBase(sesion.usuarioId),
          leerAvisosDelClub(sesion.usuarioId),
          // «CAYLA te respondió» (hoja nueva de Recomendaciones, 2026-10-17): sus respuestas de los últimos 30 días, en el mismo aviso.
          leerMisRecomendaciones(sesion.usuarioId),
          avisosVistos(),
        ])
      : [null, null, null, new Set<string>()];
  const respuestas = sesion.estado === "con_sesion" && mias?.estado === "ok" ? avisosDeRespuestas(mias.mias.recomendaciones, sesion.usuarioId, hoyLima()) : [];
  // Si una de las dos lecturas no contestó, sale lo de la otra: un aviso a medias es mejor que ninguno, y lo demás sigue en su página.
  const avisos = avisosDelClub || respuestas.length > 0 ? [...(avisosDelClub ?? []), ...respuestas] : null;
  const cuenta = lectura?.estado === "cuenta" ? lectura.cuenta : null;
  // Sin sesión el Inicio es el mismo (Felipe 2026-10-17): lo que cambia es que «Así se separa» y el Club invitan a crear la cuenta.
  const conSesion = sesion.estado !== "sin_sesion";
  const aviso = avisos ? avisoAlEntrar(avisos, vistos) : null;
  // Sin looks (o si la base no los dio), la sección no sale.
  const looks = lecturaLooks?.looks ?? [];

  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base ya respondió con «Todas»).
  const elegida = catalogo?.sede ? sedes.find((s) => s.id === catalogo.sede) ?? null : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const prendas = (catalogo?.prendas ?? []).filter((p) => hayEnTienda(p.stock, elegida?.id ?? null));
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  const nota = (p: Prenda) => notaDeStock(p.stock, elegida, sedes);

  const hero = heroDelInicio(campana, prendas);
  const nuevos = filtrarYOrdenar(prendas, { categoria: null, orden: "destacado", lista: "nuevo" });
  const ofertas = filtrarYOrdenar(prendas, { categoria: null, orden: "destacado", lista: "ofertas" });
  const campanas = campanasDe(prendas);
  const ofertaElegida = campanas.find((c) => c.id === leerCampana(sp.oferta)) ?? null;
  const ofertasVistas = ofertaElegida ? ofertas.filter((p) => p.campana?.id === ofertaElegida.id) : ofertas;
  const vendidos = filtrarYOrdenar(prendas, { categoria: null, orden: "destacado", lista: "vendidos" }).slice(0, 8);
  const lista = (l: "nuevo" | "ofertas" | "vendidos", campanaId: string | null = null) =>
    hrefLista({ sede, categoria: null, orden: "destacado", lista: l, campana: campanaId });

  return (
    <MarcoCatalogo
      prendas={prendas}
      sede={sede}
      actual="inicio"
      filtro={[
        { nombre: "Todas", href: hrefInicio(null), actual: elegida === null },
        ...sedes.map((s) => ({ nombre: s.nombre, href: hrefInicio(claveDeSede(s.nombre)), actual: elegida?.id === s.id })),
      ]}
    >
      {aviso && avisos && <AvisoAlEntrar aviso={aviso} activas={avisos.map((a) => a.clave)} />}
      <HeroeDelInicio hero={hero} sede={sede} origenFotos={origenFotos} verCampana={lista("ofertas", hero.tipo === "campana" ? hero.campanaId : null)} verNuevo={nuevos.length > 0 ? lista("nuevo") : null} />

      {catalogo === null ? (
        <div className="t-ancho">
          <div className="t-vacio" role="status">
            <Icono nombre="tienda" />
            <h3>No pudimos cargar las prendas</h3>
            <p>Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.</p>
            <Link className="t-btn" href={hrefInicio(pedida ? claveDeSede(pedida.nombre) : null)}>
              Volver a intentar
            </Link>
          </div>
        </div>
      ) : (
        <>
          {nuevos.length > 0 && (
            <section className="t-sec t-ancho" aria-labelledby="lo-nuevo">
              <div className="t-sec-cab">
                <div>
                  <h2 id="lo-nuevo">
                    Lo <em>nuevo</em>
                  </h2>
                </div>
                <Link className="t-ver" href={lista("nuevo")}>
                  Ver todo <b>{nuevos.length}</b>
                  <Icono nombre="flecha" />
                </Link>
              </div>
              <CarrilConFlechas className="t-carril-inicio">
                <div className="t-carril">
                  {nuevos.slice(0, 10).map((p) => (
                    <TarjetaPrenda key={p.id} prenda={p} sede={sede} origenFotos={origenFotos} nota={nota(p)} sinNuevo />
                  ))}
                </div>
              </CarrilConFlechas>
            </section>
          )}

          {looks.length > 0 && (
            <section className="t-sec t-ancho" aria-labelledby="arma-tu-look">
              <div className="t-sec-cab">
                <div>
                  <h2 id="arma-tu-look">
                    Arma tu <em>look</em>
                  </h2>
                </div>
                <Link className="t-ver" href={hrefLooks(sede)}>
                  Ver todos <b>{looks.length}</b>
                  <Icono nombre="flecha" />
                </Link>
              </div>
              <div className="t-looks-inicio">
                {looks.slice(0, 3).map((l) => (
                  <TarjetaLook key={l.id} look={l} sede={sede} origenFotos={origenFotos} />
                ))}
              </div>
            </section>
          )}

          {ofertas.length > 0 && (
            <section className="t-ofertas" id="ofertas" aria-labelledby="las-ofertas">
              <div className="t-ancho">
                <div className="t-sec-cab">
                  <div>
                    <h2 id="las-ofertas">
                      Las <em>ofertas</em>
                    </h2>
                  </div>
                  <Link className="t-ver" href={lista("ofertas", ofertaElegida?.id ?? null)}>
                    Ver todas <b>{ofertaElegida ? ofertaElegida.cuantas : ofertas.length}</b>
                    <Icono nombre="flecha" />
                  </Link>
                </div>
                <nav className="t-pildoras" aria-label="Campañas">
                  <Link className="t-pildora" href={`${hrefInicio(sede)}#ofertas`} scroll={false} aria-current={ofertaElegida ? undefined : "true"}>
                    Todas <small>{ofertas.length}</small>
                    <PendienteDelEnlace />
                  </Link>
                  {campanas.map((c) => (
                    <Link
                      key={c.id}
                      className="t-pildora"
                      href={`${hrefInicio(sede, c.id)}#ofertas`}
                      scroll={false}
                      aria-current={ofertaElegida?.id === c.id ? "true" : undefined}
                    >
                      {c.nombre} −{pctTexto(c.pct)} % <small>{c.hasta ? `hasta ${fechaCorta(c.hasta)}` : "sin fecha"}</small>
                      <PendienteDelEnlace />
                    </Link>
                  ))}
                </nav>
                <div className="t-grilla">
                  {ofertasVistas.slice(0, 8).map((p) => (
                    <TarjetaPrenda key={p.id} prenda={p} sede={sede} origenFotos={origenFotos} nota={nota(p)} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {vendidos.length > 0 && (
            <section className="t-sec t-ancho" aria-labelledby="mas-vendidos">
              <div className="t-sec-cab">
                <div>
                  <h2 id="mas-vendidos">
                    Más <em>vendidos</em>
                  </h2>
                </div>
                <Link className="t-ver" href={lista("vendidos")}>
                  Ver todo <Icono nombre="flecha" />
                </Link>
              </div>
              <ol className="t-top">
                {/* El orden de izquierda a derecha ya es el ranking (la lista es ordenada): sin números grandes sobre las fotos. */}
                {vendidos.map((p) => (
                  <li key={p.id}>
                    <TarjetaPrenda prenda={p} sede={sede} origenFotos={origenFotos} nota={nota(p)} sinNuevo />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <AsiSeSepara conCuenta={conSesion} />
      <SeccionClub
        nombre={cuenta?.nombre ?? null}
        desde={cuenta?.clubDesde ?? anioLima()}
        conCuenta={conSesion}
        esDelClub={cuenta?.esDelClub ?? conSesion}
        cumplePct={beneficios?.pct ?? null}
      />
      {sedes.length > 0 && (
        <NuestrasTiendas
          sedes={sedes}
          ceja=""
          ver={Object.fromEntries(sedes.map((s) => [s.id, { href: hrefInicio(claveDeSede(s.nombre)), actual: elegida?.id === s.id }]))}
        />
      )}
    </MarcoCatalogo>
  );
}

