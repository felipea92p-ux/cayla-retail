# ADR-0146 — Avisos (toasts) con coreografía: el aviso dice qué pasó, y el proceso se transforma

- **Fecha:** 2026-09-21
- **Estado:** Aceptado (Felipe, 2026-09-21: aprobó el spike —«Bien me gusta»—, pidió efectos —«en el check de éxito que se
  dibuje en el momento»— y luego «hagamos esos cambios»). Felipe no eligió piel ni intensidad de forma explícita: se
  tomó la recomendación (Ficha + Expresivo) y se dejó fuera lo que chocaba con una regla vigente (ver abajo). Implementado en `components/ui/Avisos.tsx` + `app/estilos/avisos.css`.
- **Decide:** Felipe. Arquitectura: este documento.
- **Diseño de referencia:** `docs/maquetas/avisos-spike-2026-09/avisos-spike.html` (Hoy vs. dos pieles) y
  `avisos-spike-v2-efectos.html` (coreografía; incluye el modo «Lento ×3» para juzgar cada efecto).
- **Toca** la regla de movimiento (ADR-0136 la fija para modales; este ADR aplica la misma regla a los avisos).
  No la cambia. **No toca el modelo de datos ni ninguna migración.**

## Contexto — el problema

El aviso de `Avisos.tsx` (decisión del 2026-09-14: una sola voz, arriba a la derecha) funcionaba pero se leía mal:

1. El tono lo llevaba **una barra de 3 px**: verde y rojo solos no le sirven a quien no los distingue.
2. El texto era una sola línea: «Confecciones del Sur EIRL actualizado» mezcla el nombre con lo que pasó.
3. Había **dos relojes** (barra izquierda + barra inferior que se encoge), sin que ninguno explicara qué era.
4. Un proceso que terminaba **desaparecía y aparecía otro aviso**: parpadeo.
5. Sin tope: cuatro errores seguidos tapaban la pantalla.

## Decisión

**Piel A · «Ficha»**, en la misma esquina (superior derecha), con **efectos expresivos**:

- **Icono con forma propia por tono** (✓ · ! · ⚠) dentro de un disco tintado: el tono ya no depende solo del color.
- **El anillo alrededor del icono es el único reloj** (se vacía; el mouse o el foco lo pausan). Se acabaron las barras.
- **Título = qué pasó; `detalle` = sobre qué.** `avisar.exito("Proveedor actualizado", { detalle: nombre })`.
  El campo `detalle` ya existía: los 344 llamados actuales siguen funcionando sin cambios.
- **Coreografía del éxito** (ms desde que entra): tarjeta entra 0 → disco se llena 60 → anillo se dibuja 60 (460) →
  título se revela 200 → detalle 255 (cascada de 55 ms, la del ADR-0136) → check se traza 260 (360) → una onda 520 →
  arranca la cuenta atrás 520. El reloj espera a que el efecto termine para no competir con él.
- **El proceso se transforma.** `avisar.proceso()` devuelve una función que se sigue llamando para cerrar (compatible
  con todo el código actual) y ahora también trae `.progreso(0..1)`, `.exito()` y `.error()`. El anillo se llena con
  el **avance real**; si llegó al 100 % la misma tarjeta pasa a éxito **sin redibujar el anillo** (`data-continua`).
  Sin cifra, el anillo gira: es la única animación en bucle, y es la señal «estoy trabajando».
- **Tope de 4 avisos** y «Cerrar todos» desde 3. El descarte quita el más viejo que no sea un **error** (un error sin
  leer no se descarta solo) ni un **proceso** en marcha.
- **Salida en dos tiempos**: se desvanece y luego colapsa su altura, así los de abajo suben sin salto.

Reglas heredadas del ADR-0136: `--ease-cayla`, sin rebote, nada decorativo (cada efecto responde a algo que pasó),
todo se apaga con `prefers-reduced-motion` — con una excepción deliberada: **la cuenta atrás se conserva**, porque
es función (cuándo se va el aviso), no adorno.

## Lo que se decidió NO hacer

- **Sin «gesto» de error** (sacudida lateral de 3 px del spike): el ADR-0136 dice «sin rebote» y no se quiso abrir la
  excepción. Si Felipe lo pide, es un keyframe de 5 líneas.
- **Sin piel «Tinta»** (abajo al centro, fondo oscuro): cambia la decisión de la esquina superior derecha y añadía
  tres colores fuera de `globals.css`.
- **Sin «cifra que cuenta»** en los avisos de dinero: necesita decidir por llamada qué cifra cuenta y con qué formato.
  Queda como extensión natural (`detalle` con un componente), no se inventó una API a ciegas.
- **Sin morfar «Deshacer»**: hoy, al pulsarlo, el aviso se cierra y la acción inversa publica su propio éxito
  («X reactivado»). Ya es correcto; el spike lo transformaba en un estado «Deshecho» que no tenía dónde vivir.

## Cómo se verifica

`docs/maquetas/avisos-spike-2026-09/` para ver cada efecto; en la app, cualquier «Guardar» de un proveedor
(«Proveedor actualizado» + nombre) o dejar un campo vacío (error).

**Pendiente (a propósito):** ninguna pantalla usa todavía `fin.exito()` / `fin.progreso()`. Los 7 sitios que abren un
`avisar.proceso` (adjuntos, pago juntos, recibir envío, producto, SUNAT ×2, compra) siguen cerrando el proceso y
publicando un aviso aparte; migrarlos es un cambio por pantalla (cada uno tiene su propio `finally`) y se hace uno a
uno, empezando por `AdjuntosCompra` (el único con un avance natural: N archivos).

## Lección técnica (por qué este ADR menciona un círculo)

En Chrome el trazo discontinuo **no se escala con `pathLength` en un `<circle>`** (sí en un `<path>`): con
`stroke-dasharray: 1` el anillo salía punteado y parecía lleno. El anillo usa la circunferencia real
(2π·17 = 106.81, `--aviso-anillo`); los trazos del glifo, que son `<path>`, usan `pathLength="1"`.
