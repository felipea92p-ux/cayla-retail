"use client";

import { useRef, useState, type CSSProperties } from "react";
import { ImagePlus } from "lucide-react";
import {
  ACOMODOS,
  COLOR_PROPIO_DE_PARTIDA,
  ESTILOS,
  FONDOS,
  FRASE_MAX,
  INTENSIDAD,
  INTENSIDADES,
  OSCURO_MAX,
  OSCURO_MIN,
  PALETAS,
  PATRONES,
  TAMANOS,
  aplicarEstilo,
  colorQueSeLee,
  coloresDelDiseno,
  estiloDelDiseno,
  mascaraDePatron,
  paletaPropia,
  pctTexto,
  piezasQueCaben,
  seLee,
  veloDeLaFoto,
  type Colores,
  type ColoresPropios,
  type DisenoDeCampana,
  type Fondo,
  type Intensidad,
  type Patron,
  type Sello,
  type Tamano,
} from "@cayla-retail/portada";
import { Aviso } from "@/components/ui/Aviso";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Boton, CampoTexto, Interruptor } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import {
  NOMBRES_ACOMODO,
  NOMBRES_FONDO,
  NOMBRES_INTENSIDAD,
  NOMBRES_PATRON,
  NOMBRES_SELLO,
  NOMBRES_TAMANO,
  cortarEn,
  corteEfectivo,
  palabrasDelNombre,
  prendasMarcadas,
  sellosDeLaCampana,
  tocarPrenda,
  type CampanaDePortada,
  type PiezaDePortada,
} from "@/lib/campana-diseno";
import { sugerirFrase } from "@/lib/sugerencias-campanas";
import { createClient } from "@/lib/supabase/client";
import { prepararFotoDeFondo, subirFotoDeFondo } from "@/lib/foto-de-campana";
import { Lienzo } from "./Lienzo";
import { FotoDePolaroid, PortadaDeCampana } from "./PortadaDeCampana";

// Los pasos del editor de «Diseño en la web» (ADR-0436; maqueta, pantalla 2): el cuerpo de cada uno. Cada paso recibe el diseño y avisa
// el cambio con `onCambiar`; el editor (`DisenoCampana`) guarda el borrador y lleva la guía de foco.

