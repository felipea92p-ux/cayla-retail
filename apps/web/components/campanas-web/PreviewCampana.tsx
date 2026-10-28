import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { colorDelSello, particulasDeEfecto, textoSobre, type ColoresDeCampana, type CuentaCampana, type DuracionCampana, type EfectoCampana, type EntradaCampana, type FranjaCampana, type IntensidadCampana } from "@cayla-retail/shared";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { LogoCayla } from "@/components/ui/LogoCayla";
import { fechaCortaDicha, pctDicho } from "@/lib/campanas-web-reglas";
import { DONDE_TODO, type Donde } from "@/lib/campanas-web-editor";

/** El movimiento que dibuja la vista previa: el mismo que programa el líder (Tienda web ▸ Campañas ▸ Movimiento). */
export type MovimientoDeVista = {
  franja: FranjaCampana;
  entrada: EntradaCampana;
  efecto: EfectoCampana;
  intensidad: IntensidadCampana;
  duracion: DuracionCampana;
  cuenta: CuentaCampana;
};
export const MOVIMIENTO_DE_SIEMPRE: MovimientoDeVista = { franja: "rota", entrada: "telon", efecto: "ninguno", intensidad: "poca", duracion: "una", cuenta: "siempre" };

/** El espacio que no se parte: «S/ 95» nunca queda en dos líneas. */
const NB = String.fromCharCode(160);

/** Los textos de la portada, ya limpios (`null` = sin texto: sale el nombre de la campaña, sin bajada y con «Ver la campaña»). */
export type TextosDeVista = { titular: string | null; bajada: string | null; boton: string | null };
export const SIN_TEXTOS: TextosDeVista = { titular: null, bajada: null, boton: null };

/** Las imágenes de una campaña con imagen propia (direcciones públicas): la horizontal del computador y la vertical opcional del celular. */
export type ImagenesDeVista = { horizontal: string; vertical: string | null };

export type PiezaDeVista = "portada" | "catalogo" | "bolsa";

/**
 * La vista previa viva del editor de Campañas (maqueta docs/maquetas/campanas-tienda-2026-10): la portada, el catálogo y la bolsa de la tienda
 * online con los colores y el movimiento del diseño. Es un dibujo para decidir —la franja de arriba, la cabecera, la portada con su titular,
 * su descuento y sus botones, y unas prendas—, no la tienda: la tienda se viste con los mismos colores y los mismos efectos
 * (`@cayla-retail/shared`) y la vista previa privada, en la actividad que programa, enseña la de verdad. Sin ambiente elegido, dibuja la tienda
 * «como siempre»; una pieza apagada en «dónde se ve» también.
 *
 * Los colores del diseño son DATO (como el de una prenda): van en variables de la pieza y no cambian con el tema del ERP; lo demás del cuadro es
 * papel fijo, así la portada se ve igual de día y de noche. Los efectos y la entrada son CSS (`campana-efectos.css`); con `quieto` (el botón
 * «Movimiento reducido») no se mueve nada.
 */
