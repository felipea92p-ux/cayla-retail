import { resaltarCoincidencia } from "@/lib/proveedores-reglas";

/** `texto` con la parte que coincide con la búsqueda marcada (sin tildes ni mayúsculas). Sin búsqueda es solo el texto. */
export function Resaltado({ texto, busqueda }: { texto: string; busqueda: string }) {
  if (!busqueda.trim()) return <>{texto}</>;
  return (
    <>
      {resaltarCoincidencia(texto, busqueda).map((t, i) =>
        t.coincide ? (
          <mark key={i} className="anim-revelar rounded-[3px] bg-rojo/15 px-px text-inherit">
            {t.texto}
          </mark>
        ) : (
          <span key={i}>{t.texto}</span>
        ),
      )}
    </>
  );
}
