# Descripción funcional y metodológica de Genix-asis

## 1. Propósito y alcance

Genix-asis es una aplicación web de gestión escolar en español que reúne en un mismo sistema la administración de expedientes, la organización académica, el control de entradas y asistencia en clase, el registro y publicación de calificaciones y la comunicación institucional. Está diseñada para cuatro perfiles: Dirección, Maestro, Alumno y Tutor. Cada persona inicia sesión con una cuenta vinculada a un expediente institucional y recibe acceso a las opciones correspondientes a su función.

El objetivo funcional es reducir la dispersión de información y ofrecer procesos verificables: una entrada queda asociada a una jornada; una falta o retardo queda ligada a una lista cerrada; una calificación solo se vuelve visible al publicarse en una boleta; y un tutor consulta expedientes autorizados mediante una relación activa. La plataforma es una herramienta de gestión y consulta, no sustituye la verificación física de identidad ni las decisiones académicas o administrativas de la institución.

## 2. Actores y permisos

- **Dirección:** administra catálogos, personas y cuentas; configura el calendario y los horarios; habilita jornadas; supervisa entradas; resuelve solicitudes; gestiona periodos, boletas, mensajes, avisos, exportaciones y copias de seguridad.
- **Maestro:** consulta su horario y sus grupos asignados, abre y cierra listas de clase y captura calificaciones en las materias y grupos autorizados.
- **Alumno:** consulta su propia información, horario, credencial, entradas, incidencias, permisos autorizados, calificaciones y boletas publicadas; puede registrar entrada mediante el QR/código vigente.
- **Tutor:** consulta únicamente a los alumnos asociados mediante vínculos activos; puede solicitar que se vincule un alumno, pedir permisos y enviar justificaciones, y consultar asistencia, notas y boletas publicadas.

La autorización se comprueba en el servidor. Los filtros de alumno, tutor y maestro no dependen solo de lo que muestre el navegador. Por ejemplo, un tutor no amplía su acceso modificando parámetros de la solicitud: el backend deriva los expedientes permitidos de sus vínculos activos. Las notas de alumno y tutor se limitan a las vinculadas con boletas publicadas.

## 3. Acceso y ciclo de vida de las cuentas

### Iniciar sesión

La pantalla de acceso solicita correo y contraseña. El servidor valida la cuenta activa y su contraseña, y entrega una sesión firmada con expiración de ocho horas. Se registra el correo, el resultado y la fecha del intento, pero no la contraseña enviada. La interfaz permite cerrar sesión y recuperar acceso mediante restablecimiento administrado por Dirección.

### Solicitar cuenta

El formulario público permite solicitar una cuenta de Alumno, Maestro o Tutor. Para alumno solicita además matrícula y especialidad. Una solicitud sin código de activación queda pendiente: Dirección debe comprobar los datos, elegir el expediente compatible y aprobar o rechazar. El formulario no crea acceso por sí solo.

Dirección puede emitir un código de activación de un solo uso para un expediente de alumno. Al solicitar cuenta con nombre, matrícula, área y código válidos, puede producirse la aprobación automática. El código tiene una vigencia limitada (30 días). Las contraseñas se guardan como hash scrypt, no en texto legible.

### Usuarios y solicitudes de cuenta

En **Usuarios**, Dirección crea una cuenta vinculándola con un expediente activo, desactiva o reactiva cuentas y restablece contraseñas. En **Solicitudes de cuenta**, revisa los datos de la solicitud, selecciona el expediente correcto y resuelve la aprobación o rechazo. Al crear una cuenta se debe elegir el rol y asociar la persona pertinente; una cuenta no debe vincularse al expediente equivocado.

## 4. Opciones y procesos por módulo

### Resumen

El panel de inicio muestra indicadores y accesos rápidos adecuados al perfil. Dirección ve referencias a matrícula, entradas, faltas, retardos, listas abiertas, periodos y avisos. Los otros perfiles disponen de atajos a sus tareas habituales, como horario, asistencia, calificaciones o consulta de expedientes. El indicador permite orientarse; para operar sobre datos se abre el módulo correspondiente.

### Comunidad y expedientes