export function PreviewCampana({
  colores,
  nombre,
  pct,
  hasta,
  celular = false,
  pieza = "portada",
  movimiento = MOVIMIENTO_DE_SIEMPRE,
  donde = DONDE_TODO,
  quieto = false,
  textos = SIN_TEXTOS,
  imagenes = null,
}: {
  colores: ColoresDeCampana | null;
  nombre: string;
  pct: number | null;
  hasta: string | null;
  celular?: boolean;
  pieza?: PiezaDeVista;
  movimiento?: MovimientoDeVista;
  donde?: Donde;
  quieto?: boolean;
  textos?: TextosDeVista;
  /** Con imagen propia, la portada ES la imagen y los botones van encima; sin ella, la portada de un ambiente. */
  imagenes?: ImagenesDeVista | null;
}) {
  const sello = colores ? colorDelSello(colores) : null;
  const vars = colores
    ? ({ "--cmp-fondo": colores.fondo, "--cmp-texto": colores.texto, "--cmp-acento": colores.acento, "--cmp-boton": textoSobre(colores.acento) } as CSSProperties)
    : undefined;
  const frase = `${nombre} · ${pctDicho(pct)}${hasta ? ` hasta el ${fechaCortaDicha(hasta)}` : ""}`;
  const franjaVestida = !!colores && donde.franja;

  return (
    <div className={`papel-fijo overflow-hidden rounded-lg border border-sand bg-papel text-tinta ${quieto ? "cmp-quieto" : ""}`} style={vars} data-color-dato aria-label="Vista previa de la tienda">
      <Franja frase={frase} modo={franjaVestida ? movimiento.franja : "rota"} vestida={franjaVestida} />
      <div className="flex items-center justify-between border-b border-sand px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{celular ? "☰" : "Lo nuevo · Ropa · Looks"}</span>
        {/* El logo oficial, como la cabecera de la tienda (ADR-0446). */}
        <LogoCayla className="h-6" />
        <span className="sr-only">CAYLA</span>
        <span className="w-6" />
      </div>
      {pieza === "portada" && imagenes && !!colores && donde.portada && <PortadaConImagen colores={colores} imagenes={imagenes} celular={celular} movimiento={movimiento} />}
      {pieza === "portada" && !(imagenes && !!colores && donde.portada) && <Portada colores={colores} vestida={!!colores && donde.portada} nombre={nombre} pct={pct} hasta={hasta} celular={celular} movimiento={movimiento} textos={!!colores && donde.portada ? textos : SIN_TEXTOS} />}
      {pieza === "catalogo" && <Catalogo colores={colores} banda={!!colores && donde.catalogo} sello={!!colores && donde.sello ? sello : null} nombre={nombre} pct={pct} hasta={hasta} />}
      {pieza === "bolsa" && <Bolsa linea={!!colores && donde.bolsa ? sello : null} nombre={nombre} pct={pct} />}
      {pieza === "portada" && <Prendas pct={pct} sello={!!colores && donde.sello ? sello : null} />}
    </div>
  );
}

function Franja({ frase, modo, vestida }: { frase: string; modo: FranjaCampana; vestida: boolean }) {
  const otras = ["Separa online y recoge en tu tienda", "Mira cuánto hay en cada tienda"];
  const estilo = vestida ? { backgroundColor: "var(--cmp-fondo)", color: "var(--cmp-texto)" } : undefined;
  const clase = `text-center text-[10px] font-semibold uppercase tracking-[0.16em] ${vestida ? "" : "bg-tinta text-crema"}`;
  if (modo === "marquesina") {
    return (
      <div className={`${clase} cmp-marquesina h-8`} style={estilo}>
        <div className="cmp-pista">
          {[0, 1].map((v) => [frase, ...otras].map((f, i) => <span key={`${v}-${i}`}>{f}</span>))}
        </div>
      </div>
    );
  }
  if (modo === "rota") {
    return (
      <div className={`${clase} cmp-rota h-8`} style={estilo}>
        <span>{frase}</span>
        <span>{otras[0]}</span>
      </div>
    );
  }
  return (
    <div className={`${clase} flex h-8 items-center justify-center px-3`} style={estilo}>
      {frase}
    </div>
  );
}

