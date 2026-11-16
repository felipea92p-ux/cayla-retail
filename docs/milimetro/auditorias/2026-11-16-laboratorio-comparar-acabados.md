# Al milímetro · `/laboratorio/fotos` ▸ «Comparar acabados» — 2026-11-16

**Pieza:** `apps/web/components/laboratorio/LaboratorioFotos.tsx` (el bloque «Comparar acabados» y los tres cuadros por foto). Pantalla de prueba,
solo fuera de producción. **Rama:** `claude/determined-keller-rk19hj`. **Piezas del sistema, ninguna nueva:** `Interruptor`, `CampoSelect`,
`CampoTexto`, `BotonFoto`, `Chip`, `BotonDescargar`, `btn-sutil btn-chico`, el bloque `card-cayla` de la pantalla en vidrio y el `Panel` que ya tenía.

**Cómo se midió:** el laboratorio en local con OpenAI SIMULADO (Playwright responde cada pedido con un PNG y `x-costo-usd`; no se gastó nada), el
interruptor encendido, una foto de cerca y una foto de prenda. Medidores: estados (y foco), espacio, tipografía, color (claro y oscuro) y textos a
1440 px; espacio a 375 px con el dedo. Sin animaciones propias.

## Números

**0 graves · 0 medias · 0 leves en lo que cambió** (1 leve propia arreglada en el camino).

| Medidor | 1440 claro | 375 claro | 1440 oscuro |
|---|---|---|---|
| estados | 0 apagados, 0 campos sin etiqueta, 2 hover globales de otras piezas | — | — |
| foco | 0 sin anillo, 0 flojos, 0 tapados | — | — |
| espacio | 0 blancos < 24 px, proximidad bien (tras el arreglo) | 0 blancos < 44 px, sin desborde | — |
| tipografía | 0 lectura < 14 px; 1 línea de 102 caracteres (el aviso de OpenAI, de antes) | — | — |
| color | 19 textos, 0 fallan | — | 19 textos, 0 fallan |
| textos | 2 de antes: `PHOTOROOM_API_KEY` en mayúsculas (es un nombre de variable) y «Elegir fotos» de la cabecera | — | — |

**Pedidos (lo que de verdad importa aquí):** una foto con el interruptor encendido manda **tres** pedidos, uno por acabado (`planchada`,
`arrugas-finas`, `sin-planchar`), cada uno con `prefijo=PAN`, `tejido=Lino`, `patron=Liso` y la foto de cerca (`detalle`). Los tres cuadros salen
con su nombre, su costo, «Descargar» y «Usar como molde».

## Arreglado en el camino (leve, propia)

- **La fila de cada versión no se agrupaba bien** (medidor de espacio: «adentro 14 px > afuera 6 px» en los tres cuadros): el costo, «Descargar» y
  «Usar como molde» iban en una sola fila que se partía. Ahora el costo va arriba y las dos acciones en su fila, con el mismo aire (6 px).

## Lo que se arregló en los medidores

- `color/referencia/medir.js` contaba como control el `<input type="file">` escondido de `BotonFoto` (que desde hoy lleva `aria-hidden`): ya no
  cuenta lo que está bajo `aria-hidden`, como `milimetro/referencia/medir.js`. Probado con una página de control (el campo de texto sin borde sí sale).

## Sin medir

- Con OpenAI de verdad y la foto real de Crudo: es lo que tiene que correr Felipe en local (o con su llave) para elegir.
