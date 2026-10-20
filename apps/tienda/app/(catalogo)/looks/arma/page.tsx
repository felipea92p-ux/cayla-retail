import type { Metadata } from "next";
import Link from "next/link";
import { Promesas } from "@/components/bolsa/Promesas";
import { Icono } from "@/components/Icono";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { Probador } from "@/components/probador/Probador";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { fotoOptimizable, hrefLista } from "@/lib/catalogo";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { leerMisLooksEnBase } from "@/lib/looks-guardados-servidor";
import { promesasDeCompra } from "@/lib/ficha";
import { hrefLooks } from "@/lib/looks";
import { armarProbador, completarLook, hrefDelProbador, lookDeLaUrl, lookInicial, PARAMETRO_DEL_LOOK } from "@/lib/probador";
import { leerProbador } from "@/lib/probador-servidor";
import { claveDeSede, sedesEnOrden } from "@/lib/sede-elegida";
import { sedeDeLaPagina } from "@/lib/sede-servidor";
import { hayEnTienda } from "@/lib/stock";
import { leerSesion } from "@/lib/sesion-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../../../estilos/probador.css";

export const metadata: Metadata = { title: "Arma el tuyo · CAYLA" };

// «Arma el tuyo» (ADR-0434, actividad 4; lienzo v3, `V3Probador`): el probador de looks. Junta el catálogo de la tienda elegida (qué se
// ve, su nombre y sus colores; con «Ver lo que hay en», solo lo que hay ahí) con lo del probador (el largo, los recortes y el precio y el
// stock de cada color) y abre con el look de la dirección (`?p=`) o, si no trae uno, con lo primero que hay. Pide cuenta como todo el
// catálogo (el layout del grupo). Se llega desde la cabecera, la tarjeta de «Arma tu look» y la ficha de cada prenda que se puede probar
// («Arma un look con esta prenda», que abre con ella en su color: actividad 10), y desde un look guardado o compartido.
export default async function ArmaElTuyo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = await sedeDeLaPagina(sp, sedes, "/looks/arma", claveDeSede);
  const sesion = await leerSesion();
  // Lo de todos (el catálogo, el probador y los plazos) y lo de la persona (sus looks guardados, para el corazón), a la vez.
  const [catalogo, lectura, plazos, guardados] = await Promise.all([
    leerCatalogo(pedida?.id ?? null),
    leerProbador(pedida?.id ?? null),
    leerAyuda(),
    sesion.estado === "con_sesion" ? leerMisLooksEnBase(sesion.usuarioId) : null,
  ]);
  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base ya respondió con «Todas»).
  const elegida = catalogo?.sede ? (sedes.find((s) => s.id === catalogo.sede) ?? null) : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  // Lo que se ve en esa tienda (con «Todas», todo): la cabecera y el probador dicen lo mismo que el catálogo.
  const deLaTienda = (catalogo?.prendas ?? []).filter((p) => hayEnTienda(p.stock, elegida?.id ?? null));
  const prendas =
    catalogo && lectura ? armarProbador(deLaTienda, lectura, { elegida, tiendas: sedes, optimizable: (url) => fotoOptimizable(url, origenFotos) }) : [];
  // El look de la dirección (lo que siga en esta tienda, completado si perdió lo de arriba o lo de abajo) o, sin él, lo primero que hay.
  const deLaDireccion = lookDeLaUrl(sp[PARAMETRO_DEL_LOOK], prendas);
  const inicial = deLaDireccion ? completarLook(deLaDireccion, prendas) : lookInicial(prendas);
  const tiendas: { nombre: string; sede: string | null; actual: boolean }[] = [
    { nombre: "Todas", sede: null, actual: elegida === null },
    ...sedes.map((s) => ({ nombre: s.nombre, sede: claveDeSede(s.nombre), actual: elegida?.id === s.id })),
  ];
  const lookDeLaDireccion = typeof sp[PARAMETRO_DEL_LOOK] === "string" ? sp[PARAMETRO_DEL_LOOK] : null;

  return (
    <MarcoCatalogo
      prendas={deLaTienda}
      sede={sede}
      actual="probador"
      filtro={tiendas.filter((t) => t.sede).map((t) => ({ nombre: t.nombre, href: hrefDelProbador(t.sede, lookDeLaDireccion), actual: t.actual }))}
    >
      {catalogo === null || lectura === null ? (
        <div className="t-ancho">
          <div className="t-vacio" role="status">
            <Icono nombre="tienda" />
            <h3>No pudimos abrir el probador</h3>
            <p>Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.</p>
            <Link className="t-btn" href={hrefDelProbador(pedida ? claveDeSede(pedida.nombre) : null, lookDeLaDireccion)}>
              Volver a intentar
            </Link>
          </div>
        </div>
      ) : prendas.length === 0 ? (
        <div className="t-ancho">
          <div className="t-vacio">
            <Icono nombre="chispa" />
            <h3>Pronto podrás armar tu look aquí</h3>
            <p>{elegida ? `Todavía no hay prendas listas para el probador en ${elegida.nombre}.` : "Estamos preparando las prendas para el probador."} Mientras tanto, mira los looks que armamos para ti.</p>
            <Link className="t-btn" href={hrefLooks(sede)}>
              Ver los looks
            </Link>
            <Link className="t-enlace" href={hrefLista({ sede, categoria: null, orden: "destacado" })}>
              Ver toda la tienda
            </Link>
          </div>
        </div>
      ) : (
        // Otra tienda es otro probador (otros precios, otro stock): vuelve a abrir con el look de la dirección.
        <Probador
          key={sede ?? "todas"}
          prendas={prendas}
          combina={lectura.combina}
          inicial={inicial}
          sedeId={elegida?.id ?? null}
          origenFotos={origenFotos}
          guardados={guardados}
          pie={<Promesas promesas={promesasDeCompra(plazos)} />}
        />
      )}
    </MarcoCatalogo>
  );
}
