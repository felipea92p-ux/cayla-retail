import type { ReactNode } from "react";
import { IsotipoCayla } from "@/components/ui/IsotipoCayla";
import type { Bloque, Trozo } from "@/lib/club-registro-reglas";

// Las piezas que comparten las páginas PÚBLICAS del Club CAYLA (ADR-0288 act. g): el registro (`/club/<tienda>`), la política
// de privacidad y los términos. Solo dibujan; sin estado ni red, así sirven en el servidor y en el navegador. Fuera de
// `app/(app)`: sin menú ni cabecera del ERP, una columna angosta pensada primero para el celular de ella (375 px).

/** El colibrí y «CAYLA · Club», arriba a la izquierda (como el spike del club). */
export function CabezaClub() {
  return (
    <div className="flex items-center gap-3">
      <IsotipoCayla className="h-7 w-auto" />
      <span className="flex flex-col leading-none">
        <span className="label-cayla text-sm tracking-[0.26em] text-tinta">CAYLA</span>
        <span className="label-cayla mt-1 text-[10px] tracking-[0.2em] text-taupe-profundo">Club</span>
      </span>
    </div>
  );
}

/** El fondo y la columna de todas las páginas públicas del club. */
export function HojaClub({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-crema text-tinta">
      <div className="mx-auto w-full max-w-md px-5 pb-12 pt-7 sm:max-w-lg sm:pt-10">
        <CabezaClub />
        {children}
      </div>
    </main>
  );
}

/** Un texto partido en trozos: lo que va en negrita, en negrita. Nunca HTML. */
export function Trozos({ trozos }: { trozos: readonly Trozo[] }) {
  return (
    <>
      {trozos.map((t, i) =>
        typeof t === "string" ? (
          <span key={i}>{t}</span>
        ) : (
          <b key={i} className="font-semibold text-tinta">
            {t.fuerte}
          </b>
        ),
      )}
    </>
  );
}

/** La política o los términos, bloque por bloque (`bloquesDeTexto`): títulos, párrafos y listas, sin interpretar HTML. */
export function TextoLegal({ bloques }: { bloques: readonly Bloque[] }) {
  return (
    <div className="space-y-3 text-[14.5px] leading-relaxed text-tinta/85">
      {bloques.map((b, i) => {
        if (b.tipo === "titulo") {
          return b.nivel === 2 ? (
            <h2 key={i} className="font-display pt-4 text-[24px] leading-tight text-tinta">
              <Trozos trozos={b.trozos} />
            </h2>
          ) : (
            <h3 key={i} className="pt-3 text-[15px] font-semibold text-tinta">
              <Trozos trozos={b.trozos} />
            </h3>
          );
        }
        if (b.tipo === "parrafo") {
          return (
            <p key={i}>
              <Trozos trozos={b.trozos} />
            </p>
          );
        }
        const Lista = b.ordenada ? "ol" : "ul";
        return (
          <Lista key={i} className={`space-y-2 pl-5 ${b.ordenada ? "list-decimal" : "list-disc"} marker:text-taupe`}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Trozos trozos={item.trozos} />
                {item.sub.length > 0 && (
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-5 marker:text-taupe">
                    {item.sub.map((s, k) => (
                      <li key={k}>
                        <Trozos trozos={s} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </Lista>
        );
      })}
    </div>
  );
}

/** Lo que dice una página pública que no puede mostrar lo suyo: un título y un párrafo, sin detalle de nada. */
export function AvisoClub({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h1 className="font-display text-[30px] leading-tight text-tinta">{titulo}</h1>
      <div className="mt-3 text-[15px] leading-relaxed text-tinta/70">{children}</div>
    </section>
  );
}
