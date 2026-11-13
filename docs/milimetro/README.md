# Al milímetro — tablero

**Obligatorio desde el 2026-11-12** (Felipe: «cada que se haga un cambio visual o se cree una nueva pantalla o se quiera auditar las
pantallas ya existentes se usen esas skills obligatoriamente»). Regla completa: `CLAUDE.md`, sección «Al milímetro».

| Cuándo | Qué se corre |
|---|---|
| Pantalla, modal o pieza nueva | `/milimetro diseñar <pieza>` antes del código |
| Cambio visual a algo que existe | `/milimetro auditar <ruta>` al terminar, en local |
| Auditar lo que ya existe | `/milimetro auditar <ruta|módulo>` |
| Una regla del repo que convendría mejorar | va a `propuestas.md`; se decide con `/milimetro proponer` |

El PR marca su casilla «pasó por `/milimetro`» (o «Al milímetro no aplica») y el check **«Al milímetro»** la pide cuando cambia un `.tsx`
de `apps/web/components/` o `apps/web/app/`, o un `.css` de `apps/web/app/`.

## Auditorías

Una fila por auditoría (la más nueva arriba). Graves = hallazgos de severidad «grave» que quedaron abiertos.

| Fecha | Ruta o pieza | Rama / PR | Graves abiertos | Notas |
|---|---|---|---|---|
| 2026-11-13 | `/finanzas/dinero/conciliacion` ▸ tarjeta «El banco dijo» con un retiro posterior al saldo anotado (ADR-0652) | `claude/cuadre-retiro-error-c18c68` · PR #1813 | 0 | 0 graves, 1 media arreglada (decía «Coincide con el sistema» junto a dos cifras distintas → «Coincidía con el sistema cuando se anotó»), 0 leves. La frase nueva: 14 px, 5,44:1 en claro y 6,72:1 en oscuro, ~42 caracteres por línea, sin desborde a 375 px. Lo demás que marcaron los medidores es de la página de antes. Informe: `auditorias/2026-11-13-cuadre-retiro-posterior.md` |
| 2026-11-13 | `/productos/[id]/editar` ▸ «Corregir color» con «+ acompañante»; el punto partido en Productos, Existencias y Vender | `claude/combined-colors-catalog-pov-4c7991` | 0 | 0 graves, 0 medias, 0 leves en lo que cambió; 0 textos que fallen en claro y oscuro. Lo que marcaron los medidores es de la ficha de atrás o de piezas del sistema. Segunda pasada a 375 px con el dedo y con teclado: 2 medias y 1 leve arregladas (marcador cortado, «×» de 24 px, buscador desalineado). Informe: `auditorias/2026-11-13-colores-combinados.md` |
| 2026-11-13 | `/productos` ▸ «Fusionar productos repetidos», dirección B «La ficha que se arma» (armar, revisar y comparar; 1440 claro/oscuro/quieto y 375) | `claude/fusionar-productos-rediseno` @ `cdef7467e` | 0 | Arregladas en `4cc7f182d` las 2 graves y 2 medias propias. Graves: el foco de la fila «Nombre» queda tapado entero por el pie fijo (WCAG 2.4.11; arreglo probado: `scroll-margin-bottom` en `.fus-opcion`) y el contorno de la celda «pasa» a 2,69:1 en claro (WCAG 1.4.11). Medias: la ficha abierta en Comparar solo la dice ARIA; casillas de fotos de 20 px con el dedo; letra < 14 px heredada de `Modal`/`CampoGuiado`. 6 leves. Sin medir: 3 fichas, «listo», errores. Informe: `auditorias/2026-11-13-fusionar-productos-rediseno.md` |
| 2026-11-13 | `/compras/mi-plata/compra` ▸ paso 3 «Papel y pago» (medio sin elegir de fábrica) | `claude/mis-compras-medio-sin-elegir` | 0 | 1 grave de antes arreglada (ayuda de la tarjeta elegida a 4,18:1 → tinta: 9,6:1 en oscuro); el panel «Tu compra» dice lo mismo que la guía; 3 «revisar» descartados (borde de las fichas compartidas de Vender, prefijo S/, opción en tarjeta). Informe: `auditorias/2026-11-13-apunte-medio-sin-elegir.md` |
| 2026-11-13 | `/compras/mi-plata/envios` ▸ detalle del envío: «Anular envío» y su hoja | `claude/mis-compras-anular-envio-en-camino` · PR #1801 | 0 | 0 graves, 0 medias, 0 leves en lo que cambió: contraste medido en claro y oscuro (7,2:1 y 8,1:1 el botón), foco 4/4, 44 px con dedo, error bajo el campo con foco. 4 notas del resto de la página, ya estaban. Informe: `auditorias/2026-11-13-mis-envios-anular.md` |
| 2026-11-12 | `/compras` (Historial de compras) | `claude/auditoria-milimetro-compras` | 0 | Primera corrida de los medidores contra el ERP real: 0 graves, 4 medias, 6 leves; arregladas 3 medias (rojo de «Venció», fila apilada propia, pie de paginación a 15 px), quedan el esqueleto global y las leves (backlog de la rama). 16 falsos positivos de los medidores arreglados. Informe: `auditorias/2026-11-12-compras.md` |
| 2026-11-12 | `/productos` ▸ «Fusionar productos repetidos» (hoja, aviso de posibles repetidas, botón de la vista rápida y de la Tabla) | `claude/merge-duplicate-products-09f938` · PR #1794 | 0 | 1 grave (el botón que confirma se apagaba por lo que faltaba, ADR-0611) y 1 media (lo elegido solo por color, WCAG 1.4.1), las dos arregladas; texto sin fallas; sin medir espacio, tipografía, color, movimiento y foco. Informe: `auditorias/2026-11-12-fusionar-productos.md` |
