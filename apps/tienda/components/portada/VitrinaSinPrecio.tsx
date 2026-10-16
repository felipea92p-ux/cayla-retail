import Link from "next/link";
import { colorDeDibujo, formaDe, fotoOptimizable, fotosDeTarjeta, hrefDePrenda, hrefLista, type Prenda } from "@/lib/catalogo";
import { hrefConVolver } from "@/lib/entrada";
import { CarrilConFlechas } from "../CarrilConFlechas";
import { FotoTarjeta } from "../FotoTarjeta";
import { Icono } from "../Icono";

/**
 * La vitrina de la portada sin cuenta (Felipe 2026-10-16: «fotos sin precio»): las prendas con su foto y su nombre, nunca su precio ni
 * cuánto hay. Cada una lleva a crear la cuenta y, al terminarla, a ESA prenda (`?volver=`): quien se enamoró de una blusa llega a ella.
 * Al final del carril, cuántas más hay adentro. Las tarjetas son las del catálogo (`t-card`), sin precio: en su lugar, «Ver precio».
 */
export function VitrinaSinPrecio({ prendas, total, origenFotos }: { prendas: readonly Prenda[]; total: number; origenFotos: string | undefined }) {
  if (prendas.length === 0) return null;
  const verTodo = hrefConVolver("/crear-cuenta", hrefLista({ categoria: null, orden: "destacado", lista: "nuevo" }));
  const mas = total - prendas.length;
  return (
    <section className="t-sec t-ancho po-vitrina" aria-labelledby="po-vitrina-t">
      <div className="t-sec-cab">
        <div>
          <span className="t-ceja">En nuestras tiendas</span>
          <h2 id="po-vitrina-t">
            Mira lo que <em>hay</em>
          </h2>
          <p>Crea tu cuenta para ver precios, tallas y cuánto hay en cada tienda.</p>
        </div>
        <Link className="t-ver" href={verTodo}>
          Ver todo <Icono nombre="flecha" />
        </Link>
      </div>
      <CarrilConFlechas className="po-carril">
        <div className="t-carril">
          {prendas.map((p) => {
            const [foto, segunda] = fotosDeTarjeta(p);
            return (
              <Link key={p.id} className="t-card po-tarjeta" href={hrefConVolver("/crear-cuenta", hrefDePrenda(p))} aria-label={`${p.nombre}: crea tu cuenta para ver su precio`}>
                <span className="t-card-media">
                  <FotoTarjeta
                    foto={foto}
                    segunda={segunda}
                    optimizar={[foto ? fotoOptimizable(foto, origenFotos) : false, segunda ? fotoOptimizable(segunda, origenFotos) : false]}
                    nombre={p.nombre}
                    forma={formaDe(p.categoria?.prefijo)}
                    color={colorDeDibujo(p)}
                  />
                  {p.nuevo && (
                    <span className="t-insignias">
                      <span className="t-insignia cp-insignia-nuevo">Nuevo</span>
                    </span>
                  )}
                </span>
                <span className="t-card-info">
                  <span className="t-card-nom">{p.nombre}</span>
                  <span className="po-ver-precio">
                    Ver precio <Icono nombre="flecha" />
                  </span>
                </span>
              </Link>
            );
          })}
          {mas > 0 && (
            <Link className="po-mas" href={verTodo}>
              <span className="po-mas-n">+{mas}</span>
              <span>{mas === 1 ? "prenda más te espera adentro" : "prendas más te esperan adentro"}</span>
              <span className="t-btn t-btn-chico">Crear mi cuenta</span>
            </Link>
          )}
        </div>
      </CarrilConFlechas>
    </section>
  );
}
