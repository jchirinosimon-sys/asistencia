# Asistencia · Gestión Escolar

Aplicación escolar en español con persistencia en archivos JSON compartidos. No utiliza base de datos. Los archivos de datos y las copias permanecen fuera del frontend y no se sirven como contenido estático.

## Estado

La base incluye login de cuatro roles, solicitudes públicas de cuenta con aprobación de dirección, hashes scrypt, sesiones firmadas, permisos y filtros en servidor, administración de catálogos/cuentas (edición y desactivación), calendario, horarios con detección de cruces, jornadas, QR temporal local, entradas, listas de clase, faltas/retardos, justificaciones, calificaciones, publicación/retiro de boletas, resúmenes internos automáticos, respaldos programados/manuales, restauración con verificación, auditoría, paginación y exportación CSV autorizada. La interfaz incluye navegación, panel de dirección, formularios, filtros familiares, uso de cámara donde el navegador lo soporta y estilos adaptables.

Las siete pruebas ejecutadas cubren almacenamiento, recuperación de transacciones, respaldos, autenticación, solicitud/aprobación de cuentas, permisos familiares y flujos HTTP de listas, notas, boletas, QR, justificaciones y CSV. No se ha desplegado ni se declara aprobada para utilizar información real. Aún faltan pruebas de carga y fallos de disco, decodificación del QR en dispositivos/cámaras reales, generación PDF, revisión externa de seguridad, endurecimiento operativo y un despliegue persistente elegido y verificado.

## Tecnologías y carpetas

- Node.js 20+ y módulos nativos; no se descargan dependencias.
- `frontend/`: interfaz HTML, CSS y JavaScript; `qr.js` genera el código QR localmente.
- `backend/src/server.js`: servidor/API, autenticación, permisos, automatización y tareas programadas.
- `backend/src/storage/json-storage.js`: servicio central de JSON, journal, transacciones, backups y restauración.
- `backend/data/`: archivos privados JSON (creados al inicializar, excluidos de Git).
- `backups/`: snapshots privados con manifest SHA-256 y retención.
- `tests/`: pruebas unitarias y prueba de integración del servidor.
- `docs/arquitectura.md`: diseño, contratos de datos y decisiones técnicas.

## Instalación local

1. Copia `.env.example` a `.env`.
2. Cambia `SESSION_SECRET` por un secreto aleatorio de 32 caracteres o más y configura un correo y contraseña inicial para dirección (12 caracteres o más).
3. Ejecuta `npm run init` una vez. El comando crea las colecciones JSON y un usuario administrador; no imprime la contraseña.
4. Ejecuta `npm start` y abre `http://127.0.0.1:3000`.
5. Ejecuta `npm test` para verificar la implementación.

**No abras `frontend/index.html` con Live Server para usar la aplicación.** Live Server solo sirve archivos estáticos y no ejecuta la API de autenticación/escuela. Para usarla completa, inicia `npm start` desde la carpeta del proyecto y abre `http://127.0.0.1:3000`. Las rutas de CSS y JavaScript son relativas para que Live Server pueda encontrar esos recursos si solo quieres previsualizar el diseño; los flujos de acceso y datos requieren el backend.

`HOST` escucha en loopback por defecto. `DATA_DIR` y `BACKUP_DIR` pueden apuntar a volúmenes persistentes privados. No se debe alojar el directorio `backend/data` dentro de una carpeta pública. Mantén una sola instancia escritora para el mismo directorio.

## Archivos de datos

Cada colección tiene forma `{ "schemaVersion": 1, "records": [...] }` e IDs únicos. Los archivos son `usuarios.json`, `solicitudes_cuenta.json`, `alumnos.json`, `maestros.json`, `tutores.json`, `relaciones_tutores.json`, `grupos.json`, `especialidades.json`, `semestres.json`, `materias.json`, `inscripciones.json`, `horarios.json`, `calendario_escolar.json`, `jornadas.json`, `qr_diarios.json`, `asistencias.json`, `listas_asistencia.json`, `faltas.json`, `retardos.json`, `justificaciones.json`, `notificaciones.json`, `mensajes.json`, `periodos_evaluacion.json`, `calificaciones.json`, `boletas.json`, `avisos_escolares.json`, `configuracion.json`, `auditoria.json`, `metadata.json` y `operaciones.json`.

