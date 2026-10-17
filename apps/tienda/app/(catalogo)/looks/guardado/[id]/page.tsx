import type { Metadata } from "next";
import Link from "next/link";
import { Icono } from "@/components/Icono";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { AgregarLookGuardado } from "@/components/probador/AgregarLookGuardado";
import { FiguraQuieta } from "@/components/probador/FiguraQuieta";
import { NombreDelLook } from "@/components/probador/NombreDelLook";
import { QuitarLookGuardado } from "@/components/probador/QuitarLookGuardado";
import { Recorte } from "@/components/probador/Recorte";
import { esId } from "@/lib/bolsa";
import { fotoOptimizable, hrefLista, soles } from "@/lib/catalogo";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { hrefDelInicio } from "@/lib/inicio";
import { hoyDeLima } from "@/lib/hoy-servidor";
import { hrefDePieza } from "@/lib/looks";
import {
  cuandoSeGuardo,
  diaIso,
  etiquetaDelLook,
  hrefDelGuardado,
  lookDelGuardado,
  notaDelGuardado,
  textoDeLasQueFaltan,
} from "@/lib/looks-guardados";
import { leerMisLooksEnBase } from "@/lib/looks-guardados-servidor";
import { armarProbador, codificarLook, colorDeLaPieza, hrefDelProbador, indizar, notaDeLaFoto, presentes, totales } from "@/lib/probador";
import { leerProbador } from "@/lib/probador-servidor";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "@/lib/sede-elegida";
import { leerSesion } from "@/lib/sesion-servidor";
import { hayEnTienda } from "@/lib/stock";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../../../../estilos/probador.css";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Sus looks guardados (la misma lectura de la página: una sola consulta por visita). null sin sesión o si la base no contestó. */
async function misLooks() {
  const sesion = await leerSesion();
  return sesion.estado === "con_sesion" ? leerMisLooksEnBase(sesion.usuarioId) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, looks] = await Promise.all([params, misLooks()]);
  const look = looks?.find((l) => l.id === id);
  return { title: look ? `${look.nombre} · Tus favoritos · CAYLA` : "Tu look · CAYLA" };
}

