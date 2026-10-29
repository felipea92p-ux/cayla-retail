# ADR-0567 — La planilla que Dynamic paga pide registrar de qué banco salió, partida por el banco del colaborador

- **Fecha:** 2026-10-29 · **Estado:** construido en la rama `claude/dynamic-payment-bank-identification-55b380`; migraciones
  `20261029052000`, `20261029053000` y `20261029054000` **sin pegar en producción** (van en ese orden).
- **Nace de:** la pregunta de Felipe del 2026-10-28: «cuando coloco pagado en Dynamic, ¿el sistema sabe de qué banco salió la plata? Existe BCP
  empresa e Interbank empresa y lo sabemos por el tipo de cuenta». Eligió la opción A (propone y confirmas) entre tres.
- **Complementa:** ADR-0417 (el «Pago de la planilla», `pago_planilla`, 41 | 104), ADR-0552 (los bancos con saldo real desde el 28-oct),
  ADR-0553 (una cuenta por defecto guardada en Configuración, no en el código), ADR-0412 y ADR-0548 (el token por intento).

## El problema

Dynamic, al marcar pagado un grupo de la planilla, guarda solo que se pagó, cuándo y quién (`public.periodo_grupo_pago`). Retail lo asienta como
gasto y deuda (62 | 41) y no toca ningún banco. La salida del banco existía como paso aparte y a mano («Pagar la planilla») y el 28-oct tenía
**0 registros contra 10 grupos pagados**. Con los bancos recién puestos en su saldo real (ADR-0552), la primera planilla sin registrar dejaría
a BCP Empresa e Interbank Empresas unos S/ 18 mil arriba en el ERP y la conciliación no cerraría.

CAYLA paga a cada persona desde el banco donde cobra: quien cobra en BCP, desde BCP Empresa; quien cobra en Interbank, desde Interbank
Empresas. Dynamic ya tiene ese dato por persona (`datos_personales.entidad_bancaria`), en texto libre.

## Decisión

DECIDÍ:
1. **El sistema propone y la persona confirma; nunca registra solo.** El aviso de Cuentas y dinero parte cada grupo pagado por el banco del
   colaborador y abre una hoja ya llena (cuenta, neto de Dynamic, día que Dynamic lo pagó): se confirma de un toque y se puede cambiar cuenta,
   monto o fecha, o decir cuál de las registradas a mano es (se enlaza, no se crea otra). La salida queda como un hecho, no como una suposición.
2. **El enlace vive en una tabla aparte, `retail.planilla_salidas`** (período, grupo, banco → su «Pago de la planilla»), con la llave primaria
   que hace imposible dos enlaces para el mismo tramo, y guarda **el neto que Dynamic decía al registrar** (`neto_dynamic`): el aviso vuelve solo si
   Dynamic cambia después, no porque la persona escribió a propósito otro monto (lo que de verdad salió del banco).
3. **La regla «banco del colaborador → cuenta de CAYLA» se guarda en Configuración ▸ Cuentas y cobros** (`retail.planilla_cuentas`, un disparador
   exige que sea un banco), como la cuenta del Taller (ADR-0553). El código no conoce ninguna cuenta.
4. **El banco del colaborador se lee del texto de Dynamic** (`fn_banco_del_colaborador`: «BCP», «Banco de Crédito…», «Interbank»), estricto: «Crédito»
   suelto no basta (una caja «de Ahorro y Crédito» no es el BCP). Lo que no se reconoce va a «sin banco» y la cuenta se elige al registrar.
5. **Registrar es todo o nada y una salida por tramo:** `registrar_salidas_planilla` llama a `registrar_movimiento_dinero` sin parcharla, toma un
   candado por tramo ANTES de mirar si ya tiene salida y usa un token derivado por banco. Verificado con una carrera real de dos sesiones con
   COMMIT: con el candado queda una salida y la segunda recibe «ya está registrada»; sin él quedaban dos.
6. **Se cuenta desde el inicio de Finanzas (1-oct)**: lo pagado antes ya está dentro del saldo real que se puso el 28-oct. El monto es el neto que
   recibe cada persona que cobra algo (quien queda en cero o negativo no suma ni resta); la AFP, el EsSalud y la renta de 4ª salen aparte.
