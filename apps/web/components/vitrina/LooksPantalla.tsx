"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Shirt } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { SinFoto } from "@/components/ui/PrendaCelda";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { LookHoja } from "@/components/vitrina/LookHoja";
import { LookMostrarHoja } from "@/components/vitrina/LookMostrarHoja";
import {
  cifrasLooks,
  estadoDeLook,
  filtrarLooks,
  porQueNoSeVe,
  resumenLook,
  type FiltroLooks,
  type LecturaLooks,
  type Look,
} from "@/lib/vitrina-looks-reglas";

/**
 * Tienda web ▸ Vitrina ▸ Looks (ADR-0408, actividad 11; maqueta v4, «looks-erp»): las combinaciones de 2 a 4 prendas que la tienda
 * online muestra en «Arma tu look», en su orden. Tocar un look abre su hoja (nombre, frase, prendas, si se ve y su lugar); el interruptor de
 * una fila lo muestra u oculta. Un look encendido con una prenda que dejó de verse en la web no sale en la tienda: la fila dice cuál.
 * Toda escritura pasa por una hoja con el combo «Responsable» (ADR-0162).
 */
export function LooksPantalla({ lectura }: { lectura: LecturaLooks }) {
  const router = useRouter();
  const [looks, setLooks] = useState(lectura.looks);
  // Lo que trae el servidor al refrescar manda (sin un efecto: se ajusta al dibujar, como pide React).
  const [deServidor, setDeServidor] = useState(lectura.looks);
  if (deServidor !== lectura.looks) {
    setDeServidor(lectura.looks);
    setLooks(lectura.looks);
  }
  const [filtro, setFiltro] = useState<FiltroLooks>("todos");
  // La hoja abierta: un look (su id) o «nuevo».
  const [abierto, setAbierto] = useState<string | null>(null);
  const [interruptor, setInterruptor] = useState<{ id: string; publicado: boolean } | null>(null);

  const cifras = cifrasLooks(looks);
  const visibles = filtrarLooks(looks, filtro);
  const lookAbierto = abierto && abierto !== "nuevo" ? looks.find((l) => l.id === abierto) ?? null : null;
  const lookDelInterruptor = interruptor ? looks.find((l) => l.id === interruptor.id) ?? null : null;
  const alternarFiltro = (f: FiltroLooks) => setFiltro((actual) => (actual === f ? "todos" : f));
  const sinModelos = lectura.modelos.length < 2;

  // Lo guardado reemplaza su fila; como el lugar de los demás pudo correrse, se vuelve a leer la lista.
  const actualizar = (nuevo: Look) => {
    setLooks((ls) => (ls.some((l) => l.id === nuevo.id) ? ls.map((l) => (l.id === nuevo.id ? nuevo : l)) : [...ls, nuevo]).sort((a, b) => a.lugar - b.lugar));
    router.refresh();
  };

  const nuevoLook = (
    <Boton
      type="button"
      peso="primario"
      aria-haspopup="dialog"
      data-guia="looks.nuevo"
      disabled={sinModelos}
      title={sinModelos ? "Primero muestra en la web al menos dos modelos (pestaña Modelos)." : undefined}
      onClick={() => setAbierto("nuevo")}
    >
      + Nuevo look
    </Boton>
  );

  return (
    <div className="tw space-y-6">
      <div className="grid gap-3 sm:grid-cols-2" data-guia="looks.cifras">
        <TarjetaCifra
          punto="verde"
          etiqueta="Se ven en la web"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={cifras.seVen} alMontar />}
          activa={filtro === "en_la_web"}
          onClick={() => alternarFiltro("en_la_web")}
        >
          {`de ${cifras.total} ${cifras.total === 1 ? "look" : "looks"}`}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.noSeVen > 0 ? "ambar" : "neutro"}
          etiqueta="Encendidos que no se ven"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={cifras.noSeVen} alMontar />}
          activa={filtro === "no_se_ven"}
          onClick={() => alternarFiltro("no_se_ven")}
        >
          {cifras.noSeVen > 0 ? "Una prenda suya ya no se ve en la web" : "Todos los encendidos se ven"}
        </TarjetaCifra>
      </div>

      <section className="card-cayla space-y-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-sand px-5 py-4">
          <p className="min-w-[14rem] flex-1 text-[13px] text-taupe" data-guia="looks.ayuda">
            En la tienda salen en este orden. Toca un look para cambiar sus prendas, su nombre o su lugar; el interruptor lo muestra u oculta.
          </p>
          {looks.length > 0 && nuevoLook}
        </div>

        {looks.length === 0 ? (
          <Vacio icono={<Shirt />} titulo="Todavía no hay looks" acciones={nuevoLook}>
            {sinModelos
              ? "Un look junta de 2 a 4 prendas que se ven en la web. Primero muestra al menos dos modelos en la pestaña Modelos."
              : "Junta de 2 a 4 prendas que se vean bien juntas. El cliente las ve armadas en «Arma tu look» y las agrega eligiendo cada talla."}
          </Vacio>
        ) : visibles.length === 0 ? (
          <Vacio icono={<Shirt />} tamano="chico">
            {filtro === "no_se_ven" ? "Todos los looks encendidos se ven en la web." : "Ningún look se ve en la web todavía."}
          </Vacio>
        ) : (
          // Cada look como lo arma el cliente (ADR-0430): sus prendas lado a lado, en su orden de «Arma tu look».
          <ul className="tw-looks" data-guia="looks.lista" aria-label="Los looks, en el orden en que salen en la tienda">
            {visibles.map((l, i) => (
              <CartaLook key={l.id} look={l} i={i} onAbrir={() => setAbierto(l.id)} onInterruptor={() => setInterruptor({ id: l.id, publicado: !l.publicado })} />
            ))}
          </ul>
        )}
      </section>

      <div className="nota-cayla space-y-2 text-[13px]" data-guia="looks.nota">
        <p>
          El cliente ve cada look en «Arma tu look», con el precio de la tienda que elige (con «Todas», el más alto entre ellas) y la campaña
          encima, y lo agrega completo eligiendo la talla de cada prenda. Un look solo sale si todas sus prendas se ven en la web; el total de
          cada fila es el que ve con «Todas».
        </p>
      </div>

      {abierto && (
        <LookHoja
          key={abierto}
          look={lookAbierto}
          modelos={lectura.modelos}
          cuantos={looks.length}
          onClose={() => setAbierto(null)}
          onGuardado={actualizar}
        />
      )}
      {interruptor && lookDelInterruptor && (
        <LookMostrarHoja
          look={lookDelInterruptor}
          publicado={interruptor.publicado}
          onClose={() => setInterruptor(null)}
          onHecho={(nuevo) => {
            setInterruptor(null);
            actualizar(nuevo);
          }}
        />
      )}
    </div>
  );
}

