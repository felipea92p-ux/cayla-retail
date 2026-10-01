# Spike · Vender con la caja cerrada (2026-10-01)

> **Estado: elegida la B (Persiana), construida (ADR-0298, 2026-10-01).** Lo que sigue describe las tres tal como se mostraron. Antes, con la caja cerrada, `PuntoDeVenta.tsx` solo
> apaga el catálogo y el ticket (`opacity-50` + `pointer-events-none`, líneas ~1421 y ~1509) y deja un botón chico
> «Abrir caja» en la fila de arriba.

`caja-cerrada.html` es un solo archivo. Con la barra negra se elige la maqueta (A, B o C), escritorio o celular a 375 px,
si el último cierre dejó fondo en el cajón o no, y se apaga el movimiento continuo o todo el movimiento. «↺ Ver la entrada
otra vez» repite la llegada, y «Cerrar caja y ver cómo llega» parte del POS abierto. Todo se puede tocar: el botón, Enter,
el formulario de contar el cajón (las dos opciones y el monto escrito), Volver/Esc y la confirmación hasta el aviso final.

## Lo que pidió Felipe

Con la caja cerrada, que todo el fondo se desenfoque (no solo bajarle la opacidad al POS) y que en el medio aparezca un
aviso grande para abrir caja, para que la trabajadora entienda bien que necesita abrir caja para poder vender. Que se vea
sofisticado y elegante, con muchas animaciones. Tres maquetas para elegir.

## Las tres

| | A · Vitrina | B · Persiana | C · Pulso |
|---|---|---|---|
| Fondo | Crema empañado, 18 px de desenfoque | Oscuro, 12 px, con una persiana que baja | Crema con viñeta, 22 px |
| El aviso | Tarjeta de papel con la caja registradora dibujándose | Cartel «Cerrado» colgado de un clavo | Título gigante y un botón redondo que late |
| Datos a la vista | Último cierre, lo que debería haber en el cajón (la cifra cuenta) y la hora | Último cierre y fondo, en una línea | Saludo con nombre y hora; 3 pasos con «Sigue aquí» (ADR-0284) |
| Al tocar «Abrir caja» | La misma tarjeta se convierte en el formulario | Sube la hoja estándar | La hoja nace del botón redondo |
| Al confirmar | El candado se abre, el vidrio se aclara | El cartel gira a «Abierto» y la persiana sube | El botón se pone verde y el POS aparece desde él, como un iris |
| Carácter | La más sobria y de la casa | La más clara para alguien sin formación técnica | La más llamativa |

## Igual en las tres

- **La barra de arriba queda nítida** (menú y selector de sede): con la caja cerrada se puede cambiar de sede o ir a otra
  pantalla. Todo lo de abajo se desenfoca y no se puede tocar.
- **Enter abre la caja** (el lector de etiquetas pierde el foco con la caja cerrada, así que la tecla queda libre) y Esc
  vuelve atrás desde el formulario.
- **El formulario es el de hoy** (`AbrirCajaFormV2`, ADR-0186): contar el cajón contra el último cierre o escribir otro
  monto. No cambia lo que se pide, solo cómo se llega a él.
- **El aviso «Caja abierta con S/ …» sale después de que la capa se va**, nunca encima (ADR-0149).
- **Al abrir, el catálogo entra en cascada** mientras la capa se va, con el cursor ya en el buscador.
- Con `prefers-reduced-motion` (o el interruptor «Movimiento reducido») todo pasa en un instante.

## A decidir con Felipe (además de elegir A, B o C)

1. **Movimiento en bucle.** Las tres traen algo que se repite: el punto rojo que late, y además el halo y el brillo del
   botón (A), el reflejo y el meneo del cartel (B) o las ondas del botón (C). La regla de modales (ADR-0136) solo admite
   bucles que sean señal (hoy: el punto del chip «Vencida», el giro mientras la base responde y las rayas de la guía de
   foco). Si se elige con bucle, queda escrito como excepción en el ADR-0136. Con el interruptor «Movimiento continuo»
   apagado se ve cómo queda sin bucle.
2. **El rebote del cartel (B).** El cartel se mece al colgarse hasta quedar quieto: es un rebote, y la regla dice «sin
   rebote». Si se elige B, va como excepción o el cartel baja derecho.
3. **El botón «Abrir caja» de la fila de arriba** queda tapado por la capa. Al implementarlo se saca de ahí: la capa lo
   reemplaza.

## Al implementar

Una pieza `components/vender/CajaCerrada.tsx` (o el nombre que toque) montada en `PuntoDeVenta.tsx` cuando `bloqueado`,
en lugar de las clases `opacity-50` del catálogo y del ticket. Abre el mismo `AbrirCajaFormV2`; en B y C dentro de
`<Modal>`, como hoy. En A, la tarjeta se transforma en el formulario, y eso hay que conversarlo con la regla de modales
antes de construirlo. Se prueba a 375 px (PL-105) y se declara en `lib/guia-de-foco-pantallas.ts`.