- **Alumnos:** alta, consulta, actualización y activación/desactivación de fichas. La ficha incluye nombres, apellidos, matrícula y, cuando se captura, fecha de nacimiento. Dirección dispone de alta rápida, generación/renovación de código de activación e importación masiva.
- **Importar alumnos:** descarga una plantilla CSV o Excel, se completan nombres, apellidos, especialidad, grado, grupo, matrícula, semestre y ciclo y se vuelve a cargar. Se valida el archivo antes de guardar. Las matrículas existentes o repetidas se omiten sin sobrescribir; errores en filas nuevas detienen la importación. El proceso crea o reutiliza especialidades y grupos e inscripciones correspondientes. Se recomienda conservar matrículas como texto para no perder ceros iniciales.
- **Maestros:** conserva los datos del personal docente, como nombre, número de empleado y contacto. Su expediente se vincula luego con una cuenta y con los horarios impartidos.
- **Tutores:** conserva nombre y datos de contacto del responsable familiar.
- **Vínculos familiares:** une tutor y alumno e indica parentesco. La relación activa es la autorización funcional para que el tutor vea datos de ese alumno. La solicitud de vinculación iniciada por tutor se revisa administrativamente antes de conceder acceso.
- **Áreas y grupos:** vista de organización de especialidades, grupos y semestres. Facilita revisar la estructura académica.
- **Especialidades, semestres y grupos:** catálogos de áreas académicas, niveles/periodos de semestre y grupos asociados a un ciclo. El grupo se relaciona con semestre y especialidad.
- **Materias:** catálogo de asignaturas y claves institucionales.
- **Inscripciones:** asociación entre alumno, grupo y ciclo escolar, con estado de vigencia. Sirve de base para listas, horarios y visibilidad de materias.

Los formularios de relaciones usan selectores de expedientes con búsqueda y paginación en lugar de pedir al usuario que copie IDs internos. La búsqueda general y los filtros por estado facilitan localizar registros; la lista se pagina y puede actualizarse.

### Horarios y calendario

- **Horarios / Mi horario:** representan sesiones con día de la semana, hora de inicio y fin, materia, maestro, grupo, aula y periodo de vigencia. El backend valida las referencias y rechaza cruces de horarios. Maestros ven sus sesiones asignadas; tutores y alumnos ven horarios derivados de los grupos inscritos/autorizados. Hay formato de horario de grupo e impresión.
- **Calendario:** registra fechas y tipo de día, como lectivo, festivo o suspensión, además de descripción y jornadas aplicables. Este calendario gobierna procesos dependientes de días lectivos; no debe habilitarse asistencia como si fuera una jornada normal en un día suspendido.
- **Periodos de evaluación:** Dirección define nombre, fechas, límites de escala y estado abierto/cerrado. Las fechas y escala son referencias para la captura y revisión de notas.

### Asistencia de entrada a la escuela

El proceso tiene una secuencia operativa:

1. Dirección registra el día en Calendario con el tipo adecuado.
2. Habilita una **Jornada** con nombre, fecha y horas de apertura/cierre.
3. Genera el **QR diario**. El servidor crea un código temporal, guarda su hash y solo acepta el código durante su vigencia y dentro de la jornada abierta. La pantalla actualiza el código antes de vencer y permite copiar el código numérico de cinco cifras.
4. El alumno escanea el QR con el lector de la aplicación o con la cámara normal del teléfono; el enlace puede abrir la aplicación. También puede introducir el código de cinco cifras. Si debe iniciar sesión, el QR se conserva temporalmente durante ese paso y luego se elimina de la barra de dirección.
5. El servidor comprueba sesión, jornada, hora, vigencia y duplicados antes de registrar la entrada. Dirección ve las entradas recientes y el total de la jornada, con actualización periódica.

El QR es temporal y reduce la reutilización de un código antiguo, pero no prueba por sí solo que la persona se encuentre físicamente en el lugar. La escuela debe supervisar cómo se exhibe y utiliza.

### Escáner de credenciales

