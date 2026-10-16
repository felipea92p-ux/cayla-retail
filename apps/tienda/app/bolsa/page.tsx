import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { elegirTiendaDeRecojo, quitarDeLaBolsa } from "@/app/acciones/bolsa";
import { CantidadEnLaBolsa } from "@/components/bolsa/CantidadEnLaBolsa";
import { FormularioSeparar } from "@/components/bolsa/FormularioSeparar";
import { Miniatura } from "@/components/bolsa/Miniatura";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono } from "@/components/Icono";
import { cuantas, importe, ofreceOtra, prendaParaLeer, textoDeLaMarca, vistaBolsa, yaNoEsta } from "@/lib/bolsa";
import { leerBolsaDeLaCookie, leerBolsaEnBase } from "@/lib/bolsa-servidor";
import { formaDe, fotoOptimizable, hrefDePrenda, soles } from "@/lib/catalogo";
import { detalleDeLaPrenda, nombreTienda } from "@/lib/pedidos";
import { claveDeSede } from "@/lib/sede-elegida";
import { leerSesion } from "@/lib/sesion-servidor";
import "../estilos/catalogo.css";
import "../estilos/bolsa.css";

export const metadata: Metadata = { title: "Tu bolsa · CAYLA", robots: { index: false, follow: false } };

/**
 * La bolsa (maqueta v4, `vBolsa`): las prendas, la tienda donde se recoge TODO (una para todo: lo que no está ahí, la tienda lo trae
 * de otra) y el total con los precios de ESA tienda (sin tienda, el mayor de la web, como el catálogo con «Todas»). «Separar» crea
 * el pedido por confirmar: no se paga nada en la web. Los precios, lo que hay y lo que se puede separar los dice la base cada vez
 * (`retail.tienda_bolsa`); la bolsa solo guarda qué prendas y cuántas.
 */
export default async function Bolsa() {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  if (sesion.estado === "sin_respuesta")
    return <Aviso titulo="No pudimos revisar tu sesión" texto="Vuelve a intentarlo en unos minutos." />;

  const bolsa = await leerBolsaDeLaCookie();
  if (bolsa.lineas.length === 0) {
    return (
      <MarcoCuenta conCuenta conPie>
        <div className="t-ancho">
          <div className="t-vacio">
            <Icono nombre="bolsa" />
            <h3>Tu bolsa está vacía</h3>
            <p>Elige una prenda y su talla, o agrega un look completo.</p>
            <Link className="t-btn" href="/catalogo">
              Ver toda la tienda
            </Link>
          </div>
        </div>
      </MarcoCuenta>
    );
  }

  const enBase = await leerBolsaEnBase(bolsa.lineas, bolsa.sedeId);
  if (!enBase)
    return (
      <Aviso
        titulo="No pudimos cargar tu bolsa"
        texto="Es un problema de conexión de nuestro lado. Tu bolsa sigue aquí: vuelve a intentarlo en un momento."
        reintentar
      />
    );
  const v = vistaBolsa(enBase);
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  const sedeDeLaFicha = v.sede ? claveDeSede(v.sede.nombre) : null;
  const totalPrendas = bolsa.lineas.reduce((n, l) => n + l.cantidad, 0);

  return (
    <MarcoCuenta conCuenta conPie>
      <div className="t-ancho">
        <header className="t-lista-cab t-bolsa-cab">
          <span className="t-ceja">Tu bolsa</span>
          <h1>
            {cuantas(totalPrendas)} <em>por separar</em>
          </h1>
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
                        <CantidadEnLaBolsa varianteId={linea.varianteId} cantidad={linea.cantidad} prenda={leer} puedeSumar={ofreceOtra(marca)} />
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
                <small>El pago se coordina por WhatsApp con la tienda, y lo recoges ahí.</small>
              </div>
            </aside>

            {/* El aviso de un intento que no separó se queda mientras la bolsa sea la misma (su marca); al quitar una prenda o cambiar
                de tienda, se va. */}
            <FormularioSeparar
              lineas={v.paraSeparar}
              marca={bolsa.marca}
              sedeId={v.sede?.id ?? null}
              listo={v.listo}
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

function Aviso({ titulo, texto, reintentar = false }: { titulo: string; texto: string; reintentar?: boolean }) {
  return (
    <MarcoCuenta conCuenta conPie>
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