/** Paso 1: los ocho estilos de partida, cada uno con su portada en chico. El texto y las prendas que ya se eligieron se quedan. */
export function PasoEstilo({
  diseno,
  campana,
  piezas,
  ahora,
  onCambiar,
}: {
  diseno: DisenoDeCampana;
  campana: CampanaDePortada;
  piezas: readonly PiezaDePortada[];
  ahora: number;
  onCambiar: (d: DisenoDeCampana) => void;
}) {
  const actual = estiloDelDiseno(diseno)?.id ?? null;
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-tinta/70">Un toque y la portada queda lista. Después cambia lo que quieras.</p>
      <div className="tw-opciones">
        {ESTILOS.map((e) => {
          const con = aplicarEstilo(diseno, e.id);
          return (
            <button key={e.id} type="button" className="tw-opcion" aria-pressed={actual === e.id} onClick={() => onCambiar(con)}>
              <Lienzo ancho={1280} alto={720}>
                <PortadaDeCampana campana={campana} diseno={con} tema="claro" piezas={piezas} ahora={ahora} />
              </Lienzo>
              <span className="tw-opcion-nombre">
                {e.nombre}
                <small>{e.nota}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Paso 2: las paletas curadas, las sacadas de las prendas de la campaña y «Mi color» (la letra se elige sola). */
export function PasoColores({
  diseno,
  paletasDePrendas,
  onCambiar,
}: {
  diseno: DisenoDeCampana;
  paletasDePrendas: readonly ColoresPropios[];
  onCambiar: (d: DisenoDeCampana) => void;
}) {
  const propia = diseno.paleta === "propia" ? diseno.colores : null;
  const esMiColor = propia?.nombre === "Mi color";
  const miColorSeLee = esMiColor && seLee(diseno, "claro") && seLee(diseno, "oscuro");
  const elegir = (colores: ColoresPropios) => onCambiar({ ...diseno, paleta: "propia", colores });
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <TituloGrupo>Paletas que siempre se leen bien</TituloGrupo>
        <div className="tw-muestras">
          {PALETAS.map((p) => (
            <Muestra
              key={p.id}
              nombre={p.nombre}
              fondo={p.fondo}
              acento={p.acento}
              elegida={diseno.paleta === p.id}
              onClick={() => onCambiar({ ...diseno, paleta: p.id, colores: null })}
            />
          ))}
        </div>
      </div>
      {paletasDePrendas.length > 0 && (
        <div className="space-y-2">
          <TituloGrupo>Sacadas de las prendas de esta campaña</TituloGrupo>
          <div className="tw-muestras">
            {paletasDePrendas.map((p) => (
              <Muestra key={p.fondo} nombre={p.nombre} fondo={p.fondo} acento={p.acento} elegida={propia?.fondo === p.fondo && propia.nombre === p.nombre} onClick={() => elegir(p)} />
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <TituloGrupo nota="la letra se elige sola">O tu propio color</TituloGrupo>
        <label className="tw-mi-color">
          <input
            type="color"
            value={esMiColor ? propia.fondo : COLOR_PROPIO_DE_PARTIDA}
            onChange={(e) => elegir(paletaPropia(e.target.value))}
            aria-label="Elegir mi color"
          />
          <span className="text-[13px] text-tinta">
            <b className="block font-semibold">Elegir mi color</b>
            <span className="text-tinta/70">{esMiColor ? (miColorSeLee ? "Se lee bien." : "Con este color la letra no se lee bien.") : "Toca el círculo."}</span>
          </span>
        </label>
        {esMiColor && !miColorSeLee && (
          <Aviso
            tono="atencion"
            chico
            accion={
              <Boton peso="fantasma" onClick={() => elegir(paletaPropia(colorQueSeLee(propia.fondo)))}>
                Usar uno un poco más oscuro
              </Boton>
            }
          >
            Ni la letra clara ni la oscura se leen bien sobre este tono.
          </Aviso>
        )}
      </div>
    </div>
  );
}

/** Una muestra de color: el fondo con su acento en un punto. */
function Muestra({ nombre, fondo, acento, elegida, onClick }: { nombre: string; fondo: string; acento: string; elegida: boolean; onClick: () => void }) {
  return (
    <button type="button" className="tw-muestra" aria-pressed={elegida} title={nombre} aria-label={nombre} onClick={onClick} data-color-dato style={{ background: fondo }}>
      <i style={{ background: acento }} />
    </button>
  );
}

/* ---------------- Paso 3: el fondo ---------------- */

/** El fondo en chico, con los colores de la campaña: liso, el degradado de siempre, el degradado con el dibujo encima o la foto con su velo. */
function MuestraDeFondo({ diseno, fondo, colores }: { diseno: DisenoDeCampana; fondo: Fondo; colores: Colores }) {
  const degradado = `radial-gradient(120% 90% at 88% 6%, ${colores.fondo2}, ${colores.fondo} 58%)`;
  if (fondo === "foto") {
    if (!diseno.foto) {
      return (
        <span className="tw-fondo-muestra tw-fondo-sin-foto">
          <ImagePlus aria-hidden className="h-5 w-5" />
        </span>
      );
    }
    const { cerca } = veloDeLaFoto(diseno.oscuro);
    return (
      <span className="tw-fondo-muestra" data-color-dato>
        {/* eslint-disable-next-line @next/next/no-img-element -- la foto del almacén de la campaña, en chico: no pasa por el optimizador */}
        <img src={diseno.foto} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <span className="absolute inset-0" style={{ background: colores.fondo, opacity: cerca }} />
      </span>
    );
  }
  return (
    <span className="tw-fondo-muestra" data-color-dato style={{ background: fondo === "liso" ? colores.fondo : degradado }}>
      {fondo === "dibujo" && <Estampado patron={diseno.patron} color={colores.acento} opacidad={Math.max(INTENSIDAD[diseno.intensidad], 0.3)} />}
    </span>
  );
}

/** El estampado de un dibujo, pintado con un color (el acento de la campaña). En chico se ve más que en la portada, para reconocerlo. */
function Estampado({ patron, color, opacidad }: { patron: Patron; color: string; opacidad: number }) {
  const mascara = mascaraDePatron(patron);
  const tamano = patron === "rayas" || patron === "puntos" || patron === "ondas" ? "auto" : "60%";
  const estilo: CSSProperties = { background: color, opacity: opacidad, maskImage: mascara, WebkitMaskImage: mascara, maskSize: tamano, WebkitMaskSize: tamano };
  return <span className="tw-estampado" aria-hidden style={estilo} />;
}

/**
 * Paso 3: el fondo. «Con foto» sin foto todavía abre la subida (el diseño no cambia hasta que la foto está en el almacén); con una ya
 * subida (aunque se haya elegido otro fondo después), vuelve a ella. `onArrastrar` agrupa el oscurecido en un solo «Deshacer».
 */
export function PasoFondo({
  diseno,
  onCambiar,
  onArrastrar,
  onFoto,
}: {
  diseno: DisenoDeCampana;
  onCambiar: (d: DisenoDeCampana) => void;
  onArrastrar: (d: DisenoDeCampana) => void;
  /** La foto ya subida y su tono: el editor la pone en el diseño que esté a la vista cuando termina la subida. */
  onFoto: (foto: string, tono: string) => void;
}) {
  const colores = coloresDelDiseno(diseno, "claro");
  const [pidiendoFoto, setPidiendoFoto] = useState(false);
  const elegir = (f: Fondo) => {
    if (f === "foto" && !diseno.foto) {
      setPidiendoFoto(true);
      return;
    }
    setPidiendoFoto(false);
    onCambiar({ ...diseno, fondo: f });
  };
  return (
    <div className="space-y-4">
      <div className="tw-opciones">
        {FONDOS.map((f) => (
          <button key={f} type="button" className="tw-opcion" aria-pressed={diseno.fondo === f || (f === "foto" && pidiendoFoto)} onClick={() => elegir(f)}>
            <MuestraDeFondo diseno={diseno} fondo={f} colores={colores} />
            <span className="tw-opcion-nombre">
              {NOMBRES_FONDO[f].nombre}
              <small>{NOMBRES_FONDO[f].nota}</small>
            </span>
          </button>
        ))}
      </div>
      {(diseno.fondo === "foto" || pidiendoFoto) && <FotoDelFondo diseno={diseno} onArrastrar={onArrastrar} onFoto={onFoto} />}
      {diseno.fondo === "dibujo" && (
        <>
          <div className="space-y-2">
            <TituloGrupo>El dibujo</TituloGrupo>
            <div className="tw-opciones" data-columnas="4">
              {PATRONES.map((p) => (
                <button key={p} type="button" className="tw-opcion" aria-pressed={diseno.patron === p} onClick={() => onCambiar({ ...diseno, patron: p })}>
                  <span className="tw-patron-muestra" data-color-dato style={{ background: colores.fondo }}>
                    <Estampado patron={p} color={colores.acento} opacidad={0.6} />
                  </span>
                  <span className="tw-opcion-nombre">{NOMBRES_PATRON[p]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <TituloGrupo>Qué tanto se nota</TituloGrupo>
            <SegmentoDeslizante
              etiqueta="Qué tanto se nota el dibujo"
              valor={diseno.intensidad}
              onCambio={(v) => onCambiar({ ...diseno, intensidad: v as Intensidad })}
              opciones={INTENSIDADES.map((i) => ({ clave: i, etiqueta: NOMBRES_INTENSIDAD[i] }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Subir la foto (arrastrándola o eligiéndola) y oscurecerla. Lo que no se pudo, lo dice en su lugar; los avisos no impiden usarla. */
function FotoDelFondo({
  diseno,
  onArrastrar,
  onFoto,
}: {
  diseno: DisenoDeCampana;
  onArrastrar: (d: DisenoDeCampana) => void;
  onFoto: (foto: string, tono: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<readonly string[]>([]);

  async function usar(archivo: File | undefined) {
    if (!archivo || subiendo) return;
    setError(null);
    setSubiendo(true);
    try {
      const lista = await prepararFotoDeFondo(archivo);
      if ("error" in lista) return setError(lista.error);
      const subida = await subirFotoDeFondo(createClient(), lista.archivo);
      if ("error" in subida) return setError(subida.error);
      setAvisos(lista.avisos);
      onFoto(subida.url, lista.tono);
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="tw-subir"
        data-arrastrando={arrastrando ? "" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          void usar(e.dataTransfer.files[0]);
        }}
      >
        <ImagePlus aria-hidden className="h-5 w-5 shrink-0 text-taupe" />
        <span className="min-w-0 flex-1 text-[12.5px] text-tinta/70">
          <b className="block text-[13px] font-semibold text-tinta">{diseno.foto ? "Arrastra otra foto o elige una" : "Arrastra tu foto o elígela"}</b>
          JPG o PNG, mejor horizontal. En el celular se recorta sola.
        </span>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void usar(e.target.files?.[0])}
        />
        <Boton peso="fantasma" className="btn-chico" cargando={subiendo} textoCargando="Subiendo…" onClick={() => input.current?.click()}>
          {diseno.foto ? "Cambiar foto" : "Elegir foto"}
        </Boton>
      </div>
      {error && (
        <Aviso tono="error" chico>
          {error}
        </Aviso>
      )}
      {avisos.map((a) => (
        <Aviso key={a} tono="atencion" chico>
          {a}
        </Aviso>
      ))}
      {diseno.foto && diseno.fondo === "foto" && (
        <div className="space-y-2">
          <TituloGrupo>Oscurecer la foto para que la letra se lea</TituloGrupo>
          <input
            type="range"
            min={Math.round(OSCURO_MIN * 100)}
            max={Math.round(OSCURO_MAX * 100)}
            step={5}
            value={Math.round(diseno.oscuro * 100)}
            onChange={(e) => onArrastrar({ ...diseno, oscuro: Number(e.target.value) / 100 })}
            aria-label="Oscurecer la foto"
            aria-valuetext={`${Math.round(diseno.oscuro * 100)} %`}
            className="block w-full accent-tinta"
          />
          <span className="flex justify-between gap-3 text-[12px] text-taupe">
            <span>Se ve más la foto</span>
            <span>Se lee más la letra</span>
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------------- Paso 4: cómo se acomoda ---------------- */

/** Los cuatro acomodos, cada uno con la portada en chico. Sin prendas, solo «Solo letras» se luce: lo dice y lleva a Prendas. */
export function PasoAcomodo({
  diseno,
  campana,
  piezas,
  ahora,
  onCambiar,
}: {
  diseno: DisenoDeCampana;
  campana: CampanaDePortada & { id: string };
  piezas: readonly PiezaDePortada[];
  ahora: number;
  onCambiar: (d: DisenoDeCampana) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="tw-opciones">
        {ACOMODOS.map((a) => {
          const con = { ...diseno, acomodo: a };
          return (
            <button key={a} type="button" className="tw-opcion" aria-pressed={diseno.acomodo === a} onClick={() => onCambiar(con)}>
              <Lienzo ancho={1280} alto={720}>
                <PortadaDeCampana campana={campana} diseno={con} tema="claro" piezas={piezas} ahora={ahora} />
              </Lienzo>
              <span className="tw-opcion-nombre">
                {NOMBRES_ACOMODO[a].nombre}
                <small>{NOMBRES_ACOMODO[a].nota}</small>
              </span>
            </button>
          );
        })}
      </div>
      {piezas.length === 0 && <SinPrendas campana={campana}>Con fotos saldría la tarjeta del Club. «Solo letras» luce sin ellas.</SinPrendas>}
    </div>
  );
}

/** El aviso de una campaña sin prendas, con el camino a su pestaña Prendas. */
function SinPrendas({ campana, children }: { campana: { id: string }; children: string }) {
  return (
    <Aviso
      tono="info"
      chico
      titulo="Esta campaña todavía no tiene prendas"
      accion={
        <BotonVer href={`/tienda-web/campanas/${campana.id}?pestana=prendas`} chico>
          Ir a Prendas
        </BotonVer>
      }
    >
      {children}
    </Aviso>
  );
}

/* ---------------- Paso 5: el texto ---------------- */

/**
 * Desde qué palabra va la cursiva (la primera que se toca y las que siguen), el tamaño del nombre y la frase propia. `onEscribir` agrupa
 * la frase en un solo «Deshacer» mientras se escribe.
 */
export function PasoTexto({
  diseno,
  campana,
  onCambiar,
  onEscribir,
}: {
  diseno: DisenoDeCampana;
  campana: CampanaDePortada;
  onCambiar: (d: DisenoDeCampana) => void;
  onEscribir: (d: DisenoDeCampana) => void;
}) {
  const palabras = palabrasDelNombre(campana.nombre);
  const corte = corteEfectivo(diseno, campana.nombre);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <TituloGrupo>¿Desde qué palabra va en cursiva?</TituloGrupo>
        <div className="tw-palabras">
          {palabras.map((w, k) => (
            <button
              key={`${k}-${w}`}
              type="button"
              className="tw-palabra"
              aria-pressed={corte === k}
              aria-label={`Cursiva desde «${w}»`}
              data-cursiva={k >= corte ? "" : undefined}
              onClick={() => onCambiar(cortarEn(diseno, campana.nombre, k))}
            >
              {w}
            </button>
          ))}
          <button type="button" className="tw-palabra" aria-pressed={corte >= palabras.length} onClick={() => onCambiar(cortarEn(diseno, campana.nombre, palabras.length))}>
            Sin cursiva
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <TituloGrupo>Tamaño del nombre</TituloGrupo>
        <SegmentoDeslizante
          etiqueta="Tamaño del nombre"
          valor={diseno.tamano}
          onCambio={(v) => onCambiar({ ...diseno, tamano: v as Tamano })}
          opciones={TAMANOS.map((t) => ({ clave: t, etiqueta: NOMBRES_TAMANO[t] }))}
        />
      </div>
      <div className="space-y-2">
        <TituloGrupo nota="opcional">Tu frase</TituloGrupo>
        <CampoTexto
          etiqueta="Tu frase"
          caja
          value={diseno.frase}
          maxLength={FRASE_MAX}
          placeholder={sugerirFrase(campana)}
          onChange={(e) => onEscribir({ ...diseno, frase: e.target.value })}
          pie={
            <span className="flex justify-between gap-3">
              <span>La fecha, el descuento y «Crea tu cuenta…» los pone la web sola.</span>
              <span className="tabular-nums">
                {diseno.frase.length}/{FRASE_MAX}
              </span>
            </span>
          }
        />
      </div>
    </div>
  );
}

/* ---------------- Paso 6: las prendas ---------------- */

/** Cuáles salen y en qué orden: se tocan en el orden en que se quiere que salgan. O que las elija la web (las que tienen foto primero). */
export function PasoPrendas({
  diseno,
  campana,
  piezas,
  onCambiar,
}: {
  diseno: DisenoDeCampana;
  campana: { id: string };
  piezas: readonly PiezaDePortada[];
  onCambiar: (d: DisenoDeCampana) => void;
}) {
  if (piezas.length === 0) return <SinPrendas campana={campana}>Agrégalas y aquí eliges cuáles salen en la portada.</SinPrendas>;
  const caben = piezasQueCaben(diseno);
  const marcadas = prendasMarcadas(diseno, piezas);
  const laWeb = !diseno.prendas || marcadas.length === 0;
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-tinta/70">
        {caben === 0
          ? "Con «Solo letras» la portada no muestra prendas."
          : caben === 1
            ? "Toca la que quieres de protagonista."
            : `Toca hasta ${caben} en el orden en que quieres que salgan.`}
      </p>
      <div className="tw-prendas-elegir">
        {piezas.map((p) => {
          const orden = marcadas.indexOf(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className="tw-prenda-op"
              aria-pressed={orden >= 0}
              disabled={caben === 0}
              aria-label={orden >= 0 ? `${p.nombre}, sale en el lugar ${orden + 1}` : p.nombre}
              onClick={() => onCambiar(tocarPrenda(diseno, piezas, p.id))}
            >
              {orden >= 0 && <span className="tw-prenda-orden">{orden + 1}</span>}
              <FotoDePolaroid pieza={p} />
              <small>{p.nombre}</small>
            </button>
          );
        })}
      </div>
      {caben > 0 && (
        <Interruptor
          activo={laWeb}
          onActivo={(v) => onCambiar({ ...diseno, prendas: v ? null : marcadas })}
          etiqueta="Que las elija la web"
          pie="Primero las que tienen foto. Al tocar una prenda, la eliges tú."
        />
      )}
    </div>
  );
}

/* ---------------- Paso 7: los detalles ---------------- */

/** La cuenta regresiva, el % gigante, el colibrí y el sello. Lo que la campaña no tiene (fecha de fin, descuento) se ve apagado y dice por qué. */
export function PasoDetalles({
  diseno,
  campana,
  onCambiar,
}: {
  diseno: DisenoDeCampana;
  campana: CampanaDePortada;
  onCambiar: (d: DisenoDeCampana) => void;
}) {
  const sellos = sellosDeLaCampana(campana.pct);
  const colores = coloresDelDiseno(diseno, "claro");
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Interruptor
          activo={diseno.cuenta && !!campana.hasta}
          disabled={!campana.hasta}
          onActivo={(v) => onCambiar({ ...diseno, cuenta: v })}
          etiqueta="Cuenta regresiva"
          pie={campana.hasta ? "Días, horas y minutos hasta que termina." : "Esta campaña no tiene fecha de fin."}
        />
        <Interruptor
          activo={diseno.pctGigante && !!campana.pct}
          disabled={!campana.pct}
          onActivo={(v) => onCambiar({ ...diseno, pctGigante: v })}
          etiqueta="El descuento gigante detrás"
          pie={campana.pct ? `El «−${pctTexto(campana.pct)}%» dibujado en grande, solo el borde.` : "Esta campaña no tiene descuento."}
        />
        <Interruptor activo={diseno.colibri} onActivo={(v) => onCambiar({ ...diseno, colibri: v })} etiqueta="El colibrí de CAYLA" pie="Arriba, junto al nombre." />
      </div>
      <div className="space-y-2">
        <TituloGrupo>Sello</TituloGrupo>
        <div className="tw-opciones" data-columnas="4">
          {sellos.map((s) => (
            <button key={s} type="button" className="tw-opcion" aria-pressed={(sellos.includes(diseno.sello) ? diseno.sello : "ninguno") === s} onClick={() => onCambiar({ ...diseno, sello: s })}>
              <MuestraDeSello sello={s} colores={colores} pct={campana.pct} />
              <span className="tw-opcion-nombre">{NOMBRES_SELLO[s]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** El sello en chico, como sale en la portada (el círculo del acento con la letra del fondo); «Ninguno», un círculo punteado vacío. */
function MuestraDeSello({ sello, colores, pct }: { sello: Sello; colores: Colores; pct: number | null }) {
  const texto = sello === "descuento" && pct ? `−${pctTexto(pct)}%` : sello === "dias" ? "Solo por días" : sello === "nuevo" ? "Lo nuevo" : null;
  return (
    <span className="tw-sello-muestra" data-color-dato style={{ background: colores.fondo }}>
      {texto ? (
        <span className="tw-sello-mini" style={{ background: colores.acento, color: colores.fondo }}>
          {texto}
        </span>
      ) : (
        <span className="tw-sello-mini" data-vacio="" style={{ borderColor: colores.acento }} />
      )}
    </span>
  );
}