7. **Quien lo ve:** el líder que además ve la planilla en Dynamic (`fn_planilla_visible`). A diferencia de `planilla_por_sede`, un banco con una o
   dos personas no se esconde: la salida del banco tiene que ser exacta, y quien la ve ya ve cada sueldo en Dynamic (ADR-0133 F7: no se abre
   ninguna puerta nueva). Nunca se devuelve una persona ni un nombre.
8. **El aviso llega a donde entra quien paga**: Cuentas y dinero (en toda vista), «Te toca» del líder y «Por revisar» del Observatorio del Admin.
   No se oculta (plata que no cuadra en el banco); sin nada que registrar, no existe.

DESCARTÉ:
- **Registrar la salida sola al marcar pagado en Dynamic** (opción B): anotaría salidas del banco por suposición; el día que se pague a alguien de
  BCP desde Interbank, el saldo quedaría mal sin aviso y se descubriría recién al conciliar.
- **Solo un aviso sin botón** (opción C): seguiría pidiendo dos registros a mano por planilla, y el enlace que evita duplicar no existiría.
- **Tres columnas nuevas en `movimientos_dinero`:** es la tabla de todo el dinero y esto lo usa una sola pantalla (núcleo mínimo).
- **Que la hoja aprenda la cuenta de la última vez:** una excepción (pagar una vez desde el otro banco) cambiaría la regla sin que nadie lo decida.

SE ROMPE SI:
1. Alguien registra a mano un «Pago de la planilla» y además la registra desde la hoja con «Registrarla ahora»: quedan dos salidas, una suelta. La hoja
   ofrece «Ya la registré a mano» cuando hay sueltas, pero no la elige sola (hallazgo de /chaos, abajo).
2. Dynamic renombra `entidad_bancaria`, `periodo_grupo_pago.pagado_at` o `v_planilla_pagada.total`: la lectura falla en voz alta (el Inicio dice «no
   se pudo leer»; Cuentas y dinero no muestra el aviso).
3. Se escribe en Dynamic un banco nuevo para quien sí cobra en BCP o Interbank: sale como «sin banco» y la cuenta se elige a mano.

## Qué se construyó

| Pieza | Dónde |
|---|---|
| El banco del colaborador, la tabla de enlace y la lectura de lo que falta | `supabase/migrations/20261029052000_planilla_salidas_por_registrar.sql` |
| De qué cuenta sale cada banco (tabla, disparador, guardar y leer) | `supabase/migrations/20261029053000_planilla_cuenta_por_banco.sql` |
| Registrar todo o nada, enlazar las sueltas | `supabase/migrations/20261029054000_registrar_salidas_planilla.sql` |
| Prueba de base (70 casos, mutaciones, ROLLBACK) | `scripts/pruebas/planilla_salidas.mjs` (`pnpm pruebas:planilla-salidas`) |
| Reglas puras: avisos, hoja, guía de foco, Inicio | `apps/web/lib/planilla-salidas-reglas.ts` (+ prueba) |
| El aviso y la hoja | `components/finanzas/CuentasDinero.tsx`, `components/finanzas/dinero/SalidasPlanillaModal.tsx` |
| La cuenta por banco en Configuración | `components/finanzas/ConfiguracionCuentas.tsx` |
| Inicio del líder y Observatorio | `lib/inicio-avisos.ts`, `lib/inicio.ts`, `lib/observatorio-reglas.ts`, `lib/observatorio.ts` |

## /chaos (2026-10-29, semilla 567, base privada con una Dynamic de ensayo)

La base local compartida no tiene las tablas de planilla de Dynamic: el ataque corrió en un Postgres privado con datos inventados. Resistieron
ENT-01, ENT-07, DC-01, NAV-03, RS-01, RS-03, RS-09 y TEC-01; PER-01/02 en la capa de base (la prueba). CON-02/CON-03 no aplican (son de caja). Dos
hallazgos de gravedad 2 (dato malo en silencio), sin arreglar hasta el OK de Felipe:
1. Con una salida registrada a mano y suelta, la hoja arranca en «Registrarla ahora»: confirmar sin mirar duplica la salida.
2. Un monto con un cero de más (127400 por 12740) se registra sin aviso y el aviso de Cuentas y dinero desaparece.
