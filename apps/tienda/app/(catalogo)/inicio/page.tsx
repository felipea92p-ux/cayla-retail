import type { Metadata } from "next";
import Link from "next/link";
import { CejaDeCampana, HeroeDePortada } from "@cayla-retail/portada";
import { AsiSeSepara } from "@/components/AsiSeSepara";
import { AvisoAlEntrar } from "@/components/AvisoAlEntrar";
import { CarrilConFlechas } from "@/components/CarrilConFlechas";
import { CuentaRegresiva } from "@/components/CuentaRegresiva";
import { FotoTarjeta } from "@/components/FotoTarjeta";
import { Icono } from "@/components/Icono";
import { Isotipo } from "@/components/Isotipo";
import { TarjetaLook } from "@/components/looks/TarjetaLook";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { piezasDelHeroe } from "@/components/PiezasDelHeroe";
import { PendienteDelEnlace } from "@/components/PendienteDelEnlace";
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
  type Prenda,
} from "@/lib/catalogo";
import { leerBeneficiosDelClub, leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { categoriasDelInicio, heroDelInicio, type Hero } from "@/lib/inicio";
import { avisoAlEntrar } from "@/lib/inicio-aviso";
import { avisosVistos, leerAvisosDelClub } from "@/lib/inicio-aviso-servidor";
import { hrefLooks } from "@/lib/looks";
import { leerLooks } from "@/lib/looks-servidor";
import { leerPortada } from "@/lib/portada-servidor";
import { anioLima, fechaCorta, partirTitulo, pctTexto } from "@/lib/portada";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "@/lib/sede-elegida";
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

// El Inicio de quien tiene cuenta (maqueta v4, `vInicio`): arriba, si tiene algo del Club a su favor que todavía no cerró, el aviso al
// entrar (Felipe, 2026-10-14: es adonde se llega al iniciar sesión); el héroe de la campaña vigente (o «Lo nuevo» si no hay), las
// categorías, Lo nuevo, «Arma tu look» (si hay looks), las ofertas de cada campaña, los más vendidos (sin cifras), cómo se separa, el Club
// y nuestras tiendas. Todo respeta la tienda elegida en «Ver lo que hay en»: el precio es el de esa tienda y, si hay una elegida, solo
// sale lo que hay en ella. Una sola lectura del catálogo (`tienda_catalogo` ya trae Lo nuevo y el puesto en Más vendidos); se lee en
// cada visita.
export default async function Inicio({ searchParams }: Props) {
  const sp = await searchParams;
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = sedeDeLaUrl(sp.sede, sedes);
  const [catalogo, { campana }, sesion, lecturaLooks, beneficios] = await Promise.all([
    leerCatalogo(pedida?.id ?? null),
    leerPortada(),
    leerSesion(),
    leerLooks(pedida?.id ?? null),
    leerBeneficiosDelClub(),
  ]);
  const [lectura, avisos, vistos] =
    sesion.estado === "con_sesion"
      ? await Promise.all([leerMiCuentaEnBase(sesion.usuarioId), leerAvisosDelClub(sesion.usuarioId), avisosVistos()])
      : [null, null, new Set<string>()];
  const cuenta = lectura?.estado === "cuenta" ? lectura.cuenta : null;
  const aviso = avisos ? avisoAlEntrar(avisos, vistos) : null;
  // Sin looks (o si la base no los dio), la sección no sale.
  const looks = lecturaLooks?.looks ?? [];

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
      {aviso && avisos && <AvisoAlEntrar aviso={aviso} activas={avisos.map((a) => a.clave)} />}
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
          {/* Los círculos de las categorías: en la computadora, centrados si caben y, si no, desde la primera (antes se cortaban
              las primeras ocho a la izquierda, sin forma de verlas), con flechas para el mouse (`CarrilConFlechas`). */}
          {categorias.length > 0 && (
            <CarrilConFlechas className="t-circs-envol">
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
            </CarrilConFlechas>
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
                  <span className="t-ceja">Combinaciones listas</span>
                  <h2 id="arma-tu-look">
                    Arma tu <em>look</em>
                  </h2>
                  <p>Prendas que se ven bien juntas. Agrega el look completo y eliges cada talla en un solo paso.</p>
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

      <AsiSeSepara conCuenta />
      <SeccionClub nombre={cuenta?.nombre ?? null} desde={cuenta?.clubDesde ?? anioLima()} conCuenta cumplePct={beneficios?.pct ?? null} />
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
  const comun = {
    clase: "t-hero-inicio",
    sinCampana: hero.tipo !== "campana",
    colibri: <Isotipo className="t-colibri" />,
    piezas: piezasDelHeroe(piezas, { href: (p) => hrefDePrenda(p, sede), conPrecio: true, origenFotos }),
    Enlace: Link,
  };
  if (hero.tipo === "campana") {
    return (
      <HeroeDePortada
        {...comun}
        ceja={<CejaDeCampana hasta={hero.campana.hasta} />}
        titulo={partirTitulo(hero.campana.nombre)}
        descripcion={
          <>
            <b>−{pctTexto(hero.campana.pct)} % en prendas elegidas.</b> Sepáralas online, confírmalas por WhatsApp y recógelas en tu tienda.
          </>
        }
        cuenta={hero.campana.hasta ? <CuentaRegresiva hasta={hero.campana.hasta} /> : null}
        acciones={
          <>
            <Link className="t-btn t-btn-claro" href={verCampana}>
              Ver la campaña
            </Link>
            {verNuevo && (
              <Link className="t-enlace" href={verNuevo}>
                Ver lo nuevo <Icono nombre="flecha" />
              </Link>
            )}
          </>
        }
        marca={`−${pctTexto(hero.campana.pct)}%`}
      />
    );
  }
  if (hero.tipo === "nuevo") {
    return (
      <HeroeDePortada
        {...comun}
        ceja="Recién llegado"
        titulo={["Lo nuevo", "de CAYLA"]}
        descripcion="Lo que llegó a nuestras tiendas en los últimos 30 días."
        acciones={
          verNuevo && (
            <Link className="t-btn t-btn-claro" href={verNuevo}>
              Ver lo nuevo
            </Link>
          )
        }
      />
    );
  }
  return (
    <HeroeDePortada
      {...comun}
      ceja="Tienda online"
      titulo={["Donde el estilo", "transforma"]}
      descripcion="Mira lo que hay en cada tienda, sepáralo aquí y recógelo en tu tienda."
      acciones={
        <Link className="t-btn t-btn-claro" href={hrefLista({ sede, categoria: null, orden: "destacado" })}>
          Ver toda la tienda
        </Link>
      }
    />
  );
}
