# Guion y temas para exponer Genix-asis

> Material base para una exposición de 10 a 15 minutos. Ajustar el tiempo, nombres de la institución y requisitos del concurso. Las capacidades descritas corresponden al código y documentación del proyecto; presentar como realizadas únicamente las pruebas y entregas que el equipo pueda demostrar.

## 1. Título y presentación

**Genix-asis: plataforma web para organizar la gestión escolar**

- Nombre del proyecto y del equipo.
- Integrantes, institución y fecha.
- Una frase para abrir: “Genix-asis reúne en un mismo espacio los procesos escolares de administración, asistencia, seguimiento académico y comunicación, con opciones distintas para Dirección, docentes, alumnos y tutores.”

## 2. Situación que origina el proyecto

Explicar el problema concreto que motivó el sistema. Completar con la experiencia real de la institución, por ejemplo:

- Información distribuida entre listas, documentos y hojas de cálculo.
- Dificultad para relacionar alumnos, grupos, horarios, asistencia y calificaciones.
- Tiempo que se pierde buscando o repitiendo datos.
- Necesidad de que cada integrante consulte solo la información correspondiente a su función.
- Necesidad de hacer seguimiento a faltas, retardos, permisos y avisos.

No afirmar que la escuela sufría una situación específica si no fue observada o confirmada por el equipo.

## 3. Objetivo y propuesta

**Objetivo general sugerido:** facilitar la administración y consulta de información escolar mediante una aplicación web con procesos relacionados, roles diferenciados y datos vinculados.

**Objetivos específicos que se pueden presentar:**

1. Organizar expedientes de alumnos, docentes y tutores junto con grupos, áreas, semestres y materias.
2. Reducir pasos para preparar fechas escolares y jornadas de entrada.
3. Registrar asistencia por QR temporal y por listas de clase.
4. Dar seguimiento a faltas, retardos, justificaciones y permisos.
5. Capturar calificaciones y publicarlas de forma controlada mediante boletas.
6. Facilitar avisos, mensajes, consultas y respaldos administrativos.
7. Limitar la consulta de datos según el rol y las relaciones autorizadas.

## 4. Personas usuarias y alcance por rol

| Perfil | Funciones principales |
|---|---|
| Dirección | Administra personas, cuentas, solicitudes, estructura académica, calendario, jornadas, asistencia, periodos, publicaciones, comunicación, exportaciones y copias de seguridad. |
| Maestro | Consulta su horario y grupos; abre listas de sus clases; registra presentes, retardos y ausencias; captura calificaciones de sus asignaciones. |
| Alumno | Consulta su perfil/credencial, horario, entradas, faltas, retardos, permisos autorizados, calificaciones publicadas, boletas, mensajes y avisos; registra su entrada con QR/código vigente. |
| Tutor | Consulta alumnos vinculados; ve horario, entradas, incidencias y calificaciones publicadas; solicita permisos o envía justificaciones para revisión de Dirección. |

La aplicación ofrece opciones de acuerdo con el rol. El servidor verifica las autorizaciones y relaciones; no se confía únicamente en esconder botones en la interfaz.

## 5. Recorrido funcional de la aplicación

### 5.1 Acceso y cuentas

- Inicio de sesión con correo y contraseña.
- Solicitud pública para cuenta de alumno, maestro o tutor.
- Solicitudes ordinarias revisadas y aprobadas por Dirección, con asociación a un expediente.
- Códigos de activación de alumno de un solo uso; con datos coincidentes pueden habilitar aprobación automática.
- Dirección puede crear cuentas, vincularlas a fichas, desactivarlas/reactivarlas y restablecer contraseñas.

### 5.2 Expedientes y organización escolar

- Fichas de alumnos, maestros y tutores.
- Alta rápida de alumnos con nombres, apellidos, matrícula, área, grado, grupo, semestre y ciclo. En un mismo proceso se crean o reutilizan las referencias académicas y se registra la inscripción.
- Importación masiva CSV o Excel con plantilla, validación, tratamiento de matrículas repetidas y reporte de omisiones/errores.
- Catálogos de áreas, semestres, grupos y materias.
- Inscripciones que vinculan alumno, grupo y ciclo.
- Vínculos familiares que autorizan el acceso del tutor al expediente relacionado.
- Búsqueda, filtros de estado, paginación y exportación CSV autorizada en los módulos compatibles.

### 5.3 Planificación, horarios y periodos

- Horarios vinculados con día, hora, materia, docente, grupo, aula y vigencia; se validan referencias y cruces de horarios.
- Calendario con fechas lectivas, festivos, suspensiones y otros tipos de evento.
- **Planificación diaria:** un solo apartado guía la creación de una fecha lectiva, el horario de jornada y el código QR. Permite consultar jornadas recientes y cerrarlas. El QR se genera el día de uso porque su vigencia es breve.
- Periodos de evaluación definidos por Dirección con fechas, estado y escala de notas.

