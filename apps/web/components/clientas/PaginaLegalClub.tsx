import { AvisoClub, HojaClub, TextoLegal } from "@/components/clientas/piezas-club-publico";
import { leerTextosLegales } from "@/lib/club-pagina";
import { cuerpoLegal, enlaceLegal, fechaLarga, textoLegal } from "@/lib/club-registro-reglas";

// La Política de privacidad y los Términos del Club CAYLA (ADR-0288 act. g, G-11), PÚBLICAS: las abre la clienta desde el
// registro (en otra pestaña, para no perder lo que llenó) o cualquiera con la dirección. El texto es el vigente de
// `club_textos`, con su versión —la que ella acepta al unirse— y el % y la escala vigentes en lugar de `{pct}` y `{escala}`.
// Componente de servidor: lee la base al pedirse la página.

const TITULOS = { privacidad: "Política de privacidad del Club CAYLA", terminos: "Términos del Club CAYLA" } as const;

export async function PaginaLegalClub({ cual, t }: { cual: "privacidad" | "terminos"; t: string | null }) {
  const { lectura, volverA } = await leerTextosLegales(t);
  if (lectura.estado !== "lista") {
    return (
      <HojaClub>
        <AvisoClub titulo="No pudimos abrir esta página">
          <p>Inténtalo de nuevo en un rato. También puedes pedir este texto en cualquier tienda CAYLA.</p>
        </AvisoClub>
      </HojaClub>
    );
  }
  const texto = textoLegal(lectura.pagina, cual);
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
        <a href={enlaceLegal(otro, volverA)} className="font-medium text-tinta underline underline-offset-2 hover:text-rojo-profundo">
          {TITULOS[otro]}
        </a>
        {volverA && (
          <a href={`/club/${volverA}`} className="text-tinta/70 underline underline-offset-2 hover:text-rojo-profundo">
            Ir al registro del Club CAYLA
          </a>
        )}
      </p>
    </HojaClub>
  );
}
