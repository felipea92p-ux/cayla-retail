import type { ComponentProps } from "react";
import Link from "next/link";
import { HeroeDePortada } from "@cayla-retail/portada";
import { Anuncio } from "@/components/Anuncio";
import { AsiSeSepara } from "@/components/AsiSeSepara";
import { Cabecera } from "@/components/Cabecera";
import { CejaDeCampana } from "@/components/CejaDeCampana";
import { CuentaRegresiva } from "@/components/CuentaRegresiva";
import { Icono } from "@/components/Icono";
import { Isotipo } from "@/components/Isotipo";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { piezasDelHeroe } from "@/components/PiezasDelHeroe";
import { Pie } from "@/components/Pie";
import { ConfianzaPortada } from "@/components/portada/ConfianzaPortada";
import { VitrinaSinPrecio } from "@/components/portada/VitrinaSinPrecio";
import { SeccionClub } from "@/components/SeccionClub";
import { TarjetaClub } from "@/components/TarjetaClub";
import { hrefDePrenda, hrefLista } from "@/lib/catalogo";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { leerBeneficiosDelClub } from "@/lib/cuentas-servidor";
import { hrefConVolver } from "@/lib/entrada";
import { heroDelInicio, type Hero } from "@/lib/inicio";
import { anioActual } from "@/lib/hoy-servidor";
import { leerPortada } from "@/lib/portada-servidor";
import { anuncios, partirTitulo, pctTexto, type Campana } from "@/lib/portada";
import { leerSedes } from "@/lib/tiendas-servidor";
import { vitrinaDePortada } from "@/lib/vitrina-portada";
import "./estilos/tiendas.css";
import "./estilos/portada.css";

// La campaña y las prendas salen de la base (lecturas compartidas de 30 a 300 s, `lib/compartido-servidor.ts`): lo que se cambia en el
// ERP aparece solo, sin volver a publicar la tienda. Si la base no responde, la portada sale igual, sin campaña, sin fotos ni tiendas, y
// a la vuelta siguiente se vuelve a leer la base. «Así se separa» y el Club son las mismas piezas del Inicio.

/**
 * La portada de quien todavía no tiene cuenta (maqueta v4; Felipe 2026-10-16: «competencia de grandes empresas mundiales» y «fotos sin
 * precio»). Arriba la campaña (o lo nuevo) con sus prendas como polaroids, SIN precio; la franja de lo que la tienda cumple; la vitrina de
 * lo que hay en tienda, también sin precio (cada foto lleva a crear la cuenta y, al terminarla, a esa prenda); cómo se separa; el Club con
 * su tarjeta (una sola: antes también estaba en el héroe); y nuestras tiendas. Precio, tallas y cuánto hay, solo con cuenta.
 */