/** Un look como lo arma el cliente (ADR-0430): su lugar, sus 2 a 4 prendas lado a lado (la que ya no se ve en la web, atenuada), el
 *  nombre que abre su hoja, cuántas y cuánto, por qué no sale si no sale, y el interruptor. Entra en cascada al llegar (`.tw-carta`). */
function CartaLook({ look: l, i, onAbrir, onInterruptor }: { look: Look; i: number; onAbrir: () => void; onInterruptor: () => void }) {
  const estado = estadoDeLook(l);
  const motivo = porQueNoSeVe(l);
  return (
    <li className="tw-carta" style={{ "--i": i } as CSSProperties} data-oculta={l.publicado ? undefined : ""}>
      <button type="button" onClick={onAbrir} className="tw-look-collage" aria-label={`Abrir el look ${l.nombre}`} tabIndex={-1}>
        <span className="tw-look-lugar" aria-label={`Lugar ${l.lugar}`}>
          {l.lugar}
        </span>
        {l.piezas.map((p) => {
          const sinFoto = <SinFoto tamano="h-full w-full !rounded-none" colorHex={p.color.hex} prefijo={p.prefijo} familia={p.familia} categoria={p.categoria} />;
          return (
            <span key={p.posicion} data-no-se-ve={p.seVe ? undefined : ""}>
              {p.foto ? <ImagenDePrenda src={p.foto} alt="" fill sizes="140px" className="object-cover" fondo={p.color.hex} fallback={sinFoto} /> : sinFoto}
            </span>
          );
        })}
      </button>
      <span className="tw-carta-cuerpo">
        <button type="button" onClick={onAbrir} data-guia="looks.abrir" className="tw-carta-nombre">
          {l.nombre}
        </button>
        <span className="text-[12px] leading-snug text-taupe">{`${resumenLook(l)} · ${l.piezas.map((p) => p.nombre).join(", ")}`}</span>
        {estado === "no_se_ve" && motivo && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ambar-profundo">
            <Chip tono="ambar">No se ve en la web</Chip>
            <span className="min-w-0">{motivo}</span>
          </span>
        )}
        <span className="tw-carta-pie" data-guia="looks.interruptor">
          <span>{l.seVe ? "Se ve en la web" : l.publicado ? "Encendido" : "Oculto"}</span>
          <button
            type="button"
            role="switch" // unificar-fijo: la cara del interruptor del sistema en la carta de un look; su título es la línea de al lado
            aria-checked={l.publicado}
            aria-label={`Mostrar el look ${l.nombre} en la web`}
            onClick={onInterruptor}
            className="interruptor"
          >
            <span aria-hidden className="interruptor-perilla" />
          </button>
        </span>
      </span>
    </li>
  );
}
