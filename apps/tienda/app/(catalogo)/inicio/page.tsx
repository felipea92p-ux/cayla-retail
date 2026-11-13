import type { Metadata } from "next";
import Link from "next/link";
import { AsiSeSepara } from "@/components/AsiSeSepara";
import { AvisoAlEntrar } from "@/components/AvisoAlEntrar";
import { EscenarioDelDesfile } from "@/components/desfile/EscenarioDelDesfile";
import { FilaDeCategorias } from "@/components/FilaDeCategorias";
import { HeroeDelInicio } from "@/components/HeroeDelInicio";
import { Icono } from "@/components/Icono";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { SeccionClub } from "@/components/SeccionClub";
import { TarjetaPrenda } from "@/components/TarjetaPrenda";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import {
  filtrarYOrdenar,
  hrefLista,
  type Prenda,
} from "@/lib/catalogo";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { leerConfigDePuntosDelClub } from "@/lib/puntos-servidor";
import { hoyLima } from "@/lib/cuentas";
import { leerDisenoDeCampana } from "@/lib/diseno-campana-servidor";
import { piezasDelDesfile } from "@/lib/desfile";
import { categoriasConFoto, gruposDeLaPortada } from "@/lib/portada-l";
import { ArmaTuOutfit, BeneficiosDeLaTienda } from "@/components/BloquesDelRediseno";
import { EscenaPortada } from "@/components/EscenaPortada";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { heroDelInicio, lasEnVitrina, lasNuevas } from "@/lib/inicio";
import { avisoAlEntrar, avisosDeRespuestas } from "@/lib/inicio-aviso";
import { avisosVistos, leerAvisosDelClub } from "@/lib/inicio-aviso-servidor";
import { leerMisRecomendaciones } from "@/lib/recomendaciones-servidor";
import { leerPortada } from "@/lib/portada-servidor";
import { anioActual } from "@/lib/hoy-servidor";
import { claveDeSede, sedesEnOrden } from "@/lib/sede-elegida";
import { sedeDeLaPagina } from "@/lib/sede-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import { hayEnTienda, notaDeStock } from "@/lib/stock";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../../estilos/tiendas.css";
import "../../estilos/inicio.css";