Dirección dispone de un lector para el QR del gafete. Reconoce formatos de matrícula Genix y formatos compatibles descritos para AUREX. Si el QR permite más de una coincidencia, el personal compara los datos del gafete y selecciona el expediente. Antes de registrar, confirma manualmente que la persona y el gafete corresponden. La operación requiere jornada abierta y evita duplicar la entrada del mismo alumno en la jornada. No usa reconocimiento facial ni guarda imágenes.

### Listas de clase, faltas y retardos

El maestro abre la lista desde una sesión de su horario asignado para el día, si el calendario permite clase. El sistema agrega a los alumnos inscritos al grupo con estado inicial **pendiente**. El docente asigna a cada uno **Presente**, **Retardo** o **Ausente** y cierra la lista. No se debe dejar ningún estado sin resolver. Al cerrar, se guarda la lista y se crean los registros de faltas y retardos a partir de las selecciones; la operación de varias colecciones tiene mecanismo de recuperación ante interrupciones.

**Listas de clase** permite revisar listas abiertas y cerradas. **Faltas** y **Retardos** son consultas de las incidencias resultantes. Sus estados permiten identificar registros confirmados, justificados o pendientes de resolución.

### Justificaciones y permisos

- **Justificaciones:** el tutor selecciona una falta o retardo asociado al alumno, escribe el motivo y envía la solicitud. Dirección revisa las solicitudes pendientes y autoriza o rechaza. La decisión queda reflejada en el estado relacionado. El alumno consulta incidencias, pero no presenta esta solicitud desde su rol.
- **Permisos:** el tutor solicita permiso de salida para el alumno e incluye los datos requeridos por el formulario. Dirección revisa y autoriza o rechaza. El permiso no se considera autorizado hasta la resolución. El alumno solo consulta permisos ya autorizados; no puede crear ni aprobar.

### Calificaciones y boletas

El maestro captura una nota seleccionando grupo, alumno, materia asignada y periodo. Las opciones se limitan a las clases que tiene asignadas. La nota se guarda como calificación pendiente de publicación; guardarla no equivale a hacerla visible a la familia.

Dirección revisa y publica la boleta del alumno para el periodo. La publicación registra a qué calificaciones se refiere y habilita la consulta de esas notas por el alumno y los tutores vinculados. Dirección puede retirar una boleta si es necesario. Los portales familiares no exponen notas no publicadas.

### Mensajes, avisos y notificaciones

- **Mensajes:** Dirección redacta asunto y contenido y selecciona destinatario individual o grupo (todos, alumnos, tutores o maestros). Los mensajes quedan en la bandeja interna. Web Push puede avisar a quienes habilitaron esa función en el navegador; no se envían SMS, WhatsApp ni correo.
- **Avisos:** Dirección redacta título, contenido, audiencia y, opcionalmente, vigencia; puede publicarlo. Los usuarios ven avisos publicados dirigidos a su rol o a toda la comunidad.
- **Recordatorios automáticos:** el sistema genera recordatorios internos cinco minutos antes de una clase para cuentas activas de docentes y alumnos inscritos, en días lectivos. Los resúmenes diarios para tutores pueden informar faltas/retardos de alumnos vinculados. Las notificaciones evitan duplicados mediante claves de idempotencia. Push es opcional y depende del permiso del navegador y de las claves de servidor configuradas.
- **Mensajes de eventos:** ciertos eventos de entrada o falta pueden generar mensajes a tutores vinculados. La bandeja interna es el registro principal del aviso.

### Búsqueda, filtros, exportación y guía

Las listas de registros ofrecen campo de búsqueda, actualización manual y filtros de estado en módulos que los soportan. Algunos módulos permiten paginación y selección de expedientes. Las exportaciones CSV están disponibles únicamente en categorías permitidas y con permisos; se conservan los filtros relevantes y se aplican los mismos filtros de acceso que para la consulta. La acción se audita.

**Guía de usuario** contiene instrucciones por rol, ejemplos y recorridos paso a paso. El botón para ir a una sección abre el módulo correspondiente mientras la ayuda permanece disponible.

### Configuración, copias y aplicación móvil

