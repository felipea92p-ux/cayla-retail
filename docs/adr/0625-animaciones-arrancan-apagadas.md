# ADR-0625: las animaciones arrancan apagadas, con un botón para encenderlas

**Fecha:** 2026-11-07 · **Estado:** aceptado · **Cambia:** ADR-0136 (regla de movimiento): todo lo que permite se ve solo con las animaciones encendidas.

## Contexto

Al revisar por qué el ERP se sentía pesado en algunos equipos (ADR-0623), Felipe pidió poder apagar y encender las animaciones, y que
arranquen **apagadas**. El ERP acumuló mucho movimiento elegido a propósito (hojas que suben, cascadas, cifras que cuentan, el colibrí,
latidos, vuelos), y todo eso cuesta en un equipo modesto. Hasta hoy la única forma de apagarlo era la preferencia del sistema operativo
(`prefers-reduced-motion`), que casi nadie conoce.

Felipe eligió (2026-11-07):
- **Dónde:** un botón junto al del modo oscuro, en la cabecera, y que valga para el aparato (como el tema, ADR-0336). Lo ven también las
  terminales de tienda, que no tienen «Mi perfil». Sin migración.
- **Qué sigue moviéndose apagado:** solo las **señales de espera**, para que un guardado lento no parezca colgado y nadie apriete dos veces:
  el hilo de «Guardando…», el loader y su anillo, el campo que consulta y el buscador que busca.

## Decisión

1. `<html data-movimiento="quieto|vivo">`, puesto antes de pintar por un script del `<head>` (`SCRIPT_MOVIMIENTO_ANTES_DE_PINTAR`) que lee
   `localStorage["cayla-movimiento"]`. Sin nada guardado, corrupto o sin almacenamiento: **quieto**.
2. **El CSS que aquieta** (`app/estilos/movimiento.css`, sin capa y con `!important`): cada animación y transición queda en 0,01 ms, sin
   demora y con una sola vuelta. Se eligió así, en vez de `animation: none`, porque siguen llegando `animationend` y `transitionend` (una hoja
   que espera su salida para desmontarse se cierra igual) y lo que entra con `both` queda en su estado final. No hubo que tocar ninguna
   de las ~200 reglas de `prefers-reduced-motion` del ERP.
3. **Las señales se salvan:** en JSX, con `data-senal` (`HiloEnEspera`, el anillo y el hilo de `Espera`, el hilo de `ProveedorModal`); en CSS,
   con una lista en `movimiento.css` que les devuelve su vuelta (`.buscador[data-buscando] .buscador-hilo::before`,
   `.caja-campo[data-trabajando]::after`, `.hilo-l--trabaja::after`). El hilo del buscador gira solo mientras busca.
4. **Lo que anima desde JavaScript** pregunta `prefiereQuieto()` (`lib/movimiento-cliente.ts`), o `useQuieto()` si tiene que volver a pintar
   al cambiar. Se pasaron los 80 lugares que preguntaban `matchMedia("(prefers-reduced-motion: reduce)")` por su cuenta; `lib/movimiento-reglas.test.ts`
   falla si vuelve a aparecer uno.
5. **El aparato que pide menos movimiento gana siempre** (`quedaQuieto`): el botón no enciende lo que el sistema operativo apagó.
6. **El botón** `<BotonMovimiento>` (`components/ui/BotonMovimiento.tsx`): el mismo cuerpo que el del tema, «Animaciones» como nombre
   accesible con `aria-pressed`, un destello que lleva una raya cuando está quieto (lo decide el CSS desde el atributo: sin destello al
   hidratar). Al pulsarlo cambia al instante, en todas las pestañas del aparato.

## Alternativas descartadas

- **Por persona, en «Mi perfil»:** seguiría a la persona en cualquier aparato, pero necesita migración y las terminales quedarían siempre quietas.
- **Una sola decisión para todo el ERP en Configuración:** nadie podría elegir por su cuenta.
- **Todo quieto sin excepción:** un «Guardando…» quieto parece colgado en un guardado lento.
- **Redefinir la variante `motion-reduce:` de Tailwind:** habría apagado también el anillo del loader, que es señal; el CSS general ya cubre esas utilidades.

## Consecuencias

- Quien abra el ERP después de publicar lo verá quieto: las hojas aparecen sin subir, las cifras sin contar, el login sin vuelo del colibrí.
  Para verlo como antes, el botón «Animaciones» de la cabecera, una vez por aparato.
- Una pantalla nueva se revisa también quieta: lo que entra con una animación tiene que quedar en su lugar.
- `components/ui/` cambió (botón nuevo, `campos.tsx`, `Espera.tsx`): Dynamic lo mira, no lo copia; queda como tarea allá (contrato de familia v4).
