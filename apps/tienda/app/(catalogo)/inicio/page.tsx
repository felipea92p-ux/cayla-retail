import type { Metadata } from "next";
import Link from "next/link";
import { AsiSeSepara } from "@/components/AsiSeSepara";
import { CuentaRegresiva } from "@/components/CuentaRegresiva";
import { FotoTarjeta } from "@/components/FotoTarjeta";
import { Icono } from "@/components/Icono";
import { Isotipo } from "@/components/Isotipo";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { SeccionClub } from "@/components/SeccionClub";
import { TarjetaPrenda } from "@/components/TarjetaPrenda";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import {
  campanasDe,
  colorDeDibujo,
  filtrarYOrdenar,
  formaDe,
  fotoOptimizable,
  fotosDeTarjeta,
  hrefDePrenda,
  hrefLista,
  leerCampana,
  precioTarjeta,
  type Prenda,
} from "@/lib/catalogo";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { categoriasDelInicio, heroDelInicio, type Hero } from "@/lib/inicio";
import { leerPortada } from "@/lib/portada-servidor";
import { anioLima, fechaCorta, fechaLarga, partirTitulo, pctTexto } from "@/lib/portada";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "@/lib/sede-elegida";
import { leerSesion } from "@/lib/sesion-servidor";
import { hayEnTienda, notaDeStock } from "@/lib/stock";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../../estilos/tiendas.css";
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