function Portada({
  colores,
  vestida,
  nombre,
  pct,
  hasta,
  celular,
  movimiento,
  textos,
}: {
  colores: ColoresDeCampana | null;
  vestida: boolean;
  nombre: string;
  pct: number | null;
  hasta: string | null;
  celular: boolean;
  movimiento: MovimientoDeVista;
  textos: TextosDeVista;
}) {
  const partes = (textos.titular ?? nombre).trim().split(/\s+/);
  const cola = partes.length > 1 ? (partes.pop() as string) : "";
  const cabeza = partes.join(" ");
  const acento = vestida && colores ? { color: colores.acento } : undefined;
  return (
    <div
      className={`relative isolate overflow-hidden ${celular ? "px-5 py-6" : "grid grid-cols-[1.1fr_1fr] items-center gap-4 px-8 py-8"} ${vestida ? "" : "bg-hueso"}`}
      style={vestida ? { backgroundColor: "var(--cmp-fondo)", color: "var(--cmp-texto)" } : undefined}
      data-entrada={vestida ? movimiento.entrada : undefined}
    >
      {vestida && <EfectoDePreview efecto={movimiento.efecto} intensidad={movimiento.intensidad} duracion={movimiento.duracion} />}
      <div className="relative z-[3] min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-90">{`Campaña${hasta ? ` · hasta el ${fechaCortaDicha(hasta)}` : ""}`}</p>
        <h3 className={`mt-3 font-sans font-medium uppercase leading-[1.02] ${celular ? "text-2xl" : "text-4xl"}`}>
          {cabeza}
          {cola && (
            <em className="block font-serif text-[1.18em] font-normal normal-case italic" style={acento}>
              {cola}
            </em>
          )}
        </h3>
        {textos.bajada && <p className="mt-3 max-w-[34ch] text-[13px] opacity-90">{textos.bajada}</p>}
        <p className="mt-3 flex items-baseline gap-3">
          <b className="font-serif text-3xl font-normal italic" style={acento}>
            {pctDicho(pct)}
          </b>
          <span className="text-[11px] opacity-85">en las prendas de la campaña</span>
        </p>
        {movimiento.cuenta === "siempre" && vestida && (
          <div className="mt-3 flex w-fit border-y border-current/30" aria-hidden>
            {[["04", "días"], ["11", "horas"], ["36", "min"], ["01", "seg"]].map(([n, u]) => (
              <span key={u} className="flex min-w-12 flex-col border-l border-current/30 px-2 py-1 first:border-l-0">
                <b className="font-serif text-lg font-normal italic leading-none">{n}</b>
                <small className="text-[8px] uppercase tracking-[0.14em] opacity-80">{u}</small>
              </span>
            ))}
          </div>
        )}
        {movimiento.cuenta === "ultimo" && vestida && <p className="mt-3 text-[11px] opacity-80">La cuenta regresiva aparece el último día.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className={`inline-flex h-9 items-center gap-2 px-4 text-[10px] font-semibold uppercase tracking-[0.16em] ${vestida ? "" : "bg-tinta text-crema"}`}
            style={vestida && colores ? { backgroundColor: colores.acento, color: textoSobre(colores.acento) } : undefined}
          >
            {textos.boton ?? "Ver la campaña"} <ArrowRight className="h-3 w-3" aria-hidden />
          </span>
          <span className="inline-flex h-9 items-center border border-current px-4 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-90">Lo nuevo</span>
        </div>
      </div>
      <div className={`relative z-[3] flex items-center justify-center ${celular ? "mt-5" : ""}`} aria-hidden>
        {[-6, 3, -2].map((giro, i) => (
          <div
            key={giro}
            className={`cmp-pol flex aspect-[4/5] ${celular ? "w-[30%]" : "w-[34%]"} -ml-3 items-center justify-center bg-papel p-1 text-taupe first:ml-0`}
            style={{ "--rot": `${giro}deg`, "--k": i, transform: `rotate(${giro}deg)`, zIndex: i } as CSSProperties}
          >
            <span className="flex h-full w-full items-center justify-center bg-hueso">
              <IconoPercha className="h-6 w-6" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** La portada de una campaña con imagen propia: la imagen llena el cuadro (en el celular, la vertical si hay; si no, la horizontal recortada al centro) y
 *  los botones «Ver la campaña» y «Lo nuevo» van encima, abajo a la izquierda, con la cuenta regresiva si se eligió. El texto de la campaña va DENTRO de la imagen. */
function PortadaConImagen({ colores, imagenes, celular, movimiento }: { colores: ColoresDeCampana; imagenes: ImagenesDeVista; celular: boolean; movimiento: MovimientoDeVista }) {
  const url = celular ? (imagenes.vertical ?? imagenes.horizontal) : imagenes.horizontal;
  return (
    <div className="relative isolate overflow-hidden bg-tinta-fija" style={{ aspectRatio: celular ? "4 / 5" : "2.5 / 1" }} data-entrada={movimiento.entrada}>
      {/* eslint-disable-next-line @next/next/no-img-element -- la vista previa muestra la imagen tal cual la subió el líder, sin pasar por el optimizador */}
      <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-tinta-fija/60 to-transparent" aria-hidden />
      <EfectoDePreview efecto={movimiento.efecto} intensidad={movimiento.intensidad} duracion={movimiento.duracion} />
      <div className={`absolute z-[5] ${celular ? "inset-x-5 bottom-5" : "bottom-6 left-8"}`}>
        {movimiento.cuenta === "siempre" && (
          <div className="mb-3 flex w-fit border-y border-crema-fija/40 text-crema-fija" aria-hidden>
            {[["04", "días"], ["11", "horas"], ["36", "min"], ["01", "seg"]].map(([n, u]) => (
              <span key={u} className="flex min-w-12 flex-col border-l border-crema-fija/40 bg-tinta-fija/50 px-2 py-1 first:border-l-0">
                <b className="font-serif text-lg font-normal italic leading-none">{n}</b>
                <small className="text-[8px] uppercase tracking-[0.14em] opacity-80">{u}</small>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex h-9 items-center gap-2 px-4 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ backgroundColor: colores.acento, color: textoSobre(colores.acento) }}>
            Ver la campaña <ArrowRight className="h-3 w-3" aria-hidden />
          </span>
          <span className="inline-flex h-9 items-center border border-crema-fija/75 bg-tinta-fija/45 px-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-crema-fija">Lo nuevo</span>
        </div>
      </div>
    </div>
  );
}

/** El efecto sobre la portada: las mismas partículas que la tienda (`particulasDeEfecto`), movidas con la misma hoja de estilos. */
function EfectoDePreview({ efecto, intensidad, duracion }: { efecto: EfectoCampana; intensidad: IntensidadCampana; duracion: DuracionCampana }) {
  const particulas = particulasDeEfecto(efecto, intensidad, duracion);
  if (particulas.length === 0) return null;
  return (
    <div className={`cmp-fx cmp-fx-${efecto}`} style={{ "--n": duracion === "continuo" ? "infinite" : "1" } as CSSProperties} aria-hidden>
      {particulas.map((p, i) => (
        <i
          key={i}
          className={`cmp-c-${p.color}`}
          style={{ "--x": `${p.x}%`, "--y": `${p.y}%`, "--d": `${p.retraso}s`, "--t": `${p.dura}s`, "--s": `${p.tam}px`, "--dx": `${p.dx}px`, "--r": `${p.giro}deg` } as CSSProperties}
        />
      ))}
    </div>
  );
}

function Prendas({ pct, sello }: { pct: number | null; sello: { fondo: string; texto: string } | null }) {
  return (
    <div className="grid grid-cols-3 gap-3 px-4 py-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="relative flex aspect-[4/5] items-center justify-center bg-hueso text-taupe">
          {sello && (
            <span className="absolute left-1 top-1 px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: sello.fondo, color: sello.texto }}>
              {pctDicho(pct)}
            </span>
          )}
          <IconoPercha className="h-5 w-5" />
        </div>
      ))}
    </div>
  );
}

function Catalogo({
  colores,
  banda,
  sello,
  nombre,
  pct,
  hasta,
}: {
  colores: ColoresDeCampana | null;
  banda: boolean;
  sello: { fondo: string; texto: string } | null;
  nombre: string;
  pct: number | null;
  hasta: string | null;
}) {
  return (
    <div className="space-y-3 px-4 py-4">
      <div
        className={`flex items-center gap-4 border px-4 py-3 ${banda ? "" : "border-sand"}`}
        style={banda && colores ? { backgroundColor: colores.fondo, borderColor: colores.fondo, color: colores.texto } : undefined}
      >
        <b className="font-serif text-3xl font-normal italic" style={banda && colores ? { color: colores.acento } : undefined}>
          {pctDicho(pct)}
        </b>
        <span className="min-w-0">
          <b className="block text-[13px] font-medium uppercase tracking-[0.08em]">{nombre}</b>
          <small className="block text-[11px] opacity-85">{hasta ? `Hasta el ${fechaCortaDicha(hasta)}` : "Sin fecha de término"}</small>
        </span>
      </div>
      <Prendas pct={pct} sello={sello} />
    </div>
  );
}

function Bolsa({ linea, nombre, pct }: { linea: { fondo: string; texto: string } | null; nombre: string; pct: number | null }) {
  return (
    <div className="space-y-3 px-4 py-4" aria-hidden>
      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em]">Tu bolsa</p>
      {["Blusa Emma", "Palazo Tiana"].map((n) => (
        <div key={n} className="flex items-center gap-3 border-b border-sand pb-3">
          <span className="flex h-14 w-11 items-center justify-center bg-hueso text-taupe">
            <IconoPercha className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 text-[13px]">
            <i className="block font-serif">{n}</i>
            {linea && (
              <span className="mt-1 inline-block px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]" style={{ backgroundColor: linea.fondo, color: linea.texto }}>
                {nombre} {pctDicho(pct)}
              </span>
            )}
          </span>
          <b className="text-[13px]">S/{NB}95</b>
        </div>
      ))}
    </div>
  );
}