export const metadata: Metadata = { title: "Inicio · CAYLA" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** El Inicio con la tienda elegida (`?sede=`). */
const hrefInicio = (sede: string | null) => (sede ? `/inicio?${new URLSearchParams({ sede })}` : "/inicio");

// El Inicio de la tienda, para todos (maqueta v4, `vInicio`; sin cuenta desde el 2026-10-17): arriba, si tiene algo del Club a su favor que todavía no cerró, el aviso al
// entrar (Felipe, 2026-10-14: es adonde se llega al iniciar sesión); el héroe de la campaña vigente (o «Lo nuevo» si no hay), las
// categorías, el banner «Arma tu outfit», Lo nuevo, los más vendidos (sin cifras), el Club, nuestras tiendas y cómo se separa (orden
// del rediseño Premium, 2026-11-07; sin «Outfits listos» ni «Las ofertas», que tienen su página). Todo respeta la tienda elegida en «Ver lo que hay en»: el precio es el de esa tienda y, si hay una elegida, solo
// sale lo que hay en ella. Una sola lectura del catálogo (`tienda_catalogo` ya trae Lo nuevo y el puesto en Más vendidos); se lee en
// cada visita.
export default async function Inicio({ searchParams }: Props) {
  const sp = await searchParams;
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = await sedeDeLaPagina(sp, sedes, "/inicio", claveDeSede);
  // El año va por la lectura guardada (`anioActual`, ADR-0432), no por el reloj: sin sesión esta página se arma por adelantado y Next no deja
  // leer `new Date()` mientras la arma (lo registraba como error en cada armado de la portada).
  const [catalogo, { campana }, sesion, puntosDelClub, anio] = await Promise.all([
    leerCatalogo(pedida?.id ?? null),
    leerPortada(),
    leerSesion(),
    leerConfigDePuntosDelClub(),
    anioActual(),
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

  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base ya respondió con «Todas»).
  const elegida = catalogo?.sede ? sedes.find((s) => s.id === catalogo.sede) ?? null : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const prendas = (catalogo?.prendas ?? []).filter((p) => hayEnTienda(p.stock, elegida?.id ?? null));
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  const nota = (p: Prenda) => notaDeStock(p.stock, elegida, sedes);

  const hero = heroDelInicio(campana, prendas);
  // La portada del rediseño (ADR-0615). Con una campaña vigente manda la de la campaña; si no hay tres prendas para la escena, el héroe de siempre.
  const gruposEscena = hero.tipo !== "campana" ? gruposDeLaPortada(prendas, sede) : [];
  const plazos = await leerAyuda();
  const hrefArmar = sede ? `/looks/arma?sede=${encodeURIComponent(sede)}` : "/looks/arma";
  // El diseño de la campaña que anuncia la portada (la misma que la franja): viste el héroe y el sello de sus prendas; sin él, todo como siempre.
  const diseno = await leerDisenoDeCampana(campana?.nombre);
  const nuevos = filtrarYOrdenar(prendas, { categoria: null, orden: "destacado", lista: "nuevo" });
  // Lo que llegó hace menos, con foto primero: las salidas del desfile (hasta 6) y las filas de su programa (hasta 8) siguen el mismo orden y la misma numeración.
  const nuevas = lasNuevas(prendas);
  // Sin nada que llegara hace menos de 30 días el programa sigue (Felipe 2026-10-27): lista lo que hay en la tienda, el mismo orden del desfile.
  const delPrograma = nuevas.length > 0 ? nuevas : lasEnVitrina(prendas);
  // En «Lo nuevo» no se repite «Nuevo» en cada tarjeta (como en la lista del catálogo, `sinNuevo`).
  const grillaDe = (lista: Prenda[], sinNuevo = false) =>
    lista.slice(0, 8).map((p) => <TarjetaPrenda key={p.id} prenda={p} sede={sede} origenFotos={origenFotos} nota={nota(p)} sinNuevo={sinNuevo} diseno={diseno} />);
  // Filas completas (de a 4 en la computadora, de a 2 en el celular): 5 vendidos dejarían una prenda sola en la última fila.
  const todosLosVendidos = filtrarYOrdenar(prendas, { categoria: null, orden: "destacado", lista: "vendidos" }).slice(0, 8);
  const vendidos = todosLosVendidos.length >= 4 ? todosLosVendidos.slice(0, todosLosVendidos.length - (todosLosVendidos.length % 4)) : todosLosVendidos;
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
      {gruposEscena.length > 0 ? (
        <EscenaPortada grupos={gruposEscena} hrefNuevo={lista("nuevo")} />
      ) : (
        <HeroeDelInicio hero={hero} diseno={diseno} sede={sede} origenFotos={origenFotos} verCampana={lista("ofertas", hero.tipo === "campana" ? hero.campanaId : null)} verNuevo={nuevos.length > 0 ? lista("nuevo") : null} />
      )}
      <BeneficiosDeLaTienda diasParaRecoger={plazos.diasParaRecoger} diasParaCambiar={plazos.diasParaCambiar} />
      <section className="t-ancho dn-categorias" aria-labelledby="dn-categorias">
        <div className="t-sec-cab">
          <h2 id="dn-categorias">Compra por categoría</h2>
          <Link className="t-ver" href={hrefLista({ sede, categoria: null, orden: "destacado" })}>
            Ver todas
            <Icono nombre="flecha" />
          </Link>
        </div>
        <FilaDeCategorias categorias={categoriasConFoto(prendas)} sede={sede} />
      </section>
      <ArmaTuOutfit href={hrefArmar} />
      {/* Con una campaña vigente la portada es la de la campaña y el desfile baja a su propia sección (ADR-0524); sin campaña, el desfile ES la portada. */}
      {hero.tipo === "campana" && nuevas.length > 0 && (
        <EscenarioDelDesfile
          piezas={piezasDelDesfile(nuevas, sede, origenFotos)}
          modo="seccion"
          ceja="Llegó en los últimos 30 días"
          titulo="Lo nuevo"
          boton={{ texto: "Ver lo nuevo", href: lista("nuevo") }}
        />
      )}

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
          {delPrograma.length > 0 && (
            <section className="t-sec t-ancho" aria-labelledby="dn-lo-nuevo-lista">
              <div className="t-sec-cab">
                <h2 id="dn-lo-nuevo-lista">Lo nuevo</h2>
                <Link className="t-ver" href={lista("nuevo")}>
                  Ver todo
                  <Icono nombre="flecha" />
                </Link>
              </div>
              <div className="t-grilla">{grillaDe(delPrograma, nuevas.length > 0)}</div>
            </section>
          )}
          {/* «Outfits listos» y «Las ofertas» no van en el Inicio (Felipe, 2026-11-07: demasiada información para la primera pantalla):
              las dos siguen a un toque en el menú («Outfits», «Ofertas») y en el pie. */}
          {vendidos.length > 0 && (
            <section className="t-sec t-ancho" aria-labelledby="mas-vendidos">
              <div className="t-sec-cab" data-revela>
                <div>
                  <h2 id="mas-vendidos">
                    Más <em>vendidos</em>
                  </h2>
                  {elegida && <p>Lo que más se llevan en {elegida.nombre}.</p>}
                </div>
                <Link className="t-ver" href={lista("vendidos")}>
                  Ver todo <Icono nombre="flecha" />
                </Link>
              </div>
              <ol className="t-top">
                {/* El orden de izquierda a derecha ya es el ranking (la lista es ordenada): sin números grandes sobre las fotos. */}
                {vendidos.map((p) => (
                  <li key={p.id}>
                    <TarjetaPrenda prenda={p} sede={sede} origenFotos={origenFotos} nota={nota(p)} sinNuevo diseno={diseno} />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <SeccionClub
        nombre={cuenta?.nombre ?? null}
        desde={cuenta?.clubDesde ?? anio}
        conCuenta={conSesion}
        esDelClub={cuenta?.esDelClub ?? conSesion}
        regaloCumple={puntosDelClub?.regaloCumple ?? null}
      />
      {sedes.length > 0 && (
        <NuestrasTiendas
          sedes={sedes}
          ceja=""
          ver={Object.fromEntries(sedes.map((s) => [s.id, { href: hrefInicio(claveDeSede(s.nombre)), actual: elegida?.id === s.id }]))}
        />
      )}
      {/* Cómo se separa, al final (rediseño Premium): es lo que se lee antes de decidir, después de ver las prendas y las tiendas. */}
      <AsiSeSepara conCuenta={conSesion} />
    </MarcoCatalogo>
  );
}