// Un look que el cliente guardó desde «Arma el tuyo» (ADR-0434, actividad 8; lienzo v3, `V3TuLook`): se abre como los looks de CAYLA. La
// figura quieta con el número de cada prenda y «Armado por ti», cuándo lo guardó, su nombre (que se cambia ahí mismo), cada prenda con
// su color, cuánto queda y lo que vale HOY en la tienda elegida (no se guarda ningún precio), el total, «Editar en el probador» (abre el
// probador con este look) y «Agregar el look a mi bolsa» (las mismas tallas, la misma hoja y la misma bolsa del probador). Las prendas
// que ya no están se dicen aparte; el look sigue con las demás. Es solo del cliente: otro, aunque tenga el enlace, ve «Este look ya no
// está» (la base solo devuelve los looks de la cuenta que pregunta).
export default async function LookGuardado({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = sedeDeLaUrl(sp.sede, sedes);
  const [catalogo, lectura, looks, hoy] = await Promise.all([
    leerCatalogo(pedida?.id ?? null),
    leerProbador(pedida?.id ?? null),
    esId(id) ? misLooks() : Promise.resolve([]),
    hoyDeLima(),
  ]);
  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base ya respondió con «Todas»).
  const elegida = catalogo?.sede ? (sedes.find((s) => s.id === catalogo.sede) ?? null) : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  const guardado = looks?.find((l) => l.id === id) ?? null;
  // Como los favoritos, lo guardado se ve aunque no haya en la tienda elegida: cada color dice dónde hay. Solo sale lo que ya no se ve en
  // la web (o ya no se puede probar).
  const prendas =
    catalogo && lectura
      ? armarProbador(catalogo.prendas, lectura, { elegida, tiendas: sedes, optimizable: (url) => fotoOptimizable(url, origenFotos) })
      : [];
  const { look, faltan } = guardado ? lookDelGuardado(guardado, prendas) : { look: null, faltan: [] };
  const zonas = look ? presentes(look) : [];
  const indice = indizar(prendas.filter((p) => zonas.some((z) => look?.[z]?.id === p.id)));
  const total = look ? totales(look, indice) : null;
  const favoritos = hrefLista({ sede, lista: "favoritos", categoria: null, orden: "destacado" });
  const conError = catalogo === null || lectura === null || looks === null;

  return (
    <MarcoCatalogo
      prendas={(catalogo?.prendas ?? []).filter((p) => hayEnTienda(p.stock, elegida?.id ?? null))}
      sede={sede}
      actual="favoritos"
      filtro={
        guardado
          ? [
              { nombre: "Todas", href: hrefDelGuardado(guardado.id, null), actual: elegida === null },
              ...sedes.map((s) => ({ nombre: s.nombre, href: hrefDelGuardado(guardado.id, claveDeSede(s.nombre)), actual: elegida?.id === s.id })),
            ]
          : null
      }
    >
      <div className="t-ancho">
        <nav className="t-ruta" aria-label="Estás en">
          <Link href={hrefDelInicio(sede)}>Inicio</Link>
          <span aria-hidden="true">/</span>
          <Link href={favoritos}>Tus favoritos</Link>
          {guardado && (
            <>
              <span aria-hidden="true">/</span>
              <span>{guardado.nombre}</span>
            </>
          )}
        </nav>

        {conError ? (
          <div className="t-vacio" role="status">
            <Icono nombre="tienda" />
            <h3>No pudimos cargar tu look</h3>
            <p>Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.</p>
            <Link className="t-btn" href={hrefDelGuardado(id, pedida ? claveDeSede(pedida.nombre) : null)}>
              Volver a intentar
            </Link>
          </div>
        ) : !guardado ? (
          <div className="t-vacio">
            <Icono nombre="corazon" />
            <h3>Este look ya no está</h3>
            <p>Puede que lo hayas quitado de tus favoritos. Arma otro en el probador.</p>
            <Link className="t-btn" href={hrefDelProbador(sede)}>
              Ir al probador
            </Link>
            <Link className="t-enlace" href={favoritos}>
              Ver tus favoritos
            </Link>
          </div>
        ) : !look || !total || zonas.length === 0 ? (
          <div className="t-vacio">
            <Icono nombre="corazon" />
            <h3>Las prendas de este look ya no están</h3>
            <p>Se agotaron o dejaron de verse en la tienda online. Puedes quitarlo de tus favoritos o armar otro.</p>
            <Link className="t-btn" href={hrefDelProbador(sede)}>
              Armar otro look
            </Link>
            <QuitarLookGuardado id={guardado.id} />
          </div>
        ) : (
          <div className="lg">
            <div className="lg-figura">
              <FiguraQuieta look={look} indice={indice} ancho={560} numeros etiqueta={etiquetaDelLook(look, indice)} pronto />
              <span className="lg-sello">Armado por ti</span>
            </div>
            <div className="lg-info">
              <span className="t-ceja">Tu look · {cuandoSeGuardo(guardado.guardadoEn, diaIso(hoy)).toLocaleLowerCase("es")}</span>
              <NombreDelLook id={guardado.id} nombre={guardado.nombre} />
              <ol className="lg-piezas">
                {zonas.map((z, i) => {
                  const pieza = look[z]!;
                  const p = indice.get(pieza.id)!;
                  const c = colorDeLaPieza(p, pieza);
                  const rebajada = c.precioFinal < c.precio;
                  const deLaFoto = notaDeLaFoto(c);
                  return (
                    <li key={z} className="lg-pieza">
                      <b aria-hidden="true">{i + 1}</b>
                      <span className="lg-pieza-foto" aria-hidden="true">
                        <span>
                          <Recorte foto={c.foto} tamanos="54px" />
                        </span>
                      </span>
                      <span className="lg-pieza-txt">
                        <Link href={hrefDePieza({ prenda: { id: p.id }, color: { codigo: c.codigo } }, sede)}>{p.nombre}</Link>
                        <span className="lg-pieza-color">
                          <span className="pb-punto-color" data-color-dato style={c.hex ? { background: c.hex } : undefined} aria-hidden="true" />
                          {c.nombre}
                        </span>
                        {c.nota && <small className={c.nota.tono}>{c.nota.texto}</small>}
                        {deLaFoto && <span className="pb-fila-sin-foto">{deLaFoto}</span>}
                      </span>
                      <span className="lg-pieza-precio">
                        {rebajada && (
                          <s>
                            <span className="t-sr">Antes </span>
                            {soles(c.precio)}
                          </s>
                        )}
                        <b className={rebajada ? "oferta" : undefined}>
                          {c.desde ? "Desde " : ""}
                          {soles(c.precioFinal)}
                        </b>
                      </span>
                    </li>
                  );
                })}
              </ol>
              {textoDeLasQueFaltan(faltan.length) && <p className="lg-faltan">{textoDeLasQueFaltan(faltan.length)}</p>}
              <div className="lg-total">
                <span>El look completo</span>
                <span>
                  {total.lista > total.final + 0.005 && (
                    <s>
                      <span className="t-sr">Antes </span>
                      {soles(total.lista)}
                    </s>
                  )}
                  <b>
                    {total.desde ? "Desde " : ""}
                    {soles(total.final)}
                  </b>
                </span>
              </div>
              {/* En el celular, pegado abajo mientras se mira el look (como la barra del probador); en la computadora, bajo el total. */}
              <div className="lg-barra">
                <AgregarLookGuardado look={look} prendas={[...indice.values()]} sedeId={elegida?.id ?? null} origenFotos={origenFotos} />
              </div>
              <div className="lg-acciones">
                <Link className="t-btn t-btn-sec" href={hrefDelProbador(sede, codificarLook(look, indice))}>
                  Editar en el probador
                </Link>
              </div>
              <p className="lg-nota">{notaDelGuardado(elegida?.nombre ?? null)}</p>
              <QuitarLookGuardado id={guardado.id} />
            </div>
          </div>
        )}
      </div>
    </MarcoCatalogo>
  );
}
