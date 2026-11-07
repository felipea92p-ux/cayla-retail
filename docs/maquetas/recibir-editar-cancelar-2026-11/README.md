# Maqueta · Recibir mercadería: cancelar una recepción + lápiz para cambiar lo que llegó y el nombre del modelo (2026-11-03)

Pedido de Felipe (con capturas de Recibir ▸ ENV-000004, que llegó sin aviso, con el modelo «Prueba» por crear, y de la hoja «¿Qué llegó?»):

1. **Se debe poder cancelar una recepción de mercadería.** Hoy un envío abierto en la sede solo se puede seguir, cerrar y, ya cerrado, reabrir.
   `anular_envio` existe, pero solo para un envío «en camino» y desde Órdenes de compra.
2. **Junto al nombre «Prueba» debe haber un lápiz para editarlo; y lo mismo para la categoría y la marca** — *aclarado por Felipe*: se refiere a la categoría y la marca
   que se eligen en la hoja **«¿Qué llegó?»** (`components/recepcion-conteo/AgregarFueraDeGuia.tsx`), no a renombrarlas en el catálogo. Y una forma de eliminarlas.

**Solo maqueta: nada de esto está construido.** Abrir `index.html` (o con la config `maqueta-referentes` del navegador integrado). Copia las pantallas reales y cambia solo lo
pedido. La barra negra cambia lo que hay que comparar. Una vista exacta se comparte por el hash:
`index.html#escena=contando&hoja=grupo&foco=marca&cambia=1&tema=oscuro&ancho=movil`.

## Lo que se ve

| Qué | Dónde | Cómo |
|---|---|---|
| **Cancelar recepción** | «⋯» de cada fila de la lista; «Más» arriba a la derecha al contar | Hoja que dice **qué pasa**: sin aviso → el envío se **anula**; con aviso → **vuelve a «En camino»**. Cuenta lo que se descarta, pide el porqué y el responsable. Un envío **cerrado** no se cancela: el menú ofrece «Reabrir» (ya existe). |
| **Cambiar categoría y marca de lo que llegó** | Lápiz junto a «Abrigos» (lista y bajo el nombre) y dentro del chip «Sin marca ✎» | Abre **la misma hoja «¿Qué llegó?»**, ya llena, con «Sigue aquí» en el campo que tocaste. Dice qué cambia («Marca: Sin marca → Cayla»). Guardar no toca el conteo. Si el modelo «por crear» está dentro, se creará con lo nuevo. |
| **Cambiar el nombre del modelo** | Lápiz junto a «Prueba» (cabecera y lista) | Hoja «Editar modelo»: solo el nombre. Su categoría y marca son las de lo que llegó, con un «Cambiar» que lleva a la hoja de arriba. |
| **Quitar / eliminar** | A la izquierda del pie de cada hoja, en rojo | Ver la regla. |

### La regla (nunca se borra historia)

| Cosa | Cuándo | Qué pasa |
|---|---|---|
| Lo que llegó (categoría + marca) | Sin stock ya entrado | **Quitar del envío**: sin preguntar, con aviso «Deshacer» (se vuelve a contar). Su modelo «por crear» se descarta con ella. |
| | Con stock ya entrado, o su modelo con historia | Botón apagado; al tocarlo dice por qué y qué hacer (cancelar la recepción o ajustar inventario). La categoría y marca de un producto con ventas no se cambian aquí (candado de ADR-0258): se hace en Editar producto. |
| Modelo «por crear» | — | **Quitar del envío**, con «Deshacer». |
| Producto ya creado | Nunca se movió / tiene historia | **Eliminar** (confirma con responsable) / **Desactivar** (se conserva su historia). |

## A decidir con Felipe

1. **Quitar: A · dentro de la hoja (recomendada) o B · papelera junto al lápiz.** A deja la pantalla limpia; B muestra «quitar» sin abrir nada pero suma tres iconos rojos.
2. **Un envío CON aviso al cancelar:** la maqueta propone que vuelva a «En camino». Alternativa: anularlo también.
3. **Lo que ya entró al stock:** la maqueta propone que **no se toque** (igual que al reabrir, ADR-0393). Alternativa: devolverlo automáticamente (toca inventario: siempre decisión de Felipe).
4. **«Más» (menú) o botón rojo visible** para cancelar al contar. La maqueta usa «Más» para que lo peligroso no quede junto a «Pasar a cerrar».
5. **Si se cambia una categoría/marca que ya tiene otro grupo igual en la lista:** la hoja real ya lo frena («Esa categoría y marca ya está en la lista»); esta maqueta no lo dibuja.

## Lo que haría falta construir (después del OK)

- `cancelar_recepcion_envio(p_despacho_id, p_version, p_motivo, p_token)`: sin aviso → `estado = 'anulado'` (ya existe en `despachos_estado`); con aviso → `en_camino`, con el rastro
  en `despacho_cierres`. Módulo Recibir, `fn_actor_persona_id(true)`, todo o nada, se niega si el envío está cerrado, no toca stock. Migración con su reserva y una parte re-pegable.
- Cambiar categoría/marca de una línea del envío y quitarla: sobre el borrador del conteo; un modelo ya creado y sin movimientos también actualiza el producto.
- Piezas ya decididas: `<Modal>` Serena, `<LapizEditar>`, `<MenuAcciones texto="Más">`, `btn-peligro` a la izquierda del pie, `<BotonDeshacer>`; la hoja reutiliza `AgregarFueraDeGuia`
  (modo editar). Guía de foco y guía interactiva de Recibir al día en el mismo PR; `/formidable` y `/chaos` (la pantalla guarda) antes de darla por terminada.
