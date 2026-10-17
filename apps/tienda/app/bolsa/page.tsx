import type { Metadata } from "next";
import Link from "next/link";
import { elegirTiendaDeRecojo, quitarDeLaBolsa } from "@/app/acciones/bolsa";
import { CantidadEnLaBolsa } from "@/components/bolsa/CantidadEnLaBolsa";
import { FormularioSeparar } from "@/components/bolsa/FormularioSeparar";
import { Miniatura } from "@/components/bolsa/Miniatura";
import { Promesas } from "@/components/bolsa/Promesas";
import { SigueMirando } from "@/components/bolsa/SigueMirando";
import { SubirAlLlenar } from "@/components/bolsa/SubirAlLlenar";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono } from "@/components/Icono";
import { leerAyuda } from "@/lib/ayuda-servidor";
import {
  carrilesDeLaBolsaVacia,
  cuantas,
  importe,
  ofreceOtra,
  prendaParaLeer,
  textoDeLaMarca,
  TOPE_POR_PRENDA,
  vistaBolsa,
  yaNoEsta,
  type CarrilDeLaBolsaVacia,
} from "@/lib/bolsa";
import { leerBolsaDeLaCookie, leerBolsaEnBase } from "@/lib/bolsa-servidor";
import { formaDe, fotoOptimizable, hrefDePrenda, hrefLista, soles } from "@/lib/catalogo";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { leerGuardadosEnBase } from "@/lib/club-servidor";
import { promesasDeCompra } from "@/lib/ficha";
import { detalleDeLaPrenda, nombreTienda } from "@/lib/pedidos";
import { claveDeSede, sedesEnOrden } from "@/lib/sede-elegida";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import { notaDeStock } from "@/lib/stock";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../estilos/catalogo.css";
import "../estilos/bolsa.css";

export const metadata: Metadata = { title: "Tu bolsa · CAYLA", robots: { index: false, follow: false } };

/** Lo que dice cada carril de la bolsa vacía y a qué lista lleva su «Ver todo». */
const CARRIL_DE_LA_BOLSA: Record<CarrilDeLaBolsaVacia["lista"], { ceja: string; titulo: [string, string]; href: string }> = {
  favoritos: { ceja: "Guardado por ti", titulo: ["Tus", "favoritos"], href: hrefLista({ lista: "favoritos", categoria: null, orden: "destacado" }) },
  nuevo: { ceja: "Recién llegado", titulo: ["Lo", "nuevo"], href: hrefLista({ lista: "nuevo", categoria: null, orden: "destacado" }) },
  todo: { ceja: "Para empezar", titulo: ["Toda la", "tienda"], href: hrefLista({ categoria: null, orden: "destacado" }) },
};

/**
 * La bolsa (maqueta v4, `vBolsa`): las prendas, la tienda donde se recoge TODO (una para todo: lo que no está ahí, la tienda lo trae
 * de otra) y el total con los precios de ESA tienda (sin tienda, el mayor de la web, como el catálogo con «Todas»). «Separar» crea
 * el pedido por confirmar: no se paga nada en la web. Los precios, lo que hay y lo que se puede separar los dice la base cada vez
 * (`retail.tienda_bolsa`); la bolsa solo guarda qué prendas y cuántas. El resumen termina con lo que la tienda ya cumple (las promesas
 * de la ficha, en corto) y, arriba, «Seguir mirando» vuelve a la tienda. Vacía, ofrece sus favoritos y Lo nuevo en carriles (2026-10-16).
 */