`solicitudes_cuenta.json` contiene solicitudes aún no atendidas y su hash de contraseña, nunca la contraseña original. `operaciones.json` es un journal técnico de recuperación. Las relaciones principales usan IDs: cuentas/personas, inscripciones/alumno/grupo, horarios/maestro/grupo/materia, listas/sesiones, incidencias/alumnos y periodo/materia/calificación. Las faltas y retardos creados al cerrar una lista contienen snapshot descriptivo.

## Portales y uso

### Instalar en el teléfono

La interfaz incluye un manifiesto PWA, iconos de 192 y 512 px y un service worker para que Chrome pueda ofrecer **Instalar** o **Crear acceso directo**. Al iniciar la app instalada aparece una animación breve con la marca Asistencia. El service worker conserva únicamente los archivos públicos de la interfaz y los actualiza desde la red; nunca guarda en caché las respuestas de `/api/` ni los datos institucionales. En Android, abre la URL HTTPS del servicio en Chrome y usa el menú ⋮ → **Instalar aplicación** o **Añadir a pantalla de inicio**. También aparece el botón **Instalar Asistencia** cuando Chrome informa que la instalación está disponible. Después de subir estos archivos al repositorio y esperar el despliegue de Render, recarga la página para que Chrome detecte el manifiesto.

### Dirección

Desde el menú lateral puede revisar solicitudes de cuenta, aprobarlas vinculándolas a un expediente ya existente o rechazarlas; también puede crear cuentas directamente, alumnos, maestros, tutores, grupos, especialidades, semestres, materias, inscripciones, horarios, calendario y periodos. Puede consultar registros, desactivar/reactivar entradas, habilitar jornadas, renovar QR, publicar boletas y gestionar respaldos. Los formularios de relaciones y horarios vinculan por ID. El servidor verifica las referencias y detecta cruces de maestro, grupo o aula.

Para abrir QR, registra primero la fecha en Calendario con tipo `lectivo` o `jornada_especial`, habilita la jornada y pulsa **Generar código**. Se muestra un código numérico de cinco cifras y un QR escaneable que abre un enlace de esta aplicación. El generador usa una matriz QR compacta para facilitar el enfoque. El servidor guarda un HMAC del código, lo acepta durante diez minutos y limita los intentos incorrectos a diez por cuenta cada quince minutos. Rota automáticamente antes de vencer mientras la vista QR esté abierta. El alumno puede escanearlo con el lector interno o con la cámara normal del teléfono; al abrir el enlace, Asistencia conserva el código de forma temporal y registra la entrada tras iniciar sesión. El código se elimina de la barra de dirección y la API comprueba identidad, jornada, hora, duplicados y vigencia. Si no puede escanearlo, puede escribir las cinco cifras. Un QR compartido no acredita presencia física; la institución debe considerar una validación presencial adicional.

### Maestro

Su horario muestra el botón para abrir una lista en la sesión del día. Los alumnos inscritos comienzan pendientes. Antes del cierre se asigna a cada alumno presente, retardo o ausente; el cierre genera la lista, faltas y retardos usando una operación recuperable.

El maestro captura notas dentro de sus grupos y materias asignados. Dirección publica boletas; alumno y tutor sólo ven calificaciones referenciadas por boletas publicadas.

### Alumno y tutor

El alumno consulta su perfil, horario, entradas, faltas/retardos, calificaciones publicadas, mensajes y avisos. El tutor ve exclusivamente alumnos con relación activa; cuando tiene varios puede seleccionar el expediente. El filtro familiar se aplica en el servidor aunque el cliente altere los parámetros.

Las notificaciones automáticas son mensajes internos guardados en JSON; no se simulan envíos por WhatsApp, SMS o correo.

## API implementada

