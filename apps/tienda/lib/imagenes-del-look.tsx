/* eslint-disable @next/next/no-img-element -- es la plantilla de `next/og` (satori), no la página: ahí `next/image` no existe. */
import "server-only";
import { bordesDe, DOMINIO_A_LA_VISTA, fotoContenida, tarjetasDelLook, type PiezaDeLaImagen, type Tarjeta } from "./compartir-look";
import { COLIBRI, LOGO, type PiezaDeMarca } from "@cayla-retail/shared/marca";

// Las dos imágenes de un look compartido (ADR-0434, actividad 9), como las dibuja `next/og` (satori: estilos en línea, sin las clases
// ni las variables de la tienda). Los colores son los MISMOS de `app/globals.css`, escritos aquí porque `next/og` no lee CSS: el oscuro
// de la campaña (`--t-hero` hacia `--t-oscuro`), el rosado de su acento (`--t-hero-acento`), la crema, el papel y el estudio de las fotos
// (`--t-papel-fijo`, `--t-foto`), y la tinta. Ninguna lleva precio. Las fotos llegan ya leídas (`cargarFotos`): una que no llegó deja
// su tarjeta con el estudio vacío, nunca la imagen caída.

const COLOR = {
  crema: "#f5f0e8",
  acento: "#f4c3b3",
  papel: "#fbf8f2",
  foto: "#f2ede4",
  tinta: "#1a1a18",
  fondo: "radial-gradient(120% 70% at 30% 8%, #4a1712 0%, #2a1311 38%, #171614 72%)",
  fondoAncho: "radial-gradient(90% 120% at 18% 0%, #4a1712 0%, #2a1311 42%, #171614 78%)",
};

const SERIF = "EB Garamond";
const SANS = "Heebo";

/** Una prenda lista para dibujar: su nombre, su tamaño de tarjeta y su foto ya leída (`data:`), o null si no llegó. */
export type PiezaConFoto = PiezaDeLaImagen & { dato: string | null };

const ESPERA_FOTO_MS = 4000;