- **Configuración:** Dirección fija zona horaria, hora local para los resúmenes diarios, retención de copias y escala mínima/máxima de notas.
- **Copias de seguridad:** Dirección puede crear copia manual y restaurar una existente. Las copias abarcan las colecciones y llevan un manifiesto SHA-256 que se verifica antes de restaurar. Antes de restaurar se crea copia del estado actual. Además, existe tarea diaria programada y política de retención. Conviene conservar una copia fuera del servidor y ensayar la restauración.
- **Instalación PWA:** la interfaz proporciona manifiesto, iconos y service worker; en navegadores compatibles puede instalarse o añadirse a la pantalla de inicio. El service worker conserva recursos públicos de interfaz, no respuestas de API ni datos institucionales. Las funciones de cámara y push dependen del soporte del navegador y HTTPS.

## 5. Recorrido típico de operación escolar

1. Dirección registra áreas, semestres, grupos, materias, personas, inscripciones y vínculos familiares.
2. Define calendario lectivo, horarios y periodos de evaluación.
3. Crea o aprueba cuentas y vincula cada cuenta a su expediente.
4. En cada día de clase, habilita la jornada de entradas y muestra el QR; los alumnos registran su llegada.
5. Durante las clases, el docente abre su lista desde el horario, registra el estado de cada estudiante y cierra la lista.
6. El tutor consulta información autorizada y, si corresponde, envía justificación o solicitud de permiso.
7. El docente captura calificaciones en el periodo; Dirección revisa y publica las boletas.
8. La comunidad recibe mensajes y avisos pertinentes; Dirección supervisa indicadores, exporta datos autorizados y conserva copias verificables.

## 6. Cómo funciona técnicamente

La interfaz está construida con HTML, CSS y JavaScript y se sirve junto con una API HTTP implementada en Node.js. El navegador solicita datos a endpoints `/api/`; no se conecta directamente a la base. El servidor autentica, comprueba rol y pertenencia, valida entradas, registra auditoría cuando corresponde y ejecuta las reglas de negocio.

El almacenamiento tiene dos alternativas bajo una interfaz común: archivos JSON privados para desarrollo local y MongoDB para despliegue configurado. Las colecciones representan usuarios, expedientes, catálogos, inscripciones, horarios, asistencia, incidencias, evaluaciones, mensajes, auditoría y otras entidades. Las relaciones usan identificadores. El almacenamiento JSON serializa escrituras dentro del proceso, escribe temporalmente y reemplaza archivos; para cambios relacionados usa un journal recuperable. MongoDB emplea índices y transacciones en operaciones relacionadas. Para JSON se requiere una sola instancia escritora.

En seguridad, las contraseñas se procesan con scrypt, las sesiones se firman con HMAC y vencen, se limitan intentos de inicio de sesión y se configuran cabeceras de seguridad. La aplicación contiene avisos de seguridad: la sesión se guarda actualmente en `localStorage`, por lo que antes de exposición pública se necesita revisión XSS, cookies seguras y revocables, protección CSRF, HTTPS, monitoreo y pruebas operativas. La documentación de desarrollo también advierte que no debe considerarse aprobada para datos reales antes de completar auditoría, carga, recuperación y piloto con datos ficticios.

## 7. Modelos de desarrollo de software

Los modelos de desarrollo describen cómo un equipo organiza el trabajo para construir y mantener un sistema. No son funciones visibles de la página. La elección depende de cuánto se conocen los requisitos, el riesgo, el calendario, las reglas del concurso y la frecuencia con que se espera recibir comentarios.

### Modelo en cascada

Cascada organiza el proyecto en fases ordenadas, con entregables y revisiones antes de pasar a la siguiente. Una versión habitual es:

1. **Requisitos:** identificar usuarios, necesidades, alcance, restricciones y criterios de aceptación. En Genix-asis, por ejemplo, definir qué debe consultar cada rol y cómo se aprueba una cuenta.
2. **Análisis:** convertir necesidades en procesos, reglas, datos y casos de uso. Ejemplo: decidir que una solicitud pública no da acceso hasta aprobación, salvo código válido de activación.
3. **Diseño:** definir arquitectura, datos, permisos, interfaz, API, seguridad y respaldos antes de construir.
4. **Implementación:** programar interfaz, backend, almacenamiento y reglas.
5. **Verificación:** comprobar que cada requisito se cumple, probar integración, permisos, errores y recuperación.
6. **Entrega/despliegue:** preparar entorno, configuración, migración y capacitación.
7. **Operación y mantenimiento:** corregir errores, actualizar dependencias, atender solicitudes y adaptar el sistema.

