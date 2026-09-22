# PR #285 — Terminales sin persona (ADR-0162) y combo Responsable (ADR-0161 F4b)

## Qué trae

**Terminales sin persona, como en Dynamic (ADR-0162).** Una terminal es una cuenta de Auth **sin persona**, fija en una
tienda y con un tipo (`ventas` | `administrativa`). El aparato nunca firma: firma la persona elegida en el combo
Responsable, y el aparato queda anotado aparte en `terminal_id`. Reemplaza la terminal-persona del ADR-0160, así que
**no hay que crear 6 personas falsas en Dynamic**.

- `retail.terminales` (separada de `public.terminales` de Dynamic), con el candado «activa ⇒ tiene cuenta» y una sola
  terminal activa de cada tipo por tienda. Nunca se borra: se desactiva.
- `fn_terminal_actual()`, `fn_persona_presente()` (misma lectura de asistencia que `fn_asesoras_de_turno`; en pausa no
  cuenta) y `fn_actor_persona_id(p_de_tienda)`, que responde **quién firma**.
- **Quién tiene permiso sigue siendo la cuenta** (`fn_es_lider`, las cinco `fn_puede_*`): una terminal nunca es líder,
  aunque la responsable elegida lo sea. Por decisión de Felipe, la terminal descuenta sin tope y libera cualquier apartado.
- `fn_exige_responsable()`: interruptor **apagado**. Mientras siga así, una persona que no manda `x-responsable` firma a su
  nombre como hoy. Las terminales exigen responsable siempre.
- `terminal_id` en 10 tablas (`ventas`, `movimientos`, `caja_movimientos`, `cajas`, `cambios`, `devoluciones`,
  `comprobantes`, `conteos`, `transferencias`, `transferencia_recepciones`), llenado por el disparador `trg_sellar_terminal`.
- 65 funciones firman con `fn_actor_persona_id`: 36 de tienda y 29 que no lo son (Compras, Producción, Colaboradores).
- Web: la sesión de una terminal entra por `requirePersonaActualV2`. El pie del lateral muestra el aparato y una terminal
  desactivada ve su aviso en `/login`. Nueva pestaña **Colaboradores ▸ Terminales** (`fn_terminales`,
  `desactivar_terminal`, `reactivar_terminal`). Se retiran `colaboradores.terminal` y `agregar_terminal`.
- `pnpm terminales:crear`: crea una terminal o le cambia la clave. Usa la llave de servicio, lo corre Felipe y muestra la
  clave una sola vez.

**Combo Responsable en la operación de tienda (ADR-0161 F4b).** El combo viene vacío, lista solo a quien está presente en
la tienda, bloquea si no hay nadie y vuelve a vacío al guardar. Viaja en los encabezados `x-responsable`, `x-ubicacion` y
`x-momento` (este último es la hora de una venta hecha sin conexión).
- Piezas: `lib/responsable-reglas.ts` (+ test), `lib/useDeTurno.ts`, `lib/useResponsable.ts`,
  `components/ComboResponsable.tsx` y `components/SedeActiva.tsx`.
- Conectado en Punto de venta (reemplaza la fila «Atendió» del ADR-0163), ventas sin conexión, Caja, Cambios,
  Devoluciones, Facturación, Inventario (ajuste, apartados, piso, dañadas, conteo, traslados) y Catálogo.
- `/api/lucode/emitir` valida al responsable **antes** de transmitir a SUNAT.

## Migraciones y orden de pegado en producción

| # | Archivo | Qué hace |
|---|---|---|
| 1 | `supabase/migrations/20260923010000_terminales_sin_persona.sql` (F2) | Tabla, funciones base, `terminal_id` + disparador, pestaña Terminales, retiro del ADR-0160 |
| 2 | `supabase/migrations/20260923020000_actor_firma_las_operaciones.sql` (F3) | Las 65 funciones pasan a firmar con el actor (se leen de `pg_get_functiondef` en vivo) |

- Se pegan **en ese orden**, cada una empezando con `set search_path to retail, public, extensions;`. La F3 exige la F2.
- La F3 **falla cerrada**: si una función cambió en producción, o aparece una función nueva con el patrón sin
  clasificar, aborta sin tocar nada.