async function comoDato(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ESPERA_FOTO_MS) });
    const tipo = r.headers.get("content-type") ?? "";
    // `next/og` lee PNG y JPEG; los recortes son PNG.
    if (!r.ok || !/^image\/(png|jpeg)/.test(tipo)) return null;
    return `data:${tipo.split(";")[0]};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Las fotos de las prendas, a la vez. */
export const cargarFotos = (piezas: readonly PiezaDeLaImagen[]): Promise<PiezaConFoto[]> =>
  Promise.all(piezas.map(async (p) => ({ ...p, dato: await comoDato(p.foto.url) })));

/** Una pieza del logo oficial (`packages/shared/src/marca.ts`) como imagen suelta del color pedido: `next/og` no lee la página ni su CSS. Sale del mismo
 *  trazo que la tienda, sin pedirlo a la red: la marca nunca falta en la imagen. */
function piezaComoDato(pieza: PiezaDeMarca, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${pieza.viewBox}"><path fill="${color}" fill-rule="evenodd" d="${pieza.trazo}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const LOGO_CREMA = piezaComoDato(LOGO, COLOR.crema);
// El rojo del dibujo oficial (el `--t-logo` de la tienda).
const COLIBRI_ROJO = piezaComoDato(COLIBRI, "#d13730");

/* ---------------- Las piezas comunes ---------------- */

/** El logo oficial en crema. `alto` es el de la marca escrita de antes: el logo entero mide 1,2 veces eso (su palabra, la mitad). */
function Marca({ alto }: { alto: number }) {
  const h = Math.round(alto * 1.2);
  return <img src={LOGO_CREMA} width={Math.round((h * LOGO.ancho) / LOGO.alto)} height={h} alt="" />;
}

function Llamado({ tamano }: { tamano: number }) {
  const icono = Math.round(tamano * 1.2);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(tamano * 0.75),
        padding: `${Math.round(tamano * 0.8)}px ${Math.round(tamano * 1.35)}px`,
        borderRadius: 999,
        background: COLOR.crema,
        color: COLOR.tinta,
        boxShadow: `0 ${Math.round(tamano * 0.9)}px ${Math.round(tamano * 2)}px rgba(0, 0, 0, 0.35)`,
      }}
    >
      <svg width={icono} height={icono} viewBox="0 0 24 24" fill="none" stroke={COLOR.tinta} strokeWidth={1.7} strokeLinejoin="round">
        <path d="M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4L4 9.5l4.4-1.6Z" />
        <path d="M18 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
      </svg>
      <span style={{ fontFamily: SANS, fontSize: tamano, fontWeight: 700 }}>{`Arma el tuyo en ${DOMINIO_A_LA_VISTA}`}</span>
    </div>
  );
}

/** Las tarjetas de las prendas (polaroids del lienzo), con medidas del lienzo llevadas a la imagen: `k` veces y corridas `dx`, `dy`. */
function Tarjetas({ piezas, tarjetas, k, dx = 0, dy = 0 }: { piezas: readonly PiezaConFoto[]; tarjetas: readonly Tarjeta[]; k: number; dx?: number; dy?: number }) {
  const m = (n: number) => Math.round(n * k);
  return (
    <>
      {piezas.map((p, i) => {
        const t = tarjetas[i];
        if (!t) return null;
        const recuadro = { w: t.w - 16, h: t.h - 48 };
        const foto = fotoContenida({ w: recuadro.w - 18, h: recuadro.h - 18 }, p.foto.proporcion);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: dx + m(t.x),
              top: dy + m(t.y),
              width: m(t.w),
              height: m(t.h),
              display: "flex",
              flexDirection: "column",
              gap: m(6),
              padding: `${m(8)}px ${m(8)}px 0`,
              borderRadius: m(4),
              background: COLOR.papel,
              boxShadow: `0 ${m(22)}px ${m(40)}px rgba(0, 0, 0, 0.42)`,
              transform: `rotate(${t.giro}deg)`,
            }}
          >
            <div style={{ height: m(recuadro.h), borderRadius: m(2), background: COLOR.foto, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {p.dato && <img src={p.dato} width={m(foto.w)} height={m(foto.h)} alt="" />}
            </div>
            <span
              style={{
                fontFamily: SANS,
                fontSize: m(12),
                fontWeight: 600,
                color: COLOR.tinta,
                maxWidth: m(recuadro.w),
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {p.nombre}
            </span>
          </div>
        );
      })}
    </>
  );
}

/* ---------------- La imagen para estados (1080×1920) ---------------- */

export const TAMANO_HISTORIA = { width: 1080, height: 1920 };
/** El lienzo de la pantalla 9 mide 390 de ancho. */
const S = TAMANO_HISTORIA.width / 390;
const px = (n: number) => Math.round(n * S);

/** Lienzo v3, pantalla 9: la marca, «Mi look» y su nombre (la última palabra en cursiva y rosada), las prendas como polaroids y el
 *  llamado con la dirección de la tienda. */
export function HistoriaDelLook({ titulo, piezas }: { titulo: { antes: string; ultima: string; tamano: number }; piezas: readonly PiezaConFoto[] }) {
  const tarjetas = tarjetasDelLook(
    piezas.map((p) => p.clase),
    { arriba: 236, abajo: 612 },
  );
  return (
    <div style={{ ...TAMANO_HISTORIA, position: "relative", display: "flex", backgroundImage: COLOR.fondo, color: COLOR.crema, fontFamily: SANS }}>
      <div style={{ position: "absolute", left: px(28), top: px(30), display: "flex" }}>
        <Marca alto={px(20)} />
      </div>
      <div style={{ position: "absolute", left: px(28), right: px(28), top: px(84), display: "flex", flexDirection: "column", gap: px(8) }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: px(10),
            fontSize: px(10.5),
            fontWeight: 700,
            letterSpacing: px(2.1),
            textTransform: "uppercase",
            color: COLOR.acento,
          }}
        >
          <div style={{ width: px(26), height: Math.max(2, px(1)), background: COLOR.acento }} />
          Mi look
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontFamily: SERIF, fontWeight: 500, fontSize: px(titulo.tamano), lineHeight: 0.92, letterSpacing: -px(titulo.tamano * 0.02) }}>
          {titulo.antes && <span>{titulo.antes}</span>}
          <span style={{ fontStyle: "italic", color: COLOR.acento }}>{titulo.ultima}</span>
        </div>
      </div>
      <Tarjetas piezas={piezas} tarjetas={tarjetas} k={S} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: px(30), display: "flex", justifyContent: "center" }}>
        <Llamado tamano={px(13.5)} />
      </div>
    </div>
  );
}

/* ---------------- La vista previa del enlace (1200×630) ---------------- */

export const TAMANO_VISTA = { width: 1200, height: 630 };

/** Lo que muestra WhatsApp al pegar el enlace: a la izquierda la marca y «Mira este look», con el llamado; a la derecha, las prendas. Sin
 *  ningún texto que venga en la dirección. Sin prendas (un enlace viejo), «Arma tu look» y el colibrí grande. */
export function VistaDelLook({ piezas }: { piezas: readonly PiezaConFoto[] }) {
  const tarjetas = tarjetasDelLook(
    piezas.map((p) => p.clase),
    { arriba: 0, abajo: 376 },
  );
  const borde = bordesDe(tarjetas);
  const caja = { x: 640, y: 46, w: 500, h: 538 };
  const k = borde.w > 0 ? Math.min(caja.w / borde.w, caja.h / borde.h) : 1;
  const dx = Math.round(caja.x + (caja.w - borde.w * k) / 2 - borde.x * k);
  const dy = Math.round(caja.y + (caja.h - borde.h * k) / 2 - borde.y * k);
  const conLook = piezas.length > 0;
  return (
    <div style={{ ...TAMANO_VISTA, position: "relative", display: "flex", backgroundImage: COLOR.fondoAncho, color: COLOR.crema, fontFamily: SANS }}>
      <div style={{ position: "absolute", left: 72, top: 64, bottom: 64, width: 520, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <Marca alto={34} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 19, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: COLOR.acento }}>
            <div style={{ width: 40, height: 2, background: COLOR.acento }} />
            {conLook ? "Un look armado en CAYLA" : "El probador de CAYLA"}
          </div>
          <div style={{ display: "flex", gap: 30, fontFamily: SERIF, fontWeight: 500, fontSize: 104, lineHeight: 0.92, letterSpacing: -2 }}>
            <span>{conLook ? "Mira este" : "Arma tu"}</span>
            <span style={{ fontStyle: "italic", color: COLOR.acento }}>look</span>
          </div>
          <span style={{ fontSize: 24, lineHeight: 1.35, color: "rgba(245, 240, 232, 0.78)", maxWidth: 470 }}>
            {conLook
              ? "Mira los precios y las tallas, y sepáralo para recoger en tu tienda."
              : "Arma tu look con las prendas de la tienda, a escala y en sus colores."}
          </span>
        </div>
        <div style={{ display: "flex" }}>
          <Llamado tamano={22} />
        </div>
      </div>
      {conLook ? (
        <Tarjetas piezas={piezas} tarjetas={tarjetas} k={k} dx={dx} dy={dy} />
      ) : (
        <img src={COLIBRI_ROJO} width={372} height={Math.round((372 * COLIBRI.alto) / COLIBRI.ancho)} alt="" style={{ position: "absolute", left: caja.x + 64, top: caja.y + 144, opacity: 0.9 }} />
      )}
    </div>
  );
}
