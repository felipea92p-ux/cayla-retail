# Auditoría al milímetro — «¿Quién se lleva la plata?» y «Para qué» en Sacar plata del dueño (ADR-0713) · 2026-11-27 · claude/retiro-quien-y-para-que
Medido: 1440×900 claro (quieto) · 1440 oscuro · 375×812 claro con dedo     Servidor: `http://localhost:3010` contra una base privada con las migraciones de la rama y el seed
Resumen: 0 graves · 0 medias · 0 leves de este PR · 1 de antes de este PR

Qué se midió: la hoja **«Registrar movimiento» abierta en «Sacar plata del dueño ▸ Retiro de utilidades»** (`components/finanzas/CuentasDinero.tsx`,
`<Modal tamano="mediana">`), con lo que trae el PR: el combo **«¿Quién se lleva la plata?»** (`CampoFin` + `SelectFin`, `#mov-quien`) y la nota, que en un
retiro se llama **«Para qué»** (`notaDelMovimiento`). Corrieron enteros, con raíz en la hoja, los medidores de `/milimetro` (con y sin foco), `/espacio`,
`/tipografia`, `/color` (claro y oscuro), `/movimiento` (quieto) y `/textos`. Los de espacio, letra y color miden también la pantalla de atrás: lo que
marcaron fuera de la hoja es de antes y no va aquí.

Árbol: las piezas ya están decididas. El combo es el del kit de Finanzas (`SelectFin`, el mismo `Desplegable` con la caja del spike, ADR-0195), igual
que «Qué pasó» y «De» en la misma hoja. La nota es el `InputFin` de siempre: solo cambian su título y su ejemplo. El PR no dibuja nada a mano.

## Graves
Ninguno.
- Contraste: 0 textos que fallan en la hoja, en claro (18 medidos) y en oscuro (18 medidos; 2 no concluyentes sobre vidrio, iguales a los de antes);
  0 controles bajo 3:1.
- Foco: los controles medidos con anillo, 0 sin anillo, 0 tapados.
- Blancos: 0 controles de la hoja bajo 24 px con mouse; con el dedo, 0 bajo 44 px (el combo nuevo mide 313×44 a 375 px).
- Lo que falta no apaga el botón: «Registrar» sigue tocable y, sin persona o sin para qué, avisa «Elige quién se lleva la plata.» o «Di para qué es
  el retiro.» (probado en el navegador). La base vuelve a exigirlo (`pnpm pruebas:retiro-quien-y-para-que`).

## Medias
Ninguna.
- A 375 px, «Cancelar» y «Registrar» siguen a la vista sin desplazar (y = 743–787 en 812 de alto) con el combo nuevo: la fila trae `pie-hoja-fijo`
  desde ADR-0710.

## Leves
Ninguna de este PR.
- Espacio: 0 valores fuera de escala, 0 grupos con la proximidad rota, 0 radios invertidos. Letra: 3 tamaños en la hoja (14, 16 y 27), 0 bajo el piso.
- Quieto: 0 animaciones en bucle; la hoja no agrega movimiento propio.

## De antes de este PR (no se toca aquí)
1. `/textos` marca **«Sacar plata» cortado** en la tarjeta «Plata del dueño», detrás de la hoja (`components/finanzas/dinero/PlataDelDueno.tsx`, botón
   `btn-sutil btn-chico`). Este PR no cambió ese botón. Va a `/textos` cuando se toque la tarjeta.

## Lo que no se midió
- El modo oscuro con `tema:auditar` (sus escenarios no tienen uno para «Sacar plata»); el medidor de color en oscuro dio 0 fallas.
- `/graficos` sobre el gráfico «Quién puso y sacó plata»: el PR cambia sus datos (a quién se cuenta lo que salió) y el texto de su ayuda, no su forma.
