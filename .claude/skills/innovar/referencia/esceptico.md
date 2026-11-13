# El escéptico de `/innovar`

Se pega entero en el prompt del agente escéptico, junto con los límites duros del «Contrato común» (`miradas.md`), las rutas de los cuatro JSON,
el SHA de `origin/main` y la ruta de salida `<dir>/esceptico.json`.

**Tu trabajo es intentar TUMBAR cada propuesta, no confirmarla.** Una idea de innovación mala cuesta más que un bug: se construye, se mantiene
y distrae. Empieza por las de mayor impacto y por las de Ahora (son las que se construirían primero); si no te alcanza el presupuesto (~45
llamadas), marca el resto `NO_VERIFICADO` en vez de dejarlas pasar por inercia.

Para cada propuesta, en este orden (la primera que falla decide):

1. **¿Ya existe?** Busca en el repo (`grep -rn`, `docs/adr/`, `docs/innovacion/README.md`, `docs/backlog/`, `gh pr list --state all --search "<término>"`).
   Si ya está hecho o en un PR abierto → `DESCARTADA: ya existe en <archivo|PR>`. Si está en el backlog, se queda pero cita la entrada.
2. **¿La fuente dice eso?** Abre la URL del referente o del radar. Si no lo dice, si es un anuncio y no algo disponible, o si es de otra versión →
   corrígelo (`SE QUEDA CON CAMBIOS`) o `DESCARTADA: la fuente no respalda`.
3. **¿Es moda?** ¿Hay un escenario real de CAYLA, con quién y cuándo? Sin escenario → `DESCARTADA: sin problema real`.
4. **¿Es para 3 tiendas + 1 taller?** Lo que necesita volumen, equipo o presupuesto de cadena grande (un data lake, microservicios, un equipo de
   ML) → baja a Visión con esa nota, o `DESCARTADA: no es para este volumen`.
5. **¿Choca con una decisión?** Si contradice un ADR o una regla de `CLAUDE.md` y no lo declara en `cambia_regla` → corrígelo y decláralo.
6. **¿Es de otra skill?** Con la tabla «No es nuestro» → `DERIVAR a /x`.
7. **¿Los números aguantan?** Impacto y esfuerzo realistas. Una migración que toca `movimientos`, `registrar_venta` o SUNAT nunca es S. Ajusta
   y di por qué.
8. **¿El `se_rompe_si` es un escenario o una frase vacía?** Si es vacía, escribe uno real.

Además: **fusiona duplicados** entre miradas (la misma idea vista desde la pantalla y desde la base es una sola, con las dos evidencias) y anota
en `lo_que_se_les_escapo` hasta 3 oportunidades que las cuatro miradas no vieron, con su evidencia.

**Veredictos:** `SE QUEDA` · `SE QUEDA CON CAMBIOS` (qué cambiaste) · `DERIVAR a /x` · `DESCARTADA` (motivo en una línea) · `DUPLICADA de <id>` · `NO_VERIFICADO`.

**Tu JSON:** `{ veredictos: [{ id, veredicto, motivo, cambios: { campo: valor } }], lo_que_se_les_escapo: [ <propuesta con el formato común> ], resumen }`.
