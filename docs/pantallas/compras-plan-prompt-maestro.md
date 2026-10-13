# Prompt maestro · Compras ▸ Plan de campaña (`/compras/plan`)

- **Fecha / SHA:** 2026-10-13 · `829943766` (main)
- **Para qué sirve este archivo:** copiar el bloque de abajo en una sesión nueva de Claude Code. Junta en un solo recorrido, y en orden, las skills
  del repo que mejoran una pantalla. Antes del bloque está el diagnóstico de la captura del 13-oct (Aniversario CAYLA 2026, día 13 de 21,
  0 de 45 categorías con plan). Son **hipótesis**: la sesión las comprueba contra el código y el navegador antes de tocar nada.

---

## Diagnóstico de la captura (hipótesis a verificar)

### Lo que sobra o hace ruido (ley 8: quitar antes de agregar)
| # | Qué se ve | Por qué estorba | Dónde vive |
|---|---|---|---|
| S1 | 45 filas con el chip «Sin plan» **y además** el botón «Armar plan» | Dicen dos veces lo mismo. Con el botón alcanza; el chip es ruido repetido 45 veces | `FilaCategoria.tsx:58-62` |
| S2 | Columnas «Comprar» e «Inversión» con «—» en las 45 filas | Son dos columnas vacías que ocupan ~25 % del ancho. Con 0 planes no tienen nada que decir | `FilaCategoria.tsx:14-23` (`columnasDelPlan`) |
| S3 | «Cómo leer la barra: Ya hay · Comprar · Del flojo al bueno…» | Explica una barra que no aparece en ninguna fila (solo se dibuja con plan) | `ListaCategorias.tsx` → `LeyendaRango` |
| S4 | Píldoras «Todas 45 · Sin plan 45 · Con plan 0» | «Sin plan» filtra a lo mismo que «Todas», y «Con plan 0» lleva a una lista vacía. Son tres filtros donde hoy sirve uno | `PILDORAS` en `ListaCategorias.tsx` |
| S5 | Las fechas tres veces: en el selector («1 OCT – 21 OCT»), en el subtítulo («del 1 de octubre al 21 de octubre») y en el chip («Día 13 de 21») | Tres lecturas del mismo dato. El chip es el único que responde «¿cuándo estamos?» | `PlanCampana.tsx` (subtítulo + `pie`) |
| S6 | «Se vendieron 172.» como frase con punto final, fila por fila | Una cifra escrita como oración, repetida 45 veces, cuesta leerla en columna y no se puede comparar de un vistazo | `FilaCategoria.tsx:78` |

### Lo importante que hoy no se ve
| # | Qué falta ver | Por qué importa | Dónde vive |
|---|---|---|---|
| V1 | **El aviso de stock (el «3» rojo) está escondido tras un ícono sin texto** | Dice que el stock de 3 tiendas no cuadra, o sea, que la columna «Hay hoy» (226, 292…) no es confiable. Es el dato que más condiciona la decisión y está en un cajón que hay que adivinar | `PlanCampana.tsx` (botón `PanelRightOpen` + insignia) |
| V2 | **La cabecera dice «Todas las tiendas» y arriba a la derecha dice «TIENDA TRU»** | Se contradicen a la vista. La aclaración («la sede elegida arriba no filtra esta pantalla») está dentro del cajón cerrado | `EncabezadoPagina sede=` + `CajonFicha` |
| V3 | **Con la campaña empezada y sin plan, la pantalla sigue pidiendo «Armar plan»** | El día 13 de 21 ya no se le compra a un proveedor para esta campaña. La acción útil hoy es otra: ver Resultados (qué reponer o impulsar) o armar el plan de la PRÓXIMA campaña. La pantalla no cambia la pregunta según el momento | `momentoDeLaCampana` + `primera` (solo se calcula con `estado === "antes"`) |
| V4 | «Vendiste 175 en 90 días» y «Se vendieron 172» están en dos columnas separadas | Son la comparación que vale oro (en 13 días de campaña se vendió casi lo de 3 meses), pero nadie la hace porque están lejos y escritas distinto. Debería ser una sola lectura: ritmo de la campaña contra lo normal, y si el stock alcanza para los días que quedan | `FilaCategoria.tsx` (2.ª y última celda) |
| V5 | El chip verde «N.º 1» | En el sistema, verde quiere decir «bien». Un puesto en un ranking no es un estado bueno ni malo: va en pizarra (informativo) | `FilaCategoria.tsx:48` |
| V6 | Ninguna fila dice qué pasa al tocarla, salvo el botón | Toda la fila es un botón, pero solo lo parece la caja «Armar plan». Ya estaba en la lista aparte de Formidable («una fila con plan no dice que se puede corregir») | `FilaCategoria.tsx` |