// El Inicio de quien tiene cuenta (maqueta v4, `vInicio`): el héroe de la campaña vigente (o «Lo nuevo» si no hay), las categorías, Lo
// nuevo, las ofertas de cada campaña, los más vendidos (sin cifras), cómo se separa, el Club y nuestras tiendas. Todo respeta la tienda
// elegida en «Ver lo que hay en»: el precio es el de esa tienda y, si hay una elegida, solo sale lo que hay en ella. Una sola lectura
// del catálogo (`tienda_catalogo` ya trae Lo nuevo y el puesto en Más vendidos); se lee en cada visita.
export default async function Inicio({ searchParams }: Props) {
  const sp = await searchParams;
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = sedeDeLaUrl(sp.sede, sedes);
  const [catalogo, { campana }, sesion] = await Promise.all([leerCatalogo(pedida?.id ?? null), leerPortada(), leerSesion()]);
  const lectura = sesion.estado === "con_sesion" ? await leerMiCuentaEnBase(sesion.usuarioId) : null;
  const cuenta = lectura?.estado === "cuenta" ? lectura.cuenta : null;

  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base ya respondió con «Todas»).
  const elegida = catalogo?.sede ? sedes.find((s) => s.id === catalogo.sede) ?? null : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const prendas = (catalogo?.prendas ?? []).filter((p) => hayEnTienda(p.stock, elegida?.id ?? null));
  const enTxt = elegida ? ` en ${elegida.nombre}` : "";
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  const nota = (p: Prenda) => notaDeStock(p.stock, elegida, sedes);

  const hero = heroDelInicio(campana, prendas);
  const categorias = categoriasDelInicio(prendas);
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
      <Heroe hero={hero} sede={sede} origenFotos={origenFotos} verCampana={lista("ofertas", hero.tipo === "campana" ? hero.campanaId : null)} verNuevo={nuevos.length > 0 ? lista("nuevo") : null} />

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
          {categorias.length > 0 && (
            <nav className="t-circs" aria-label="Categorías">
              {categorias.map((c) => {
                const foto = fotosDeTarjeta(c.prenda)[0];
                return (
                  <Link key={c.clave} className="t-circ" href={hrefLista({ sede, categoria: c.clave, orden: "destacado" })} data-nuevo={c.nueva ? "" : undefined}>
                    <span className="t-circ-img">
                      <FotoTarjeta
                        foto={foto}
                        segunda={null}
                        optimizar={[foto ? fotoOptimizable(foto, origenFotos) : false, false]}
                        nombre=""
                        forma={formaDe(c.prenda.categoria?.prefijo)}
                        color={colorDeDibujo(c.prenda)}
                        tamanos="96px"
                      />
                    </span>
                    <b>{c.corto}</b>
                  </Link>
                );
              })}
            </nav>
          )}

          {nuevos.length > 0 && (
            <section className="t-sec t-ancho" aria-labelledby="lo-nuevo">
              <div className="t-sec-cab">
                <div>
                  <span className="t-ceja">Recién llegado{enTxt}</span>
                  <h2 id="lo-nuevo">
                    Lo <em>nuevo</em>
                  </h2>
                  <p>Lo que llegó a nuestras tiendas en los últimos 30 días.</p>
                </div>
                <Link className="t-ver" href={lista("nuevo")}>
                  Ver todo <b>{nuevos.length}</b>
                  <Icono nombre="flecha" />
                </Link>
              </div>
              <div className="t-carril">
                {nuevos.slice(0, 10).map((p) => (
                  <TarjetaPrenda key={p.id} prenda={p} sede={sede} origenFotos={origenFotos} nota={nota(p)} sinNuevo />
                ))}
              </div>
            </section>
          )}

          {ofertas.length > 0 && (
            <section className="t-ofertas" id="ofertas" aria-labelledby="las-ofertas">
              <div className="t-ancho">
                <div className="t-sec-cab">
                  <div>
                    <span className="t-ceja">Campañas vigentes{enTxt}</span>
                    <h2 id="las-ofertas">
                      Las <em>ofertas</em>
                    </h2>
                    <p>El descuento de cada campaña, sobre el precio de tu tienda.</p>
                  </div>
                  <Link className="t-ver" href={lista("ofertas", ofertaElegida?.id ?? null)}>
                    Ver todas <b>{ofertaElegida ? ofertaElegida.cuantas : ofertas.length}</b>
                    <Icono nombre="flecha" />
                  </Link>
                </div>
                <nav className="t-pildoras" aria-label="Campañas">
                  <Link className="t-pildora" href={`${hrefInicio(sede)}#ofertas`} scroll={false} aria-current={ofertaElegida ? undefined : "true"}>
                    Todas <small>{ofertas.length}</small>
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
                  <span className="t-ceja">Lo que más se llevan</span>
                  <h2 id="mas-vendidos">
                    Más <em>vendidos</em>
                  </h2>
                  <p>Por modelo, en los últimos 30 días.</p>
                </div>
                <Link className="t-ver" href={lista("vendidos")}>
                  Ver el ranking <Icono nombre="flecha" />
                </Link>
              </div>
              <ol className="t-top">
                {vendidos.map((p, i) => (
                  <li key={p.id}>
                    <span className="t-top-n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <TarjetaPrenda prenda={p} sede={sede} origenFotos={origenFotos} nota={nota(p)} />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <AsiSeSepara />
      <SeccionClub nombre={cuenta?.nombre ?? null} desde={cuenta?.clubDesde ?? anioLima()} conCuenta />
      {sedes.length > 0 && (
        <NuestrasTiendas
          sedes={sedes}
          ver={Object.fromEntries(sedes.map((s) => [s.id, { href: hrefInicio(claveDeSede(s.nombre)), actual: elegida?.id === s.id }]))}
        />
      )}
    </MarcoCatalogo>
  );
}

/** El héroe (maqueta, `heroCampana` y `heroNuevo`): el texto a la izquierda y, en la computadora, las fotos como polaroids. */
function Heroe({
  hero,
  sede,
  origenFotos,
  verCampana,
  verNuevo,
}: {
  hero: Hero;
  sede: string | null;
  origenFotos: string | undefined;
  verCampana: string;
  verNuevo: string | null;
}) {
  const piezas = hero.tipo === "marca" ? [] : hero.piezas;
  return (
    <section className={`t-hero t-hero-inicio${hero.tipo === "campana" ? "" : " sin-campana"}`}>
      <Isotipo className="t-colibri" />
      <div className="t-hero-texto">
        {hero.tipo === "campana" ? (
          <>
            <span className="t-hero-ceja">
              {hero.campana.hasta ? (
                <span>
                  Campaña · hasta el <span className="t-fecha-larga">{fechaLarga(hero.campana.hasta)}</span>
                  <span className="t-fecha-corta">{fechaCorta(hero.campana.hasta)}</span>
                </span>
              ) : (
                "Campaña vigente"
              )}
            </span>
            <TituloHeroe texto={hero.campana.nombre} />
            <p className="t-hero-desc">
              <b>−{pctTexto(hero.campana.pct)} % en prendas elegidas.</b> Sepáralas online, confírmalas por WhatsApp y recógelas en tu tienda.
            </p>
            {hero.campana.hasta && <CuentaRegresiva hasta={hero.campana.hasta} />}
            <div className="t-hero-acciones">
              <Link className="t-btn t-btn-claro" href={verCampana}>
                Ver la campaña
              </Link>
              {verNuevo && (
                <Link className="t-enlace" href={verNuevo}>
                  Ver lo nuevo <Icono nombre="flecha" />
                </Link>
              )}
            </div>
          </>
        ) : hero.tipo === "nuevo" ? (
          <>
            <span className="t-hero-ceja">Recién llegado</span>
            <h1 className="t-hero-tit">
              <span>Lo nuevo</span>
              <em>de CAYLA</em>
            </h1>
            <p className="t-hero-desc">Lo que llegó a nuestras tiendas en los últimos 30 días.</p>
            <div className="t-hero-acciones">
              {verNuevo && (
                <Link className="t-btn t-btn-claro" href={verNuevo}>
                  Ver lo nuevo
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="t-hero-ceja">Tienda online</span>
            <h1 className="t-hero-tit">
              <span>Donde el estilo</span>
              <em>transforma</em>
            </h1>
            <p className="t-hero-desc">Mira lo que hay en cada tienda, sepáralo aquí y recógelo en tu tienda.</p>
            <div className="t-hero-acciones">
              <Link className="t-btn t-btn-claro" href={hrefLista({ sede, categoria: null, orden: "destacado" })}>
                Ver toda la ropa
              </Link>
            </div>
          </>
        )}
      </div>
      {piezas.length > 0 && (
        <div className="t-collage">
          {piezas.map((p, i) => {
            const foto = fotosDeTarjeta(p)[0];
            return (
              <Link key={p.id} className={`t-polaroid p${i + 1}`} href={hrefDePrenda(p, sede)} aria-label={`Ver ${p.nombre}`}>
                <FotoTarjeta
                  foto={foto}
                  segunda={null}
                  optimizar={[foto ? fotoOptimizable(foto, origenFotos) : false, false]}
                  nombre={p.nombre}
                  forma={formaDe(p.categoria?.prefijo)}
                  color={colorDeDibujo(p)}
                  tamanos="(min-width: 960px) 22vw, 45vw"
                />
                <span className="t-polaroid-pie">
                  <span>{p.nombre}</span>
                  <span className="num">{precioTarjeta(p).principal}</span>
                </span>
              </Link>
            );
          })}
          {hero.tipo === "campana" && (
            <span className="t-hero-pct" aria-hidden="true">
              −{pctTexto(hero.campana.pct)}%
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/** «Aniversario» / «CAYLA»: la última palabra en cursiva (como la portada). */
function TituloHeroe({ texto }: { texto: string }) {
  const [linea, cursiva] = partirTitulo(texto);
  return (
    <h1 className="t-hero-tit">
      <span>{linea}</span>
      {cursiva && <em>{cursiva}</em>}
    </h1>
  );
}
