# ADR-0295 · «Reponer piso» por prenda: todas sus tallas en una ventana, y una sola llamada que no se queda a medias

- **Fecha:** 2026-10-01 · **Estado:** construido en la rama `claude/inventory-sizes-restock-issue-165920`, **sin commitear ni PR todavía**. Solo web:
  **sin migración y sin tocar producción**. Probado en el navegador contra la base local (escritorio y 375 px; ver «Cómo se verificó»).
- **Pedido:** Felipe, 2026-10-01, con captura de Existencias en TRU: con «Body Bonita · Beige» en S y M por colgar, «Reponer» abría una ventana
  que mostraba **solo la S**; la M no aparecía, «y pasa igual con todos los productos». Además la ventana decía el SKU y «Disponible en piso /
  Disponible en almacén» en voz de sistema: pidió algo **más básico, simple, moderno, directo a lo que requiere**.
- **Complementa:** ADR-0208 (la bajada al piso: `bajar_al_piso`, todo o nada, con marca), ADR-0231 (CAYLA no sugiere cuánto reponer), ADR-0237
  (Existencias por prenda), ADR-0240 (una puerta, un candado), ADR-0284 (guía de foco), ADR-0161 (Responsable).

## Qué había

- **La ventana era de UNA talla.** Las dos entradas —«Reponer» de la tarjeta y «Reponer a piso» del cajón— llamaban a `tallaParaReponer`
  (`lib/existencias-prendas.ts`), que devuelve **la primera** talla que se puede bajar, y abrían `ReponerPisoModal` con esa variante. Para bajar la
  M había que cerrar, volver a abrir y esperar que el sistema ofreciera otra: no había forma de pedirla.
- **Hablaba como el sistema.** Mostraba `BOD-0008-BEI-S` y «Disponible en piso / Disponible en almacén» en una tarjeta de cifras.
- **ADR-0208 ya había descartado la salida fácil.** Para bajar varias tallas habría bastado llamar `mover_entre_piso_y_almacen` una vez por talla;
  ADR-0208 lo descartó por escrito: «llamar N veces desde la web: no es todo o nada».

## Decidí

DECIDÍ: «Reponer» abre una ventana de la **prenda entera** (modelo + color), con **todas sus tallas**; la persona elige cuántas baja de cada una y al
confirmar se hace **una sola llamada a `bajar_al_piso`** (todo o nada, con marca de reintento), nunca una por talla.

1. **Una fila por talla, sin código.** «S · 2 en almacén · Nada en el piso · − 0 +». La talla sin nada en el almacén también se lista (apagada, «Nada en
   almacén»): quien busca su M tiene que ver **por qué** no se puede subir, no que desapareció. El «+» no pasa de lo libre (neto de apartados).
2. **Arranca en cero** (ADR-0231): CAYLA no sugiere cuánto reponer; la cifra la pone quien tiene la prenda en la mano. El botón dice cuánto baja
   («Bajar 3 prendas») y queda apagado mientras no haya nada elegido.
3. **La puerta es `bajar_al_piso`**, la de «Bajar al piso». Sus líneas son `mover_interno` almacén → piso, las **mismas filas de movimiento** que
   escribía «Reponer»: Frescura las lee por su forma (ADR-0208) y ningún indicador mira `bajada_id` (comprobado en las migraciones), así que nada
   cambia salvo que ahora queda también la cabecera de la bajada. Pide el mismo módulo («Bajada al piso»), el mismo permiso de sede y el mismo
   Responsable que ya pedía «Reponer» desde ADR-0240: **ningún rol gana ni pierde nada**.
4. **Si falla, dice dónde.** «No se bajó nada: revisa las tallas marcadas», y la fila de la talla dice «Solo quedan 3 libres en el almacén»;
   las cifras se releen solas. Tras un corte de red las cifras se congelan y el botón pasa a «Confirmar de nuevo»: reenvía lo mismo con la misma
   marca y, si ya se había guardado, la base lo devuelve sin repetirlo. La cifra que se ve es siempre la que se envía.
5. **Con la guía de foco** (ADR-0284): «Sigue aquí», «Falta: Cuántas bajar», «Todo listo para bajar». El modal nuevo nace `aplicada` en
   `lib/guia-de-foco-pantallas.ts`.