export default async function Portada() {
  const [{ campana }, sedes, catalogo, beneficios] = await Promise.all([leerPortada(), leerSedes(), leerCatalogo(null), leerBeneficiosDelClub()]);
  const anio = await anioActual();
  const prendas = catalogo?.prendas ?? [];
  const hero = heroDelInicio(campana, prendas);
  const piezas = hero.tipo === "marca" ? [] : hero.piezas;
  const vitrina = vitrinaDePortada(prendas, new Set(piezas.map((p) => p.id)));
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  // El rojo de la campaña cuando el héroe la anuncia (con sus prendas o, sin ninguna publicada, solo su texto); si no, el oscuro.
  const conCampana = hero.tipo === "campana" || (hero.tipo === "marca" && campana !== null);
  // A dónde llega quien crea su cuenta desde el héroe: a la campaña, o a lo nuevo.
  const destino =
    hero.tipo === "campana"
      ? hrefLista({ categoria: null, orden: "destacado", lista: "ofertas", campana: hero.campanaId })
      : hero.tipo === "nuevo"
        ? hrefLista({ categoria: null, orden: "destacado", lista: "nuevo" })
        : null;

  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campana)} />
      <Cabecera />
      <main className="t-pagina">
        <HeroeDePortada
          clase={`t-portada${piezas.length > 0 ? " po-hero" : ""}`}
          sinCampana={!conCampana}
          colibri={<Isotipo className="t-colibri" />}
          {...textoDelHeroe(hero, campana)}
          acciones={
            <>
              <Link className="t-btn t-btn-claro" href={hrefConVolver("/crear-cuenta", destino)}>
                Crear mi cuenta
              </Link>
              <Link className="t-enlace" href={hrefConVolver("/entrar", destino)}>
                Ya tengo cuenta · Entrar <Icono nombre="flecha" />
              </Link>
            </>
          }
          piezas={piezasDelHeroe(piezas, { href: (p) => hrefConVolver("/crear-cuenta", hrefDePrenda(p)), conPrecio: false, origenFotos })}
          Enlace={Link}
          marca={hero.tipo === "campana" ? `−${pctTexto(hero.campana.pct)}%` : null}
          lado={
            // Sin prendas para mostrar (o sin base): la tarjeta del Club, como antes.
            <div className="t-portada-club">
              <TarjetaClub nombre="Tu nombre aquí" desde={anio} />
              <p>Crea tu cuenta y forma parte del Club CAYLA.</p>
            </div>
          }
        />

        <ConfianzaPortada tiendas={sedes.map((s) => s.nombre)} />
        <VitrinaSinPrecio prendas={vitrina} total={prendas.length - piezas.length} origenFotos={origenFotos} />
        <AsiSeSepara />
        <SeccionClub nombre={null} desde={anio} conCuenta={false} cumplePct={beneficios?.pct ?? null} />

        {/* Las tiendas que el ERP muestra en la web (Configuración ▸ Tienda web). Sin ninguna, o sin base, la sección no sale. */}
        {sedes.length > 0 && <NuestrasTiendas sedes={sedes} />}
      </main>
      <Pie anio={anio} />
    </div>
  );
}

type TextoDelHeroe = Pick<ComponentProps<typeof HeroeDePortada>, "ceja" | "titulo" | "descripcion" | "cuenta">;

/** El texto del héroe: la campaña con sus prendas, lo nuevo, o la frase de la marca (sin nada que mostrar). */
function textoDelHeroe(hero: Hero, campana: Campana | null): TextoDelHeroe {
  if (hero.tipo === "campana") return textoCampana(hero.campana);
  if (hero.tipo === "nuevo") {
    return {
      ceja: "Recién llegado",
      titulo: ["Lo nuevo", "de CAYLA"],
      descripcion: (
        <>
          <b>Lo que llegó a nuestras tiendas en los últimos 30 días.</b> Crea tu cuenta para ver precios, tallas y cuánto hay en cada tienda.
        </>
      ),
    };
  }
  // Una campaña sin prendas publicadas igual se anuncia (la franja de arriba ya la nombra), sin fotos.
  if (campana) return textoCampana(campana);
  // Sin campaña ni prendas, la frase de la marca. Le habla igual a todos: la maqueta decía «Bienvenido a CAYLA», y un texto para el
  // cliente no lleva género (ADR-0288 act. k).
  return {
    ceja: "Tienda online",
    titulo: ["Donde el estilo", "transforma"],
    descripcion: "Crea tu cuenta para ver el catálogo, cuánto hay en cada tienda y separar.",
  };
}

function textoCampana(campana: Campana): TextoDelHeroe {
  return {
    ceja: <CejaDeCampana hasta={campana.hasta} />,
    titulo: partirTitulo(campana.nombre),
    descripcion: (
      <>
        <b>−{pctTexto(campana.pct)} % en prendas elegidas.</b> Crea tu cuenta para ver los precios, cuánto hay en cada tienda y separar.
      </>
    ),
    cuenta: campana.hasta ? <CuentaRegresiva hasta={campana.hasta} /> : null,
  };
}
