## 2026-10-02 (Reponer vuelve a depender solo de Existencias; Bajada al piso y Ajustar stock dejan de ser módulos)
Qué hice: «Bajada al piso» y «Ajustar stock» salen del catálogo de módulos (ADR-0306): reponer, subir, retirar y ajustar piden Existencias (o Conteos/Traslados para ajustar). Migración `20261002120000` (sin pegar), web, pruebas, y la regla «un módulo es una entrada del menú» en CLAUDE.md con su prueba.
Por qué así: el Terminal de ventas tenía Existencias y no podía reponer; bajaba prendas sin registrarlo y Vender no las dejaba vender. Los dos módulos no tenían menú ni rol.
Felipe se lleva: quien ve Existencias hace todo lo de Existencias. Mientras no se pegue la migración, el desbloqueo es encender «Bajada al piso» en el rol del Terminal de ventas.
