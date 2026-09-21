# ADR-0142 — Solo el líder de equipo cierra la caja y ajusta stock fuera de una venta: el candado va en la base

**Fecha:** 2026-09-21
**Estado:** Aceptado e **implementado en local** en la rama `claude/cayla-menu-pajaros-aviario-1f2c50`. Verificado contra un Postgres 17 desechable
(20 pruebas nuevas, 7 roturas a propósito detectadas, `caja:verificar` 15/15, 4 suites vecinas en verde), 1657 pruebas unitarias, `tsc` y `eslint`
limpios, y en el navegador (el panel de Caja como colaborador y como líder). **La migración NO está aplicada en producción**: se pega con ok de Felipe,
DESPUÉS de desplegar las pantallas (ver «Cómo se pega en producción»).
**Decide:** Felipe, el 2026-09-21, con la pregunta «¿qué vale para el mostrador?» → «Solo el líder, con candado en la base».
**Afecta:** `retail.cerrar_caja` y `retail.registrar_movimiento` (recreadas con el mismo cuerpo de producción más el candado), cinco botones de la web
(Caja, Punto de Venta, Existencias, y el menú y la vista rápida de Productos), `scripts/caja/verificar.sql` (escenario C2) y CI.

## Contexto (verificado contra producción, solo lectura, 2026-09-21)

1. D-13 (`docs/datos/DECISIONES-2026-09-12.md`) reserva al líder «cerrar la caja del día · ajustar stock sin venta · registrar gastos y depósitos».
   Producción cumplía todo menos dos cosas: **`cerrar_caja` y `registrar_movimiento` solo preguntaban `fn_puede_operar_ubicacion`**, que es «líder O es
   mi ubicación». Cualquier colaborador podía cerrar la caja de su tienda —poniendo él el monto contado, y con él la diferencia que después nadie audita—
   o inventarse una entrada, salida o ajuste que cuadra un faltante.
2. Las demás ya piden líder: `anular_venta`, `aprobar_devolucion`, `registrar_movimiento_caja`, `registrar_gasto` (vía `fn_puede_registrar_compras`),
   `cerrar_conteo`. Solo `cerrar_caja` y `registrar_movimiento` quedaban abiertas.
3. Quién las usa: la web llama a `registrar_movimiento` únicamente desde `AjustarInventarioModal` (tipo `ajuste`) y a `cerrar_caja` únicamente desde
   `CerrarCajaModalV2`. **Ninguna otra función SQL de producción las menciona.** Por eso el candado no rompe nada por dentro.
4. `fn_es_lider()` en producción lee de verdad el rol (`colaboradores.rol = 'lider'` y persona activa): 9 líderes, 16 colaboradores. No es la versión de
   la migración 0012 («control total temporal») que dejaba pasar a cualquiera.
5. Una pantalla que esconde el botón no es un candado: la API es pública y cualquier colaborador con sesión puede llamar la función desde la consola.

## Decisión

**DECIDÍ:** recrear `cerrar_caja` y `registrar_movimiento` con **una sola verificación al principio**: `if not fn_es_lider()` → error 42501 en español
(«Solo un líder de equipo puede cerrar la caja» / «…puede ajustar stock fuera de una venta»). Va ANTES de mirar si la caja existe (quien no es líder no
averigua nada). En `registrar_movimiento` cubre los tres tipos que acepta (entrada, salida, ajuste): las tres son stock que se mueve sin venta,
recepción ni traslado. El candado de ubicación se conserva después, tal cual: hoy no rechaza a nadie que el de líder haya dejado pasar, pero queda
puesto para el día que R-48 acote a un líder a su sede. Y las pantallas dejan de ofrecerle el botón a quien no es líder.

**DESCARTÉ:**
- *Solo esconder los botones.* Cuesta cero, pero cualquiera con sesión llama la función directo; y un menú «solo líder» que la base contradice es
  escenografía.
- *«El colaborador puede, con registro».* Nadie se queda bloqueado en el mostrador, pero 16 personas mueven caja y stock y la auditoría es solo a
  posteriori: exactamente el hueco que D-13 quiso cerrar.