- Las funciones que producción todavía no tiene (apartar stock, comprador de tienda) se **omiten con aviso**. **Si esas
  migraciones se pegan después, volver a pegar la F3.** Es re-ejecutable.
- **No** encender `fn_exige_responsable()` en este paso.

## Pruebas

- `pnpm pruebas:terminales-sin-persona`: **34/34**.
- `pnpm pruebas:actor-firma`: **30/30**.
- `pnpm pruebas:terminales` (reescrita para terminales sin persona): **74/74**.
- `pnpm terminales:probar`: partes puras del script.
- `lib/responsable-reglas.test.ts`: reglas del combo y de los encabezados.

## Verificado en el navegador

En el Postgres local, con sesión de líder, se probaron abrir caja, cobrar (con nota de venta), egreso de caja y cerrar
caja. En las cuatro:
- el combo aparece vacío y el botón queda apagado hasta elegir a alguien;
- después de guardar, el combo vuelve a vacío;
- en la base firma la persona **elegida**, no la sesión.

**Falta verificar:**
- con la sesión de una terminal de verdad (todavía no hay ninguna creada);
- en producción, con la asistencia real de TRU.

## Qué NO trae

- **Roles «ve / no ve» por módulo (ADR-0161 B / ADR-0150):** están en otra rama (`claude/roles-por-modulo`). Por ahora
  los permisos de una terminal siguen siendo las cinco capacidades fijas del ADR-0160.
- El interruptor `fn_exige_responsable()` sigue **apagado**.
- Las 6 terminales no están creadas.
- El diccionario (`docs/datos/generado/`) no se regeneró: eso va después de pegar.
- Quedan fuera del combo, a propósito:
  - lo que solo puede hacer el líder;
  - Compras, Producción, Colaboradores y Configuración;
  - el alta de clienta dentro del cobro;
  - «Pedidos no atendidos», que está pendiente de decisión.

## Riesgos

- **Tienda LIM no tiene asistencia cargada en Dynamic.** Sus terminales no podrán guardar nada hasta que se cargue. Es la
  regla A4/A5, no un error. En el Postgres local pasa lo mismo, porque no hay `marcajes` ni `jornadas`.
- **Encender el interruptor antes de tiempo:** si queda una escritura de tienda sin combo, la base rechaza a las personas
  con `responsable_requerido`.
- **Una migración futura que recree alguna de las 65 funciones copiando su cuerpo viejo del repo** trae de vuelta la
  búsqueda por `auth.uid()`, y la terminal firmaría NULL. `pnpm pruebas:actor-firma` lo detecta.
- **Punto de venta abierto sin conexión desde el inicio:** no carga la lista del combo y no puede vender sin conexión
  hasta que la cargue una vez con red.
- **Comentario viejo en la F3:** el encabezado de `20260923020000` todavía dice que la terminal tiene tope 0 y que no
  libera apartados. El cuerpo de la migración, que es lo que corre, ya aplica lo que decidió Felipe (sin tope y libera
  siempre). Conviene corregir ese comentario en un commit aparte.
- **Descuento con código:** la terminal no tiene tope, pero como no es líder, un descuento manual por línea le sigue
  pidiendo un código válido (`venta_descuento_requiere_codigo`). Lo decide Felipe.

## Checklist de despliegue

- [ ] OK de Felipe para tocar producción.
- [ ] Pegar la F2 `20260923010000` (con `set search_path to retail, public, extensions;`).
- [ ] Pegar la F3 `20260923020000` (igual). Revisar los avisos: qué funciones omitió.
- [ ] Fusionar este PR y confirmar la web publicada en `origin/main` (lo fusiona Felipe).
- [ ] Felipe crea las 6 terminales con `pnpm terminales:crear`.
- [ ] Probar una terminal de verdad en TRU: entra, vende con responsable presente, y se bloquea sin nadie de turno.
- [ ] Revisar que ninguna escritura de tienda quede sin combo y **después** encender `fn_exige_responsable()`
      (`create or replace function retail.fn_exige_responsable() returns boolean language sql stable as $$ select true $$;`).
- [ ] `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- [ ] Si más adelante se pegan apartar stock o comprador de tienda: volver a pegar la F3.
- [ ] Actualizar BACKLOG y BITÁCORA con lo aplicado.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
