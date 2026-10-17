"use client";

import { useRouter } from "next/navigation";
import { agregarLookALaBolsa } from "@/app/acciones/bolsa";
import { visible } from "@/lib/visible";
import { avisoDelLook, type LineaLook, type Look } from "@/lib/looks";
import { useAvisoBreve } from "../club/useAvisoBreve";
import { AgregarLook } from "./AgregarLook";

/** El globo de la bolsa salta una vez (maqueta, `saltaBolsa`) cuando ya dice cuántas lleva ahora: la acción escribe la cookie y Next
 *  vuelve a dibujar la cabecera; se espera ese cuadro (como mucho medio segundo) para no hacer saltar el número viejo. Sin movimiento
 *  si la persona lo pidió (bolsa.css apaga `.salta` con `prefers-reduced-motion`). */
function saltarLaBolsa(cuantas: number) {
  let cuadros = 0;
  const mirar = () => {
    const globo = visible(document.querySelectorAll<HTMLElement>("[data-bolsa] .t-globo"));
    if (globo?.textContent === String(cuantas)) {
      globo.classList.remove("salta");
      void globo.offsetWidth; // vuelve a empezar la animación si ya había saltado
      globo.classList.add("salta");
    } else if (++cuadros < 30) requestAnimationFrame(mirar);
  };
  requestAnimationFrame(mirar);
}

/**
 * «Agregar el look a mi bolsa» conectado a la bolsa (ADR-0408, actividades 7 y 11): la hoja de tallas (`AgregarLook`) le pasa las prendas
 * elegidas a la acción `agregarLookALaBolsa`, que le pregunta antes a la base y no lleva ningún precio. Al terminar, el aviso de abajo
 * («Agregaste 3 prendas del look «X» a tu bolsa.») y el salto del globo, como la maqueta. Si no entró ninguna, la hoja sigue abierta y lo
 * dice ahí. Sin sesión, a «Entrar».
 */
export function AgregarLookALaBolsa({
  look,
  origenFotos,
  sedeId,
}: {
  look: Look;
  origenFotos: string | undefined;
  /** La tienda que el cliente venía mirando («Ver lo que hay en»): queda elegida para recoger si todavía no eligió otra. */
  sedeId: string | null;
}) {
  const router = useRouter();
  const { aviso, mostrar } = useAvisoBreve();

  async function alAgregar(lineas: LineaLook[]): Promise<string | null> {
    const r = await agregarLookALaBolsa(
      lineas.map((l) => l.varianteId),
      sedeId,
    );
    if (r.estado === "sin_sesion") {
      router.push("/entrar");
      return null;
    }
    if (r.estado === "no") return r.mensaje;
    const dicho = avisoDelLook(look.nombre, lineas, r);
    if (!dicho.cerrar) return dicho.texto;
    mostrar(dicho.texto, r.agotadas.length + r.noEstan.length === 0);
    saltarLaBolsa(r.cuantas);
    return null;
  }

  return (
    <>
      <AgregarLook look={look} origenFotos={origenFotos} alAgregar={alAgregar} />
      {aviso}
    </>
  );
}
