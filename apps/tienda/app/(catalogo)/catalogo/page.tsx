import type { Metadata } from "next";
import Link from "next/link";
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

export const metadata: Metadata = { title: "Toda la ropa · CAYLA" };

// El catálogo publicado (maqueta v4, `vLista`): lo que el ERP muestra en Catálogo ▸ Vitrina web, con su precio web y el de la campaña.
// Se lee en cada visita (la URL trae la categoría y el orden): lo que se enciende o se apaga en el ERP se ve al recargar.
export default async function Catalogo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const orden = leerOrden(sp.orden);
  const categoria = leerCategoria(sp.categoria);
  const prendas = await leerCatalogo();
  const categorias = prendas ? categoriasDe(prendas) : [];
  const lista = prendas ? filtrarYOrdenar(prendas, { categoria, orden }) : [];
  const elegida = categorias.find((c) => c.clave === categoria) ?? null;
  // El origen del almacén público de fotos (no es una llave): solo sus fotos pasan por el optimizador de Next.
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;

  return (
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
          <Link className="t-btn" href={hrefLista({ categoria, orden })}>
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
                <Link className="t-pildora" href={hrefLista({ categoria: null, orden })} aria-current={categoria === null ? "true" : undefined}>
                  Todas <small>{prendas.length}</small>
                </Link>
                {categorias.map((c) => (
                  <Link key={c.clave} className="t-pildora" href={hrefLista({ categoria: c.clave, orden })} aria-current={categoria === c.clave ? "true" : undefined}>
                    {c.nombre} <small>{c.cuantas}</small>
                  </Link>
                ))}
              </nav>
            ) : (
              <span className="t-esp" />
            )}
            <div className="t-orden">
              <Link href={hrefLista({ categoria, orden: siguienteOrden(orden) })} aria-label={`Orden: ${NOMBRE_ORDEN[orden]}. Cambiar a ${NOMBRE_ORDEN[siguienteOrden(orden)]}`}>
                <Icono nombre="flechas" />
                {NOMBRE_ORDEN[orden]}
              </Link>
            </div>
          </div>
          <p className="t-conteo" aria-live="polite">
            {cuantasPrendas(lista.length)}
            {elegida ? ` en ${elegida.nombre}` : ""}
          </p>
          {lista.length > 0 ? (
            <div className="t-grilla">
              {lista.map((p) => (
                <TarjetaPrenda key={p.id} prenda={p} origenFotos={origenFotos} />
              ))}
            </div>
          ) : (
            <div className="t-vacio">
              <Icono nombre="tienda" />
              <h3>No hay prendas de esa categoría</h3>
              <p>Prueba con otra o mira toda la ropa.</p>
              <Link className="t-btn" href={hrefLista({ categoria: null, orden })}>
                Ver toda la ropa
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
