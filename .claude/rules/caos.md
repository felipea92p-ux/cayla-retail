---
paths:
  - "scripts/chaos/**"
  - "docs/chaos/**"
---

## Caos: usar mal el sistema a propósito (regla — ADR-0356, Felipe 2026-10-06)

**Toda pantalla o modal que GUARDA se ataca a propósito antes de darse por terminada.** Una colaboradora real hace doble clic en «Cobrar»,
recarga a mitad de un guardado, abre dos pestañas, pega un monto con coma o pierde el internet justo al pulsar Guardar; hoy nada de eso lo
prueba nadie de forma sistemática. **Lo grave no es la pantalla caída sino el descuadre que nadie ve** (un stock que ya no cuadra con
`movimientos`, una venta cuyos pagos no suman, dos comprobantes): es el principio 2 llevado a prueba. **`/chaos` (skill) lo hace:**
1. **Catálogo fijo + azar con semilla** (`scripts/chaos/catalogo.mjs`, 85 ataques en 9 familias: entradas hostiles, doble clic, navegación
   torcida, concurrencia entre cuentas, permisos y URL ajena, red y sesión, celular 375 px, teclado, y **el botón que no hace lo que dice**:
   ni error ni dato imposible, pero lo prometido no quedó hecho —un `router.refresh()` o un `useEffect([prop])` que pisa lo recién
   guardado, dos respuestas que llegan al revés—, con su lectura del código en `scripts/chaos/boton.mjs`, ADR-0693). El núcleo corre
   siempre; el azar descubre lo que no se nos ocurrió; la semilla repite una corrida exacta (`--semilla N`).
2. **Navegador y base.** Lo que ve la persona (el navegador integrado) y lo que la pantalla esconde (RPC directo en Postgres local, dos
   sesiones paralelas para la concurrencia).
3. **Tras cada ataque que escribe se mira la base** (`node scripts/chaos/invariantes.mjs --contra <foto>`, 12 invariantes que cruzan tablas
   y que la base no impide sola; `--autoprueba` comprueba que el propio detector no esté ciego). Solo cuentan las violaciones NUEVAS.
4. **Gravedad por evidencia, de peor a menos mala:** 1 estado imposible (inventario, dinero o comprobante que no cuadra) · 2 dato malo en
   silencio · 3 pantalla caída · 4 error feo pero seguro. Un rechazo claro sin nada escrito no es hallazgo: es el sistema resistiendo.
5. **Informa, propone y espera tu OK.** Con el OK: primero la **prueba de regresión que falla**, después el arreglo de UNA pantalla, y se
   repite el mismo ataque con la misma semilla. **Dinero, stock, permisos, RPC, migraciones y SUNAT son siempre de Felipe.**

**Candados:** solo local; todo ataque que escribe pasa por `scripts/flujo-de-negocio/estado.mjs` (foto antes, restaurar después), y como la base
local es **compartida con otras sesiones** y restaurar deshace también lo ajeno, no se corre si otra sesión escribió hace menos de 10 minutos
(el 2026-10-06 apareció un movimiento ajeno a mitad de la prueba). Informes y capturas van a `.chaos/` (fuera de git: el repo es público) y
**un hallazgo de permisos o de seguridad nunca entra a un archivo versionado**. Se ataca el código de tu rama, no el de producción.
**Qué cuenta como «guarda»:** llama una RPC o un `.insert/.update/.delete`; una pantalla de solo lectura se declara y no se ataca. Con tablero
y todavía sin prueba en el CI: el avance vive en `docs/chaos/README.md`, y la casilla de `.github/pull_request_template.md` lo pide.
**La parte pura sí corre en el CI** (`scripts/chaos/*.test.mjs`: la forma del catálogo, la reproducibilidad por semilla y la lógica del
detector). Detalle y decisiones: `docs/adr/0356-chaos-usar-mal-el-sistema-a-proposito.md` y `.claude/skills/chaos/SKILL.md`.