- *«El colaborador cuenta y el líder firma».* Es el modelo de `cerrar_conteo`, pero para la caja implica un flujo nuevo y un paso más cada noche.

**SE ROMPE SI:** (a) queda un colaborador solo al final del turno sin un líder presente: la caja queda abierta hasta que llegue uno (hoy hay 3 abiertas,
probablemente de prueba); (b) alguien agrega una pantalla que llame `registrar_movimiento` como colaborador para una entrada o salida sueltas; (c) nace
un rol «Solo lectura» o «Admin» y el candado sigue leyendo `fn_es_lider()` en vez de un permiso por acción (D-12 prevé cuatro niveles; hoy hay dos).

## Qué cambia

- `supabase/migrations/20260921100000_candado_de_lider_caja_y_ajuste.sql`. Su cuerpo, **quitando solo el bloque del candado, es idéntico byte a byte al de
  producción** (mismo `md5` y largo: `cerrar_caja` 03e68706…, 2502; `registrar_movimiento` eeae9a03…, 1331). Mismo `SECURITY DEFINER`, mismo
  `search_path`, mismos permisos de ejecución (`create or replace` con la misma firma).
- `scripts/pruebas/candado_lider_caja_y_ajuste.mjs` (20 escenarios, cada uno con ROLLBACK; `--en-seco` carga la migración dentro de cada escenario) y
  su paso en `ci.yml` y `package.json` (`pruebas:candado-lider`). Contra las funciones de producción, sin candado, la misma prueba da 9/20 y falla donde
  debe.
- `scripts/caja/verificar.sql`, escenario C2: ahora una colaboradora choca con el candado de líder antes que con el de ubicación, y el mensaje dice
  «líder» en vez de «permiso».
- Web: `CajaAbiertaPanel` (a quien no es líder le dice «La caja la cierra un líder de equipo.» en lugar del botón), `PuntoDeVenta` (con la caja abierta,
  el colaborador no ve «Cerrar caja»; «Abrir caja» sigue para todos), `InventarioPanel`, `ProductosAgrupados` y `ProductosGrilla` (sin «Ajustar» para
  quien no es líder).

## Cómo se pega en producción (con ok de Felipe)

1. **Primero se despliegan las pantallas** (fusionar y esperar el deploy): así el colaborador ya no ve los botones cuando el SQL empiece a rechazarlo.
2. **Ensayo** en un lote único que termina en excepción a propósito (nada queda confirmado), con una sonda previa sin escrituras que confirme que
   `md5(prosrc)` de las dos funciones sigue siendo el de arriba: si cambió, alguien las tocó y hay que partir del cuerpo nuevo.
3. Pegar la migración entera (ya trae `retail.` en los nombres y su `search_path`).
4. **Verificar por catálogo:** `prosrc ilike '%fn_es_lider%'` en las dos, mismo ACL (`postgres` y `authenticated`), y una llamada de un colaborador
   real que responda 42501.

## Lo que queda abierto

- **Quién cierra la caja cuando no hay un líder en la tienda** es una decisión operativa de Felipe, no técnica. Hoy hay 9 líderes con alcance global y
  ninguno asignado a una tienda.
- `abrir_caja` sigue abierta al colaborador a propósito (Felipe no la incluyó).
- Un colaborador que pulsa «Cerrar caja» desde una pantalla vieja en caché verá el mensaje de la base (ya está en español); no hay reintento.
- El agente que armó las pruebas reportó que `deriva_produccion` (12/13) y `fn_movimientos_referencias` (70/72) fallan en su base local **igual con y sin
  este cambio** (la primera, porque `registrar_compra` inserta `compras.ubicacion_destino_id`, columna que ADR-0139 eliminó). **No lo reproduje yo**:
  queda anotado para quien toque esas suites.
- El Postgres local tiene `PUBLIC` con permiso de ejecución sobre las dos funciones; producción solo `postgres` y `authenticated`. No afecta a
  producción, pero local y producción no coinciden en permisos.
