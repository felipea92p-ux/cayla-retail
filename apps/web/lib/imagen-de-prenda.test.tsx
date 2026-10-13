import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImagenDePrenda } from "../components/ui/ImagenDePrenda";

// Vitest no resuelve el alias `@/` en este repo (las demás pruebas solo lo usan en `import type`, que se borra al compilar), y
// `ImagenDePrenda` importa `@/lib/foto-prenda-reglas` de verdad. Se le entrega el módulo REAL por ruta relativa: lo que se prueba
// sigue siendo la decisión verdadera de `fotoOptimizable`, no una copia.
vi.mock("@/lib/foto-prenda-reglas", async () => await import("./foto-prenda-reglas"));

// Cómo se SIRVE la foto de una prenda (ADR-0168, «Actualización 2026-10-13»). `fotoOptimizable` ya tiene su prueba (decide por
// host); esta mira lo que de verdad sale al navegador: el `src`/`srcset` que dibuja `ImagenDePrenda`. Sin jsdom no se puede
// disparar el `onError` (queda comprobado a mano en el navegador); aquí se prueba el render de servidor, que es lo que pide la foto.
const SUPA = "https://vovjyyiafkxteijimpuy.supabase.co";
const FOTO = `${SUPA}/storage/v1/object/public/retail-productos-fotos/b6f795a3/BLA.webp`;

function dibujar(src: string) {
  return renderToStaticMarkup(<ImagenDePrenda src={src} alt="" width={36} height={36} className="h-9 w-9" fallback={<span>SIN FOTO</span>} />);
}

afterEach(() => vi.unstubAllEnvs());

describe("ImagenDePrenda: cómo se sirve la foto", () => {
  it("una foto de nuestro Storage pasa por el optimizador, a 1× y 2× del ancho en que se ve", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPA);
    const html = dibujar(FOTO);
    expect(html).toContain("/_next/image?url=");
    // 36 px de ancho → los dos anchos más cercanos del optimizador (48 y 96): unos pocos KB, no el original de 1200 px.
    expect(html).toMatch(/w=48&amp;q=75 1x/);
    expect(html).toMatch(/w=96&amp;q=75 2x/);
    // La foto original NO se pide tal cual (solo aparece codificada dentro de `url=`).
    expect(html).not.toContain(`src="${FOTO}"`);
  });

  it("una foto de otro host se muestra tal cual (el optimizador la rechazaría y tumbaría la pantalla)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPA);
    const otra = "https://cdn.otro.com/storage/v1/object/public/x.webp";
    const html = dibujar(otra);
    expect(html).toContain(`src="${otra}"`);
    expect(html).not.toContain("/_next/image");
  });

  it("sin la URL de Supabase configurada, nada se optimiza (mejor una foto pesada que una pantalla caída)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const html = dibujar(FOTO);
    expect(html).toContain(`src="${FOTO}"`);
    expect(html).not.toContain("/_next/image");
  });

  it("conserva la caja y las clases de quien la dibuja (la miniatura no cambia de aspecto)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPA);
    const html = dibujar(FOTO);
    expect(html).toContain('width="36"');
    expect(html).toContain('height="36"');
    expect(html).toContain('class="h-9 w-9"');
  });
});
