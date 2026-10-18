import type { ReactNode } from "react";
import Link from "next/link";
import { CejaDeCampana, HeroeDePortada, destacadoDeCampana, partirTitulo, pctTexto, type PiezaDeHeroe } from "@cayla-retail/portada";
import { hrefDePrenda, hrefLista } from "@/lib/catalogo";
import type { Hero } from "@/lib/inicio";
import { CuentaRegresiva } from "./CuentaRegresiva";
import { FotoDeFondo } from "./FotoDeFondo";
import { Icono } from "./Icono";
import { Isotipo } from "./Isotipo";
import { TextoConMarca } from "./Marca";
import { piezasDelHeroe } from "./PiezasDelHeroe";
import "@/app/estilos/inicio.css";

/**
 * El héroe del Inicio (maqueta, `heroCampana` y `heroNuevo`): el texto a la izquierda y, en la computadora, las fotos de la campaña. Lo
 * dibuja `HeroeDePortada` (@cayla-retail/portada, ADR-0436: la misma pieza de la vista previa del ERP, con el diseño publicado de la
 * campaña); aquí solo se le pasan las piezas de la tienda (el colibrí del logo oficial, la palabra CAYLA como dibujo, el enlace de Next, las
 * fotos con su optimizador). Lo usan el Inicio y su esqueleto (2026-10-17, Felipe: «quisiera que sea más fiel a lo que mostrará el
 * contenido»): mientras llega el Inicio, el héroe ya está, con la campaña de verdad (`leerPortada`, la misma que lee la franja), y solo las
 * fotos esperan. Con `enEspera`, los botones son su forma (todavía no se sabe a qué campaña lleva) y en lugar de las fotos van sus marcos
 * vacíos.
 */
export function HeroeDelInicio({
  hero,
  sede,
  origenFotos,
  verCampana,
  verNuevo,
  enEspera = false,
}: {
  hero: Hero;
  sede: string | null;
  origenFotos: string | undefined;
  /** null: la campaña sale por su diseño, sin prendas a la vista; el botón lleva a «Lo nuevo» (o a toda la tienda), nunca a una lista vacía. */
  verCampana: string | null;
  verNuevo: string | null;
  enEspera?: boolean;
}) {
  const campana = hero.tipo === "campana" ? hero.campana : null;
  // Un botón del esqueleto se ve igual pero no lleva a ningún lado: la dirección de la campaña sale de las prendas, que aún no llegan.
  const boton = (clase: string, href: string | null, contenido: ReactNode) =>
    enEspera || !href ? (
      <span className={clase} aria-hidden="true">
        {contenido}
      </span>
    ) : (
      <Link className={clase} href={href}>
        {contenido}
      </Link>
    );
  const verLoNuevo = (
    <>
      Ver lo nuevo <Icono nombre="flecha" />
    </>
  );
  const comun = {
    clase: "t-hero-inicio",
    sinCampana: hero.tipo !== "campana",
    colibri: <Isotipo className="t-colibri" />,
    Enlace: Link,
    Texto: (t: string) => <TextoConMarca texto={t} />,
    enEspera,
    piezas: enEspera ? MARCOS_VACIOS : piezasDelHeroe(hero.tipo === "marca" ? [] : hero.piezas, { href: (p) => hrefDePrenda(p, sede), conPrecio: true, origenFotos }),
  };

  if (campana) {
    return (
      <HeroeDePortada
        {...comun}
        ceja={<CejaDeCampana hasta={campana.hasta} />}
        titulo={partirTitulo(campana.nombre, campana.diseno?.corte)}
        descripcion={
          <>
            <b>{destacadoDeCampana(campana)}</b> Sepáralas online, confírmalas por WhatsApp y recógelas en tu tienda.
          </>
        }
        cuenta={campana.hasta ? <CuentaRegresiva hasta={campana.hasta} /> : null}
        acciones={
          verCampana || enEspera ? (
            <>
              {boton("t-btn t-btn-claro", verCampana, "Ver la campaña")}
              {(verNuevo || enEspera) && boton("t-enlace", verNuevo, verLoNuevo)}
            </>
          ) : (
            boton("t-btn t-btn-claro", verNuevo ?? hrefLista({ sede, categoria: null, orden: "destacado" }), verNuevo ? "Ver lo nuevo" : "Ver toda la tienda")
          )
        }
        marca={campana.pct ? `−${pctTexto(campana.pct)}%` : null}
        // Con su diseño publicado en el ERP (ADR-0436), sus colores, su fondo y su acomodo; sin él, el rojo de siempre.
        diseno={campana.diseno}
        FotoDeFondo={FotoDeFondo}
      />
    );
  }
  if (hero.tipo === "nuevo") {
    return (
      <HeroeDePortada
        {...comun}
        ceja="Recién llegado"
        titulo={["Lo nuevo", "de CAYLA"]}
        descripcion="Lo que llegó a nuestras tiendas en los últimos 30 días."
        acciones={verNuevo ? boton("t-btn t-btn-claro", verNuevo, "Ver lo nuevo") : undefined}
      />
    );
  }
  return (
    <HeroeDePortada
      {...comun}
      ceja="Tienda online"
      titulo={["Donde el estilo", "transforma"]}
      descripcion="Mira lo que hay en cada tienda, sepáralo aquí y recógelo en tu tienda."
      acciones={boton("t-btn t-btn-claro", hrefLista({ sede, categoria: null, orden: "destacado" }), "Ver toda la tienda")}
    />
  );
}

/** El lugar de las polaroids mientras llegan sus fotos: los tres marcos, quietos y apagados, en el mismo sitio. Al llegar el Inicio, las de
 *  verdad caen como siempre. */
const MARCOS_VACIOS: readonly PiezaDeHeroe[] = [1, 2, 3].map((n) => ({
  id: `espera-${n}`,
  nombre: "",
  foto: <span className="t-card-foto" />,
  derecha: (
    <>
      <i />
      <i />
    </>
  ),
}));