- `GET /api/health`
- `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/auth/solicitudes` (solicitudes públicas; acceso pendiente de aprobación de dirección)
- `GET /api/solicitudes_cuenta`, `POST /api/solicitudes_cuenta/:id/resolver` (solo dirección)
- `GET /api/dashboard`, `GET /api/perfil`, `GET /api/mis-alumnos`
- `GET /api/:coleccion` aplica permisos y filtros del usuario
- `POST /api/usuarios` crea una cuenta vinculada y almacena únicamente el hash de contraseña
- `POST /api/:coleccion` crea catálogos autorizados; `PATCH /api/:coleccion/:id/estado` desactiva/reactiva
- `POST /api/jornadas`, `POST /api/jornadas/:id/cerrar`
- `POST /api/qr_diarios/renovar`, `POST /api/asistencias/registrar`
- `POST /api/listas_asistencia`, `POST /api/listas_asistencia/:id/cerrar`
- `POST /api/calificaciones`, `POST /api/boletas/publicar`, `POST /api/boletas/:id/retirar`
- `POST /api/justificaciones`, `POST /api/justificaciones/:id/resolver`
- `PUT /api/configuracion`
- `GET /api/exportar/:coleccion.csv` (sólo categorías autorizadas, filtros por usuario y auditoría)
- `GET/POST /api/backups`, `POST /api/backups/restaurar`

Todas las mutaciones requieren un usuario autorizado. El backend define nombres de archivo permitidos; el cliente no puede enviar rutas locales.

## Integridad, seguridad y respaldo

Una cola global de proceso serializa las actualizaciones. Los cambios de una colección se escriben a un temporal y se reemplazan con `rename`. Operaciones que afectan varias colecciones anotan primero parches idempotentes en `operaciones.json`, aplican todos los archivos y eliminan el journal; al iniciar, los journals pendientes se reconcilian. Sigue siendo necesario ejecutar una sola instancia porque el bloqueo no coordina procesos/servidores independientes.

Contraseñas usan scrypt. Sesiones HMAC expiran después de ocho horas; los intentos de login se limitan por IP en memoria. `auditoria.json` guarda el correo, resultado y fecha de cada intento de acceso (máximo 5000 registros); nunca guarda las contraseñas enviadas. Se activan CSP, `nosniff`, `frame-ancestors`, referrer y permisos de cámara limitados. El token se guarda en `localStorage`; por eso no se debe desplegar en Internet hasta completar revisión XSS y migrar a cookies seguras/revocables, HTTPS, políticas operativas y monitoreo.

Se genera un backup diario a las 02:00 de la zona configurada (por defecto `America/Guatemala`), se conserva una ventana de 30 copias y se crea uno antes de acciones críticas. Desde Administración → Copias de seguridad se puede crear o restaurar. Cada copia tiene manifiesto SHA-256 y se verifica íntegramente antes de restaurar; antes de la restauración se crea otra copia del estado actual. Conserva una copia externa al servidor para protegerse de fallos del disco.

Los JSON reescriben colecciones completas y pierden rendimiento a medida que crecen. La cola y el journal reducen pérdidas, pero no ofrecen las mismas garantías/escala que un sistema transaccional. Mide tamaño, latencia y memoria y acuerda límites antes de operar a escala institucional. La arquitectura no añade una base de datos sin autorización.

## Pruebas y pendientes de despliegue

La suite automatizada comprueba esquema e IDs, concurrencia dentro del proceso, hashes y sesiones, recuperación después de reinicio, checksum/restauración y los flujos HTTP de cuentas, aislamiento familiar, listas, calificaciones, boletas, QR y duplicados. Deben añadirse pruebas de carga, QR con cámaras/dispositivos reales, fallos de disco, horarios históricos, exportaciones y pilotaje con datos ficticios.

Para desplegar: elige una VM/servidor con disco persistente privado, HTTPS, firewall, permisos mínimos, proceso único, monitorización, respaldos externos y procedimiento de recuperación probado. No usar hosting estático ni filesystem efímero. No se ha elegido/probado proveedor todavía.
