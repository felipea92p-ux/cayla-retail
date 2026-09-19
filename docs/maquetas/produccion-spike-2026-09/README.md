# Spike visual · Producción del Taller + Insumos (2026-09-19)

Un solo archivo, sin build: abre `produccion-spike.html` en el navegador (o
`python3 -m http.server` en esta carpeta). Datos de ejemplo, nada se guarda.
Usa los tokens reales de `apps/web/app/globals.css` (brandbook v3.x) y la gramática
de movimiento existente; no introduce colores ni gradientes.

**Qué demuestra.** Que el costo de una prenda hecha en el Taller deje de teclearse y
salga de lo que de verdad se descontó del estante. Conecta con lo que ya está
construido pero sin pantalla: ADR-0051 (producción) y ADR-0090 / D-47 (insumos).

## Qué probar (en este orden)
1. **Tablero** → tarjetas por etapa; «Pantalón Sol» y «Falda Brisa» avisan «Sin insumos».
2. Abre **Blusa Aruma** → registra `Lino lavado crudo`, 30 m: la base rechaza (el lote
   más antiguo solo tiene 13 m). Baja a 10 m: ves de qué lote sale, cuánto sube el
   costo por prenda y cuánto baja el margen **antes** de confirmar.
3. Abre **Vestido Tara** → «Marcar hecho» en Acabados: la tarjeta viaja a «Listas para
   cerrar». Ábrela → «Cerrar al inventario» → baja las buenas y mira el costo real.
4. **Insumos** → abre un lote (PEPS: el «1º» es el que se descuenta primero) → «Recibir
   insumo» → el saldo, el lote y el libro de movimientos reaccionan.

## Mejoras de UI/UX propuestas (vs. la pantalla actual)
| Hoy (`OrdenesProduccionV2.tsx`) | Spike |
|---|---|
| Lista plana de tarjetas con 3 `<select>` por orden | **Tablero por etapa**: la etapa donde está la orden *es* la columna |
| Costo de tela y avíos tecleado | Se calcula solo; el aviso «Sin insumos» detecta costos subestimados |
| Margen como texto + punto | **Medidor** con zonas pierde / al filo / gana y barra apilada tela·avíos·maquila |
| Cambiar etapa = cambiar un select | Paso a paso con «Marcar hecho» / «Enviar a maquila» y **Deshacer** |
| Errores después de guardar | **Vista previa antes de confirmar** (lote, saldo, costo y margen antes → después) |
| Sin pantalla de insumos | Saldo contra mínimo, lotes expandibles, libro de movimientos append-only |

## Gramática de movimiento
Reusa (mismo nombre que en producción): `cayla-entrada`, `cayla-velo`,
`cayla-hilo-barrido`, `cayla-brillo`, `--ease-cayla`, `--ease-salida`.

**Gestos NUEVOS que habría que aprobar** (prefijo `nv-` en el CSS):
- `nv-trazo` — el check de una etapa se dibuja al completarse.
- `nv-destello` — la fila que acaba de cambiar (lote, movimiento, consumo) se marca 1,4 s.
- `nv-pulso` — anillo en la etapa actual y punto «vivo».
- `nv-progreso` — barra de cuenta regresiva del aviso con «Deshacer».
- **FLIP** — la tarjeta viaja entre columnas en vez de saltar (Web Animations API).
- **Números y barras que cuentan** de un valor al otro (costo, saldo, margen) — un solo
  helper (`post()`), reusable en todo el ERP.
- Avisos: una sola voz arriba a la derecha (ADR-0047), que se corre a la izquierda del
  panel cuando hay uno abierto.

Con «Reducir movimiento» (o `prefers-reduced-motion`) todo llega al mismo estado final
sin viaje. Cada gesto comunica un cambio de estado; ninguno es decoración.

## Qué es maqueta y qué sería real
| En el spike | En producción |
|---|---|
| `D.consumos` (libro) | `movimientos_insumo` (append-only) — el saldo del lote se **deriva**, no se guarda |
| «Descontar del lote» | RPC `registrar_consumo_insumo` (ya en producción; recalcula `costo_tela` / `costo_avios`) |
| «Recibir insumo» | RPC `recibir_insumo` (existe, sin pantalla) |
| «Marcar hecho» / «Enviar a maquila» | RPC `set_etapa_produccion` |
| «Confirmar entrada al stock» | RPC `cerrar_produccion` (costo ÷ **buenas**) |
| «Anular» | RPC `anular_produccion` |
| Deshacer un consumo | Movimiento de `devolucion` — nunca `DELETE` |

## Pendiente / fuera de alcance
- **Nueva orden** solo muestra la idea (ya no pide tela ni avíos); su formulario real
  merece su propio spike.
- **Muestras** (patronaje → muestra → escalado) no están en el tablero.
- **`v_insumo_saldos`**: la pantalla real no debe leerla directo (hallazgo de ADR-0090:
  sin `security_invoker`, mostraría el saldo de todas las ubicaciones).
- **Compras**: el aviso de recepción menciona que el gasto aparece en Compras →
  Proveedores; la entrada de tela/avíos contra una factura de compra sigue sin
  decidirse (ver la respuesta del 2026-09-19 y ADR-0090).
- No hay captura PNG: abrir el HTML.