export default async function Bolsa() {
  const sesion = await leerSesion();
  // La bolsa se arma sin cuenta (vive en la cookie de este aparato); la cuenta se pide al «Separar» (Felipe 2026-10-17).
  const visitante = sesion.estado === "sin_sesion";
  // Con cuenta pero sin Club (ADR-0438), «Separar» pide completar el documento y el celular antes: se sabe aquí, sin esperar a que la base diga que no.
  const lectura = sesion.estado === "con_sesion" ? await leerMiCuentaEnBase(sesion.usuarioId) : null;
  const sinClub = lectura?.estado === "cuenta" && !lectura.cuenta.esDelClub;
  if (sesion.estado === "sin_respuesta")
    return <Aviso titulo="No pudimos revisar tu sesión" texto="Vuelve a intentarlo en unos minutos." />;

  const bolsa = await leerBolsaDeLaCookie();
  if (bolsa.lineas.length === 0) {
    // Vacía no es un callejón (2026-10-16): sus favoritos y Lo nuevo, en carriles, para llenarla desde aquí. El catálogo es la misma
    // lectura de la cabecera (`MarcoCuenta`, con «Todas»); si la base no responde, solo queda el vacío con sus dos caminos.
    const [catalogo, guardados, sedes] = await Promise.all([leerCatalogo(null), sesion.estado === "con_sesion" ? leerGuardadosEnBase(sesion.usuarioId) : null, leerSedes()]);
    const tiendas = sedesEnOrden(sedes);
    const favoritos = guardados?.favoritos ?? new Set<string>();
    const carriles = carrilesDeLaBolsaVacia(catalogo?.prendas ?? [], favoritos);
    const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
    return (
      <MarcoCuenta conCuenta conPie visitante={visitante}>
        <div className="t-ancho cp-bolsa-vacia">
          <SubirAlLlenar />
          <div className="t-vacio">
            <Icono nombre="bolsa" />
            <h3>Tu bolsa está vacía</h3>
            <p>Elige una prenda y su talla, o agrega un look completo.</p>
            <div className="cp-vacio-acciones">
              <Link className="t-btn" href="/catalogo">
                Ver toda la tienda
              </Link>
              <Link className="t-btn t-btn-sec" href="/looks">
                Ver los looks
              </Link>
            </div>
          </div>
          {carriles.map((c) => (
            <SigueMirando
              key={c.lista}
              id={`bolsa-${c.lista}`}
              {...CARRIL_DE_LA_BOLSA[c.lista]}
              prendas={c.prendas}
              sede={null}
              origenFotos={origenFotos}
              nota={(p) => notaDeStock(p.stock, null, tiendas)}
              guardados={favoritos}
            />
          ))}
        </div>
      </MarcoCuenta>
    );
  }

  // Los plazos de las promesas del resumen (la misma lectura de la ayuda) van junto con la bolsa: una sola espera.
  const [enBase, plazos] = await Promise.all([leerBolsaEnBase(bolsa.lineas, bolsa.sedeId), leerAyuda()]);
  if (!enBase)
    return (
      <Aviso
        titulo="No pudimos cargar tu bolsa"
        texto="Es un problema de conexión de nuestro lado. Tu bolsa sigue aquí: vuelve a intentarlo en un momento."
        reintentar
        visitante={visitante}
      />
    );
  const v = vistaBolsa(enBase);
  const promesas = promesasDeCompra(plazos);
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  const sedeDeLaFicha = v.sede ? claveDeSede(v.sede.nombre) : null;
  const totalPrendas = bolsa.lineas.reduce((n, l) => n + l.cantidad, 0);

  return (
    <MarcoCuenta conCuenta conPie visitante={visitante}>
      <div className="t-ancho">
        <header className="t-lista-cab t-bolsa-cab cp-sec-cab">
          <span className="t-ceja">Tu bolsa</span>
          <h1>
            {cuantas(totalPrendas)} <em>por separar</em>
          </h1>
          <Link className="t-ver" href="/catalogo">
            Seguir mirando <Icono nombre="flecha" />
          </Link>
        </header>
        <div className="t-bolsa">
          <div className="t-bolsa-principal">
            <div className="t-bolsa-items">
              {v.lineas.map(({ linea, marca, importe: monto, antes }) => {
                const texto = textoDeLaMarca(marca);
                // «Quitar» saca la prenda entera (la cantidad se baja con «−»), y dice cuál para quien usa lector de pantalla. Si la
                // prenda ya no se puede separar (agotada o fuera de la tienda online), quitarla es lo que toca: va como botón, no enlace.
                const urgente = marca.tipo === "agotada" || marca.tipo === "no_esta";
                const quitar = (leer: string) => (
                  <form action={quitarDeLaBolsa} className="t-bolsa-quitar">
                    <input type="hidden" name="variante" value={linea.varianteId} />
                    <input type="hidden" name="vista" value={linea.cantidad} />
                    <input type="hidden" name="todas" value="1" />
                    <button className={`w-quitar${urgente ? " urgente" : ""}`} type="submit" aria-label={`Quitar de tu bolsa: ${leer}`}>
                      Quitar
                    </button>
                  </form>
                );
                if (yaNoEsta(linea)) {
                  return (
                    <div key={linea.varianteId} className="t-bolsa-item" data-marca="no_esta">
                      <div className="t-bolsa-foto">
                        <Miniatura foto={null} optimizar={false} forma="percha" color={null} />
                      </div>
                      <span>
                        <b>Una prenda que ya no está</b>
                        <em>{texto}</em>
                      </span>
                      <div className="t-bolsa-acc">{quitar("una prenda que ya no está")}</div>
                    </div>
                  );
                }
                const href = hrefDePrenda({ id: linea.productoId }, sedeDeLaFicha);
                const leer = prendaParaLeer(linea);
                return (
                  <div key={linea.varianteId} className="t-bolsa-item" data-marca={marca.tipo}>
                    <Link href={href} tabIndex={-1} aria-hidden="true" className="t-bolsa-foto">
                      <Miniatura
                        foto={linea.foto}
                        optimizar={linea.foto ? fotoOptimizable(linea.foto, origenFotos) : false}
                        forma={formaDe(linea.categoria?.prefijo)}
                        color={linea.color.hex}
                      />
                    </Link>
                    <span>
                      <Link className="t-card-nom" href={href}>
                        {linea.nombre}
                      </Link>
                      <small>{detalleDeLaPrenda(linea)}</small>
                      {texto &&
                        (marca.tipo === "hay" ? (
                          <small className="t-ok">
                            <Icono nombre="check" />
                            {texto}
                          </small>
                        ) : marca.tipo === "traslado" ? (
                          <small className="t-traslado">
                            <Icono nombre="traslado" />
                            {texto}
                          </small>
                        ) : (
                          <em>{texto}</em>
                        ))}
                    </span>
                    <span className="t-bolsa-der">
                      <b className="num">{importe(monto)}</b>
                      {/* Con campaña, lo que costaría sin ella, tachado (como en la ficha y la tarjeta). */}
                      {antes !== null && (
                        <s className="num">
                          <span className="t-sr">Antes </span>
                          {importe(antes)}
                        </s>
                      )}
                    </span>
                    <div className="t-bolsa-acc">
                      {/* Agotada: la cantidad no se puede cambiar (ni hay de dónde), solo quitarla. */}
                      {!urgente && (
                        <CantidadEnLaBolsa varianteId={linea.varianteId} cantidad={linea.cantidad} prenda={leer} puedeSumar={ofreceOtra(marca) && linea.cantidad < TOPE_POR_PRENDA} />
                      )}
                      {quitar(leer)}
                    </div>
                  </div>
                );
              })}
            </div>

            {v.tiendas.length > 0 && (
              <div id="bloque-tienda" className="w-bloque t-bolsa-tiendas" data-campo="tienda" data-estado={v.sede ? "hecho" : "sigue"}>
                <span className="w-lbl" id="tienda-de-recojo">
                  ¿En qué tienda lo recoges? <span className="w-marca">{v.sede ? "✓ Listo" : "Sigue aquí"}</span>
                </span>
                <form action={elegirTiendaDeRecojo} className="w-lista" role="group" aria-labelledby="tienda-de-recojo">
                  {v.tiendas.map((t) => (
                    <button
                      key={t.sede.id}
                      className="w-opcion t-op-tienda"
                      type="submit"
                      name="sede"
                      value={t.sede.id}
                      aria-pressed={t.elegida}
                    >
                      <span className="w-opcion-cab">
                        <span className="w-radio" />
                        <span className="w-opcion-t">
                          <b>{nombreTienda(t.sede.nombre)}</b>
                          {t.texto && <small>{t.texto}</small>}
                        </span>
                        <Icono nombre="tienda" />
                      </span>
                    </button>
                  ))}
                </form>
              </div>
            )}
          </div>

          {/* El resumen y «Separar»: en la computadora, la columna de la derecha que acompaña al bajar; en el celular, «Separar» queda
              pegado abajo (`bolsa.css`). */}
          <div className="t-bolsa-lado">
            <aside className="t-resumen" aria-label="Resumen">
              <h3>Resumen</h3>
              <div className="w-resumen">
                {/* Sin campañas el subtotal es el total; con ellas, «Prendas − Ahorras = Total» cuadra a la vista. */}
                <div>
                  <span>Prendas ({v.prendas})</span>
                  <span className="num">{soles(v.subtotal)}</span>
                </div>
                {v.ahorro > 0 && (
                  <div>
                    <span>Ahorras con las campañas</span>
                    <span className="num t-ahorro">−{soles(v.ahorro)}</span>
                  </div>
                )}
                <div className="tot">
                  <span>Total de tu pedido</span>
                  <span className="num">{soles(v.total)}</span>
                </div>
              </div>
              {/* Lo que la tienda ya cumple, en corto (el detalle está en la ficha y en «Cómo separar»). */}
              <Promesas promesas={promesas} compacta />
            </aside>

            {/* El aviso de un intento que no separó se queda mientras la bolsa sea la misma (su marca); al quitar una prenda o cambiar
                de tienda, se va. */}
            <FormularioSeparar
              lineas={v.paraSeparar}
              marca={bolsa.marca}
              sedeId={v.sede?.id ?? null}
              listo={v.listo}
              sinCuenta={visitante}
              sinClub={sinClub}
              faltaTienda={v.faltaTienda}
              boton={v.boton}
              nota={
                <>
                  {v.nota.antes}
                  {v.nota.destacado && <b>{v.nota.destacado}</b>}
                  {v.nota.despues}
                </>
              }
            />
          </div>
        </div>
      </div>
    </MarcoCuenta>
  );
}

function Aviso({ titulo, texto, reintentar = false, visitante = false }: { titulo: string; texto: string; reintentar?: boolean; visitante?: boolean }) {
  return (
    <MarcoCuenta conCuenta conPie visitante={visitante}>
      <div className="t-ancho">
        <div className="t-vacio" role="status">
          <Icono nombre="bolsa" />
          <h3>{titulo}</h3>
          <p>{texto}</p>
          {reintentar && (
            <Link className="t-btn" href="/bolsa">
              Volver a intentar
            </Link>
          )}
        </div>
      </div>
    </MarcoCuenta>
  );
}
