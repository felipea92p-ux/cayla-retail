import { AvisoClub, HojaClub, TextoLegal } from "@/components/clientas/piezas-club-publico";
import { leerPuntosDelClub, leerTextosLegales } from "@/lib/club-pagina";
import { DIRECCION_TIENDA_ONLINE } from "@/lib/club-qr-reglas";
import { cuerpoLegal, enlaceLegal, fechaLarga, textoLegal } from "@/lib/club-registro-reglas";

// La Política de privacidad y los Términos del Club CAYLA (ADR-0288 act. g, G-11), PÚBLICAS: las abre cualquiera con la dirección.
// Son lo que aceptó quien se unió por el cartel, hasta que el registro del cartel se retiró el 2026-10-16 (desde entonces se entra al
// Club al crear la cuenta en la tienda online, 20261016154000). El texto es el vigente de `club_textos`, con su versión y sus cifras
// vigentes en lugar de los marcadores: los de antes (`{pct}`, `{escala}`) mientras el texto los nombre, y los de los puntos
// (`{puntos_por_sol}`, `{canje_minimo}`…, de `fn_club_puntos_vigentes`) para el texto que publique el abogado. Un texto al que le
// falta una cifra que nombra no se muestra a medias. Componente de servidor: lee la base al pedirse la página.

const TITULOS = { privacidad: "Política de privacidad del Club CAYLA", terminos: "Términos del Club CAYLA" } as const;

export async function PaginaLegalClub({ cual, t }: { cual: "privacidad" | "terminos"; t: string | null }) {
  const [{ lectura, volverA }, puntos] = await Promise.all([leerTextosLegales(t), leerPuntosDelClub()]);
  const texto = lectura.estado === "lista" ? textoLegal(lectura.pagina, cual, puntos) : null;
  if (!texto) {
    return (
      <HojaClub>
        <AvisoClub titulo="No pudimos abrir esta página">
          <p>Inténtalo de nuevo en un rato. También puedes pedir este texto en cualquier tienda CAYLA.</p>
        </AvisoClub>
      </HojaClub>
    );
  }
  const desde = fechaLarga(texto.vigenteDesde);
  const otro = cual === "privacidad" ? "terminos" : "privacidad";
  return (
    <HojaClub>
      <p className="label-cayla mt-8 text-[11px] text-taupe-profundo">Club CAYLA</p>
      <h1 className="font-display mt-2 text-[32px] leading-tight tracking-tight text-tinta">{TITULOS[cual]}</h1>
      <p className="mt-2 text-[13px] text-tinta/60">
        Versión {texto.version}
        {desde ? ` · vigente desde el ${desde}` : ""}
      </p>
      <div className="mt-6">
        <TextoLegal bloques={cuerpoLegal(texto.texto)} />
      </div>
      <p className="mt-10 flex flex-wrap gap-x-4 gap-y-1 border-t border-sand pt-4 text-[13px]">
        <a href={enlaceLegal(otro, volverA)} className="club-enlace club-enlace-amplio font-medium">
          {TITULOS[otro]}
        </a>
        <a href={DIRECCION_TIENDA_ONLINE} className="club-enlace club-enlace-amplio">
          Únete al Club en tienda.cayla.pe
        </a>
      </p>
    </HojaClub>
  );
}
