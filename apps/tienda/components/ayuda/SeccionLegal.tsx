import { partirTituloLegal, type SeccionLegal as Seccion } from "@/lib/ayuda";
import "@/app/estilos/ayuda.css";

/**
 * Un punto de una lectura larga (Privacidad, Términos del Club): su ancla (el índice y los enlaces de una página a la otra llegan aquí)
 * y su título con el número aparte, que se lee letra por letra igual que antes («1. Quién es responsable de tus datos»). El texto de
 * adentro va tal cual (`children`).
 */
export function SeccionLegal({ id, titulo, children }: Seccion & { children: React.ReactNode }) {
  const { numero, texto } = partirTituloLegal(titulo);
  return (
    <section id={id} className="ay-legal-sec" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="ay-legal-h2">
        {numero !== null && <span className="ay-legal-n">{numero}.</span>}
        {numero !== null && " "}
        {texto}
      </h2>
      {children}
    </section>
  );
}