### 5.4 Asistencia de entrada

1. Dirección prepara fecha y jornada en Planificación diaria.
2. Genera el QR temporal para la jornada vigente.
3. El alumno escanea el código o introduce el número temporal.
4. El servidor comprueba la sesión, la vigencia del código, el estado y horario de la jornada y los registros duplicados.
5. Dirección consulta las entradas recientes de la jornada.
6. El escáner de credenciales permite a Dirección leer el QR del gafete, comparar manualmente los datos y confirmar el expediente antes de registrar.

El QR facilita el registro, pero no verifica por sí solo la presencia física. El escaneo de gafete requiere comprobación visual del personal. No se usa reconocimiento facial.

### 5.5 Asistencia en clase e incidencias

- El docente abre una lista desde la clase que tiene asignada para el día.
- Cada alumno comienza pendiente; el docente elige presente, retardo o ausente.
- Al cerrar la lista, el sistema guarda las incidencias asociadas.
- Los módulos Faltas y Retardos permiten consultar los registros.
- El tutor puede seleccionar un registro y enviar una justificación a Dirección.
- Dirección revisa y autoriza o rechaza la solicitud.
- El tutor puede solicitar un permiso; Dirección lo resuelve. El alumno solo consulta permisos autorizados.

### 5.6 Calificaciones y publicación

- El maestro selecciona grupo, alumno, materia y periodo entre las opciones permitidas para sus asignaciones.
- La calificación capturada queda guardada, pero todavía no es pública.
- Dirección revisa y publica la boleta del alumno.
- El alumno y los tutores vinculados consultan las notas que forman parte de boletas publicadas.
- Dirección puede retirar la publicación cuando corresponda.

### 5.7 Comunicación y seguimiento

- Mensajes internos de Dirección a cuentas individuales o conjuntos de usuarios.
- Avisos institucionales con audiencia y vigencia.
- Recordatorios de clase y resúmenes escolares generados por el sistema según configuración.
- Notificaciones Web Push opcionales con autorización del navegador y configuración del servidor.
- Los mensajes se conservan en la bandeja interna. No se envían por WhatsApp, SMS o correo electrónico.

### 5.8 Administración y continuidad

- Resumen con indicadores y accesos rápidos.
- Configuración de zona horaria, hora de resumen, retención de respaldos y escala de calificaciones.
- Exportaciones CSV restringidas a módulos y permisos definidos.
- Copias manuales y programadas, manifiesto SHA-256 y comprobación antes de restaurar.
- Guía de usuario por rol con recorridos visuales y acceso a los módulos.
- Interfaz adaptable y PWA para instalar en navegadores compatibles; cámara y push dependen del dispositivo y de HTTPS.

## 6. Demostración recomendada (3 a 5 minutos)

Preparar datos ficticios antes de presentar. Evitar exponer contraseñas, matrículas reales o información privada.

1. **Dirección:** mostrar el Resumen y explicar cómo los módulos se ordenan por tareas.
2. **Planificación diaria:** crear una fecha de demostración, definir apertura/cierre, guardar la jornada y generar el QR solo si la fecha y el horario permiten el flujo en vivo.
3. **Alumno:** enseñar el alta rápida con datos ficticios y señalar área, grado, grupo, semestre y ciclo.
4. **Maestro:** mostrar el horario y cómo se abre una lista, se asignan estados y se cierra.
5. **Tutor:** enseñar cómo selecciona un expediente vinculado, consulta asistencia y envía una justificación o solicitud de permiso.
6. **Académico:** explicar la diferencia entre capturar una nota y publicar una boleta.
7. **Cierre:** mostrar un aviso o mensaje y mencionar copias de seguridad y permisos.

Si no se dispone de cuatro cuentas de demostración, utilizar capturas o explicar los otros roles sin iniciar sesión con datos personales. No improvisar en vivo la carga de datos de producción.

## 7. Arquitectura y tecnologías

- **Interfaz:** HTML, CSS y JavaScript; diseño adaptable, navegación por rol y componentes de formularios/listas.
- **Servidor:** Node.js, API HTTP, autenticación, controles de acceso, validaciones, reglas escolares y trabajos programados.
- **Almacenamiento:** JSON privado para desarrollo local o MongoDB cuando se configura el entorno. El navegador se comunica con la API y no accede directamente a la base de datos.
- **Datos:** colecciones relacionadas por identificadores para cuentas, expedientes, grupos, inscripciones, horarios, jornadas, asistencias, incidencias, notas, mensajes y auditoría.
- **PWA:** manifiesto, iconos y service worker para recursos públicos de la aplicación; no almacena respuestas institucionales de API en caché.

Una manera sencilla de explicar el recorrido de datos: **persona usuaria → interfaz → API del servidor → validación/autorización → almacenamiento → respuesta filtrada a la interfaz**.

## 8. Seguridad, privacidad y límites