### Lo que la captura no puede mostrar y hay que medir
- La hoja de una categoría (`PlanCategoriaModal` → `FormularioCategoria`, 473 líneas), el paso a paso y el cajón «Resumen y avisos» con sus 5 bloques.
- Formidable (2026-10-10) dejó **6,8 provisional, sin prueba ciega sobre la pantalla nueva y sin prueba real**. Después de esa medición
  entraron unos 15 commits (cajón de resumen, íconos, pedido en órdenes, simulador, reparto). La nota ya no describe la pantalla de hoy.

---

## El prompt (copiar desde aquí)

```text
Trabajamos Compras ▸ Plan de campaña (/compras/plan, con Resultados e Historial como pestañas hermanas). Objetivo: que un líder de equipo
o una encargada de sede, sin formación técnica, entienda en 5 segundos qué le toca hacer HOY en esta pantalla, según el momento de la
campaña (antes, durante o después), y lo haga sin que nadie le explique. Prioridad: quitar antes de agregar. Que algo se vea más se logra
sacando lo que le hace sombra, no sumando bloques.

## 0. Antes de empezar (ritual del repo)
- `git status --short`, `docs/SESIONES-ACTIVAS.md` (la sesión `elegant-bose-201880` tocó `components/plan-compra/*`, `lib/plan-compra*.ts`
  y las funciones `editar_/quitar_/restaurar_plan_compra`, `fn_planes_compra`, `fn_plan_compra`: si sigue activa, avisarle antes de tocarlas).
- Leer: CLAUDE.md, `docs/datos/15-COMO-OPERA-CAYLA.md`, `docs/adr/0349-plan-de-campana.md`, `docs/adr/0372-plan-de-campana-barra-de-rango-paso-a-paso-y-exportar.md`,
  `docs/formidable/compras-plan.md`, `docs/pantallas/compras-plan-prompt-maestro.md` (este archivo: trae 12 hipótesis S1–S6 y V1–V6),
  `docs/maquetas/plan-campana-rediseno-2026-10/` y `grep -rn "plan_compra\|Plan de campaña" docs/bitacora docs/backlog docs/datos/DECISIONES-*.md`.
- Sesión local: `localhost`, con una cuenta Líder del seed. Hace falta una campaña en cada momento (antes, durante con 0 planes,
  durante con planes, terminada). Si la base local no las tiene, se dice; no se inventan datos fuera de `estado.mjs`.

## 1. Diagnóstico (solo lee, no toca código)
1. `/pantalla /compras/plan`: con la captura del 13-oct y recorriendo los 4 momentos de la campaña. Que confirme o refute cada hipótesis
   S1–S6 y V1–V6 con archivo:línea, y proponga las 12 tareas por importancia. Lo guarda en `docs/pantallas/compras-plan.md`.
2. `/formidable /compras/plan`: volver a medir sobre la pantalla DE HOY (la nota 6,8 es de antes de unos 15 commits). Incluye la prueba
   ciega que quedó pendiente, con dos tareas: (a) «la campaña empieza en 40 días, arma el plan de las 3 que más venden»; (b) «la campaña va
   en el día 13 y nadie planificó: ¿qué haces hoy?». La (b) pone a prueba V3.
3. `/unificar`: censar solo esta pantalla y sus hojas contra la tabla de piezas únicas (chips, cifras, vacíos, avisos, botones de ícono).
   Que mire en especial el chip verde de ranking (V5) y el botón-ícono con insignia (V1).
4. `/skill-optimizacion-ui-ux-perf /compras/plan`: `PlanCampana.tsx` es `"use client"` y monta 10 modales y un cajón siempre. ¿Cuáles van
   con `next/dynamic`? ¿Hay `await` en cascada en `page.tsx`?
5. `/skill-analisis-arboles-decision lib/plan-compra-reglas.ts` (999 líneas): solo si el paso 1 encuentra una regla que nadie sabe explicar.

Entregable de la fase: UN informe en el chat con lo que se confirmó, lo que se refutó y **las 3 a 5 propuestas de mayor impacto**, cada
una con antes/después, la ley que mueve, el esfuerzo y cómo se verifica. Para lo estructural, el formato de siempre: DECIDÍ / DESCARTÉ /
SE ROMPE SI. **Te detienes y esperas el OK de Felipe.** Si no contesta, ejecutas solo lo que no cambia ni el cálculo ni una regla de negocio.

## 2. Lo que espero que salga (orientación, no orden: el diagnóstico manda)
- **La pantalla cambia la pregunta según el momento:**
  ANTES → «¿cuánto compro?», con una sola acción principal (eso ya existe: «Empezar por …»).
  DURANTE sin plan → no ofrece «Armar plan» 45 veces. Dice que la campaña empezó sin plan y lleva a lo útil: Resultados (reponer o
  impulsar) y «Planificar la próxima campaña».
  DURANTE con plan / DESPUÉS → lo real contra lo planificado, en una sola lectura (V4).
- **Las columnas se ganan su lugar:** «Comprar» e «Inversión» no se dibujan si ninguna fila tiene plan; la leyenda de la barra no sale si
  no hay barras; las píldoras que no filtran nada (0, o igual a Todas) no compiten (S1–S4).
- **El aviso que condiciona la decisión se lee sin abrir nada:** si el stock no cuadra, una línea a la vista junto a «Hay hoy», con su
  acción («Ir a Conteo»). El cajón queda para el detalle (V1). La contradicción de sede se resuelve en la cabecera, no en el cajón (V2).
- **Las fechas, una sola vez** (S5); cifras en vez de frases en columna (S6); el ranking en pizarra (V5).
- **Dinámico** quiere decir que la pantalla responde al momento y a lo que se toca, no que tenga más animación. El movimiento sigue
  ADR-0136: sin rebote, sin bucle, y se apaga con prefers-reduced-motion.

## 3. Implementar (solo lo aprobado)
- Un commit de refactor si el terreno lo pide, y después un commit por cambio (Kent Beck). Conventional Commits con scope `compras`.
- Lógica nueva, pura, en `lib/plan-compra-*.ts` con su prueba (por ejemplo: «qué acción principal toca según el momento y cuántos planes
  hay» y «qué columnas se dibujan»). La prueba recorre los 4 momentos × {0 planes, algunos, todos}.
- Solo tokens, piezas únicas (`Chip`, `TarjetaCifra`, `Aviso`, `Vacio`, `Boton`, `Pestanas`), `<Modal>`, el loader global y el
  vocabulario «cliente / sede / líder de equipo».
- **No tocar sin el OK puntual de Felipe:** el cálculo (`cuantilCritico`, lo que sobra, el tope, el reparto), las RPC, las migraciones y
  los permisos. Un cambio que muestra u oculta información en otro módulo (por ejemplo, un aviso en Inicio) es una decisión de varios
  módulos: se propone, no se ejecuta.

## 4. Las skills obligatorias sobre lo que cambió
1. `/focus`: la hoja de categoría, el paso a paso y cualquier modal tocado mantienen su guía de foco.
2. `/sugerir`: los ejemplos de la hoja siguen a la categoría elegida.
3. `/guia`: la demo de `/compras/plan` se pone al día con las piezas que nacen o se van (`lib/guias/pantallas/compras.ts` + huella), probada
   con `guias:recorrer` en escritorio y a 375 px. Que tenga un paso para cada momento de la campaña, marcado `opcional` cuando dependa del estado.
4. `/multi-view-responsive /compras/plan`: de 1024×768 a 1920×1080. La lista tiene que empezar arriba del pliegue a 1024×768 (hoy, según
   Formidable, no).
5. `pnpm --filter web tema:auditar -- --ruta /compras/plan --escenarios`, mirando las capturas en claro y en oscuro.
6. `/chaos` solo si se tocó algo que guarda (la hoja o el paso a paso). Si es solo lectura y presentación, se declara y no se ataca.
7. `/formidable` de nuevo: misma tarea ciega, antes/después al mismo ancho, y la nota nueva en `docs/formidable/compras-plan.md`.

## 5. Cierre
- Las tres de siempre, con evidencia: concurrencia (¿cambió algo que guarda?), caída externa (¿qué ve el líder si `fn_plan_compra` no
  responde?) y persona sin contexto (la ciega del paso 4.7).
- Bitácora en `docs/bitacora/2026-10-13-<tema>.md`, backlog en `docs/backlog/2026-10-13-<tema>.md`, ADR (con número reservado mediante
  `pnpm reservar adr`) si se cambió qué pregunta responde la pantalla en cada momento. El PR, con `/abrir-pr`.
- En cada cambio, las tres líneas para Felipe: QUÉ HICE / POR QUÉ ASÍ / QUÉ SE ROMPERÍA SIN ESTO.
```

---

## Lo que el prompt deja fuera a propósito
- **Rediseñar el cálculo** (lo que sobra, el cuantil, el tope): ya tiene su ADR y su prueba. Si la ciega vuelve a tropezar con «Lo que sobra»,
  se le lleva a Felipe como decisión de dinero, igual que en Formidable.
- **Dárselo a colaboradoras:** el módulo `plan_compra` nació solo para el líder (ADR-0161). Si Felipe quiere que lo vean las encargadas, eso se
  hace en Roles y accesos, no en el código.

---

## Resultado de la primera corrida (2026-10-13)
Felipe eligió: diagnóstico más implementar lo seguro, sin PR; con la campaña empezada sin plan, llevar a Resultados y a la próxima; el
recordatorio en Inicio, proponerlo y no construirlo; la usan líderes y encargadas.

| Hipótesis | Veredicto | Qué se hizo |
|---|---|---|
| S1 «Sin plan» + «Armar plan» | confirmada | queda solo el botón |
| S2 columnas en raya | confirmada | con 0 planes no se dibujan (`formaDeLaTabla`) |
| S3 leyenda sin barras | confirmada | solo sale si hay barra |
| S4 píldoras que no filtran | confirmada | se esconden (`pildoraVisible`), nunca la que está puesta |
| S5 fechas tres veces | confirmada | quedan en el selector; el chip dice «termina en N días» |
| S6 «Se vendieron 172.» | confirmada | cifra |
| V1 aviso de stock tras un ícono | confirmada por las dos ciegas | línea sobre la tabla con «Ver qué falta» |
| V2 «Todas las tiendas» frente a «Tienda Trujillo» | confirmada | **no tocada**: decisión de producto (backlog) |
| V3 «Armar plan» a mitad de campaña | confirmada por la ciega (armaría 5 planes a 2 días del cierre) | aviso «empezó sin plan» → «Ver cómo va» / «Planificar <próxima>» |
| V4 ritmo de la campaña frente a lo normal | parcial | se deja a Resultados («¿Cómo va?»); en el Plan no se agrega otra cifra |
| V5 «N.º» en verde | confirmada (verde = «hecho» en `Chip`) | pizarra |
| V6 fila sin señal de que se abre | sin cambio | sigue en la lista aparte |

Evidencia y pendientes: `docs/formidable/compras-plan.md` (2026-10-13), `docs/backlog/2026-10-13-campaign-plan-screen-optimization-1b5890.md`
y ADR-0349, actualización 2026-10-13.