6. **Lo que se quita:** `varianteInicial` del cajón (solo servía para elegir con qué talla empezar) y `abrirMovimiento` del panel. La lógica
   pura vive en `lib/reponer-prenda-reglas.ts` (13 pruebas), reutilizando `argumentosDeBajada`, `interpretarErrorDeBajada` y `resolverTokenReusado`
   de `lib/bajada-reglas.ts`: no hay una segunda interpretación de los errores de `bajar_al_piso`.

## Descarté

DESCARTÉ: **una llamada a `mover_entre_piso_y_almacen` por talla** porque la segunda puede fallar con la primera ya guardada y la prenda queda
repuesta a medias (S abajo, M no) sin que la persona sepa cuál; además cada talla necesitaría su propia marca y su propio manejo de cortes.
DESCARTÉ: **una función nueva `mover_varias_…`** porque ya existe `bajar_al_piso`, con su transacción, sus candados en orden (ADR-0190), su marca y
sus pruebas (`bajada_al_piso.mjs` 51/51); sumar otra sería dos productores de la misma fila (lo que ADR-0208 evitó a propósito) y una migración a
producción sin necesidad.
DESCARTÉ: **precargar la cantidad** (todo lo que hay atrás, o 1 por talla) porque contradice ADR-0231 y es el atajo que baja de golpe todo el
almacén si alguien confirma por reflejo.
DESCARTÉ: **ofrecer solo las tallas «que piden reponer»** porque era justo el hueco de hoy: quien quiere subir una M con 3 en el piso y 4 atrás no
podía; la base solo exige que haya libre en el almacén.

## Se rompe si

SE ROMPE SI **Frescura empieza a distinguir una bajada por escaneo de una por «Reponer»** mirando `bajada_id`: a partir de ese día toda reposición
desde la tarjeta contaría como bajada con lista, y habría que decidir si eso es lo que se quiere.
SE ROMPE SI **dos personas reponen la misma prenda en el mismo segundo**: la segunda recibe «Solo quedan N libres» en la talla afectada y **no se mueve
nada de esa ventana** (la base valida con las prendas ya bloqueadas, así que no puede quedar una talla repuesta y otra no).
SE ROMPE SI **alguien tiene el módulo «Bajada al piso» apagado**: el botón ya no se dibuja (`puedeReponer`), igual que antes.

## Lo que este cambio deja a la vista (no lo resuelve)

- **«Retirar del piso» no tiene entrada en la pantalla.** El commit `46e8abb6` (cajón lateral único) quitó el menú «⋯» de cada talla, que era la única
  llamada a `ReponerPisoModal` con `sentido: "retirar"`. El modal y la función siguen, pero nadie los abre; Frescura (`frescura-pantalla.ts:965`) y
  Ajustar (`ajuste-reglas.ts:262`) siguen diciéndole a la gente que lo use. Queda apagado a propósito en `InventarioPanel.tsx` (comentario en
  `moviendo`) hasta decidir dónde vive: una puerta por talla en el cajón, no un botón de la prenda.

## Cómo se verificó

- Pruebas: `lib/reponer-prenda-reglas.test.ts` (13): lista TODAS las tallas, S y M viajan **juntas** en un solo `p_items`, el tope es lo libre, lo
  tecleado se recorta, una talla sin stock nunca viaja. Suite completa: **273 archivos en verde**, `tsc` y eslint sin errores nuevos.
- Navegador (localhost:3010, base local con una foto previa restaurada al final: «idéntica, 136 tablas»):
  - **Caso de la captura** (Blusa Valentina · Blanco, S 0/2, M 0/5, L 0/5): la ventana lista S, M y L; S 1 + M 2 → «Bajar 3 prendas» → aviso «3 prendas
    bajadas al piso · S 1 · M 2». En la base: **1** bajada, **2** líneas, 3 unidades; cambiaron solo `bajadas_piso`, `bajada_piso_items`,
    `movimientos` y `stock`.
  - **Todo o nada:** con la M reducida a 3 por debajo, pedir S 1 + M 5 → «No se bajó nada», fila de la M «Solo quedan 3 libres»; la S **tampoco** se movió.
  - **Corte de red** (fetch de `bajar_al_piso` rechazado): mensaje honesto, cifras congeladas, «Confirmar de nuevo»; con la red devuelta, **una** bajada.
  - **375 px:** la hoja sube desde abajo, las tallas caben, sin desborde horizontal; botones a la vista (`pie-hoja-fijo`).
- **No probado:** con una cuenta no administradora (se vio el aviso «Eres admin»; el combo de responsable con lista de turno es el mismo de siempre); ni
  en producción hasta fusionar.
