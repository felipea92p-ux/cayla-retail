# Maqueta · Caja cerrada («Cuenta el cajón antes de abrir») a pantalla completa (2026-11-03)

Pedido de Felipe: la pantalla de abrir caja se ve muy simple y no ocupa toda la pantalla; textos cortos y solo lo necesario.
Abrir `index.html` (config `maqueta-referentes` del navegador integrado, carpeta `docs/maquetas`). Todo se puede tocar: opciones,
escribir el monto, motivo, responsable, «Abrir caja» hasta la pantalla de «Caja abierta».

La barra negra elige: **propuesta** (Como ahora · A · B · C), **escenario** (el cierre cuadró · tuvo faltante · primera vez),
tema y ancho (320 a 1920). «Reiniciar la apertura» vuelve al inicio.

| Propuesta | Idea |
|---|---|
| **A · Mesa de apertura** | Cabecera → cuatro cifras (ayer, meta, hora de cierre, desde cuándo está cerrada) → «Último cierre» (queda fijo al bajar) y, al lado, el conteo. Botón y responsable fijos abajo. |
| **B · Paso a paso** | Riel oscuro con el cierre a la izquierda; a la derecha, 2 pasos: Cuenta → Abre. |
| **C · El cajón** | Cifra grande arriba con la decisión (lo contado, responsable, abrir), las dos opciones y el monto en el centro, y la tira de los últimos 7 cierres abajo. |

## Qué cambia respecto a hoy
- Sale del tope de ancho: usa todo el ancho (ADR-0462).
- Textos mínimos («Hay S/ 258.50 · Igual que el cierre», «Falta: contar el cajón»).
- Se ve lo necesario para abrir bien: cuánto debería haber, qué pasó en el último cierre, ayer, meta, hora de cierre, qué falta y quién responde.
- **Nuevo:** pantalla «Caja abierta» con «Ir a vender» / «Ver la caja».

## No cambia
Lo que se pide y guarda: monto, motivo (3 letras mínimo si no coincide) y responsable, en una sola llamada a `abrir_caja`.

## Datos
Ayer, meta y hora de cierre ya se leen en Caja con la caja abierta (`getPagosDelDia`, `getParametrosCaja`, `ubicaciones.horaCierre`); con la caja
cerrada hay que traerlos también (lectura, sin migración). Todo lo demás es inventado.

## A decidir con Felipe
1. ¿Cuál de las tres (o una mezcla)?
2. ¿La pantalla «Caja abierta» o que el tablero aparezca directo, como hoy?
