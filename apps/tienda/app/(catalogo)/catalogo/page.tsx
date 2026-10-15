import type { Metadata } from "next";
import Link from "next/link";
import { FiltroTienda } from "@/components/FiltroTienda";
import { Icono } from "@/components/Icono";
import { TarjetaPrenda } from "@/components/TarjetaPrenda";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import {
  categoriasDe,
  cuantasPrendas,
  filtrarYOrdenar,
  hrefLista,
  leerCategoria,
  leerOrden,
  NOMBRE_ORDEN,
  siguienteOrden,
} from "@/lib/catalogo";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "@/lib/sede-elegida";
import { leerSedes } from "@/lib/tiendas-servidor";

export const metadata: Metadata = { title: "Toda la ropa · CAYLA" };

// El catálogo publicado (maqueta v4, `vLista` y `filtroTienda`): lo que el ERP muestra en Catálogo ▸ Vitrina web, al precio de la
// tienda que el cliente elige en «Ver lo que hay en» o, con «Todas», al mayor entre las tiendas de la web, con la campaña encima. Se
// lee en cada visita (la dirección trae la tienda, la categoría y el orden): lo que se enciende o se apaga en el ERP se ve al recargar.
export default async function Catalogo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const orden = leerOrden(sp.orden);
  const categoria = leerCategoria(sp.categoria);
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = sedeDeLaUrl(sp.sede, sedes);
  const catalogo = await leerCatalogo(pedida?.id ?? null);
  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base ya respondió con «Todas»).
  const elegida = catalogo?.sede ? sedes.find((s) => s.id === catalogo.sede) ?? null : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const prendas = catalogo?.prendas ?? null;
  const categorias = prendas ? categoriasDe(prendas) : [];
  const lista = prendas ? filtrarYOrdenar(prendas, { categoria, orden }) : [];
  const categoriaElegida = categorias.find((c) => c.clave === categoria) ?? null;
  // El origen del almacén público de fotos (no es una llave): solo sus fotos pasan por el optimizador de Next.
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;

  return (
    <>
      {/* Con una sola tienda en la web no hay nada que elegir. */}
      {sedes.length > 1 && (
        <FiltroTienda
          opciones={[
            { nombre: "Todas", href: hrefLista({ sede: null, categoria, orden }), actual: elegida === null },
            ...sedes.map((s) => ({ nombre: s.nombre, href: hrefLista({ sede: claveDeSede(s.nombre), categoria, orden }), actual: elegida?.id === s.id })),
          ]}
        />
      )}
      <div className="t-ancho">
        <nav className="t-ruta" aria-label="Estás en">
          <Link href="/">Inicio</Link>
          <span aria-hidden="true">/</span>
          <span>Toda la ropa</span>
        </nav>
        <header className="t-lista-cab">
          <span className="t-ceja">Toda la tienda</span>
          <h1>
            Toda la <em>ropa</em>
          </h1>
        </header>

        {prendas === null ? (
          <div className="t-vacio" role="status">
            <Icono nombre="tienda" />
            <h3>No pudimos cargar el catálogo</h3>
            <p>Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.</p>
            <Link className="t-btn" href={hrefLista({ sede: pedida ? claveDeSede(pedida.nombre) : null, categoria, orden })}>
              Volver a intentar
            </Link>
          </div>
        ) : prendas.length === 0 ? (
          <div className="t-vacio">
            <Icono nombre="tienda" />
            <h3>Pronto verás aquí nuestras prendas</h3>
            <p>Todavía no hay prendas en la tienda online. Mientras tanto, te esperamos en nuestras tiendas.</p>
            <Link className="t-btn" href="/">
              Volver a la portada
            </Link>
          </div>
        ) : (
          <>
            <div className="t-filtros">
              {categorias.length > 1 ? (
                <nav className="t-pildoras" aria-label="Categoría">
                  <Link className="t-pildora" href={hrefLista({ sede, categoria: null, orden })} aria-current={categoria === null ? "true" : undefined}>
                    Todas <small>{prendas.length}</small>
                  </Link>
                  {categorias.map((c) => (
                    <Link key={c.clave} className="t-pildora" href={hrefLista({ sede, categoria: c.clave, orden })} aria-current={categoria === c.clave ? "true" : undefined}>
                      {c.nombre} <small>{c.cuantas}</small>
                    </Link>
                  ))}
                </nav>
              ) : (
                <span className="t-esp" />
              )}
              <div className="t-orden">
                <Link href={hrefLista({ sede, categoria, orden: siguienteOrden(orden) })} aria-label={`Orden: ${NOMBRE_ORDEN[orden]}. Cambiar a ${NOMBRE_ORDEN[siguienteOrden(orden)]}`}>
                  <Icono nombre="flechas" />
                  {NOMBRE_ORDEN[orden]}
                </Link>
              </div>
            </div>
            <p className="t-conteo" aria-live="polite">
              {cuantasPrendas(lista.length)}
              {categoriaElegida ? ` en ${categoriaElegida.nombre}` : ""}
            </p>
            {lista.length > 0 ? (
              <div className="t-grilla">
                {lista.map((p) => (
                  <TarjetaPrenda key={p.id} prenda={p} sede={sede} origenFotos={origenFotos} />
                ))}
              </div>
            ) : (
              <div className="t-vacio">
                <Icono nombre="tienda" />
                <h3>No hay prendas de esa categoría</h3>
                <p>Prueba con otra o mira toda la ropa.</p>
                <Link className="t-btn" href={hrefLista({ sede, categoria: null, orden })}>
                  Ver toda la ropa
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
