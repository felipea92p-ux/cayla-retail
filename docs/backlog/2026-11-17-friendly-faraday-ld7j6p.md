# 2026-11-17 · «Pantalla»: los ajustes del aparato salen de la cabecera del celular

**Estado:** propuesta. Nada construido todavía. Falta el OK de Felipe en las tres preguntas del final.
**Rama de origen:** `claude/friendly-faraday-ld7j6p`.

## El pedido (Felipe, 2026-11-17)

En el celular, la barra de arriba tiene botones que no sirven para trabajar en tienda o almacén: modo oscuro (luna) y animaciones
(destello). Además, el modo liviano (la pluma) quedó al pie del menú lateral, junto a «Salir», y casi no se descubre. Felipe quiere:

- sacar esos ajustes de la barra de arriba, **solo en el celular**;
- juntar los tres (modo oscuro, animaciones, modo liviano) en un lugar fácil de encontrar para las colaboradoras.

También preguntó si el modo liviano tiene que venir encendido o si se enciende solo según el aparato.

## Lo que ya existe (verificado en el código el 2026-11-17)

- **El modo liviano ya se enciende solo** (ADR-0674, `apps/web/lib/liviano-reglas.ts`). Un script del `<head>` lo decide antes de la
  primera pintura y lo enciende si:
  - el aparato tiene 2 GB de memoria o menos, o
  - es táctil y tiene 4 GB o menos, o
  - el navegador pide «ahorro de datos».

  En el iPhone y en un computador bueno queda apagado. Safari no informa la memoria, y ahí el vidrio anda bien.
- **El problema del modo liviano:** si alguien lo toca, `localStorage["cayla-liviano"]` queda en «si» o «no» y ese aparato ya no
  vuelve a decidir solo. No existe «Volver a automático».
- **Dónde está cada botón hoy** (`apps/web/components/AppShell.tsx`):
  - `<BotonTema />` y `<BotonMovimiento />` van en la isla derecha de la cabecera, en celular y escritorio (≈ línea 1213).
  - `<BotonLiviano />` va en la cabecera solo en escritorio (`hidden sm:contents`, ≈ línea 1218). En el celular va al pie del
    menú lateral, junto a «Salir» (`contents sm:hidden`, ≈ línea 1094).
- Los tres son **preferencias del aparato**, no módulos (ADR-0306). Los ve toda cuenta, también una terminal, y una terminal
  **no tiene «Mi perfil»**.

## Propuesta: una fila «Pantalla» al pie del menú lateral

```
 ┌─ menú lateral (celular) ───────────┐
 │  …                                 │
 │  Clientes                        › │
 │                                    │
 │  ◐  Pantalla                     › │  ← fila nueva
 │     Claro · Liviano (automático)   │
 │ ┌────────────────────────────────┐ │
 │ │ (foto) Felipe Alvarez       [⎋]│ │  ← la pluma sale de aquí
 │ └────────────────────────────────┘ │
 └────────────────────────────────────┘

 Hoja «Pantalla» (<Modal>; en el celular sube desde abajo, con asa):
   Modo oscuro ..................... [  ○]
   Animaciones ..................... [  ○]
   Modo liviano  · Automático ...... [●  ]
     Volver a automático               (solo si alguien lo cambió a mano)
```

### Por qué ahí

- **La barra de arriba queda para trabajar.** En el celular quedan: menú, colibrí, «Pregúntale a CAYLA», Actividad, sede y lupa.
  Salen la luna y el destello, y la sede gana espacio.
- **Lo ve toda cuenta, también una terminal.** «Mi perfil» parecía el lugar natural, pero una terminal no lo tiene, y estos ajustes
  son del aparato, no de la persona.
- **Se reconoce fácil.** Una fila con nombre y su estado en una línea se entiende mejor que tres íconos sueltos (regla «Poco texto
  a la vista»: el nombre y una línea corta).
- **Usa piezas que ya existen:** `<Modal>` (la hoja del celular, ADR-0479), `<Interruptor>`, `<Chip>` para «Automático». Ninguna
  pieza nueva dibujada a mano (ADR-0358).

### En escritorio

En escritorio, los tres botones siguen en la cabecera, donde sí hay lugar. Si después se quiere lo mismo ahí, se reutiliza la misma
hoja.

## Preguntas abiertas para Felipe (decidir antes de construir)

1. **El nombre de la fila:** «Pantalla» (recomendado: es la palabra de la tienda), «Apariencia» o «Cómo se ve».
2. **¿«Volver a automático» en el modo liviano?** Se recomienda que sí. Para eso hace falta que `liviano-reglas.ts` acepte un
   tercer estado: sin valor guardado = automático. Hay que borrar la clave y que el script del `<head>` vuelva a decidir. Cuidado:
   `liviano.test.ts` compara el script con `resolverLiviano` y tiene que seguir de acuerdo.
3. **¿Solo celular o también escritorio?** El pedido original dice solo celular.

## Cómo construirlo (cuando haya OK)

1. `/milimetro diseñar` la fila y la hoja «Pantalla» antes de escribir código.
2. Componente nuevo, por ejemplo `apps/web/components/ui/HojaPantalla.tsx`, con los tres `<Interruptor>`. Reutiliza
   `lib/liviano-cliente.ts` y la lógica de `BotonTema` y `BotonMovimiento` (extraer sus funciones puras si hace falta; un archivo
   `"use client"` no se llama desde el servidor). Lo que anima desde JS pregunta `prefiereQuieto()`.
3. `AppShell.tsx`:
   - en el celular, ocultar `BotonTema` y `BotonMovimiento` de la cabecera (`hidden sm:contents`, como ya hace `BotonLiviano`);
   - quitar la pluma del pie del menú;
   - agregar la fila «Pantalla» sobre la tarjeta de perfil, solo bajo `sm`.
4. La fila **no es un módulo** (ADR-0306): no va en `lib/modulos.ts` ni en Roles y accesos. Si `lib/modulos.test.ts` («un módulo
   es una entrada del menú») la confunde con una entrada, se marca como fila del pie, no del menú.
5. Reglas que hay que cumplir:
   - guía de foco: la hoja tiene solo interruptores, probablemente `no-aplica` con su motivo, en `lib/guia-de-foco-pantallas.ts`;
   - la guía interactiva del menú (`/guia`): la huella de controles cambia;
   - el escenario de `tema/escenarios/registro.mjs` para la hoja;
   - modo oscuro y quieto;
   - verificar a 375 px y 320 px (la sede no puede quedar cortada).
6. Escribir la actualización del ADR-0674 (y una nota en ADR-0336 y ADR-0625 sobre dónde viven sus botones en el celular).
   Actualizar los comentarios de `AppShell.tsx` que dicen «junto a Salir».
7. PR con `/abrir-pr`, con la casilla de `/milimetro` marcada. Avisar en el PR si toca `components/ui/` (lo mira Dynamic: «queda
   como tarea allá»).

## Cómo verificar que funciona

- En el celular (375 px), la cabecera ya no muestra la luna ni el destello, y la sede se ve entera.
- Abrir el menú → «Pantalla» → cada interruptor cambia el ERP al momento, y se mantiene al recargar.
- En un aparato lento, «Modo liviano» dice «Automático» encendido. Apagarlo, tocar «Volver a automático» y recargar: vuelve
  a encenderse solo.
- En escritorio no cambia nada.