Su ventaja es la claridad documental: cada etapa produce resultados revisables, presupuesto y cronograma pueden planificarse y los requisitos aprobados sirven como referencia. Es apropiada cuando los requisitos y las reglas institucionales son estables, hay fechas contractuales o regulatorias y el concurso exige evidencia formal. Su principal riesgo es que los usuarios descubran tarde que una regla o interfaz no refleja su trabajo real; volver a una fase anterior puede implicar retrabajo. Las pruebas tardías también pueden revelar problemas arquitectónicos costosos.

Cascada no significa que jamás se corrija algo. Significa que el plan controla los cambios y que se intenta completar y aprobar cada fase antes de avanzar. Para una plataforma escolar, conviene incluir revisión de usuarios en requisitos y diseño, y validar prototipos antes de congelar el alcance.

### Modelo incremental

El producto se entrega en bloques funcionales que aportan valor sucesivamente. Por ejemplo: primero autenticación y expedientes; luego horarios y listas; después QR de entrada; finalmente calificaciones, comunicación y reportes. Cada incremento pasa por diseño, construcción y verificación, y reutiliza la base anterior.

Permite priorizar lo más útil, recibir comentarios antes y reducir el riesgo de esperar hasta el final para mostrar el sistema. Requiere arquitectura que admita crecimiento y control claro de dependencias: permisos, expedientes e inscripciones son bases para otros módulos. Debe comunicarse que cada entrega parcial tiene alcance definido y puede no cubrir aún todos los procesos.

### Modelo iterativo

Se construye una versión y se mejora mediante ciclos de evaluación y ajuste. A diferencia de dividir principalmente el alcance en módulos entregables, la iteración puede revisar repetidamente una misma función. Por ejemplo, probar una primera lista de asistencia con docentes, ajustar el flujo de cierre y volver a validarla.

Ayuda cuando la experiencia de uso o las reglas tienen incertidumbre. Sus riesgos son cambios de alcance constantes y acumulación de deuda técnica si cada vuelta añade excepciones sin revisar el diseño. Se controla con objetivos de iteración, criterios de aceptación, registro de cambios y revisión técnica.

### Ágil (Scrum/Kanban como marcos de trabajo)

Ágil prioriza entregas frecuentes, colaboración con usuarios, adaptación y software funcional. No es una única receta ni elimina documentación, planificación o pruebas.

- **Scrum** organiza el trabajo en periodos breves llamados sprints. Se mantiene un backlog priorizado; se define un objetivo del sprint; al final se revisa el incremento y se acuerdan mejoras del proceso. Los roles y eventos formales de Scrum pueden ser útiles con un equipo estable y disponibilidad de usuarios.
- **Kanban** visualiza el trabajo por estados (por ejemplo, pendiente, en curso, revisión, terminado), limita el trabajo simultáneo y procura flujo continuo. Encaja con mantenimiento o equipos que reciben solicitudes de forma constante.

Ágil es útil si Dirección y docentes pueden revisar avances con frecuencia y los requisitos evolucionan. Puede ser difícil si no hay disponibilidad de usuarios, decisiones oportunas o control de alcance. Para sistemas escolares, los controles de acceso, privacidad, respaldos y migración deben tener criterios verificables desde el principio, no quedar como trabajo indefinido.

### Prototipado

Se construye una representación rápida de pantallas o procesos para validar comprensión, navegación y lenguaje con usuarios antes de invertir en toda la implementación. Puede ser desechable o evolucionar a producto. Un prototipo visual no demuestra que estén resueltos permisos, base de datos, seguridad, rendimiento o recuperación: esos aspectos requieren diseño e implementación propios.

### Espiral y desarrollo guiado por riesgos

