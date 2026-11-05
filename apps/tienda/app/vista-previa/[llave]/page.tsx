import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Anuncio } from "@/components/Anuncio";
import { ProveedorGuardados } from "@/components/club/Guardados";
import { HeroeDelInicio } from "@/components/HeroeDelInicio";
import { TarjetaPrenda } from "@/components/TarjetaPrenda";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import type { Prenda } from "@/lib/catalogo";
import { anuncios, fechaCorta } from "@/lib/portada";
import { leerVistaPrevia } from "@/lib/vista-previa-campana-servidor";
import "@/app/estilos/inicio.css";

// La vista previa privada del diseño de una campaña (Tienda web ▸ Campañas, ERP): la franja, la portada y las prendas con el diseño que el líder
// armó, con las prendas de la tienda de verdad, sin que lo vea nadie que no tenga el enlace. Nunca se indexa. Un enlace que no sirve (llave rara,
// vencida, campaña terminada) dice solo eso: no revela si la llave existió.
export const metadata: Metadata = {
  title: "Vista previa · CAYLA",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

// La llave y la lectura de la base se conocen al pedir la página: van dentro de un <Suspense> para que el resto de la cáscara no espere (la tienda
// arma sus páginas por adelantado, ADR-0432).
export default function VistaPrevia({ params }: { params: Promise<{ llave: string }> }) {
  return (
    <Suspense fallback={<div className="tienda" aria-busy="true" />}>
      <ContenidoDeLaVistaPrevia params={params} />
    </Suspense>
  );
}

async function ContenidoDeLaVistaPrevia({ params }: { params: Promise<{ llave: string }> }) {
  const { llave } = await params;
  const vista = await leerVistaPrevia(llave);
  if (!vista) {
    return (
      <div className="tienda">
        <main className="t-ancho">
          <div className="t-vacio">
            <h3>Este enlace ya no sirve</h3>
            <p>Puede que haya vencido o que la campaña haya terminado. Pide uno nuevo a quien te lo compartió.</p>
            <Link className="t-btn t-btn-claro" href="/inicio">
              Ir a la tienda
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { campana, diseno } = vista;
  const catalogo = await leerCatalogo(null);
  // Las prendas de la tienda (las que tienen foto primero), vestidas como si ya estuvieran en esta campaña (el descuento solo se ve en vivo cuando la campaña empieza).
  const prendas: Prenda[] = [...(catalogo?.prendas ?? [])]
    .sort((a, b) => Number(b.fotos.length > 0) - Number(a.fotos.length > 0))
    .slice(0, 8)
    .map((p) => ({
      ...p,
      campana: { id: null, nombre: campana.nombre, pct: campana.pct, hasta: campana.hasta },
      precioFinal: Math.round(p.precio * (1 - campana.pct / 100) * 100) / 100,
    }));
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;

  return (
    <div className="tienda">
      <div className="cp-previa-aviso" role="note">
        <b>Vista previa privada</b> · «{campana.nombre}» · {vista.valeHasta ? `vale hasta el ${fechaCorta(vista.valeHasta)}` : "vale unos días"} · Solo la ve quien tiene este enlace. Las prendas son de la
        tienda; el descuento se muestra como se verá cuando la campaña esté en vivo.
      </div>
      <Anuncio frases={anuncios({ nombre: campana.nombre, pct: campana.pct, hasta: campana.hasta }, false)} diseno={diseno} />
      <ProveedorGuardados favoritos={[]}>
        <HeroeDelInicio
          hero={{ tipo: "campana", campana: { nombre: campana.nombre, pct: campana.pct, hasta: campana.hasta }, piezas: prendas.slice(0, 3), campanaId: null }}
          diseno={diseno}
          sede={null}
          origenFotos={origenFotos}
          verCampana="#prendas"
          verNuevo="#prendas"
        />
        {diseno === null && (
          <div className="t-ancho">
            <p className="cp-previa-nota">Este diseño todavía no se puede pintar en la tienda (por ejemplo, un color que no se lee o una imagen que falta): hoy se vería como siempre.</p>
          </div>
        )}
        {prendas.length > 0 && (
          <section id="prendas" className="t-sec t-ancho" aria-label="Prendas de la campaña">
            <div className="t-grilla">
              {prendas.map((p) => (
                <TarjetaPrenda key={p.id} prenda={p} sede={null} origenFotos={origenFotos} diseno={diseno} />
              ))}
            </div>
          </section>
        )}
      </ProveedorGuardados>
    </div>
  );
}