Explicar como controles existentes: hash scrypt para contraseñas, sesiones firmadas con expiración, permisos del lado del servidor, limitación de intentos, cabeceras de seguridad, auditoría de accesos y validación de respaldos.

También declarar límites actuales documentados:

- La sesión del navegador se almacena en `localStorage`; hace falta revisión de XSS y migración a cookies seguras/revocables antes de la exposición institucional a Internet.
- Se debe completar revisión independiente de seguridad, pruebas de carga, compatibilidad con cámaras/dispositivos reales y pruebas de restauración en el despliegue elegido.
- JSON está pensado para desarrollo local y una sola instancia escritora. Un despliegue necesita almacenamiento persistente, HTTPS, monitoreo y copias externas; MongoDB requiere configuración correcta.
- Los mensajes automáticos son internos; Web Push es opcional y no garantiza entrega en todos los dispositivos.
- La aplicación no debe presentarse como certificada o lista para datos reales si esas revisiones no se han completado.

## 9. Proceso de desarrollo y metodología

Describir la metodología que el equipo realmente utilizó, respaldada por fechas, tareas, versiones, reuniones, diseños y pruebas. No atribuir retrospectivamente Scrum, cascada u otra metodología sin evidencia.

Si el concurso pide explicar un método propuesto, se puede presentar un enfoque híbrido razonado:

1. Levantamiento y aprobación de requisitos por rol.
2. Diseño de procesos, datos, permisos y prototipos de interfaz.
3. Construcción incremental de módulos conectados.
4. Revisión iterativa con docentes y personal administrativo.
5. Pruebas por flujo y por permiso antes de cada entrega.
6. Despliegue piloto con datos ficticios, monitoreo y mejoras.

Aclarar que es una propuesta metodológica si no fue exactamente el método histórico del equipo.

## 10. Beneficios esperados y evaluación

Presentar como beneficios esperados, no resultados medidos, mientras no exista piloto:

- Menos pasos repetidos al relacionar alumno, grupo e inscripción.
- Consulta más clara según el rol.
- Seguimiento trazable de entradas, listas e incidencias.
- Publicación académica bajo decisión de Dirección.
- Mayor facilidad para localizar información y respaldar los datos.

Proponer indicadores para un piloto: tiempo de alta por alumno, porcentaje de formularios completos, tiempo para localizar un registro, errores/duplicados en listas, incidencias reportadas, éxito de restauración y satisfacción por perfil.

## 11. Preguntas que puede hacer la audiencia

**¿El QR garantiza que el alumno está presente?** No. Registra el uso de un código temporal; la institución debe complementar el proceso con supervisión adecuada.

**¿Quién ve las calificaciones?** El maestro captura dentro de sus asignaciones; Dirección publica la boleta; alumno y tutor vinculado ven solo notas publicadas.

**¿Cómo protege la información familiar?** Los vínculos tutor-alumno se verifican en el servidor; el tutor recibe datos de expedientes con relación activa.

**¿La aplicación manda WhatsApp o correo?** No. Guarda mensajes internos y puede usar Web Push si se configura y la persona lo autoriza.

**¿Se puede usar en teléfono?** La interfaz es adaptable y puede instalarse como PWA en navegadores compatibles. Cámara, instalación y notificaciones dependen del navegador/HTTPS.

**¿Está lista para operar con datos reales?** Hay que contestar según las revisiones efectivamente completadas. La documentación actual señala que quedan auditoría de seguridad, pruebas de carga y recuperación/dispositivos reales antes de aprobarla para datos reales.

**¿Qué almacenamiento utiliza?** JSON local para desarrollo o MongoDB configurado en despliegue; la aplicación selecciona el adaptador según su configuración.

**¿Qué ocurre si una persona no tiene cuenta?** Puede enviar una solicitud; Dirección la revisa y la vincula. El código de activación para alumno es un flujo controlado aparte.

## 12. Cierre sugerido

“Genix-asis conecta procesos escolares que suelen gestionarse por separado: expedientes, grupos, horarios, entradas, asistencia de clase, incidencias, calificaciones y comunicación. Sus cuatro perfiles ayudan a que cada usuario consulte o gestione lo que le corresponde. El siguiente paso responsable es validar los procesos con la institución, completar las pruebas de seguridad y operación y realizar un piloto antes de incorporar datos reales.”

## 13. Material visual para la exposición

Preparar antes de presentar:

- Diagrama simple de los cuatro perfiles y su acceso.
- Diagrama del flujo: planificación diaria → jornada → QR → entrada.
- Diagrama académico: grupo/inscripción → lista → incidencia → justificación.
- Capturas con datos de ejemplo de Resumen, alta de alumno, lista docente, consulta familiar y boleta publicada.
- Una lámina de arquitectura con interfaz, API y almacenamiento.
- Una diapositiva de límites y próximos pasos.
- Una demostración breve en un dispositivo representativo.

Usar datos inventados en las capturas y ocultar correos, matrículas, códigos de activación, tokens y secretos.
