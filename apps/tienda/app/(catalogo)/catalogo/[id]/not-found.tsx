import Link from "next/link";
import { PorDondeSeguir } from "@/components/ayuda/PorDondeSeguir";
import { Icono } from "@/components/Icono";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { TarjetaPrenda } from "@/components/TarjetaPrenda";
import { filtrarYOrdenar, hrefLista } from "@/lib/catalogo";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { claveDeSede, sedesEnOrden } from "@/lib/sede-elegida";
import { sedeRecordada } from "@/lib/sede-servidor";
import { hayEnTienda, notaDeStock } from "@/lib/stock";
import { leerSedes } from "@/lib/tiendas-servidor";

/**
 * Una prenda que ya no se ve en la web (la ocultaron, se descontinuó o el enlace está mal): lo dice y lleva a toda la tienda.
 * Revisión «a nivel mundial» (2026-10-16): con la marca y, debajo, lo que hay ahora en vez de una página vacía: cuatro prendas de «Lo
 * nuevo» (o, si no hay nada nuevo, las primeras de la tienda), solo las que hay en alguna tienda, con la misma tarjeta del catálogo.
 * Sale de la misma lectura del catálogo que ya hace la cabecera (`leerCatalogo` va una vez por petición).
 */
export default async function PrendaQueNoEsta() {
  // La tienda que eligió la última vez (ADR-0465): sus prendas, y en Lima con la empresa de cada tarjeta.
  const sedes = sedesEnOrden(await leerSedes());
  const elegida = await sedeRecordada(sedes);
  const sedeClave = elegida ? claveDeSede(elegida.nombre) : null;
  const catalogo = await leerCatalogo(elegida?.id ?? null);
  const todas = catalogo?.prendas ?? [];
  const hay = todas.filter((p) => hayEnTienda(p.stock, elegida?.id ?? null));
  const nuevas = filtrarYOrdenar(hay, { categoria: null, orden: "destacado", lista: "nuevo" });
  const conNuevas = nuevas.length > 0;
  const sugeridas = (conNuevas ? nuevas : hay).slice(0, 4);
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  return (
    <MarcoCatalogo prendas={todas} sede={sedeClave}>
      <PorDondeSeguir
        ceja="Prenda no disponible"
        titulo={
          <>
            Esta prenda ya no está <em>en la tienda.</em>
          </>
        }
        texto="Puede que se haya agotado o que el enlace esté mal escrito. Mira lo que hay ahora."
        acciones={
          <>
            <Link className="t-btn" href="/catalogo">
              Ver toda la tienda
            </Link>
            <Link className="ay-enlace" href="/inicio">
              Ir al inicio <Icono nombre="flecha" />
            </Link>
          </>
        }
      >
        {sugeridas.length > 0 && (
          <section className="ay-sugeridas" aria-labelledby="ay-sugeridas-t">
            <div className="t-sec-cab">
              <div>
                <span className="t-ceja">{conNuevas ? "Recién llegado" : "En nuestras tiendas"}</span>
                <h2 id="ay-sugeridas-t">
                  {conNuevas ? (
                    <>
                      Lo <em>nuevo</em>
                    </>
                  ) : (
                    <>
                      Mira lo que <em>hay</em>
                    </>
                  )}
                </h2>
              </div>
              <Link className="t-ver" href={conNuevas ? hrefLista({ categoria: null, orden: "destacado", lista: "nuevo" }) : "/catalogo"}>
                Ver todo <Icono nombre="flecha" />
              </Link>
            </div>
            <div className="t-grilla">
              {sugeridas.map((p) => (
                <TarjetaPrenda key={p.id} prenda={p} sede={sedeClave} origenFotos={origenFotos} nota={notaDeStock(p.stock, elegida, sedes)} sinNuevo={conNuevas} />
              ))}
            </div>
          </section>
        )}
      </PorDondeSeguir>
    </MarcoCatalogo>
  );
}