El modelo espiral avanza en ciclos que fijan objetivos, comparan alternativas, identifican riesgos, construyen/verifican una parte y planifican el siguiente ciclo. Es especialmente útil en proyectos grandes o de riesgo elevado, como migración de datos sensibles o despliegues con alta concurrencia. Exige experiencia para valorar riesgos y puede añadir costo de gestión para proyectos pequeños.

### Comparación y recomendación para documentar el proyecto

| Enfoque | Cuándo conviene | Riesgo principal | Evidencia útil |
|---|---|---|---|
| Cascada | Requisitos estables, fases formales y fechas fijas | Descubrir tarde una necesidad omitida | Especificación, diseño aprobado, matriz de trazabilidad, actas de pruebas |
| Incremental | Se necesita poner módulos en uso gradualmente | Dependencias entre módulos y entregas incompletas | Plan de versiones, alcance y aceptación por incremento |
| Iterativo | Se necesita refinar reglas o facilidad de uso | Cambios sin control y deuda técnica | Registro de iteraciones, resultados de evaluación y cambios |
| Scrum | Equipo puede trabajar en ciclos y obtener revisión frecuente | Ceremonias sin participación real o backlog descontrolado | Backlog, objetivos de sprint, incrementos y retrospectivas |
| Kanban | Flujo continuo de solicitudes y mantenimiento | Falta de prioridad o trabajo acumulado | Tablero, límites de trabajo simultáneo y métricas de flujo |
| Prototipado | Incertidumbre temprana de interfaz/proceso | Confundir maqueta con producto operativo | Prototipo, observaciones y decisiones de diseño |
| Espiral | Incertidumbre técnica o impacto alto de fallos | Complejidad de gestión | Registro y tratamiento de riesgos por ciclo |

Para describir Genix-asis sin inventar un método que el repositorio no acredita, puede indicarse que **el software está organizado por módulos y que su proceso histórico debe documentarse con evidencia del equipo**. Si el concurso requiere proponer una metodología, un planteamiento razonable es un proceso híbrido: planificación y documentación por fases para requisitos, datos, seguridad y aceptación; construcción incremental de módulos; iteraciones cortas de revisión con usuarios; y pruebas/gestión de riesgos continuas. Solo se debe afirmar que se siguió un método si existen evidencias (fechas, entregables, versiones, reuniones, criterios y resultados) que lo demuestren.

## 8. Alcances y límites que deben declararse con precisión

- Una entrada QR no equivale a identificación biométrica ni prueba concluyente de presencia.
- La captura de una calificación no publica automáticamente una boleta.
- Una solicitud de cuenta o permiso no está aprobada hasta completar la resolución correspondiente.
- Los mensajes son internos; push requiere configuración y consentimiento. No hay envío por WhatsApp, SMS ni correo.
- La disponibilidad de cámara, instalación PWA y notificaciones depende del navegador y de HTTPS.
- El modo JSON está pensado para desarrollo local y una sola instancia escritora; MongoDB debe configurarse correctamente para producción.
- El repositorio reconoce pendientes de auditoría de seguridad, XSS/cookies, pruebas de carga, dispositivos reales, persistencia y restauración en el despliegue elegido. No se debe afirmar que estos controles ya fueron certificados o que la plataforma está aprobada para datos reales sin evidencia adicional.

## 9. Guion breve para presentar el proyecto

“Genix-asis es una plataforma web escolar con portales diferenciados para Dirección, docentes, alumnos y tutores. Integra expedientes, estructura académica, horarios, control de entradas con códigos QR temporales, listas de clase, incidencias, solicitudes de justificación y permiso, calificaciones y publicación de boletas, además de comunicación institucional y respaldos verificables. El servidor aplica permisos por rol y por relación con el alumno, de modo que cada usuario consulta la información correspondiente a su función. Su diseño modular permite explicar y planificar entregas por etapas. Para una implementación institucional, la propuesta contempla validación con usuarios, pruebas de seguridad y recuperación y despliegue con almacenamiento persistente.”

Este guion resume capacidades descritas en el código y la documentación del proyecto; debe ajustarse al reglamento del concurso y acompañarse de evidencia comprobable sobre pruebas, equipo, fechas, metodología realmente utilizada y estado de despliegue.
