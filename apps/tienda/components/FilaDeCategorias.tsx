import Image from "next/image";
import Link from "next/link";
import { fotoOptimizable, hrefLista } from "@/lib/catalogo";
import type { CategoriaConFoto } from "@/lib/portada-l";

/** La fila de categorías bajo la portada (ADR-0613): una prenda real de cada una, en un círculo con su color. Se desliza si no cabe. */
export function FilaDeCategorias({ categorias, sede, origenFotos }: { categorias: CategoriaConFoto[]; sede: string | null; origenFotos: string | undefined }) {
  if (categorias.length === 0) return null;
  return (
    <nav className="pl-cats t-ancho" aria-label="Categorías">
      {categorias.map((c) => (
        <Link className="pl-cat" key={c.clave} href={hrefLista({ sede, categoria: c.clave, orden: "destacado" })} style={{ "--c": c.fondo } as React.CSSProperties}>
          <span>
            <Image src={c.foto} alt="" width={124} height={124} sizes="124px" unoptimized={!fotoOptimizable(c.foto, origenFotos)} />
          </span>
          {c.nombre}
        </Link>
      ))}
    </nav>
  );
}
