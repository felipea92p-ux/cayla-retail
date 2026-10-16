import Link from "next/link";
import { CabeceraNeutra, PorDondeSeguir } from "@/components/ayuda/PorDondeSeguir";
import { TEMAS_DE_AYUDA } from "@/components/ayuda/temas";
import { Icono } from "@/components/Icono";

/**
 * Una dirección que no existe: lo dice con la marca y ofrece por dónde seguir (revisión «a nivel mundial», 2026-10-16). Es IGUAL para
 * todos y no lee nada (ni la sesión, ni cookies, ni la base): esta página es el límite «no existe» de TODAS las rutas, y leer la sesión
 * aquí hacía que Next armara cada página de la tienda en cada visita (medido por la sesión principal: con ella, todas salían dinámicas en
 * `next build`; sin ella, la portada, «Entrar» y «Crear cuenta» salen estáticas). Por eso sus salidas sirven con y sin cuenta: «Ir a la
 * tienda» lleva a «/» (el proxy manda al Inicio a quien tiene sesión) y las tres páginas de ayuda son públicas.
 */
export default function NoEncontrada() {
  return (
    <div className="tienda">
      <CabeceraNeutra />
      <main className="t-pagina ay-pagina-sola">
        <PorDondeSeguir
          ceja="Página no encontrada"
          titulo={
            <>
              Esta página <em>no está.</em>
            </>
          }
          texto="Puede que el enlace esté mal escrito o que la página ya no exista."
          acciones={
            <Link className="t-btn" href="/">
              Ir a la tienda <Icono nombre="flecha" />
            </Link>
          }
          caminos={TEMAS_DE_AYUDA}
        />
      </main>
    </div>
  );
}
