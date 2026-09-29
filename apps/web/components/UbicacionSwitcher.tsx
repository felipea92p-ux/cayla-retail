"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cambiarUbicacionActiva } from "@/app/actions/ubicacion";
import { AvisoCambioDeSede } from "@/components/AvisoCambioDeSede";
import { Desplegable } from "@/components/ui/campos";
import { NOMBRE_VISTA_GLOBAL, VALOR_VISTA_GLOBAL } from "@/lib/vista-global";

// Selector de ubicación del líder (Fase 2 — pendiente desde
// app/(app)/layout.tsx, "Fase 1 no lo pedía como prop"): "pararse" en
// Trujillo, Arequipa, Lima o el Almacén y que TODA la app (vender, caja,
// inventario, movimientos) trabaje sobre esa ubicación. Mismo mecanismo que
// `SedeSwitcher` de V1 — cookie httpOnly vía server action — adaptado a
// ubicaciones en vez de sedes. Un integrante no lo ve.
//
// ADR-0275: quien ve el módulo CAYLA Global (al nacer, solo el Admin) tiene además esa opción, primera y aparte de las
// sedes («Toda la empresa»). Elegirla lleva al tablero: la pantalla donde estaba puede no existir en esa vista (Vender,
// Caja). Volver a una sede desde el tablero lleva al inicio de esa sede; desde cualquier otra pantalla (Finanzas,
// Clientas, que existen en las dos vistas) se queda donde está, ahora con los datos de la sede.
export function UbicacionSwitcher({
  ubicaciones,
  ubicacionActualId,
  puedeVerGlobal = false,
  enVistaGlobal = false,
}: {
  ubicaciones: { id: string; nombre: string }[];
  ubicacionActualId: string;
  puedeVerGlobal?: boolean;
  enVistaGlobal?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, startTransition] = useTransition();
  const actual = enVistaGlobal ? VALOR_VISTA_GLOBAL : ubicacionActualId;
  const [valor, setValor] = useState(actual);
  // El selector vive en la cabecera y no se vuelve a montar al navegar: si la sede cambia por otro camino («Elige sede»
  // de CAYLA Global, ADR-0275), el valor se pone al día con lo que dice el servidor.
  const [previo, setPrevio] = useState(actual);
  if (previo !== actual) {
    setPrevio(actual);
    setValor(actual);
  }

  const nombre = (id: string) => (id === VALOR_VISTA_GLOBAL ? NOMBRE_VISTA_GLOBAL : (ubicaciones.find((u) => u.id === id)?.nombre ?? ""));
  const opciones = puedeVerGlobal
    ? [
        { valor: VALOR_VISTA_GLOBAL, texto: NOMBRE_VISTA_GLOBAL, grupo: "Toda la empresa" },
        ...ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre, grupo: "Sedes" })),
      ]
    : ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }));

  return (
    <>
      <Desplegable
        forma="pastilla"
        alineacion="derecha"
        etiquetaAccesible="Cambiar de ubicación"
        valor={valor}
        opciones={opciones}
        trabajando={pendiente}
        onValor={(elegido) => {
          setValor(elegido);
          startTransition(async () => {
            await cambiarUbicacionActiva(elegido);
            if (elegido === VALOR_VISTA_GLOBAL) router.push("/global");
            else if (pathname === "/global" || pathname.startsWith("/global/")) router.push("/");
            else router.refresh();
          });
        }}
      />
      {/* Cambiar de ubicación aquí repinta TODA la app: el aviso dura lo que tarda esa recarga. */}
      <AvisoCambioDeSede
        activo={pendiente}
        de={nombre(actual)}
        a={nombre(valor)}
        detalle={valor === VALOR_VISTA_GLOBAL ? "Juntando las cifras de toda la empresa…" : undefined}
      />
    </>
  );
}
