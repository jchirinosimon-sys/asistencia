const $ = selector => document.querySelector(selector);
const tokenKey = 'gestionEscolarToken';
const incomingQr = new URLSearchParams(location.search).get('qr');
if (incomingQr && /^(?:[0-9]{5}|[A-Za-z0-9_-]{22})$/.test(incomingQr)) {
  sessionStorage.setItem('pendingAttendanceQr', incomingQr);
  history.replaceState(null, '', `${location.pathname}${location.hash}`);
}
let me = null;
const labels = { dashboard:'Resumen',organizacion:'Áreas y grupos',usuarios:'Usuarios',solicitudes_cuenta:'Solicitudes de cuenta',configuracion:'Configuración',alumnos:'Alumnos',maestros:'Maestros',tutores:'Tutores',relaciones_tutores:'Vínculos familiares',vincular_alumno:'Vincular alumno',grupos:'Grupos',especialidades:'Especialidades',semestres:'Semestres',materias:'Materias',inscripciones:'Inscripciones',horarios:'Horarios',calendario_escolar:'Calendario',jornadas:'Jornadas',qr_diarios:'QR diario',escaner_credenciales:'Escáner de credenciales',asistencias:'Entradas',listas_asistencia:'Listas de clase',faltas:'Faltas',retardos:'Retardos',justificaciones:'Justificaciones',permisos:'Permisos',periodos_evaluacion:'Periodos',calificaciones:'Calificaciones',boletas:'Boletas',mensajes:'Mensajes',avisos_escolares:'Avisos' };
const forms = {
  alumnos:[['nombres','Nombres'],['apellidos','Apellidos'],['matricula','Matrícula'],['fechaNacimiento','Fecha de nacimiento','date'],['activo','Activo','checkbox']],
  maestros:[['nombres','Nombres'],['apellidos','Apellidos'],['numeroEmpleado','Número de empleado'],['correo','Correo','email'],['activo','Activo','checkbox']],
  tutores:[['nombres','Nombres'],['apellidos','Apellidos'],['correo','Correo','email'],['telefono','Teléfono'],['activo','Activo','checkbox']],
  grupos:[['nombre','Nombre del grupo'],['ciclo','Ciclo escolar'],['semestreId','Semestre'],['especialidadId','Especialidad'],['activo','Activo','checkbox']],
  especialidades:[['nombre','Nombre'],['clave','Clave'],['activo','Activo','checkbox']],
  semestres:[['nombre','Nombre'],['orden','Orden','number'],['activo','Activo','checkbox']],
  materias:[['nombre','Nombre'],['clave','Clave'],['activo','Activo','checkbox']],
  avisos_escolares:[['titulo','Título'],['contenido','Contenido','textarea'],['audiencia','Enviar a','select'],['publicado','Publicar ahora','checkbox'],['visibleHasta','Visible hasta','date']]
  ,relaciones_tutores:[['tutorId','Tutor'],['alumnoId','Alumno'],['parentesco','Parentesco']],
  inscripciones:[['alumnoId','Alumno'],['grupoId','Grupo'],['ciclo','Ciclo escolar'],['estado','Estado']],
  horarios:[['diaSemana','Día (0 domingo – 6 sábado)','number'],['horaInicio','Hora de inicio','time'],['horaFin','Hora de finalización','time'],['materiaId','Materia'],['maestroId','Maestro'],['grupoId','Grupo'],['aula','Aula'],['desde','Vigente desde','date'],['hasta','Vigente hasta','date']],
  calendario_escolar:[['fecha','Fecha','date'],['tipo','Tipo (lectivo, festivo, suspension)'],['descripcion','Descripción'],['jornadas','Jornadas habilitadas (separadas por coma)']],
  periodos_evaluacion:[['nombre','Nombre'],['iniciaEn','Fecha de inicio','date'],['terminaEn','Fecha de cierre','date'],['escalaMin','Nota mínima','number'],['escalaMax','Nota máxima','number'],['estado','Estado']]
};
const editOnly={usuarios:[['nombre','Nombre'],['email','Correo','email']]};
const fieldGuides={
  nombre:'Usa el nombre institucional que aparecerá en el sistema.',email:'Escribe un correo único al que la persona tenga acceso.',rol:'Elige el portal que usará esta cuenta.',personaId:'Selecciona una ficha activa sin cuenta para vincularla.',password:'Crea una clave temporal de al menos 12 caracteres y compártela por un canal privado.',
  nombres:'Escribe los nombres tal como aparecen en el expediente.',apellidos:'Escribe los apellidos completos.',matricula:'Código único del alumno; no lo repitas en otra ficha.',fechaNacimiento:'Selecciona la fecha de nacimiento del expediente.',numeroEmpleado:'Código laboral único asignado por la institución.',correo:'Correo de contacto de la persona.',telefono:'Número de contacto con código de país si aplica.',
  nombreGrupo:'Nombre corto del grupo, por ejemplo 2A.',ciclo:'Ciclo escolar, por ejemplo 2026-2027.',semestreId:'Selecciona el semestre registrado.',especialidadId:'Selecciona el área registrada.',clave:'Clave institucional única de la materia o especialidad.',orden:'Número de orden del semestre, por ejemplo 1 o 2.',
  titulo:'Escribe un título breve que describa el aviso.',contenido:'Redacta el mensaje que leerán los usuarios.',visibleHasta:'Último día en que se debe mostrar el aviso.',tutorId:'Selecciona la ficha del tutor.',alumnoId:'Selecciona la ficha del alumno.',parentesco:'Relación con el alumno, por ejemplo madre, padre o encargado.',grupoId:'Selecciona el grupo de la inscripción o clase.',userId:'Selecciona la cuenta que necesita restablecer el acceso.',zonaHoraria:'Usa un identificador IANA, por ejemplo America/Guatemala.',horaResumenDiario:'Hora local en formato de 24 horas para generar los resúmenes.',retencionBackups:'Cantidad de días que se conservarán las copias (de 1 a 365).',escalaMin:'Valor mínimo permitido para las notas.',escalaMax:'Valor máximo permitido para las notas.',
  estado:'Indica el estado del registro según el proceso escolar.',diaSemana:'Usa 0 para domingo, 1 para lunes, hasta 6 para sábado.',horaInicio:'Hora local de inicio en formato 24 horas, por ejemplo 07:30.',horaFin:'Hora local de finalización en formato 24 horas; debe ser posterior al inicio.',materiaId:'Selecciona la materia registrada.',maestroId:'Selecciona la ficha del maestro.',aula:'Nombre o número del salón, por ejemplo B-12.',desde:'Primer día de vigencia del horario.',hasta:'Último día de vigencia; déjalo vacío si no tiene fecha de cierre.',
  fecha:'Selecciona la fecha escolar del evento.',tipo:'Escribe lectivo, clases, festivo, suspension, sin_clases, evento, evaluacion o jornada_especial.',descripcion:'Resume qué ocurre ese día; por ejemplo, asueto nacional.',jornadas:'Opcional: nombres de jornadas separados por comas.',iniciaEn:'Primer día del periodo de evaluación.',terminaEn:'Último día del periodo de evaluación.',escalaMin:'Nota mínima válida para este periodo.',escalaMax:'Nota máxima válida para este periodo.'
};
const formGuides={alumnos:'Crea una ficha escolar. La matrícula identifica al alumno y debe ser única.',maestros:'Registra al docente; después podrás vincularlo a horarios y a su cuenta.',tutores:'Registra los datos de contacto del tutor antes de crear el vínculo familiar.',grupos:'Define el grupo, el ciclo, el semestre y el área desde las fichas registradas.',especialidades:'Registra el nombre oficial de la especialidad y una clave única si tu institución la usa.',semestres:'Indica el nombre y el orden en que aparece dentro del ciclo.',materias:'Usa el nombre oficial de la asignatura y su clave institucional.',relaciones_tutores:'Selecciona las fichas del tutor y del alumno. El vínculo autoriza al tutor a consultar información del alumno.',inscripciones:'Asigna una ficha de alumno a un grupo y especifica el ciclo escolar.',horarios:'Selecciona materia, maestro y grupo. El sistema rechazará cruces de horario.',calendario_escolar:'Marca la fecha como lectiva o describe el evento; solo los días lectivos permiten abrir jornadas.',periodos_evaluacion:'Define las fechas y los límites de calificación del periodo.',avisos_escolares:'Escribe el anuncio institucional y hasta qué fecha debe permanecer visible.',usuarios:'Crea una cuenta y vincúlala con una ficha institucional existente.'};
const roleName = {direccion:'Dirección',maestro:'Maestro',alumno:'Alumno',tutor:'Tutor'};
const exportablePages=new Set(['alumnos','maestros','tutores','grupos','materias','horarios','asistencias','listas_asistencia','faltas','retardos','justificaciones','calificaciones','boletas','mensajes','avisos_escolares']);
let currentPage = 'dashboard';
let selectedFamilyStudent='';
let qrRotationTimer;
let attendanceRefreshTimer;
let editingId=null;
let currentOffset=0,searchTerm='',statusFilter='';
let studentImportFeedback=null,recordStatusTimer;
let credentialScannerCleanup;

async function api(url, options = {}) {
  if (location.port === '5500') throw new Error('Estás usando Live Server, que solo sirve archivos. Inicia el backend con npm start y abre http://127.0.0.1:3000.');
  const token = localStorage.getItem(tokenKey);
  const response = await fetch(url, { ...options, headers: { ...(options.body ? {'content-type':'application/json'} : {}), ...(token ? {authorization:`Bearer ${token}`} : {}), ...options.headers } });
  const data = await response.json().catch(()=>({error:'Respuesta no válida del servidor.'}));
  if (!response.ok) throw new Error([data.error ?? 'No se pudo completar la solicitud.',...(Array.isArray(data.detalles)?data.detalles:[])].join('\n'));
  api.lastTotal=Number(response.headers.get('x-total-count'))||null;
  return data;
}
function pickerName(record){
  return record.nombre||[record.nombres,record.apellidos].filter(Boolean).join(' ')||record.titulo||record.asunto||record.materiaNombre||record.id;
}
function pickerDetails(record){
  return [record.matricula,record.especialidadNombre,record.grupoNombre,record.numeroEmpleado,record.correo,record.email,record.ciclo,record.estado].filter(Boolean).join(' · ');
}
const stateFilterOptions={
  solicitudes_cuenta:[['pendiente','Pendientes'],['aprobada','Aprobadas'],['rechazada','Rechazadas']],
  relaciones_tutores:[['pendiente','Pendientes'],['activa','Aprobados'],['inactiva','Inactivos']],
  asistencias:[['validada','Registradas']],
  listas_asistencia:[['abierta','Abiertas'],['cerrada','Cerradas']],
  faltas:[['confirmada','Confirmadas'],['justificada','Justificadas']],
  retardos:[['registrado','Registrados'],['justificada','Justificados']],
  justificaciones:[['pendiente','Pendientes'],['autorizada','Autorizadas'],['rechazada','Rechazadas']],
  permisos:[['pendiente','Pendientes'],['autorizado','Autorizados'],['rechazado','Rechazados']],
  periodos_evaluacion:[['abierto','Abiertos'],['cerrado','Cerrados']],
  jornadas:[['habilitada','Habilitadas'],['cerrada','Cerradas']]
};
const recordFilter=document.createElement('select');recordFilter.id='record-filter';recordFilter.className='record-filter hidden';recordFilter.setAttribute('aria-label','Filtrar registros por estado');
const allStates=document.createElement('option');allStates.value='';allStates.textContent='Todos los estados';recordFilter.append(allStates);$('#record-search').insertAdjacentElement('beforebegin',recordFilter);
function updateRecordFilter(key){
  const options=stateFilterOptions[key]??[];recordFilter.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='Todos los estados';recordFilter.append(all);
  for(const [value,label] of options){const option=document.createElement('option');option.value=value;option.textContent=label;recordFilter.append(option);}
  recordFilter.classList.toggle('hidden',!options.length);if(!options.some(([value])=>value===statusFilter))statusFilter='';recordFilter.value=statusFilter;
}
function ensureRecordPicker(){
  let dialog=$('#record-picker-dialog');if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='record-picker-dialog';dialog.className='record-picker-dialog';
  const panel=document.createElement('section');panel.className='record-picker-panel';
  const heading=document.createElement('div');heading.className='record-picker-heading';const title=document.createElement('h2');title.id='record-picker-title';const close=document.createElement('button');close.type='button';close.className='secondary';close.textContent='Cerrar';close.onclick=()=>dialog.close();heading.append(title,close);
  const description=document.createElement('p');description.id='record-picker-description';description.className='muted';
  const label=document.createElement('label');label.className='record-picker-search';label.append(document.createTextNode('Buscar por nombre, matrícula o dato visible'));const search=document.createElement('input');search.id='record-picker-search';search.type='search';search.autocomplete='off';label.append(search);
  const status=document.createElement('p');status.id='record-picker-status';status.className='form-note';status.setAttribute('role','status');
  const results=document.createElement('div');results.id='record-picker-results';results.className='record-picker-results';
  const pagination=document.createElement('div');pagination.className='pagination record-picker-pagination';const pageInfo=document.createElement('span');pageInfo.id='record-picker-page';const previous=document.createElement('button');previous.type='button';previous.className='secondary';previous.textContent='Anterior';const next=document.createElement('button');next.type='button';next.className='secondary';next.textContent='Siguiente';pagination.append(pageInfo,previous,next);
  panel.append(heading,description,label,status,results,pagination);dialog.append(panel);document.body.append(dialog);
  dialog._picker={title,description,search,status,results,pagination,pageInfo,previous,next};
  return dialog;
}
async function openRecordPicker({title,description='',collection,records,endpoint,onSelect,canSelect=()=>true,emptyText='No hay expedientes disponibles.'}){
  const dialog=ensureRecordPicker(),ui=dialog._picker,pageSize=20;let offset=0,query='',total=0,renderVersion=0,allRecords=records;
  ui.title.textContent=title;ui.description.textContent=description;ui.search.value='';ui.status.textContent='';ui.results.replaceChildren();
  const render=async()=>{
    const version=++renderVersion;ui.status.textContent='Cargando expedientes…';ui.results.replaceChildren();
    try{
      let items=[];
      if(allRecords){
        const filtered=allRecords.filter(item=>!query||[pickerName(item),pickerDetails(item)].join(' ').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
        total=filtered.length;items=filtered.slice(offset,offset+pageSize);
      }else{
        const params=new URLSearchParams({limit:String(pageSize),offset:String(offset)});if(query)params.set('q',query);
        const base=endpoint??`/api/${collection}`,separator=base.includes('?')?'&':'?';
        items=await api(`${base}${separator}${params}`);total=api.lastTotal??items.length;
      }
      if(version!==renderVersion)return;
      ui.status.textContent=items.length?'Selecciona una fila para continuar.':emptyText;ui.results.replaceChildren();
      for(const item of items){
        const button=document.createElement('button');button.type='button';button.className='record-picker-option';button.disabled=!canSelect(item);
        const name=document.createElement('strong');name.textContent=pickerName(item)||'Registro sin nombre';const detail=document.createElement('span');detail.textContent=pickerDetails(item)||'Sin información adicional';
        button.append(name,detail);
        if(item.compatibleEspecialidad===false){const warning=document.createElement('small');warning.textContent='No coincide con la especialidad solicitada.';button.append(warning)}
        button.onclick=()=>{onSelect(item);dialog.close();};ui.results.append(button);
      }
      ui.pageInfo.textContent=total?`${offset+1}–${Math.min(offset+pageSize,total)} de ${total}`:'0 registros';
      ui.previous.disabled=offset===0;ui.next.disabled=offset+pageSize>=total;ui.pagination.hidden=total<=pageSize;
    }catch(error){if(version!==renderVersion)return;ui.status.textContent=error.message;ui.results.replaceChildren();ui.previous.disabled=true;ui.next.disabled=true;}
  };
  ui.previous.onclick=()=>{offset=Math.max(0,offset-pageSize);render();};ui.next.onclick=()=>{offset+=pageSize;render();};
  let searchTimer;ui.search.oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{query=ui.search.value.trim();offset=0;render();},220);};
  dialog.showModal();await render();ui.search.focus();
}
function createRecordChoice({name,label,collection,records,title,description,onSelected}){
  const wrap=document.createElement('div');wrap.className='record-picker-field';const caption=document.createElement('span');caption.textContent=label;
  const input=document.createElement('input');input.type='hidden';input.name=name;
  const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=`Seleccionar ${label.toLocaleLowerCase('es')}`;
  button.disabled=Boolean(records&&!records.length);
  const status=document.createElement('small');status.className='field-help';status.setAttribute('role','status');status.textContent='Selección obligatoria.';
  let availableRecords=records;
  const setSelected=record=>{input.value=record.id;button.textContent='Cambiar selección';status.textContent=[pickerName(record),pickerDetails(record)].filter(Boolean).join(' · ');onSelected?.(record);};
  button.onclick=()=>openRecordPicker({title:title??`Seleccionar ${label.toLocaleLowerCase('es')}`,description,collection,records:availableRecords,onSelect:setSelected});
  const setRecords=items=>{availableRecords=items;input.value='';button.disabled=!items.length;button.textContent=`Seleccionar ${label.toLocaleLowerCase('es')}`;status.textContent=items.length?'Selección obligatoria.':'No hay registros para esta selección.';};
  wrap.append(caption,input,button,status);return{wrap,input,button,status,setSelected,setRecords};
}
function selectAccountForPasswordReset(account){
  $('#reset-password-form [name="userId"]').value=account.id;
  const status=$('#reset-account-selection');if(status)status.textContent=`${account.nombre} · ${account.email} · ${roleName[account.rol]??account.rol}`;
  $('#account-admin').scrollIntoView({behavior:'smooth',block:'center'});$('#reset-password-form [name="password"]').focus();
}
function base64UrlBytes(value){const padded=value.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(padded+'='.repeat((4-padded.length%4)%4)),char=>char.charCodeAt(0));}
function pushKeysMatch(subscription,publicKey){const installed=subscription?.options?.applicationServerKey;if(!installed)return false;const actual=new Uint8Array(installed),expected=base64UrlBytes(publicKey);return actual.length===expected.length&&actual.every((byte,index)=>byte===expected[index]);}
function pushReportText(report,kind='aviso'){
  if(!report?.configured)return 'El envío interno quedó guardado, pero faltan las variables VAPID en Render.';
  if(!report.dispositivos)return 'No hay destinatarios con notificaciones activadas en su teléfono; el contenido sí quedó guardado en la bandeja de la app.';
  if(report.errorClaveVapid)return 'El servidor rechazó la clave VAPID. Revisa que la clave pública y privada de Render pertenezcan al mismo par y luego reactiva las notificaciones en el teléfono.';
  if(report.enviadas)return `${kind==='prueba'?'Prueba':'Notificación'} aceptada para entrega a ${report.enviadas} dispositivo(s). Si alguno está sin conexión, el servicio puede conservarla hasta 28 días; la entrega final depende del teléfono y su conexión.${report.fallidas?` ${report.fallidas} fallaron.`:''}${report.caducadas?` Se quitaron ${report.caducadas} suscripciones caducadas.`:''}`;
  return `No se entregó a ningún dispositivo (${report.fallidas} fallidas, ${report.caducadas} caducadas). Vuelve a activar las notificaciones desde ese teléfono.`;
}
async function refreshPushButton(){
  const button=$('#push-notifications');if(!button)return;
  button.classList.add('hidden');
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))return;
  try{const config=await api('/api/push/public-key');const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();button.disabled=false;if(!config.enabled){button.textContent='Notificaciones no configuradas';button.disabled=true;button.title='Dirección debe configurar las variables VAPID en Render.';}else if(subscription&&!pushKeysMatch(subscription,config.publicKey)){button.textContent='Reactivar notificaciones';button.title='Cambió la clave del servidor; pulsa para renovar esta suscripción.';}else{button.textContent=subscription?'Probar notificaciones':'Activar notificaciones';button.title=subscription?'Envía una prueba a este teléfono.':'Activa las notificaciones en este dispositivo.';}button.classList.remove('hidden');}catch{}
}
async function enablePushNotifications(){
  const button=$('#push-notifications');if(!button)return;
  button.disabled=true;
  try{
    if(Notification.permission==='denied')throw new Error('Las notificaciones están bloqueadas en el navegador. Actívalas desde los ajustes del sitio.');
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(permission!=='granted')throw new Error('No se otorgó permiso para mostrar notificaciones.');
    const config=await api('/api/push/public-key');if(!config.enabled)throw new Error('La institución aún debe configurar el servicio de notificaciones.');
    const registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(subscription&&!pushKeysMatch(subscription,config.publicKey)){await subscription.unsubscribe();subscription=null;}
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlBytes(config.publicKey)});
    const result=await api('/api/push/subscriptions',{method:'POST',body:JSON.stringify({subscription:subscription.toJSON()})});
    let report=await api('/api/push/test',{method:'POST',body:'{}'});
    if(report.caducadas){await subscription.unsubscribe();subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlBytes(config.publicKey)});await api('/api/push/subscriptions',{method:'POST',body:JSON.stringify({subscription:subscription.toJSON()})});report=await api('/api/push/test',{method:'POST',body:'{}'});}
    button.textContent='Probar notificaciones';button.disabled=false;button.title=result.mensaje;alert(pushReportText(report,'prueba'));
  }catch(error){alert(error.message);button.disabled=false;}
}
function extractAttendanceToken(rawValue) {
  const value=String(rawValue??'').trim();
  try { const link=new URL(value,location.origin);if(link.origin===location.origin){const linkedToken=link.searchParams.get('qr');if(linkedToken)return linkedToken;} } catch {}
  return value;
}
function showAttendanceNotice(message, isError=false) {
  const notice=$('#qr-notice');if(!notice)return;
  notice.textContent=message;notice.classList.toggle('error',isError);notice.classList.add('visible');
  clearTimeout(showAttendanceNotice.timer);showAttendanceNotice.timer=setTimeout(()=>notice.classList.remove('visible'),9000);
}
async function submitPendingAttendance(user) {
  const token=sessionStorage.getItem('pendingAttendanceQr');if(!token)return;
  if(user.rol!=='alumno'){showAttendanceNotice('Inicia sesión con una cuenta de alumno para registrar esta entrada.',true);return;}
  const nav=[...document.querySelectorAll('.nav-link')].find(button=>button.textContent.trim()==='Entradas');
  await loadPage('asistencias','Entradas',nav);
  showAttendanceNotice('QR listo. Pulsa «Registrar entrada» para guardar la entrada.');
}
function goLogin(message='') {
  credentialScannerCleanup?.();credentialScannerCleanup=undefined;
  setNavigationOpen(false);
  $('#portal-menu-button').classList.add('hidden');
  localStorage.removeItem(tokenKey); $('#portal').classList.add('hidden'); $('#login').classList.remove('hidden'); $('#session-indicator').classList.add('hidden');
  $('#login-form').reset();
  $('#login-error').textContent = message;
}
function setNavigationOpen(open) {
  const drawer=$('#navigation-drawer'),button=$('#portal-menu-button');
  drawer.classList.toggle('is-open',open);
  $('#nav-backdrop').classList.toggle('is-visible',open);
  document.body.classList.toggle('navigation-open',open);
  button.setAttribute('aria-expanded',String(open));
  button.setAttribute('aria-label',open?'Cerrar menú de navegación':'Abrir menú de navegación');
  if(open)drawer.querySelector('.nav-link.active, .nav-link')?.focus({preventScroll:true});
  else button.focus({preventScroll:true});
}
function metric(label,value,icon) {
  const item=document.createElement('article');item.className='metric-card';
  const top=document.createElement('div');top.className='metric-top';const name=document.createElement('span');name.textContent=label;const mark=document.createElement('span');mark.className='metric-icon';mark.textContent=icon;
  const amount=document.createElement('strong');amount.textContent=Number(value).toLocaleString('es-GT');item.append(top,amount);top.append(name,mark);return item;
}
async function showPortal(user) {
  $('#login').classList.add('hidden');$('#portal').classList.remove('hidden');$('#session-indicator').classList.remove('hidden');
  $('#welcome-kicker').textContent=`PORTAL DE ${roleName[user.rol]?.toUpperCase() ?? user.rol.toUpperCase()}`;
  $('#welcome-title').textContent=`Hola, ${user.nombre.split(' ')[0]}`;
  $('#welcome-subtitle').textContent=user.rol==='direccion'?'Aquí tienes la actividad y administración de tu institución.':'Consulta tu información escolar y mantente al día.';
  await refreshPushButton();
  $('#account-admin').classList.add('hidden');
  $('#record-admin').classList.add('hidden');
  $('#settings-admin').classList.add('hidden');
  if(user.rol==='direccion')try{const rows=await api('/api/configuracion');if(rows[0])for(const [key,value] of Object.entries(rows[0])){const field=$(`#settings-form [name="${key}"]`);if(field)field.value=value}}catch{}
  $('#student-switch').classList.toggle('hidden',user.rol!=='tutor');
  if(user.rol==='tutor')try{const children=await api('/api/mis-alumnos'),select=$('#student-select');select.replaceChildren(...children.map(child=>{const option=document.createElement('option');option.value=child.id;option.textContent=[child.nombres,child.apellidos].filter(Boolean).join(' ');return option}));selectedFamilyStudent=children[0]?.id??'';if(children.length>1)$('#student-switch').classList.remove('hidden');select.onchange=()=>{selectedFamilyStudent=select.value;loadPage(currentPage,labels[currentPage]??'Información',document.querySelector('.nav-link.active'));};}catch{}
  const pages=user.rol==='direccion'
    ? [['dashboard','Resumen','⌂','General'],['usuarios','Usuarios','♙','Administración'],['solicitudes_cuenta','Solicitudes de cuenta','✉','Administración'],['configuracion','Configuración','⚙','Administración'],['alumnos','Alumnos','◉','Comunidad'],['maestros','Maestros','♧','Comunidad'],['tutores','Tutores','♡','Comunidad'],['relaciones_tutores','Vínculos familiares','↔','Comunidad'],['organizacion','Áreas y grupos','▦','Organización'],['materias','Materias','▱','Organización'],['inscripciones','Inscripciones','⊞','Organización'],['horarios','Horarios','◷','Organización'],['calendario_escolar','Calendario','▣','Organización'],['jornadas','Jornadas','◷','Asistencia'],['qr_diarios','QR diario','▦','Asistencia'],['escaner_credenciales','Escáner de credenciales','▣','Asistencia'],['asistencias','Entradas','↗','Asistencia'],['listas_asistencia','Listas de clase','☷','Asistencia'],['faltas','Faltas','!','Asistencia'],['retardos','Retardos','◴','Asistencia'],['justificaciones','Justificaciones','✓','Asistencia'],['permisos','Permisos','▤','Asistencia'],['periodos_evaluacion','Periodos','▤','Académico'],['calificaciones','Calificaciones','☆','Académico'],['boletas','Boletas','▧','Académico'],['mensajes','Mensajes','✉','Comunicación'],['avisos_escolares','Avisos','◉','Comunicación'],['backups','Copias de seguridad','⤓','Administración']]
    : user.rol==='maestro' ? [['perfil','Mi perfil','♙','Mi espacio'],['horarios','Mi horario','◷','Asistencia'],['listas_asistencia','Listas de clase','☷','Asistencia'],['faltas','Faltas','!','Asistencia'],['retardos','Retardos','◴','Asistencia'],['calificaciones','Calificaciones','☆','Académico'],['avisos_escolares','Avisos','◉','Comunicación']]
    : [['vincular_alumno','Vincular alumno','↔','Familia'],['perfil','Mi perfil','♙','Mi espacio'],['horarios','Mi horario','◷','Asistencia'],['asistencias','Entradas','↗','Asistencia'],['faltas','Faltas','!','Asistencia'],['retardos','Retardos','◴','Asistencia'],...(user.rol==='tutor'?[['justificaciones','Justificaciones','✓','Asistencia'],['permisos','Permisos','▤','Asistencia']]:user.rol==='alumno'?[['permisos','Permisos','▤','Asistencia']]:[]),['calificaciones','Calificaciones','☆','Académico'],['boletas','Boletas','▧','Académico'],['mensajes','Mensajes','✉','Comunicación'],['avisos_escolares','Avisos','◉','Comunicación']];
  if(user.rol!=='direccion')pages.unshift(['dashboard','Resumen','⌂','General']);
  if(user.rol==='alumno')pages.splice(1,1);
  const groups=[];
  for(const [key,title,icon,group='Mi espacio'] of pages){let section=groups.find(x=>x.group===group);if(!section){section={group,items:[]};groups.push(section)}section.items.push({key,title,icon});}
  $('#nav').replaceChildren(...groups.map((section,groupIndex)=>{const fragment=document.createDocumentFragment();const heading=document.createElement('span');heading.className='nav-heading';heading.style.setProperty('--menu-delay',`${Math.min(groupIndex,6)*35}ms`);const toggle=document.createElement('button');toggle.className='nav-heading-toggle';toggle.type='button';toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-controls',`nav-group-${groupIndex}`);const title=document.createElement('span');title.textContent=section.group;const chevron=document.createElement('span');chevron.className='nav-chevron';chevron.setAttribute('aria-hidden','true');chevron.textContent='⌄';toggle.append(title,chevron);const items=document.createElement('div');items.className='nav-group-items';items.id=`nav-group-${groupIndex}`;toggle.onclick=()=>{const expanded=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!expanded));items.hidden=expanded;};heading.append(toggle);fragment.append(heading,items);items.append(...section.items.map((item,itemIndex)=>{const b=document.createElement('button');b.className='nav-link';b.dataset.page=item.key;b.style.setProperty('--menu-delay',`${Math.min(itemIndex+1,6)*35}ms`);b.innerHTML=`<span class="nav-icon">${item.icon}</span><span>${item.title}</span>`;b.onclick=()=>{loadPage(item.key,item.title,b);setNavigationOpen(false);document.querySelector('.main-column').scrollIntoView({behavior:'smooth',block:'start'});};return b;}));return fragment;}));
  $('#portal-menu-button').classList.remove('hidden');
  const initialPage=user.rol==='direccion'?['dashboard','Resumen']:pages[0],initialButton=$(`#nav .nav-link[data-page="${initialPage[0]}"]`);
  await loadPage(initialPage[0],initialPage[1],initialButton);
  const query=new URLSearchParams(location.search),target=query.has('mensaje')?'mensajes':query.has('aviso')?'avisos_escolares':null;if(target){const navButton=[...document.querySelectorAll('.nav-link')].find(item=>item.textContent.includes(labels[target]));if(navButton){await loadPage(target,labels[target],navButton);history.replaceState(null,'',location.pathname+location.hash)}}
}
async function loadPage(key,title,button,offset=0) {
  credentialScannerCleanup?.();credentialScannerCleanup=undefined;clearTimeout(qrRotationTimer);clearInterval(attendanceRefreshTimer);attendanceRefreshTimer=undefined;if(key!==currentPage){offset=0;searchTerm='';statusFilter='';editingId=null;studentImportFeedback=null;clearTimeout(recordStatusTimer);$('#record-search').value='';for(const selector of ['#record-result','#account-result','#reset-result','#settings-result'])$(selector).textContent='';}currentPage=key;currentOffset=offset;updateRecordFilter(key);document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));button?.classList.add('active');
  $('#record-search').classList.toggle('hidden',key==='dashboard'||key==='perfil'||key==='backups'||key==='vincular_alumno');$('#record-search').placeholder=key==='usuarios'?'Buscar por nombre o correo…':'Buscar registros';$('#record-search').setAttribute('aria-label',key==='usuarios'?'Buscar usuarios por nombre o correo':'Buscar registros');
  $('#dashboard-content').replaceChildren();$('#list-title').textContent=title;$('#module-kicker').textContent=key==='dashboard'?'VISTA GENERAL':'REGISTROS ESCOLARES';const loading=document.createElement('div');loading.className='loading';loading.setAttribute('role','status');loading.textContent='Cargando información…';$('#list').replaceChildren(loading);
  const isDirection=me?.rol==='direccion';$('#account-admin').classList.toggle('hidden',!isDirection||key!=='usuarios');$('#settings-admin').classList.toggle('hidden',!isDirection||key!=='configuracion');
  const canCreate=isDirection&&forms[key];$('#record-admin').classList.toggle('hidden',!canCreate);if(canCreate)await buildRecordForm(key);
  try {
    if(key==='vincular_alumno'&&me?.rol==='tutor'){$('#list').replaceChildren();await renderTutorLinkAction();return;}
    if(key==='organizacion'){const [areas,groups,terms]=await Promise.all([api('/api/especialidades?limit=200'),api('/api/grupos?limit=200'),api('/api/semestres?limit=100')]);$('#list').replaceChildren();await renderOrganization(areas,groups,terms);return;}
    if(key==='escaner_credenciales'&&me?.rol==='direccion'){$('#dashboard-content').replaceChildren();$('#list').replaceChildren();await renderCredentialScanner();return;}
    const pageSize=key==='permisos'?10:key==='horarios'?200:50;const params=new URLSearchParams({limit:String(pageSize),offset:String(offset)});if(searchTerm)params.set('q',searchTerm);if(statusFilter)params.set('estado',statusFilter);if(me?.rol==='tutor'&&selectedFamilyStudent)params.set('alumnoId',selectedFamilyStudent);const result=await api(`/api/${key}${key==='dashboard'?'':`?${params}`}`);const total=api.lastTotal??result.length;
    $('#dashboard-content').replaceChildren();if(key==='alumnos'&&isDirection)renderStudentImportAction();
    if(key==='dashboard'){
      if(!isDirection){
        const quickItems={
          maestro:[['horarios','Consultar mi horario','◷'],['listas_asistencia','Tomar asistencia','☷'],['calificaciones','Capturar calificaciones','☆'],['avisos_escolares','Ver avisos','◉']],
          tutor:[['vincular_alumno','Vincular alumno','↔'],['asistencias','Consultar entradas','↗'],['permisos','Solicitar permiso','▤'],['calificaciones','Consultar calificaciones','☆']],
          alumno:[['asistencias','Registrar entrada','↗'],['perfil','Ver mi credencial','♙'],['calificaciones','Consultar calificaciones','☆'],['horarios','Consultar mi horario','◷']]
        }[me?.rol]??[];
        const panel=document.createElement('section');panel.className='dashboard-section role-dashboard';
        const heading=document.createElement('div');heading.className='dashboard-section-heading';const title=document.createElement('h3');title.textContent='Accesos rápidos';const description=document.createElement('p');description.textContent='Ve directo a las tareas más útiles para tu perfil.';heading.append(title,description);
        const grid=document.createElement('div');grid.className='role-dashboard-grid';
        for(const [page,label,icon] of quickItems){const action=document.createElement('button');action.type='button';action.className='role-dashboard-action';const mark=document.createElement('span');mark.className='metric-icon';mark.textContent=icon;const copy=document.createElement('span');copy.textContent=label;action.append(mark,copy);action.onclick=()=>{const nav=$(`#nav .nav-link[data-page="${page}"]`);if(nav)loadPage(page,labels[page],nav);};grid.append(action);}
        panel.append(heading,grid);$('#dashboard-content').append(panel);
        const note=document.createElement('p');note.className='form-intro';note.textContent='La información disponible depende de tu cuenta y de los expedientes vinculados por la institución.';$('#dashboard-content').append(note);
        $('#list').innerHTML='<div class="empty-state"><span class="empty-icon">✦</span><strong>Tu espacio escolar</strong><span>Selecciona un acceso rápido o explora las opciones del menú.</span></div>';return;
      }
      const sections=[
        {title:'Alumnos',description:'Matrícula, entradas e incidencias de hoy.',items:[['alumnos','Alumnos','◉'],['asistencias','Entradas hoy','↗'],['faltas','Faltas hoy','!'],['retardos','Retardos hoy','◴'],['calificaciones','Calificaciones','☆']]},
        {title:'Maestros',description:'Personal docente y seguimiento de clases.',items:[['maestros','Maestros','♧'],['listasPendientes','Listas abiertas','☷']]},
        {title:'Otros',description:'Organización, jornadas y comunicación escolar.',items:[['organizacion','Áreas y grupos','▦'],['jornadas','Jornadas activas','◷'],['notificacionesPendientes','Avisos pendientes','✉'],['periodosActivos','Periodos activos','▤']]}
      ];
      for(const sectionData of sections){const section=document.createElement('section');section.className='dashboard-section';const heading=document.createElement('div');heading.className='dashboard-section-heading';const title=document.createElement('h3');title.textContent=sectionData.title;const description=document.createElement('p');description.textContent=sectionData.description;heading.append(title,description);const grid=document.createElement('div');grid.className='metric-grid';grid.append(...sectionData.items.map(([k,l,i])=>metric(l,result[k]??0,i)));section.append(heading,grid);$('#dashboard-content').append(section);}
      $('#list').innerHTML='<div class="empty-state"><span class="empty-icon">✦</span><strong>Tu institución, al día</strong><span>Las cifras se calculan directamente desde los registros escolares.</span></div>';return;
    }
    if(key==='jornadas'&&me?.rol==='direccion')renderJourneyAction();
    if(key==='mensajes'&&me?.rol==='direccion'){await renderMessageAction();const pushHint=document.createElement('p');pushHint.className='form-note';pushHint.textContent='Los mensajes quedan en la bandeja. El teléfono debe tener las notificaciones activadas. Si está apagado o sin conexión, el servicio intentará conservar la notificación hasta 28 días; la entrega al encenderlo depende de Android o iOS y de que el permiso siga activo.';$('#list').prepend(pushHint);}
    if(key==='qr_diarios'&&me?.rol==='direccion')renderQrAction();
    if(key==='asistencias'&&me?.rol==='alumno')renderAttendanceAction();
    if(key==='listas_asistencia'&&me?.rol==='maestro')renderCloseListActions(result);
    if(key==='calificaciones'&&me?.rol==='maestro')await renderGradeCaptureAction();
    if(key==='calificaciones'&&me?.rol==='direccion')renderPublishAction();
    if(key==='justificaciones'&&me?.rol==='direccion')renderResolutionActions(result);
    if(['faltas','retardos'].includes(key)&&me?.rol==='tutor')renderJustificationRequestAction();
    if(exportablePages.has(key))renderExportAction(key);
    if(key==='backups'&&me?.rol==='direccion')renderBackupActions();
    if(key==='usuarios'&&Array.isArray(result)){renderUserSections(result);if(total>result.length)renderPagination(total,offset);return;}
    if(key==='permisos'&&Array.isArray(result)){if(me?.rol==='tutor')await renderPermitAction();renderPermits(result);if(total>result.length)renderPagination(total,offset,10);return;}
    if(key==='horarios'&&Array.isArray(result)){await renderScheduleView(result);if(total>result.length)renderPagination(total,offset,pageSize);return;}
    if(key==='perfil'&&result&&typeof result==='object'&&!Array.isArray(result)){if(me?.rol==='alumno')await renderStudentCredential(result);else $('#list').append(recordCard(result));return;}
    if(!Array.isArray(result)||!result.length){const blank=document.createElement('div');blank.className='empty-state';blank.innerHTML=`<span class="empty-icon">${iconFor(key)}</span><strong>Aún no hay ${title.toLowerCase()}</strong><span>Los registros que correspondan aparecerán aquí.</span>`;$('#list').append(blank);return;}
    const rows=result.map(record=>recordCard(record));$('#list').append(...rows);if(total>50)renderPagination(total,offset);
  }catch(error){$('#list').innerHTML='';const box=document.createElement('div');box.className='error-state';box.textContent=error.message;$('#list').append(box);}finally{loading.remove();}
}
function iconFor(key){return ({alumnos:'◉',horarios:'◷',faltas:'!',asistencias:'↗',boletas:'▧',avisos_escolares:'◉'})[key]??'▤'}
function renderUserSections(records){
  const roles=[['alumno','Alumnos'],['maestro','Maestros'],['tutor','Tutores'],['direccion','Dirección']];
  for(const [role,title] of roles){const people=records.filter(item=>item.rol===role).sort((a,b)=>String(a.nombre??'').localeCompare(String(b.nombre??''),'es',{sensitivity:'base'}));const section=document.createElement('section');section.className='user-role-section';const heading=document.createElement('h3');heading.textContent=title;section.append(heading);if(!people.length){const empty=document.createElement('p');empty.className='user-role-empty';empty.textContent='Sin usuarios en esta sección.';section.append(empty);}for(const person of people){const row=document.createElement('article');row.className='user-name-row';const name=document.createElement('strong');name.textContent=person.nombre||'Nombre no disponible';row.append(name);const reset=document.createElement('button');reset.type='button';reset.className='row-action';reset.textContent='Restablecer acceso';reset.setAttribute('aria-label',`Restablecer acceso de ${person.nombre||'usuario'}`);reset.onclick=()=>selectAccountForPasswordReset(person);const active=document.createElement('button');active.type='button';active.className='row-action';active.textContent=person.activo===false?'Reactivar':'Desactivar';active.onclick=async()=>{active.disabled=true;try{await api(`/api/usuarios/${encodeURIComponent(person.id)}/estado`,{method:'PATCH'});await loadPage('usuarios','Usuarios',document.querySelector('.nav-link.active'));}catch(error){alert(error.message);active.disabled=false}};row.append(reset,active);section.append(row)}$('#list').append(section)}
}
async function imageFileToDataUrl(file){
  if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error('La foto debe ser JPG, PNG o WEBP.');if(file.size>10_000_000)throw new Error('La foto original debe pesar menos de 10 MB.');const bitmap=await createImageBitmap(file),scale=Math.min(1,1100/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.72));if(!blob)throw new Error('No se pudo procesar la foto. Intenta con otra imagen.');if(blob.size>1_000_000)blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.48));if(!blob||blob.size>1_000_000)throw new Error('La foto sigue pesando demasiado; elige una imagen más pequeña.');return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('No se pudo leer la foto.'));reader.readAsDataURL(blob)});
}
async function renderPermitAction(){
  const box=actionBox('Solicitar permiso de ausencia','Adjunta una foto clara de la credencial del alumno y explica por qué faltará. Dirección revisará la información; la falta solo se justificará cuando el permiso esté autorizado.');const form=document.createElement('form');form.className='permit-request-form';let studentSelect=null;
  if(me?.rol==='tutor'){const label=document.createElement('label');label.textContent='Alumno';studentSelect=document.createElement('select');studentSelect.name='alumnoId';studentSelect.required=true;try{const children=await api('/api/mis-alumnos');for(const child of children){const option=document.createElement('option');option.value=child.id;option.textContent=[child.nombres,child.apellidos].filter(Boolean).join(' ');studentSelect.append(option)}if(!children.length){const message=document.createElement('p');message.className='empty-state';message.textContent='Primero necesitas un vínculo familiar aprobado para solicitar permisos.';box.append(message);$('#list').append(box);return}studentSelect.value=selectedFamilyStudent||studentSelect.value;}catch(error){const message=document.createElement('p');message.className='error-state';message.textContent=error.message;box.append(message);$('#list').append(box);return}label.append(studentSelect);form.append(label)}
  const dateLabel=document.createElement('label');dateLabel.textContent='Fecha de ausencia';const date=document.createElement('input');date.type='date';date.name='fecha';date.required=true;date.value=new Date().toLocaleDateString('en-CA',{timeZone:'America/Guatemala'});dateLabel.append(date);const reasonLabel=document.createElement('label');reasonLabel.textContent='Motivo de la ausencia';const reason=document.createElement('textarea');reason.name='motivo';reason.rows=4;reason.minLength=10;reason.maxLength=2000;reason.required=true;reason.placeholder='Explica por qué no podrá asistir y agrega la información necesaria.';reasonLabel.append(reason);const photoLabel=document.createElement('label');photoLabel.textContent='Foto de la credencial del alumno (obligatoria)';const photo=document.createElement('input');photo.type='file';photo.accept='image/jpeg,image/png,image/webp';photo.capture='environment';photo.required=true;photoLabel.append(photo);const photoHelp=document.createElement('small');photoHelp.className='field-help';photoHelp.textContent='Se comprimirá en este dispositivo antes de enviarse. Evita incluir documentos que no sean necesarios.';photoLabel.append(photoHelp);
  let canvas=null,signatureTouched=false;if(me?.rol==='tutor'){const signatureBox=document.createElement('div');signatureBox.className='signature-field';const label=document.createElement('label');label.textContent='Firma del tutor (opcional)';canvas=document.createElement('canvas');canvas.className='signature-canvas';canvas.width=720;canvas.height=180;canvas.setAttribute('aria-label','Espacio opcional para dibujar la firma del tutor');const context=canvas.getContext('2d');context.strokeStyle='#172f2b';context.lineWidth=4;context.lineCap='round';context.lineJoin='round';let drawing=false;const point=event=>{const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height}};canvas.onpointerdown=event=>{drawing=true;signatureTouched=true;canvas.setPointerCapture(event.pointerId);const p=point(event);context.beginPath();context.moveTo(p.x,p.y)};canvas.onpointermove=event=>{if(!drawing)return;const p=point(event);context.lineTo(p.x,p.y);context.stroke()};canvas.onpointerup=canvas.onpointercancel=()=>drawing=false;label.append(canvas);const clear=document.createElement('button');clear.type='button';clear.className='secondary';clear.textContent='Borrar firma';clear.onclick=()=>{context.clearRect(0,0,canvas.width,canvas.height);signatureTouched=false};const help=document.createElement('small');help.className='field-help';help.textContent='Puedes firmar con el dedo o dejarlo vacío.';signatureBox.append(label,help,clear);form.append(signatureBox)}
  const submit=document.createElement('button');submit.textContent='Enviar para revisión';const status=document.createElement('span');status.className='form-note';status.setAttribute('role','status');form.append(dateLabel,reasonLabel,photoLabel,submit,status);form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;status.textContent='Preparando y enviando solicitud…';try{const fotoCredencial=await imageFileToDataUrl(photo.files[0]);if(studentSelect){selectedFamilyStudent=studentSelect.value;$('#student-select').value=selectedFamilyStudent}const payload={fecha:date.value,motivo:reason.value,fotoCredencial,...(studentSelect?{alumnoId:studentSelect.value}:{}),...(canvas&&signatureTouched?{firmaTutor:canvas.toDataURL('image/png')}: {})};const result=await api('/api/permisos',{method:'POST',body:JSON.stringify(payload)});status.textContent=result.mensaje;form.reset();if(canvas){canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);signatureTouched=false}await loadPage('permisos','Permisos',document.querySelector('.nav-link.active'));}catch(error){status.textContent=error.message;submit.disabled=false}};box.append(form);$('#list').append(box);
}
function renderPermits(records){
  const sorted=[...records].sort((a,b)=>String(b.solicitadoEn??'').localeCompare(String(a.solicitadoEn??'')));if(!sorted.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent='Todavía no hay solicitudes de permiso.';$('#list').append(empty);return;}
  for(const permit of sorted){const card=document.createElement('article');card.className='permit-card';const top=document.createElement('div');top.className='permit-card-top';const identity=document.createElement('div');const name=document.createElement('h3');name.textContent=permit.nombreSnapshot||'Alumno';const metadata=document.createElement('p');metadata.textContent=`Matrícula ${permit.matricula||'—'} · ${permit.fecha||'Fecha pendiente'}`;identity.append(name,metadata);const badge=document.createElement('span');badge.className=`status-badge ${permit.estado}`;badge.textContent=permit.estado==='autorizado'?'Autorizado':permit.estado==='rechazado'?'Rechazado':'Pendiente de revisión';top.append(identity,badge);const reason=document.createElement('p');reason.className='permit-reason';reason.textContent=permit.motivo;card.append(top,reason);if(me?.rol!=='alumno'){const evidence=document.createElement('div');evidence.className='permit-evidence';const photo=document.createElement('img');photo.src=permit.fotoCredencial;photo.alt=`Foto de credencial adjunta para ${permit.nombreSnapshot||'el alumno'}`;photo.className='permit-photo';photo.title='Toca la imagen para ampliar';photo.onclick=()=>photo.classList.toggle('expanded');const photoCaption=document.createElement('span');photoCaption.textContent='Credencial adjunta';evidence.append(photoCaption,photo);if(permit.firmaTutor){const signatureGroup=document.createElement('div');signatureGroup.className='permit-signature';const caption=document.createElement('span');caption.textContent='Firma opcional del tutor';const signature=document.createElement('img');signature.src=permit.firmaTutor;signature.alt='Firma del tutor';signatureGroup.append(caption,signature);evidence.append(signatureGroup)}card.append(evidence)}
    if(me?.rol==='direccion'&&permit.estado==='pendiente'){const review=document.createElement('label');review.className='permit-review-check';const check=document.createElement('input');check.type='checkbox';const text=document.createElement('span');text.textContent='Confirmo que revisé la foto de la credencial, la matrícula, el alumno, la fecha y el motivo.';review.append(check,text);const actions=document.createElement('div');actions.className='permit-review-actions';for(const [decision,labelText] of [['autorizar','Autorizar permiso'],['rechazar','Rechazar']]){const button=document.createElement('button');button.type='button';button.textContent=labelText;if(decision==='rechazar')button.className='secondary';button.onclick=async()=>{if(decision==='autorizar'&&!check.checked){alert('Marca la casilla después de verificar los datos del permiso.');return}button.disabled=true;try{await api(`/api/permisos/${encodeURIComponent(permit.id)}/resolver`,{method:'POST',body:JSON.stringify({decision,revisionCompleta:check.checked})});await loadPage('permisos','Permisos',document.querySelector('.nav-link.active'));}catch(error){alert(error.message);button.disabled=false}};actions.append(button)}card.append(review,actions)}else if(permit.estado==='autorizado'){const result=document.createElement('p');result.className='permit-approved-note';result.textContent='Autorizado por Dirección. Si el alumno fue registrado ausente ese día, su falta aparece como justificada.';card.append(result)}$('#list').append(card)
  }
}
async function renderStudentCredential(student){
  const fullName=[student.nombres,student.apellidos].filter(Boolean).join(' ')||'Alumno';
  const card=document.createElement('article');card.className='student-credential';card.setAttribute('aria-label','Credencial escolar digital');
  const head=document.createElement('div');head.className='credential-head';
  const logo=document.createElement('img');logo.className='credential-logo';logo.src='/icons/genix-app-512.png';logo.alt='Logotipo de Genix';
  const institution=document.createElement('div');institution.className='credential-institution';const overline=document.createElement('span');overline.textContent='GENIX · CONTROL ESCOLAR';const school=document.createElement('strong');school.textContent='Credencial de estudiante';institution.append(overline,school);
  const badge=document.createElement('span');badge.className=`credential-status${student.activo===false?' credential-status-inactive':''}`;badge.textContent=student.activo===false?'INACTIVO':'ACTIVO';head.append(logo,institution,badge);
  const identity=document.createElement('div');identity.className='credential-identity';const initials=document.createElement('div');initials.className='credential-avatar';initials.textContent=fullName.split(/\s+/).slice(0,2).map(word=>word[0]??'').join('').toUpperCase();const nameBlock=document.createElement('div');const name=document.createElement('h2');name.textContent=fullName;const matricula=document.createElement('p');matricula.innerHTML='MATRÍCULA <strong></strong>';matricula.querySelector('strong').textContent=student.matricula||'Pendiente';nameBlock.append(name,matricula);identity.append(initials,nameBlock);
  const details=document.createElement('dl');details.className='credential-details';for(const [label,value] of [['Especialidad',student.especialidadNombre],['Grado',student.grado],['Semestre',student.semestre?`${student.semestre}° semestre`:'' ],['Grupo',student.grupoNombre],['Ciclo escolar',student.ciclo],['Correo institucional',student.correoCuenta??me?.email],['Teléfono',student.telefono]]){const item=document.createElement('div');const term=document.createElement('dt');term.textContent=label;const description=document.createElement('dd');description.textContent=value||'Por completar';item.append(term,description);details.append(item)}
  const qrPanel=document.createElement('div');qrPanel.className='credential-qr';const qrTitle=document.createElement('span');qrTitle.textContent='IDENTIFICACIÓN ESCOLAR';const qrHelp=document.createElement('small');qrHelp.textContent='Código de matrícula';if(student.matricula){const {qrSvg}=await import('./qr.js');const qr=document.createElement('img');qr.className='credential-qr-image';qr.alt=`Código QR de matrícula ${student.matricula}`;qr.src=URL.createObjectURL(new Blob([qrSvg(`GENIX|ALUMNO|${student.matricula}`)],{type:'image/svg+xml'}));qrPanel.append(qrTitle,qr,qrHelp);}else{const missing=document.createElement('small');missing.textContent='Matrícula pendiente';qrPanel.append(qrTitle,missing)}
  const footer=document.createElement('div');footer.className='credential-footer';footer.textContent='Credencial digital personal · Genix-asis';card.append(head,identity,details,qrPanel,footer);$('#list').append(card);
  const actions=document.createElement('div');actions.className='credential-actions';const print=document.createElement('button');print.className='secondary';print.textContent='Imprimir credencial';print.onclick=()=>{document.body.classList.add('printing-credential');window.onafterprint=()=>document.body.classList.remove('printing-credential');window.print();};actions.append(print);$('#list').append(actions);
  const box=document.createElement('section');box.className='credential-edit';const heading=document.createElement('h3');heading.textContent='Completa tus datos de contacto';const hint=document.createElement('p');hint.textContent='Tu nombre, matrícula y datos escolares vienen del expediente. Aquí puedes agregar o corregir tu teléfono y un correo de contacto.';const form=document.createElement('form');form.className='credential-form';
  const makeField=(labelText,name,type,value,placeholder)=>{const label=document.createElement('label');label.append(document.createTextNode(labelText));const input=document.createElement('input');input.name=name;input.type=type;input.value=value??'';input.maxLength=name==='telefono'?30:254;input.placeholder=placeholder;if(name==='telefono')input.autocomplete='tel';if(name==='correoContacto')input.autocomplete='email';label.append(input);return label};
  form.append(makeField('Teléfono','telefono','tel',student.telefono,'Ej. +502 5555 1234'),makeField('Correo de contacto','correoContacto','email',student.correoContacto,'correo@ejemplo.com'));
  const submit=document.createElement('button');submit.textContent='Guardar mis datos';const status=document.createElement('span');status.className='form-note';status.setAttribute('role','status');form.append(submit,status);form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;status.textContent='Guardando…';try{await api('/api/perfil',{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(form)))});await loadPage('perfil','Mi perfil',document.querySelector('.nav-link.active'));}catch(error){status.textContent=error.message;submit.disabled=false}};box.append(heading,hint,form);$('#list').append(box);
}
function recordCard(record){
  const card=document.createElement('article');card.className='data-row';const main=document.createElement('div');main.className='data-row-main';const title=document.createElement('strong');title.textContent=record.asunto??record.nombre??record.titulo??record.alumnoNombreSnapshot??([record.nombres,record.apellidos].filter(Boolean).join(' '))??record.materia??record.id;const subtitle=document.createElement('span');subtitle.textContent=[record.tutorNombre,record.matricula,record.parentesco,record.clave,record.email,record.fecha,record.nombreSnapshot].filter(Boolean).join(' · ')||`Registro ${String(record.id??'').slice(0,8)}`;main.append(title,subtitle);const badge=document.createElement('span');badge.className=`status-badge ${String(record.estado??(record.activo===false?'inactivo':'activo')).toLowerCase()}`;badge.textContent=record.estado??(currentPage==='mensajes'?'Enviado':record.activo===false?'Inactivo':'Activo');card.append(main,badge);
  const details=Object.entries(record).filter(([k,v])=>!['id','nombre','titulo','nombres','apellidos','matricula','clave','email','fecha','nombreSnapshot','estado','activo','passwordHash','destinatarioUsuarioId','tutorId','alumnoId','tipoEvento','eventoOrigenId','alcance','creadoPor','creadoEn','leidoEn'].includes(k)&&v!==null&&typeof v!=='object').slice(0,3).map(([k,v])=>`${prettyKey(k)}: ${v}`);const detail=details.join(' · ');if(detail){const small=document.createElement('span');small.className='data-detail';small.textContent=detail;card.append(small)}
  if(me?.rol==='direccion'&&currentPage==='boletas'&&record.publicada){const withdraw=document.createElement('button');withdraw.className='row-action';withdraw.textContent='Retirar publicación';withdraw.onclick=async()=>{if(!confirm('El alumno y sus tutores dejarán de ver esta boleta. ¿Deseas continuar?'))return;try{await api(`/api/boletas/${record.id}/retirar`,{method:'POST'});await loadPage(currentPage,labels[currentPage],document.querySelector('.nav-link.active'));}catch(error){alert(error.message)}};card.append(withdraw)}
  if(me?.rol==='direccion'&&currentPage==='backups'){const restore=document.createElement('button');restore.className='row-action';restore.textContent='Restaurar esta copia';restore.onclick=async()=>{if(!confirm('La restauración reemplazará todos los datos actuales con esta copia. ¿Deseas continuar?'))return;restore.disabled=true;try{await api('/api/backups/restaurar',{method:'POST',body:JSON.stringify({id:record.id})});alert('Copia restaurada correctamente.');location.reload();}catch(error){restore.disabled=false;alert(error.message)}};card.append(restore)}
  if(me?.rol==='direccion'&&currentPage==='solicitudes_cuenta'&&record.estado==='pendiente'){
    const resolve=document.createElement('section');resolve.className='account-resolution';
    const selectRecord=document.createElement('button');selectRecord.type='button';selectRecord.className='secondary';selectRecord.textContent='Elegir expediente para vincular';
    const chosen=document.createElement('p');chosen.className='form-note';chosen.setAttribute('role','status');chosen.textContent='Selecciona una ficha antes de aprobar.';
    const approve=document.createElement('button');approve.type='button';approve.textContent='Aprobar cuenta';approve.disabled=true;
    const reject=document.createElement('button');reject.type='button';reject.className='danger-action';reject.textContent='Rechazar';
    const status=document.createElement('span');status.className='form-note';status.setAttribute('role','status');
    let selectedPerson=null;
    selectRecord.onclick=async()=>{
      selectRecord.disabled=true;status.textContent='Cargando expedientes disponibles…';
      try{
        const candidates=await api(`/api/solicitudes_cuenta/${encodeURIComponent(record.id)}/candidatos`);
        if(!candidates.length){status.textContent='No hay expedientes activos sin cuenta para este tipo de usuario.';return;}
        status.textContent='';
        await openRecordPicker({title:`Seleccionar expediente de ${roleName[record.rolSolicitado]?.toLocaleLowerCase('es')??'la persona'}`,description:record.rolSolicitado==='alumno'?'Se muestran alumnos activos sin cuenta. Los que no coinciden con la especialidad se indican y no se pueden aprobar.':'Se muestran fichas activas sin una cuenta vinculada.',records:candidates,canSelect:item=>item.compatibleEspecialidad!==false,onSelect:person=>{selectedPerson=person;chosen.textContent=[pickerName(person),pickerDetails(person)].filter(Boolean).join(' · ');approve.disabled=false;status.textContent='Expediente seleccionado. Verifica los datos antes de aprobar.';}});
      }catch(error){status.textContent=error.message;}finally{selectRecord.disabled=false;}
    };
    approve.onclick=async()=>{if(!selectedPerson)return;approve.disabled=true;selectRecord.disabled=true;status.textContent='Aprobando cuenta…';try{await api(`/api/solicitudes_cuenta/${encodeURIComponent(record.id)}/resolver`,{method:'POST',body:JSON.stringify({decision:'aprobar',personaId:selectedPerson.id})});await loadPage(currentPage,labels[currentPage],document.querySelector('.nav-link.active'));}catch(error){status.textContent=error.message;approve.disabled=false;selectRecord.disabled=false;}};
    reject.onclick=async()=>{if(!confirm(`¿Rechazar la solicitud de ${record.email}?`))return;reject.disabled=true;try{await api(`/api/solicitudes_cuenta/${encodeURIComponent(record.id)}/resolver`,{method:'POST',body:JSON.stringify({decision:'rechazar'})});await loadPage(currentPage,labels[currentPage],document.querySelector('.nav-link.active'));}catch(error){status.textContent=error.message;reject.disabled=false;}};
    resolve.append(selectRecord,chosen,approve,reject,status);card.append(resolve);
  }
  if(me?.rol==='direccion'&&record.id&&['alumnos','avisos_escolares','mensajes'].includes(currentPage)){const remove=document.createElement('button');remove.className='row-action danger-action';remove.textContent='Eliminar';remove.onclick=async()=>{const message=currentPage==='alumnos'?'Se eliminará la ficha, la cuenta vinculada y sus inscripciones, vínculos familiares, asistencias, faltas, retardos, justificaciones, calificaciones, boletas y mensajes. Esta acción no se puede deshacer. ¿Continuar?':currentPage==='avisos_escolares'?'¿Eliminar este aviso de forma permanente?':'¿Eliminar este mensaje de forma permanente?';if(!confirm(message))return;remove.disabled=true;try{await api(`/api/${currentPage}/${encodeURIComponent(record.id)}`,{method:'DELETE'});await loadPage(currentPage,labels[currentPage],document.querySelector('.nav-link.active'));}catch(error){alert(error.message);remove.disabled=false}};card.append(remove)}
  if(currentPage==='mensajes'&&me?.rol!=='direccion'&&record.id){const remove=document.createElement('button');remove.className='row-action danger-action';remove.textContent='Eliminar de mi bandeja';remove.onclick=async()=>{if(!confirm('¿Eliminar este mensaje de tu bandeja?'))return;remove.disabled=true;try{await api(`/api/mensajes/${encodeURIComponent(record.id)}`,{method:'DELETE'});await loadPage('mensajes','Mensajes',document.querySelector('.nav-link.active'));}catch(error){alert(error.message);remove.disabled=false}};card.append(remove)}
  if(me?.rol==='direccion'&&currentPage==='jornadas'&&record.id){const remove=document.createElement('button');remove.className='row-action';remove.textContent='Borrar jornada';remove.onclick=async()=>{if(!confirm(`¿Borrar la jornada «${record.nombre}» del ${record.fecha}? Solo se podrá borrar si todavía no tiene entradas registradas.`))return;remove.disabled=true;try{await api(`/api/jornadas/${encodeURIComponent(record.id)}`,{method:'DELETE'});await loadPage('jornadas','Jornadas',document.querySelector('.nav-link.active'));}catch(error){alert(error.message);remove.disabled=false}};card.append(remove)}
  if(me?.rol==='direccion'&&record.id&&(forms[currentPage]||editOnly[currentPage])){const edit=document.createElement('button');edit.className='row-action';edit.textContent='Editar';edit.onclick=async()=>{editingId=record.id;$('#record-admin').classList.remove('hidden');await buildRecordForm(currentPage,record);$('#record-admin').scrollIntoView({behavior:'smooth',block:'center'});};card.append(edit)}
  if(me?.rol==='direccion'&&currentPage==='usuarios'){const reset=document.createElement('button');reset.className='row-action';reset.textContent='Restablecer acceso';reset.onclick=()=>selectAccountForPasswordReset(record);card.append(reset)}
  if(me?.rol==='direccion'&&record.id&&['usuarios',...Object.keys(forms)].includes(currentPage)){const toggle=document.createElement('button');toggle.className='row-action';toggle.textContent=currentPage==='relaciones_tutores'&&record.estado==='pendiente'?'Aprobar vínculo':record.activo===false||record.activa===false||record.publicado===false||record.estado==='cerrado'?'Reactivar':'Desactivar';toggle.onclick=async()=>{if(currentPage==='relaciones_tutores'&&record.estado==='pendiente'&&!confirm(`¿Aprobar el vínculo de ${record.tutorNombre??'este tutor'} con ${record.alumnoNombreSnapshot??'este alumno'}?`))return;toggle.disabled=true;try{await api(`/api/${currentPage}/${record.id}/estado`,{method:'PATCH'});await loadPage(currentPage,labels[currentPage]??'Registros',document.querySelector('.nav-link.active'));}catch(error){toggle.disabled=false;alert(error.message)}};card.append(toggle)}return card;
}
function prettyKey(key){return key.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase())}
for(const label of document.querySelectorAll('#account-form label,#settings-form label')){const field=label.querySelector('input,select,textarea'),hintText=field&&fieldGuides[field.name];if(hintText){const hint=document.createElement('small');hint.className='field-help';hint.textContent=hintText;label.append(hint);}}
for(const field of document.querySelectorAll('#reset-password-form input')){const hintText=fieldGuides[field.name];if(hintText){const hint=document.createElement('small');hint.className='field-help';hint.textContent=hintText;field.insertAdjacentElement('afterend',hint);}}
async function renderTutorLinkAction(){
  const box=actionBox('Vincular a un alumno','Busca con la matrícula y confirma el expediente encontrado. Por privacidad, no se muestran otros alumnos. Dirección revisará la solicitud antes de habilitar el acceso.');const form=document.createElement('form');form.className='inline-form';
  const matricula=document.createElement('input');matricula.name='matricula';matricula.placeholder='Matrícula del alumno';matricula.maxLength=40;matricula.required=true;
  const studentId=document.createElement('input');studentId.type='hidden';studentId.name='alumnoId';
  const selected=document.createElement('span');selected.className='form-note';selected.setAttribute('role','status');selected.textContent='Primero busca y confirma al alumno.';
  const search=document.createElement('button');search.type='button';search.className='secondary';search.textContent='Buscar expediente';
  const kin=document.createElement('select');kin.name='parentesco';kin.required=true;for(const value of ['Padre','Madre','Tutor legal','Encargado','Otro']){const option=document.createElement('option');option.value=value;option.textContent=value;kin.append(option)}
  const submit=document.createElement('button');submit.textContent='Solicitar vínculo';submit.disabled=true;
  search.onclick=async()=>{if(!matricula.value.trim()){selected.textContent='Escribe primero la matrícula.';return;}search.disabled=true;selected.textContent='Buscando expediente…';try{const item=await api(`/api/relaciones_tutores/alumno?matricula=${encodeURIComponent(matricula.value.trim())}`);await openRecordPicker({title:'Confirmar expediente del alumno',description:'Verifica que los datos correspondan al alumno que deseas vincular.',records:[item],onSelect:person=>{studentId.value=person.id;selected.textContent=[pickerName(person),pickerDetails(person)].filter(Boolean).join(' · ');submit.disabled=false;}});}catch(error){studentId.value='';submit.disabled=true;selected.textContent=error.message;}finally{search.disabled=false;}};
  matricula.addEventListener('input',()=>{studentId.value='';submit.disabled=true;selected.textContent='Busca de nuevo para confirmar el expediente.';});
  const note=document.createElement('span');note.className='form-note';note.setAttribute('role','status');
  form.append(matricula,search,selected,kin,submit,note);form.onsubmit=async e=>{e.preventDefault();if(!studentId.value)return;submit.disabled=true;try{const result=await api('/api/relaciones_tutores/vincular',{method:'POST',body:JSON.stringify({alumnoId:studentId.value,parentesco:kin.value})});note.textContent=result.mensaje;form.reset();studentId.value='';selected.textContent='Primero busca y confirma al alumno.';await showTutorLinks();}catch(error){note.textContent=error.message;submit.disabled=false;}};box.append(form);$('#list').append(box);await showTutorLinks();
}
async function showTutorLinks(){const heading=document.createElement('h3');heading.textContent='Mis alumnos vinculados y solicitudes';$('#list').append(heading);try{const records=await api('/api/mis-vinculos');if(!records.length){const p=document.createElement('p');p.className='muted';p.textContent='Todavía no has solicitado vínculos.';$('#list').append(p);return}$('#list').append(...records.map(record=>{const card=document.createElement('article');card.className='data-row';const main=document.createElement('div');main.className='data-row-main';const name=document.createElement('strong');name.textContent=record.alumnoNombre;const sub=document.createElement('span');sub.textContent=[record.matricula,record.parentesco].filter(Boolean).join(' · ');main.append(name,sub);const status=document.createElement('span');status.className='status-badge '+(record.activa?'activo':'pendiente');status.textContent=record.estado;card.append(main,status);return card}))}catch(error){const p=document.createElement('p');p.className='error-state';p.textContent=error.message;$('#list').append(p)}}
async function renderOrganization(areas,groups,terms){
  if(me?.rol!=='direccion')return;
  const intro=document.createElement('p');intro.className='form-intro';intro.textContent='Administra las áreas y sus grupos en una sola vista. Cada área muestra sus seis semestres como organización visual; el semestre no crea registros separados.';$('#list').append(intro);
  const areaBox=actionBox('Agregar área o especialidad','Registra aquí el nombre oficial que el alumno deberá elegir al solicitar su cuenta.');const areaForm=document.createElement('form');areaForm.className='inline-form';const areaName=document.createElement('input');areaName.name='nombre';areaName.placeholder='Nombre del área, por ejemplo Programación';areaName.required=true;const areaKey=document.createElement('input');areaKey.name='clave';areaKey.placeholder='Clave (opcional)';const areaSubmit=document.createElement('button');areaSubmit.textContent='Guardar área';areaForm.append(areaName,areaKey,areaSubmit);areaForm.onsubmit=async e=>{e.preventDefault();areaSubmit.disabled=true;try{await api('/api/especialidades',{method:'POST',body:JSON.stringify({nombre:areaName.value.trim(),clave:areaKey.value.trim(),activo:true})});await loadPage('organizacion',labels.organizacion,document.querySelector('.nav-link.active'));}catch(error){alert(error.message);areaSubmit.disabled=false}};areaBox.append(areaForm);$('#list').append(areaBox);
  const groupBox=actionBox('Agregar grupo','Elige un área y el semestre del 1 al 6 en que aparece el grupo.');const groupForm=document.createElement('form');groupForm.className='form-grid';const makeLabel=(title,control)=>{const label=document.createElement('label');label.append(document.createTextNode(title),control);return label};const groupName=document.createElement('input');groupName.name='nombre';groupName.placeholder='Ejemplo: 2A';groupName.required=true;const cycle=document.createElement('input');cycle.name='ciclo';cycle.placeholder='Ejemplo: 2026-2027';cycle.required=true;const areaSelect=document.createElement('select');areaSelect.name='especialidadId';areaSelect.required=true;for(const area of areas.filter(x=>x.activo!==false)){const o=document.createElement('option');o.value=area.id;o.textContent=area.nombre;areaSelect.append(o)}const semester=document.createElement('select');semester.name='semestre';semester.required=true;for(let i=1;i<=6;i++){const o=document.createElement('option');o.value=String(i);o.textContent=i+'° semestre';semester.append(o)}const submit=document.createElement('button');submit.textContent='Guardar grupo';groupForm.append(makeLabel('Nombre del grupo',groupName),makeLabel('Ciclo escolar',cycle),makeLabel('Área',areaSelect),makeLabel('Semestre visual',semester),submit);groupForm.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await api('/api/grupos',{method:'POST',body:JSON.stringify({nombre:groupName.value.trim(),ciclo:cycle.value.trim(),especialidadId:areaSelect.value,semestre:Number(semester.value),activo:true})});await loadPage('organizacion',labels.organizacion,document.querySelector('.nav-link.active'));}catch(error){alert(error.message);submit.disabled=false}};groupBox.append(groupForm);$('#list').append(groupBox);
  const wrap=document.createElement('div');wrap.className='organization-areas';for(const area of areas){const panel=document.createElement('section');panel.className='organization-area';const heading=document.createElement('div');heading.className='organization-area-heading';const h=document.createElement('h3');h.textContent=area.nombre;const count=document.createElement('span');count.textContent=groups.filter(g=>g.especialidadId===area.id).length+' grupos'+(area.activo===false?' · inactiva':'');const rename=document.createElement('button');rename.type='button';rename.className='row-action';rename.textContent='Renombrar área';rename.onclick=async()=>{const nombre=prompt('Nombre oficial del área:',area.nombre);if(!nombre?.trim())return;rename.disabled=true;try{await api('/api/especialidades/'+encodeURIComponent(area.id),{method:'PATCH',body:JSON.stringify({nombre:nombre.trim()})});await loadPage('organizacion',labels.organizacion,document.querySelector('.nav-link.active'));}catch(error){alert(error.message);rename.disabled=false}};const toggle=document.createElement('button');toggle.type='button';toggle.className='row-action';toggle.textContent=area.activo===false?'Reactivar área':'Desactivar área';toggle.onclick=async()=>{if(!confirm(area.activo===false?'¿Reactivar esta área para nuevos registros y solicitudes?':'¿Desactivar el área? Los alumnos y grupos existentes se conservarán.'))return;toggle.disabled=true;try{await api('/api/especialidades/'+encodeURIComponent(area.id)+'/estado',{method:'PATCH'});await loadPage('organizacion',labels.organizacion,document.querySelector('.nav-link.active'));}catch(error){alert(error.message);toggle.disabled=false}};heading.append(h,count,rename,toggle);panel.append(heading);const grid=document.createElement('div');grid.className='semester-grid';for(let n=1;n<=6;n++){const cell=document.createElement('section');cell.className='semester-card';const title=document.createElement('h4');title.textContent=n+'° semestre';const members=groups.filter(g=>g.especialidadId===area.id&&Number(g.semestre??(terms.find(t=>t.id===g.semestreId)?.orden))===n);const list=document.createElement('div');list.className='semester-groups';if(members.length)for(const group of members){const item=document.createElement('div');item.className='semester-group';const name=document.createElement('strong');name.textContent=group.nombre;const meta=document.createElement('span');meta.textContent=[group.grado?`Grado ${group.grado}`:'',group.ciclo].filter(Boolean).join(' · ');item.append(name,meta);const edit=document.createElement('button');edit.type='button';edit.className='row-action';edit.textContent='Editar';edit.onclick=async()=>{const newName=prompt('Nombre del grupo:',group.nombre);if(!newName?.trim())return;const newCycle=prompt('Ciclo escolar:',group.ciclo??'');if(!newCycle?.trim())return;const nextSemester=prompt('Semestre (1 a 6):',String(group.semestre??n));if(!nextSemester)return;const parsed=Number(nextSemester);if(!Number.isInteger(parsed)||parsed<1||parsed>6){alert('El semestre debe estar entre 1 y 6.');return}edit.disabled=true;try{await api('/api/grupos/'+encodeURIComponent(group.id),{method:'PATCH',body:JSON.stringify({nombre:newName.trim(),ciclo:newCycle.trim(),semestre:parsed})});await loadPage('organizacion',labels.organizacion,document.querySelector('.nav-link.active'));}catch(error){alert(error.message);edit.disabled=false}};item.append(edit);list.append(item)}else{const empty=document.createElement('span');empty.className='muted';empty.textContent='Sin grupos';list.append(empty)}cell.append(title,list);grid.append(cell)}panel.append(grid);wrap.append(panel)}if(!areas.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent='Agrega la primera área para comenzar.';wrap.append(empty)}$('#list').append(wrap);
}
function renderPagination(total,offset,pageSize=50){const bar=document.createElement('div');bar.className='pagination';const info=document.createElement('span');info.textContent=`${offset+1}–${Math.min(offset+pageSize,total)} de ${total}`;const back=document.createElement('button');back.className='secondary';back.textContent='Anterior';back.disabled=offset===0;back.onclick=()=>loadPage(currentPage,labels[currentPage]??'Información',document.querySelector('.nav-link.active'),Math.max(0,offset-pageSize));const next=document.createElement('button');next.className='secondary';next.textContent='Siguiente';next.disabled=offset+pageSize>=total;next.onclick=()=>loadPage(currentPage,labels[currentPage]??'Información',document.querySelector('.nav-link.active'),offset+pageSize);bar.append(info,back,next);$('#list').append(bar);}
const referenceCollections={alumnoId:'alumnos',tutorId:'tutores',maestroId:'maestros',grupoId:'grupos',materiaId:'materias',especialidadId:'especialidades',semestreId:'semestres',periodoId:'periodos_evaluacion',horarioId:'horarios'};
async function buildRecordForm(key,record=null){
  const definitions=forms[key]??editOnly[key];$('#record-title').textContent=`${record?'Editar':'Agregar'} ${labels[key].toLowerCase()}`;
  const form=$('#record-form');form.replaceChildren();const intro=document.createElement('p');intro.className='form-intro';intro.textContent=formGuides[key]??'Completa los datos del registro seleccionado. Los campos marcados son obligatorios.';form.append(intro);
  for(const [name,label,type='text'] of definitions){
    const collection=referenceCollections[name];
    if(collection){
      const wrap=document.createElement('div');wrap.className='record-picker-field';const caption=document.createElement('span');caption.textContent=label;const input=document.createElement('input');input.type='hidden';input.name=name;
      const choose=document.createElement('button');choose.type='button';choose.className='secondary';choose.textContent=`Seleccionar ${label.toLocaleLowerCase('es')}`;
      const selected=document.createElement('small');selected.className='field-help';selected.setAttribute('role','status');
      const setSelected=item=>{input.value=item.id;choose.textContent='Cambiar selección';selected.textContent=[pickerName(item),pickerDetails(item)].filter(Boolean).join(' · ');};
      if(record?.[name]){
        try{const params=new URLSearchParams({id:record[name],limit:'1'}),items=await api(`/api/${collection}?${params}`);if(items[0])setSelected(items[0]);else selected.textContent='El expediente asociado ya no está disponible.';}
        catch(error){selected.textContent=`No se pudo cargar el expediente: ${error.message}`;}
      }
      choose.onclick=()=>openRecordPicker({title:`Seleccionar ${label.toLocaleLowerCase('es')}`,collection,onSelect:setSelected});
      wrap.append(caption,input,choose,selected);form.append(wrap);continue;
    }
    const wrap=document.createElement('label');wrap.append(document.createTextNode(label));let input;
    if(type==='textarea'){input=document.createElement('textarea');input.rows=3;if(record)input.value=record[name]??'';}
    else if(type==='select'){input=document.createElement('select');const choices=name==='audiencia'?[['usuarios','Todos los usuarios'],['alumno','Alumnos'],['tutor','Padres de familia / tutores'],['maestro','Maestros']]:[];for(const [value,text] of choices){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option)}input.value=record?.[name]??'usuarios';}
    else if(type==='checkbox'){input=document.createElement('input');input.type='checkbox';input.checked=record?Boolean(record[name]):name==='activo'||name==='publicado';}
    else{input=document.createElement('input');input.type=type;if(record&&record[name]!==undefined)input.value=record[name];}
    input.name=name;if(type!=='checkbox'&&!['visibleHasta','desde','hasta','jornadas'].includes(name))input.required=true;wrap.append(input);const hintText=fieldGuides[name];if(hintText&&type!=='checkbox'){const hint=document.createElement('small');hint.className='field-help';hint.textContent=hintText;wrap.append(hint);}form.append(wrap);
  }
  const submit=document.createElement('button');submit.textContent=record?'Guardar cambios':'Guardar registro';submit.type='submit';form.append(submit);
  if(record){const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Cancelar edición';cancel.onclick=()=>{editingId=null;form.reset();$('#record-result').textContent='';};form.append(cancel);}
}
function actionBox(title,description){const box=document.createElement('section');box.className='action-box';const heading=document.createElement('div');heading.className='action-copy';const strong=document.createElement('strong');strong.textContent=title;const text=document.createElement('span');text.textContent=description;heading.append(strong,text);box.append(heading);return box;}
function renderStudentImportAction(){
  const box=actionBox('Importar alumnos desde CSV o Excel','Descarga la tabla CSV, agrega una fila por alumno y vuelve a cargarla. También puedes importar una hoja .xlsx. Las matrículas ya registradas se omiten sin sobrescribir datos.');
  const guide=document.createElement('p');guide.className='form-note';guide.textContent='Conserva estos encabezados: Nombres, Apellidos, Especialidad, Grado, Grupo, Matrícula, Semestre (1–6) y Ciclo. Puedes volver a subir el CSV de alumnos después de añadir filas: las matrículas existentes se reconocerán y se omitirán.';
  const table=document.createElement('table');table.className='import-example-table';const head=document.createElement('thead'),headRow=document.createElement('tr'),body=document.createElement('tbody'),exampleRow=document.createElement('tr');
  for(const value of ['Nombres','Apellidos','Especialidad','Grado','Grupo','Matrícula','Semestre','Ciclo']){const cell=document.createElement('th');cell.scope='col';cell.textContent=value;headRow.append(cell)}
  for(const value of ['Ana Sofía','López Pérez','Informática','2','A','QA-0001','3','2026-2027']){const cell=document.createElement('td');cell.textContent=value;exampleRow.append(cell)}
  head.append(headRow);body.append(exampleRow);table.append(head,body);
  const csvDownload=document.createElement('button');csvDownload.type='button';csvDownload.className='secondary';csvDownload.textContent='Descargar plantilla CSV';const csvStatus=document.createElement('span');csvStatus.className='form-note';
  const excelDownload=document.createElement('button');excelDownload.type='button';excelDownload.className='secondary';excelDownload.textContent='Descargar plantilla Excel';const excelStatus=document.createElement('span');excelStatus.className='form-note';
  const downloadTemplate=async(button,status,endpoint,filename)=>{button.disabled=true;status.textContent='Preparando plantilla…';try{const response=await fetch(endpoint,{headers:{authorization:`Bearer ${localStorage.getItem(tokenKey)}`}});if(!response.ok){const error=await response.json();throw new Error(error.error??'No se pudo descargar la plantilla.')}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Plantilla descargada.';}catch(error){status.textContent=error.message;}finally{button.disabled=false}};
  csvDownload.onclick=()=>downloadTemplate(csvDownload,csvStatus,'/api/alumnos/plantilla.csv','plantilla-alumnos.csv');
  excelDownload.onclick=()=>downloadTemplate(excelDownload,excelStatus,'/api/alumnos/plantilla.xlsx','plantilla-alumnos.xlsx');
  const form=document.createElement('form');form.className='inline-form';const fileLabel=document.createElement('label');fileLabel.textContent='Archivo CSV (.csv) o Excel (.xlsx)';const file=document.createElement('input');file.type='file';file.accept='.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';file.required=true;fileLabel.append(file);const submit=document.createElement('button');submit.type='submit';submit.textContent='Importar alumnos';const status=document.createElement('span');status.className='form-note';status.style.whiteSpace='pre-line';status.setAttribute('role','status');form.append(fileLabel,submit,status);
  form.onsubmit=async event=>{event.preventDefault();const selected=file.files[0];if(!selected)return;if(selected.size>5_000_000){status.textContent='El archivo no puede superar 5 MB.';return;}submit.disabled=true;status.textContent='Validando e importando…';try{const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('No se pudo leer el archivo seleccionado.'));reader.readAsDataURL(selected)});studentImportFeedback=await api('/api/alumnos/importar',{method:'POST',body:JSON.stringify({nombreArchivo:selected.name,contenido:String(dataUrl).split(',')[1]})});form.reset();await loadPage('alumnos',labels.alumnos,document.querySelector('.nav-link.active'));}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};
  box.append(guide,table,csvDownload,csvStatus,excelDownload,excelStatus,form);
  if(studentImportFeedback){const report=document.createElement('p');report.className='form-note';report.setAttribute('role','status');report.textContent=`Importación terminada: ${studentImportFeedback.importados} alumno(s) guardado(s), ${studentImportFeedback.omitidos} omitido(s).`;box.append(report);if(studentImportFeedback.duplicados?.length){const list=document.createElement('ul');for(const duplicate of studentImportFeedback.duplicados.slice(0,20)){const item=document.createElement('li');item.textContent=`Fila ${duplicate.fila}, matrícula ${duplicate.matricula}: ${duplicate.motivo}`;list.append(item)}box.append(list)}}
  $('#dashboard-content').append(box);
}
function renderBackupActions(){const box=actionBox('Respaldo íntegro','Las copias incluyen todas las colecciones y se validan con SHA-256.');const create=document.createElement('button');create.textContent='Crear copia ahora';const status=document.createElement('span');status.className='form-note';create.onclick=async()=>{create.disabled=true;try{const backup=await api('/api/backups',{method:'POST'});status.textContent=`Copia creada: ${backup.id}`;await loadPage('backups','Copias de seguridad',document.querySelector('.nav-link.active'));}catch(error){status.textContent=error.message;create.disabled=false}};box.append(create,status);$('#list').append(box);}
function renderExportAction(key){const box=actionBox('Exportación autorizada','Descarga los registros del módulo; si aplicaste un filtro de estado, se conservará en el archivo.');const button=document.createElement('button');button.className='secondary';button.textContent='Descargar CSV';const status=document.createElement('span');status.className='form-note';button.onclick=async()=>{button.disabled=true;try{const params=new URLSearchParams();if(me?.rol==='tutor'&&selectedFamilyStudent)params.set('alumnoId',selectedFamilyStudent);if(statusFilter)params.set('estado',statusFilter);const query=params.toString(),suffix=query?`?${query}`:'';const response=await fetch(`/api/exportar/${key}.csv${suffix}`,{headers:{authorization:`Bearer ${localStorage.getItem(tokenKey)}`}});if(!response.ok){const error=await response.json();throw new Error(error.error??'No se pudo exportar.')}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${key}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Archivo descargado.';}catch(error){status.textContent=error.message;}finally{button.disabled=false}};box.append(button,status);$('#list').prepend(box);}
function renderJourneyAction(){const box=actionBox('Habilitar jornada de entrada','El QR solo registra entradas dentro del horario configurado. Verifica que coincida con la hora real de llegada.');const form=document.createElement('form');form.className='inline-form';const date=document.createElement('input');date.type='date';date.name='fecha';date.value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());date.required=true;const start=document.createElement('input');start.type='time';start.name='abreEn';start.value='06:00';start.required=true;const end=document.createElement('input');end.type='time';end.name='cierraEn';end.value='15:00';end.required=true;const name=document.createElement('input');name.name='nombre';name.value='Jornada ordinaria';name.setAttribute('aria-label','Nombre de jornada');const submit=document.createElement('button');submit.textContent='Habilitar jornada';form.append(date,start,end,name,submit);form.onsubmit=async e=>{e.preventDefault();try{await api('/api/jornadas',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});await loadPage('jornadas','Jornadas',document.querySelector('.nav-link.active'));}catch(error){alert(error.message)}};box.append(form);$('#list').append(box);}
async function renderMessageAction(){const box=actionBox('Enviar mensaje','Elige si deseas enviar el mensaje a todos, a un grupo por tipo de cuenta o a una persona específica.');const form=document.createElement('form');form.className='form-grid';const toLabel=document.createElement('label');toLabel.append(document.createTextNode('Destinatario'));const to=document.createElement('select');to.name='destinatario';to.required=true;for(const [value,text] of [['todos_usuarios','Todos los usuarios'],['todos_alumnos','Todos los alumnos'],['todos_tutores','Padres de familia / tutores'],['todos_maestros','Todos los maestros']]){const option=document.createElement('option');option.value=value;option.textContent=text;to.append(option)}const individualGroup=document.createElement('optgroup');individualGroup.label='Una persona específica';try{const accounts=await api('/api/mensajes/destinatarios');for(const account of accounts){const option=document.createElement('option');option.value=account.id;option.textContent=account.nombre+' · '+account.email+' · '+account.rol;individualGroup.append(option)}to.append(individualGroup)}catch(error){const errorBox=document.createElement('p');errorBox.className='error-state';errorBox.textContent='No se pudo cargar la lista de usuarios: '+error.message;box.append(errorBox);$('#list').append(box);return;}toLabel.append(to);const subjectLabel=document.createElement('label');subjectLabel.append(document.createTextNode('Asunto'));const subject=document.createElement('input');subject.name='asunto';subject.maxLength=160;subject.required=true;subject.placeholder='Por ejemplo: Reunión de padres';subjectLabel.append(subject);const bodyLabel=document.createElement('label');bodyLabel.append(document.createTextNode('Mensaje'));const body=document.createElement('textarea');body.name='contenido';body.rows=4;body.maxLength=5000;body.required=true;body.placeholder='Escribe la información que deseas enviar';bodyLabel.append(body);const submit=document.createElement('button');submit.textContent='Enviar mensaje';const status=document.createElement('span');status.className='form-note';status.setAttribute('role','status');form.append(toLabel,subjectLabel,bodyLabel,submit,status);form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;status.textContent='Enviando…';try{const result=await api('/api/mensajes',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});const deliveryMessage=result.mensaje+' '+pushReportText(result.notificacionesPush);subject.value='';body.value='';await loadPage('mensajes','Mensajes',document.querySelector('.nav-link.active'));const deliveryNote=actionBox('Resultado del envío',deliveryMessage);$('#list').prepend(deliveryNote);}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};box.append(form);$('#list').append(box);}
async function renderCredentialScanner(){
  const box=actionBox('Escanear credencial de alumno','Escanea el QR impreso y compara los datos encontrados con el gafete físico. Solo Dirección puede registrar entradas desde este apartado.');
  const guide=document.createElement('p');guide.className='form-note';guide.textContent='Después de leer el QR, confirma que nombre, matrícula y grupo coincidan con el gafete. No se usa reconocimiento facial ni se captura una imagen del alumno.';
  const jornadaLabel=document.createElement('label');jornadaLabel.append(document.createTextNode('Jornada activa'));const jornadaSelect=document.createElement('select');jornadaSelect.required=true;jornadaLabel.append(jornadaSelect);
  const inputLabel=document.createElement('label');inputLabel.textContent='Contenido del QR de la credencial';const input=document.createElement('textarea');input.rows=2;input.autocomplete='off';input.placeholder='Escanea o pega el contenido del QR';inputLabel.append(input);
  const scanRow=document.createElement('div');scanRow.className='inline-form';const camera=document.createElement('button');camera.type='button';camera.className='secondary';camera.textContent='Abrir cámara';const search=document.createElement('button');search.type='button';search.textContent='Verificar QR';const status=document.createElement('span');status.className='form-note';status.setAttribute('role','status');const video=document.createElement('video');video.className='camera-preview hidden';video.autoplay=true;video.playsInline=true;video.muted=true;scanRow.append(camera,search,status,video);
  const result=document.createElement('div');result.className='credential-scan-result';
  box.append(guide,jornadaLabel,inputLabel,scanRow,result);$('#list').append(box);
  try{
    const jornadas=await api('/api/jornadas?limit=200');
    const todayForZone=zone=>new Intl.DateTimeFormat('en-CA',{timeZone:zone||'America/Guatemala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const current=jornadas.filter(item=>item.estado==='habilitada'&&item.fecha===todayForZone(item.zonaHoraria));
    for(const jornada of current){const option=document.createElement('option');option.value=jornada.id;option.textContent=`${jornada.nombre} · ${jornada.abreEn}–${jornada.cierraEn}`;jornadaSelect.append(option);}
    if(!current.length){jornadaSelect.disabled=true;input.disabled=true;camera.disabled=true;search.disabled=true;status.textContent='Primero habilita en Jornadas una jornada para hoy.';return;}
  }catch(error){jornadaSelect.disabled=true;input.disabled=true;camera.disabled=true;search.disabled=true;status.textContent=error.message;return;}
  let stream,scanTimer,detector;
  const stopCamera=()=>{clearTimeout(scanTimer);stream?.getTracks().forEach(track=>track.stop());stream=undefined;video.srcObject=null;video.classList.add('hidden');camera.textContent='Abrir cámara';};
  credentialScannerCleanup=stopCamera;
  const renderCandidate=({candidate,candidates,qr})=>{
    result.replaceChildren();
    const section=document.createElement('section');section.className='credential-candidate';
    const selectLabel=document.createElement('label');selectLabel.append(document.createTextNode(candidates.length>1?'Hay alumnos con el mismo nombre; compara el gafete y elige el expediente correcto.':'Alumno identificado'));
    const select=document.createElement('select');
    for(const item of candidates){const option=document.createElement('option');option.value=item.id;option.textContent=`${item.nombres} ${item.apellidos} · ${item.matricula}`;select.append(option);}
    select.value=candidate.id;selectLabel.append(select);section.append(selectLabel);
    const details=document.createElement('dl');details.className='credential-scan-details';section.append(details);
    const confirmLabel=document.createElement('label');const confirm=document.createElement('input');confirm.type='checkbox';const confirmText=document.createElement('span');confirmText.textContent='Confirmo que comparé los datos del sistema con el gafete físico del alumno.';confirmLabel.append(confirm,confirmText);
    const submit=document.createElement('button');submit.type='button';submit.textContent='Confirmar y registrar entrada';submit.disabled=true;
    const outcome=document.createElement('span');outcome.className='form-note';outcome.setAttribute('role','status');
    const showDetails=()=>{
      const current=candidates.find(item=>item.id===select.value);details.replaceChildren();
      for(const [label,value] of [['Nombre',[current?.nombres,current?.apellidos].filter(Boolean).join(' ')],['Matrícula',current?.matricula],['Especialidad',current?.especialidadNombre],['Grado',current?.grado],['Grupo',current?.grupoNombre],['Semestre',current?.semestre],['Ciclo',current?.ciclo]]){if(!value)continue;const term=document.createElement('dt');term.textContent=label;const description=document.createElement('dd');description.textContent=value;details.append(term,description);}
      const already=current?.yaRegistrada===true;confirm.checked=false;confirm.disabled=already;submit.disabled=true;outcome.textContent=already?'Este alumno ya tiene entrada registrada para esta jornada.':'Compara los datos con el gafete antes de confirmar.';
    };
    select.onchange=showDetails;confirm.onchange=()=>{submit.disabled=!confirm.checked||candidates.find(item=>item.id===select.value)?.yaRegistrada===true;};showDetails();
    submit.onclick=async()=>{submit.disabled=true;outcome.textContent='Registrando entrada…';try{const saved=await api('/api/asistencias/credencial/registrar',{method:'POST',body:JSON.stringify({qr,alumnoId:select.value,jornadaId:jornadaSelect.value,confirmacionVisual:confirm.checked})});outcome.textContent=saved.mensaje;status.textContent=`Entrada registrada: ${saved.asistencia.nombreSnapshot}.`;input.value='';confirm.checked=false;const updatedCandidates=candidates.map(item=>item.id===select.value?{...item,yaRegistrada:true}:item);await renderCandidate({candidate:updatedCandidates.find(item=>item.id===select.value),candidates:updatedCandidates,qr});}catch(error){outcome.textContent=error.message;submit.disabled=!confirm.checked;}};
    section.append(confirmLabel,submit,outcome);result.append(section);
  };
  const verifyQr=async()=>{
    const qr=input.value.trim();if(!qr){status.textContent='Escanea o pega el QR de una credencial.';return;}
    search.disabled=true;status.textContent='Verificando credencial…';result.replaceChildren();
    try{const data=await api('/api/asistencias/credencial/validar',{method:'POST',body:JSON.stringify({qr,jornadaId:jornadaSelect.value})});if(data.candidatos.length>1)status.textContent='Se encontraron varios expedientes con ese nombre.';else status.textContent='Credencial leída. Verifica los datos antes de registrar.';renderCandidate({candidate:data.candidatos[0],candidates:data.candidatos,qr});}
    catch(error){status.textContent=error.message;}
    finally{search.disabled=false;}
  };
  search.onclick=verifyQr;
  camera.onclick=async()=>{
    if(stream){stopCamera();status.textContent='Cámara cerrada.';return;}
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status.textContent='La cámara requiere abrir Genix-asis desde HTTPS.';return;}
    if(!('BarcodeDetector'in window)){status.textContent='Este navegador no tiene lector QR integrado. Usa un navegador compatible o pega aquí el contenido leído por otro lector QR.';return;}
    try{
      detector=new BarcodeDetector({formats:['qr_code']});stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});video.srcObject=stream;video.classList.remove('hidden');camera.textContent='Cerrar cámara';status.textContent='Buscando el QR…';await video.play();
      const scan=async()=>{if(!stream)return;if(video.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA&&video.videoWidth>0){try{const codes=await detector.detect(video);if(codes.length){input.value=codes[0].rawValue;stopCamera();await verifyQr();return;}}catch{status.textContent='No se pudo leer el QR. Mantén el gafete enfocado e inténtalo otra vez.';stopCamera();return;}}scanTimer=window.setTimeout(scan,150);};scan();
      stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(stream){stopCamera();status.textContent='La cámara se desconectó.';}},{once:true});
    }catch(error){const messages={NotAllowedError:'Permite el acceso a la cámara en los ajustes del navegador.',NotFoundError:'No se encontró una cámara disponible.',NotReadableError:'La cámara está ocupada por otra aplicación.'};status.textContent=messages[error?.name]??'No se pudo abrir la cámara.';stopCamera();}
  };
}
async function renderQrAction(){
  const box=actionBox('Código de entrada temporal','El QR permanece válido durante 10 minutos y se renueva antes de vencer.');
  const row=document.createElement('div');row.className='inline-form';
  const select=document.createElement('select');select.setAttribute('aria-label','Jornada');
  const refresh=document.createElement('button');refresh.textContent='Generar código';
  const result=document.createElement('div');result.className='qr-result';
  try{
    const days=await api('/api/jornadas');
    for(const day of days.filter(item=>item.estado==='habilitada')){
      const option=document.createElement('option');option.value=day.id;
      option.textContent=`${day.fecha} · ${day.nombre} · ${day.abreEn}–${day.cierraEn}`;select.append(option);
    }
    if(!select.options.length){select.innerHTML='<option value="">Primero habilita una jornada</option>';refresh.disabled=true;}
  }catch(error){result.textContent=error.message;refresh.disabled=true;}
  if(currentPage!=='qr_diarios')return;
  refresh.onclick=async()=>{
    clearTimeout(qrRotationTimer);
    try{
      const data=await api('/api/qr_diarios/renovar',{method:'POST',body:JSON.stringify({jornadaId:select.value})});
      result.replaceChildren();const {qrSvg}=await import('./qr.js');const image=document.createElement('img');
      image.className='qr-image';const qrLink=new URL('/',location.origin);qrLink.searchParams.set('qr',data.token);
      image.alt='Enlace QR para registrar la entrada desde el teléfono';
      image.src=URL.createObjectURL(new Blob([qrSvg(qrLink.href)],{type:'image/svg+xml'}));
      const code=document.createElement('code');code.className='qr-manual-code';code.textContent=data.token;
      const manualHint=document.createElement('span');manualHint.className='qr-manual-hint';manualHint.textContent='Si no puedes escanearlo, escribe estos 5 números.';
      const expiry=document.createElement('span');expiry.textContent=`Válido hasta ${new Date(data.expiraEn).toLocaleTimeString('es-GT')}.`;
      const copy=document.createElement('button');copy.className='secondary';copy.textContent='Copiar código';copy.onclick=()=>navigator.clipboard?.writeText(data.token);
      result.append(image,manualHint,code,expiry,copy);
      const refreshDelay=Math.max(1000,Date.parse(data.expiraEn)-Date.now()-10000);
      qrRotationTimer=setTimeout(()=>{if(currentPage==='qr_diarios')refresh.click()},refreshDelay);
    }catch(error){result.textContent=error.message;}
  };
  row.append(select,refresh);box.append(row,result);$('#list').append(box);renderLiveAttendance(select);
}
function renderLiveAttendance(journeySelect){
  const panel=actionBox('Entradas en tiempo real','Consulta los registros más recientes de la jornada. La lista se actualiza cada 15 segundos.');
  panel.classList.add('attendance-live-panel');
  const header=document.createElement('div');header.className='attendance-live-header';
  const summary=document.createElement('strong');summary.className='attendance-live-summary';summary.textContent='Selecciona una jornada habilitada.';
  const refresh=document.createElement('button');refresh.type='button';refresh.className='secondary';refresh.textContent='Actualizar ahora';
  header.append(summary,refresh);
  const status=document.createElement('p');status.className='attendance-live-status';status.setAttribute('role','status');
  const list=document.createElement('div');list.className='attendance-live-list';
  let loading=false;
  const update=async()=>{
    if(!journeySelect.value||loading)return;
    loading=true;refresh.disabled=true;
    try{
      const data=await api(`/api/asistencias/tiempo-real?jornadaId=${encodeURIComponent(journeySelect.value)}`);
      summary.textContent=`${data.total} ${data.total===1?'entrada registrada':'entradas registradas'}`;
      list.replaceChildren();
      if(!data.registros.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='Todavía no hay entradas para esta jornada.';list.append(empty);}
      for(const record of data.registros){
        const item=document.createElement('article');item.className='attendance-live-row';
        const identity=document.createElement('div');const name=document.createElement('strong');name.textContent=record.nombreSnapshot;const registration=document.createElement('span');registration.textContent=record.matricula?`Matrícula ${record.matricula}`:'Matrícula no disponible';identity.append(name,registration);
        const time=document.createElement('time');time.dateTime=record.horaServidor;time.textContent=record.horaServidor?new Date(record.horaServidor).toLocaleTimeString('es-GT',{timeZone:data.zonaHoraria,hour:'2-digit',minute:'2-digit'}):'Hora no disponible';
        item.append(identity,time);list.append(item);
      }
      status.textContent=`Actualizado ${new Date().toLocaleTimeString('es-GT',{timeZone:data.zonaHoraria,hour:'2-digit',minute:'2-digit'})}.`;
    }catch(error){status.textContent=error.message;}
    finally{loading=false;refresh.disabled=false;}
  };
  refresh.onclick=update;journeySelect.addEventListener('change',update);
  panel.append(header,status,list);$('#list').append(panel);
  void update();
  if(journeySelect.value)attendanceRefreshTimer=setInterval(()=>{if(currentPage==='qr_diarios'&&document.visibilityState==='visible')void update();},15000);
}
function renderAttendanceAction(){
  const box=actionBox('Registrar entrada','Escribe el código de cinco números o apunta la cámara al código QR.');
  const form=document.createElement('form');form.className='inline-form';
  const input=document.createElement('textarea');input.name='token';input.rows=2;input.placeholder='Código de 5 números o enlace QR';input.autocomplete='off';input.required=true;
  input.value=sessionStorage.getItem('pendingAttendanceQr')??'';
  const submit=document.createElement('button');submit.textContent='Registrar entrada';
  const camera=document.createElement('button');camera.type='button';camera.className='secondary';camera.textContent='Abrir cámara';
  const status=document.createElement('span');status.className='form-note';status.setAttribute('role','status');
  const video=document.createElement('video');video.className='camera-preview hidden';video.autoplay=true;video.playsInline=true;video.muted=true;
  let stream,scanTimer,detector,detectorErrors=0;
  const stopCamera=()=>{clearTimeout(scanTimer);stream?.getTracks().forEach(track=>track.stop());stream=undefined;video.srcObject=null;video.classList.add('hidden');camera.textContent='Abrir cámara';};
  const cameraError=error=>({
    NotAllowedError:'Permite el uso de la cámara para este sitio desde los ajustes de Chrome y vuelve a intentarlo.',
    NotFoundError:'No se encontró una cámara disponible en este teléfono.',
    NotReadableError:'La cámara está ocupada por otra aplicación. Ciérrala y vuelve a intentarlo.',
    OverconstrainedError:'No se pudo activar la cámara trasera. Comprueba los permisos e inténtalo de nuevo.',
    SecurityError:'La cámara requiere abrir Genix-asis mediante una conexión HTTPS segura.'
  }[error?.name]??'No se pudo abrir la cámara. Revisa los permisos del navegador e inténtalo de nuevo.');
  camera.onclick=async()=>{
    if(stream){stopCamera();status.textContent='Cámara cerrada.';return;}
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status.textContent='La cámara requiere abrir Genix-asis desde su dirección HTTPS segura.';return;}
    if(!('BarcodeDetector'in window)){status.textContent='Este navegador no tiene lector QR integrado. Abre la cámara normal del teléfono y apunta al QR; el enlace abrirá Genix-asis. También puedes pegar el código manualmente.';return;}
    try{
      detector=new BarcodeDetector({formats:['qr_code']});detectorErrors=0;
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
      video.srcObject=stream;video.classList.remove('hidden');camera.textContent='Cerrar cámara';status.textContent='Buscando el código QR…';
      await video.play();
      const scan=async()=>{
        if(!stream)return;
        if(video.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA&&video.videoWidth>0){
          try{
            const codes=await detector.detect(video);detectorErrors=0;
            if(codes.length){input.value=extractAttendanceToken(codes[0].rawValue);status.textContent='Código leído. Pulsa «Registrar entrada» para guardar la entrada.';stopCamera();return;}
          }catch(error){
            detectorErrors++;
            if(detectorErrors>=8){status.textContent='El navegador tuvo problemas al leer la imagen de la cámara. Comprueba que el QR esté enfocado y actualiza Chrome si continúa.';stopCamera();return;}
          }
        }
        scanTimer=window.setTimeout(scan,140);
      };
      scan();
      stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(stream){stopCamera();status.textContent='La cámara se desconectó. Vuelve a abrirla para escanear.';}},{once:true});
    }catch(error){status.textContent=cameraError(error);stopCamera();}
  };
  form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const token=extractAttendanceToken(input.value),data=await api('/api/asistencias/registrar',{method:'POST',body:JSON.stringify({token})});status.textContent=data.mensaje;input.value='';sessionStorage.removeItem('pendingAttendanceQr');}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};
  form.append(input,camera,submit,status,video);box.append(form);$('#list').append(box);
}
async function renderGradeCaptureAction(){
  const box=actionBox('Capturar calificación','Selecciona el grupo, el alumno, la materia asignada y el periodo. Solo aparecen opciones de tus clases.');
  const form=document.createElement('form');form.className='form-grid';const status=document.createElement('span');status.className='form-note';status.setAttribute('role','status');
  let options;
  try{options=await api('/api/calificaciones/opciones');}
  catch(error){const failure=document.createElement('p');failure.className='error-state';failure.textContent=error.message;box.append(failure);$('#list').append(box);return;}
  const group=createRecordChoice({name:'grupoId',label:'Grupo',records:options.grupos});
  const student=createRecordChoice({name:'alumnoId',label:'Alumno',records:[]});
  const subject=createRecordChoice({name:'materiaId',label:'Materia',records:[]});
  const period=createRecordChoice({name:'periodoId',label:'Periodo de evaluación',records:options.periodos});
  student.setRecords([]);subject.setRecords([]);
  group.button.onclick=()=>openRecordPicker({title:'Seleccionar grupo',records:options.grupos,onSelect:item=>{group.setSelected(item);student.setRecords(options.alumnos.filter(record=>record.grupoId===item.id));const assigned=new Set(options.asignaciones.filter(entry=>entry.grupoId===item.id).map(entry=>entry.materiaId));subject.setRecords(options.materias.filter(record=>assigned.has(record.id)));}});
  const resetChoices=()=>{group.input.value='';group.button.textContent='Seleccionar grupo';group.status.textContent='Selección obligatoria.';student.setRecords([]);subject.setRecords([]);};
  if(!options.grupos.length||!options.periodos.length){status.textContent='No hay grupos asignados o periodos abiertos para capturar calificaciones.';}
  const gradeLabel=document.createElement('label');gradeLabel.append(document.createTextNode('Calificación'));const grade=document.createElement('input');grade.name='valor';grade.type='number';grade.step='any';grade.min='0';grade.required=true;gradeLabel.append(grade);
  const submit=document.createElement('button');submit.textContent='Guardar nota';
  form.onsubmit=async event=>{event.preventDefault();if(!student.input.value||!group.input.value||!subject.input.value||!period.input.value){status.textContent='Selecciona grupo, alumno, materia y periodo antes de guardar.';return;}submit.disabled=true;status.textContent='Guardando…';try{await api('/api/calificaciones',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});status.textContent='Calificación guardada como borrador.';form.reset();resetChoices();period.input.value='';period.button.textContent='Seleccionar periodo de evaluación';period.status.textContent='Selección obligatoria.';}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};
  form.append(group.wrap,student.wrap,subject.wrap,period.wrap,gradeLabel,submit,status);box.append(form);$('#list').append(box);
}
function renderPublishAction(){
  const box=actionBox('Publicar boleta','Selecciona el expediente del alumno y el periodo. El alumno y sus tutores autorizados podrán consultar las calificaciones.');
  const form=document.createElement('form');form.className='form-grid';const student=createRecordChoice({name:'alumnoId',label:'Alumno',collection:'alumnos'}),period=createRecordChoice({name:'periodoId',label:'Periodo de evaluación',collection:'periodos_evaluacion'});
  const submit=document.createElement('button');submit.textContent='Publicar boleta';const status=document.createElement('span');status.className='form-note';status.setAttribute('role','status');
  form.onsubmit=async event=>{event.preventDefault();if(!student.input.value||!period.input.value){status.textContent='Selecciona alumno y periodo antes de publicar.';return;}submit.disabled=true;status.textContent='Publicando…';try{const result=await api('/api/boletas/publicar',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});status.textContent=`Boleta publicada · ${result.id}`;form.reset();}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};
  form.append(student.wrap,period.wrap,submit,status);box.append(form);$('#list').append(box);
}
function renderResolutionActions(records){for(const request of records.filter(x=>x.estado==='pendiente')){const box=actionBox(`Solicitud · ${request.tipo}`,request.motivo);for(const [decision,label] of [['autorizar','Autorizar'],['rechazar','Rechazar']]){const button=document.createElement('button');button.className=decision==='rechazar'?'secondary':'';button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await api(`/api/justificaciones/${request.id}/resolver`,{method:'POST',body:JSON.stringify({decision})});await loadPage('justificaciones','Justificaciones',document.querySelector('.nav-link.active'));}catch(error){button.disabled=false;alert(error.message)}};box.append(button)}$('#list').append(box)}}
function renderJustificationRequestAction(){
  const box=actionBox('Solicitar justificación','Selecciona la falta o el retardo del expediente y explica el motivo. Dirección revisará la solicitud.');
  const form=document.createElement('form');form.className='inline-form';const id=document.createElement('input');id.type='hidden';id.name='registroId';
  const choose=document.createElement('button');choose.type='button';choose.className='secondary';choose.textContent='Seleccionar falta o retardo';const selected=document.createElement('small');selected.className='field-help';selected.setAttribute('role','status');
  choose.onclick=async()=>{choose.disabled=true;selected.textContent='Cargando registros…';try{const params=new URLSearchParams({alumnoId:selectedFamilyStudent,limit:'200'}),[faults,delays]=await Promise.all([api(`/api/faltas?${params}`),api(`/api/retardos?${params}`)]);const records=[...faults.map(item=>({...item,nombre:`Falta · ${item.fecha??'sin fecha'}`,tipoRegistro:'falta'})),...delays.map(item=>({...item,nombre:`Retardo · ${item.fecha??'sin fecha'}`,tipoRegistro:'retardo'}))].filter(item=>!['justificada','justificado'].includes(item.estado));await openRecordPicker({title:'Seleccionar falta o retardo',description:'Elige el registro por fecha y estado.',records,onSelect:item=>{id.value=item.id;selected.textContent=[pickerName(item),pickerDetails(item)].filter(Boolean).join(' · ');}});if(!records.length)selected.textContent='No hay faltas o retardos pendientes para este expediente.';}catch(error){selected.textContent=error.message;}finally{choose.disabled=false;}};
  const reason=document.createElement('textarea');reason.name='motivo';reason.placeholder='Motivo de la solicitud';reason.required=true;reason.minLength=5;const submit=document.createElement('button');submit.textContent='Enviar solicitud';const status=document.createElement('span');status.className='form-note';status.setAttribute('role','status');
  form.onsubmit=async event=>{event.preventDefault();if(!id.value){status.textContent='Selecciona primero la falta o el retardo.';return;}const values=Object.fromEntries(new FormData(form));values.alumnoId=selectedFamilyStudent;submit.disabled=true;try{await api('/api/justificaciones',{method:'POST',body:JSON.stringify(values)});status.textContent='Solicitud enviada.';form.reset();selected.textContent='';}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};
  form.append(choose,selected,id,reason,submit,status);box.append(form);$('#list').append(box);
}
async function renderScheduleView(records){
  if(me?.rol==='maestro')await renderOpenListActions(records);
  const active=records.filter(record=>record.activo!==false&&record.grupoId);
  const groups=new Map();
  for(const record of active){if(!groups.has(record.grupoId))groups.set(record.grupoId,[]);groups.get(record.grupoId).push(record);}
  if(!groups.size&&me?.rol!=='direccion'){
    const empty=document.createElement('div');empty.className='empty-state';empty.innerHTML='<span class="empty-icon">◷</span><strong>Aún no hay horarios</strong><span>Los horarios asignados a tu expediente aparecerán aquí.</span>';$('#list').append(empty);
  }
  if(groups.size){
    const toolbar=document.createElement('div');toolbar.className='schedule-toolbar';const print=document.createElement('button');print.type='button';print.className='secondary schedule-print';print.textContent='Imprimir horarios';print.onclick=()=>{document.body.classList.add('printing-schedule');window.onafterprint=()=>document.body.classList.remove('printing-schedule');window.print();};toolbar.append(print);$('#list').append(toolbar);
  }
  const sortedGroups=[...groups.entries()].sort(([,a],[,b])=>(a[0].areaNombre??'').localeCompare(b[0].areaNombre??'','es')||(a[0].ciclo??'').localeCompare(b[0].ciclo??'','es')||(a[0].grupoNombre??'').localeCompare(b[0].grupoNombre??'','es'));
  for(const [,sessions] of sortedGroups){
    const first=sessions[0],sheet=document.createElement('section');sheet.className='schedule-sheet';
    const heading=document.createElement('header');heading.className='schedule-sheet-heading';
    const title=document.createElement('h3');title.textContent='HORARIO DE GRUPO';
    const metadata=document.createElement('div');metadata.className='schedule-metadata';
    for(const [label,value] of [['Área',first.areaNombre],['Ciclo',first.ciclo],['Semestre',first.semestreNombre],['Grupo',first.grupoNombre]]){
      if(!value)continue;const item=document.createElement('div');const caption=document.createElement('span');caption.textContent=label;const detail=document.createElement('strong');detail.textContent=String(value);item.append(caption,detail);metadata.append(item);
    }
    heading.append(title,metadata);sheet.append(heading);
    const days=[[1,'Lunes'],[2,'Martes'],[3,'Miércoles'],[4,'Jueves'],[5,'Viernes']];
    if(sessions.some(record=>Number(record.diaSemana)===0))days.unshift([0,'Domingo']);
    if(sessions.some(record=>Number(record.diaSemana)===6))days.push([6,'Sábado']);
    const subjects=new Map();
    for(const session of sessions){const key=`${session.materiaId??session.materiaNombre??'materia'}|${session.maestroId??session.maestroNombre??'maestro'}`;if(!subjects.has(key))subjects.set(key,[]);subjects.get(key).push(session);}
    const wrapper=document.createElement('div');wrapper.className='schedule-table-wrap';const table=document.createElement('table');table.className='schedule-table';
    const head=document.createElement('thead'),headerRow=document.createElement('tr');
    for(const label of ['Código','Asignatura','H','Catedráticos',...days.map(([,name])=>name)]){const cell=document.createElement('th');cell.scope='col';cell.textContent=label;headerRow.append(cell);}
    head.append(headerRow);const body=document.createElement('tbody');
    for(const subjectSessions of subjects.values()){
      const sample=subjectSessions[0],row=document.createElement('tr'),minutes=subjectSessions.reduce((total,session)=>{const start=Number(String(session.horaInicio??'').slice(0,2))*60+Number(String(session.horaInicio??'').slice(3,5)),end=Number(String(session.horaFin??'').slice(0,2))*60+Number(String(session.horaFin??'').slice(3,5));return Number.isFinite(start)&&Number.isFinite(end)&&end>start?total+end-start:total;},0);
      const code=document.createElement('td');code.textContent=sample.materiaClave||sample.materiaId||'—';
      const name=document.createElement('td');name.textContent=sample.materiaNombre||'Asignatura';
      const hours=document.createElement('td');hours.textContent=new Intl.NumberFormat('es-MX',{maximumFractionDigits:2}).format(minutes/60);
      const teacher=document.createElement('td');teacher.textContent=sample.maestroNombre||'Sin asignar';
      row.append(code,name,hours,teacher);
      for(const [day] of days){const cell=document.createElement('td');const matching=subjectSessions.filter(session=>Number(session.diaSemana)===day).sort((a,b)=>String(a.horaInicio).localeCompare(String(b.horaInicio)));for(const session of matching){const time=document.createElement('span');time.className='schedule-time';time.textContent=`${session.horaInicio}–${session.horaFin}${session.aula?` · ${session.aula}`:''}`;cell.append(time);}row.append(cell);}
      body.append(row);
    }
    table.append(head,body);wrapper.append(table);sheet.append(wrapper);$('#list').append(sheet);
  }
  if(me?.rol==='direccion'){
    if(!records.length){const empty=document.createElement('div');empty.className='empty-state';empty.innerHTML='<span class="empty-icon">◷</span><strong>Aún no hay horarios</strong><span>Los registros que correspondan aparecerán aquí.</span>';$('#list').append(empty);}
    if(records.length){const management=document.createElement('details');management.className='schedule-management';const summary=document.createElement('summary');summary.textContent=`Administrar sesiones individuales (${records.length})`;management.append(summary);const list=document.createElement('div');list.className='schedule-management-list';list.append(...records.map(record=>recordCard(record)));management.append(list);$('#list').append(management);}
  }
}
async function renderOpenListActions(records){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),weekday=new Date(`${today}T12:00:00Z`).getUTCDay();
  const schedules=records.filter(record=>record.id&&record.activo!==false&&record.horaInicio&&Number(record.diaSemana)===weekday&&(!record.desde||record.desde<=today)&&(!record.hasta||record.hasta>=today));
  const box=actionBox('Lista de asistencia','Solo se puede abrir desde una clase asignada para hoy y en una fecha lectiva.');
  if(!schedules.length){const note=document.createElement('span');note.className='form-note';note.textContent='No tienes clases programadas hoy. Las clases de otros días no permiten abrir una lista.';box.append(note);$('#list').prepend(box);return;}
  let existing;
  try{existing=await api(`/api/listas_asistencia?fecha=${encodeURIComponent(today)}&limit=200`);}
  catch(error){const failure=document.createElement('span');failure.className='error-state';failure.textContent=error.message;box.append(failure);$('#list').prepend(box);return;}
  for(const record of schedules){
    const list=existing.find(item=>item.horarioId===record.id);
    if(list){const status=document.createElement('span');status.className='form-note';status.textContent=`${record.horaInicio} · ${record.materiaNombre??'Clase'} · Lista ${list.estado==='abierta'?'abierta':'cerrada'}.`;box.append(status);continue;}
    const button=document.createElement('button');button.type='button';button.className='row-action';button.textContent=`Hacer lista · ${record.horaInicio} · ${record.materiaNombre??record.materiaId} · ${record.grupoNombre??'Grupo'}`;
    const status=document.createElement('span');status.className='form-note';status.setAttribute('role','status');
    button.onclick=async()=>{button.disabled=true;status.textContent='Abriendo lista…';try{await api('/api/listas_asistencia',{method:'POST',body:JSON.stringify({horarioId:record.id})});await loadPage('listas_asistencia','Listas de clase',document.querySelector('.nav-link.active'));}catch(error){status.textContent=error.message;button.disabled=false}};
    box.append(button,status);
  }
  $('#list').prepend(box);
}
function renderCloseListActions(records){for(const list of records.filter(x=>x.estado==='abierta')){const box=actionBox(`Cerrar lista · ${list.fecha}`,`Confirma presentes, retardos y ausencias para ${list.alumnos?.length??0} alumnos.`);const form=document.createElement('form');form.className='attendance-list';for(const student of list.alumnos??[]){const row=document.createElement('label');row.className='attendance-person';const name=document.createElement('span');name.textContent=student.nombreSnapshot;const select=document.createElement('select');select.name=student.alumnoId;for(const [value,label] of [['pendiente','Seleccionar estado'],['presente','Presente'],['retardo','Retardo'],['ausente','Ausente']]){const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=value==='pendiente';select.append(option)}row.append(name,select);form.append(row)}const submit=document.createElement('button');submit.textContent='Cerrar lista y guardar';const hint=document.createElement('span');hint.className='form-note';form.append(submit,hint);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;const alumnos=Array.from(form.querySelectorAll('select')).map(x=>({alumnoId:x.name,estado:x.value}));try{await api(`/api/listas_asistencia/${list.id}/cerrar`,{method:'POST',body:JSON.stringify({alumnos})});hint.textContent='Lista cerrada. Faltas y retardos quedaron guardados.';await loadPage('listas_asistencia','Listas de clase',document.querySelector('.nav-link.active'));}catch(error){hint.textContent=error.message;submit.disabled=false}};box.append(form);$('#list').append(box);}}
$('#login-form').addEventListener('submit',async event=>{event.preventDefault();$('#login-error').textContent='';const submit=event.currentTarget.querySelector('button');submit.disabled=true;try{const result=await api('/api/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))});localStorage.setItem(tokenKey,result.token);me=result.usuario;await showPortal(me);await submitPendingAttendance(me);}catch(error){$('#login-error').textContent=error.message;}finally{submit.disabled=false;}});
$('#push-notifications').addEventListener('click',enablePushNotifications);
$('#portal-menu-button').addEventListener('click',()=>setNavigationOpen(!$('#navigation-drawer').classList.contains('is-open')));
$('#close-navigation').addEventListener('click',()=>setNavigationOpen(false));
$('#nav-backdrop').addEventListener('click',()=>setNavigationOpen(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#navigation-drawer').classList.contains('is-open'))setNavigationOpen(false);});
$('#show-signup').onclick=()=>{$('#login').classList.add('hidden');$('#signup').classList.remove('hidden');$('#signup-result').textContent='';};
$('#cancel-signup').onclick=()=>{$('#signup').classList.add('hidden');$('#login').classList.remove('hidden');};
const recoveryNote=document.createElement('p');recoveryNote.className='form-note login-support';recoveryNote.textContent='¿Olvidaste tu contraseña? Solicita a Dirección que restablezca tu acceso.';$('#show-signup').insertAdjacentElement('afterend',recoveryNote);
async function loadSpecialtyChoices(){try{const areas=await api('/api/auth/especialidades');for(const id of ['signup-specialty-list','account-specialty-list']){const list=document.getElementById(id);if(list)list.replaceChildren(...areas.map(area=>{const option=document.createElement('option');option.value=area.nombre;return option}))}}catch(error){const status=$('#account-result');if(status)status.textContent=`No se pudieron cargar las especialidades: ${error.message}`;}}
loadSpecialtyChoices();
const signupRole=document.querySelector('#signup-form [name="rol"]'),signupMatricula=document.querySelector('#signup-form [name="matricula"]'),signupArea=document.querySelector('#signup-form [name="especialidad"]');
function syncSignupMatricula(){const isStudent=signupRole.value==='alumno';$('#signup-matricula-wrap').classList.toggle('hidden',!isStudent);$('#signup-especialidad-wrap').classList.toggle('hidden',!isStudent);signupMatricula.required=isStudent;signupArea.required=isStudent;}
signupRole.addEventListener('change',syncSignupMatricula);syncSignupMatricula();
const accountRole=document.querySelector('#account-form [name="rol"]'),accountForm=$('#account-form'),accountPersonId=accountForm.querySelector('[name="personaId"]'),accountPersonWrap=$('#account-persona-wrap'),accountMatriculaWrap=$('#account-matricula-wrap');
accountPersonWrap.className='record-picker-field hidden';
accountPersonWrap.replaceChildren();
const accountPersonCaption=document.createElement('span');accountPersonCaption.textContent='Expediente institucional';
const accountPersonStatus=document.createElement('small');accountPersonStatus.className='field-help';accountPersonStatus.setAttribute('role','status');accountPersonStatus.textContent='Selecciona una ficha activa que todavía no tenga cuenta.';
const accountPersonButton=document.createElement('button');accountPersonButton.type='button';accountPersonButton.className='secondary';accountPersonButton.textContent='Seleccionar expediente';accountPersonId.type='hidden';
accountPersonWrap.append(accountPersonCaption,accountPersonId,accountPersonButton,accountPersonStatus);
accountMatriculaWrap.classList.add('hidden');
accountForm.querySelector('[name="matricula"]').type='hidden';
let selectedAccountCandidate=null,lastAccountRole=accountRole.value;
function syncAccountFields(){
  const role=accountRole.value,needsPerson=role!=='direccion';
  if(role!==lastAccountRole){selectedAccountCandidate=null;accountPersonId.value='';accountPersonStatus.textContent='Selecciona una ficha activa que todavía no tenga cuenta.';accountPersonButton.textContent='Seleccionar expediente';lastAccountRole=role;}
  accountPersonWrap.classList.toggle('hidden',!needsPerson);
  $('#account-especialidad-wrap').classList.toggle('hidden',role!=='alumno');
  accountPersonId.required=false;
  accountForm.querySelector('[name="especialidad"]').required=role==='alumno';
}
accountRole.addEventListener('change',syncAccountFields);syncAccountFields();
accountPersonButton.onclick=()=>openRecordPicker({
  title:`Seleccionar expediente de ${roleName[accountRole.value]?.toLocaleLowerCase('es')??'la persona'}`,
  description:'Solo aparecen expedientes activos que aún no tienen una cuenta vinculada.',
  endpoint:`/api/personas-disponibles?rol=${encodeURIComponent(accountRole.value)}`,
  onSelect:person=>{selectedAccountCandidate=person;accountPersonId.value=person.id;accountPersonStatus.textContent=[person.nombre,pickerDetails(person)].filter(Boolean).join(' · ');accountPersonButton.textContent='Cambiar expediente';const nameField=accountForm.querySelector('[name="nombre"]');nameField.value=person.nombre;const specialty=accountForm.querySelector('[name="especialidad"]');if(accountRole.value==='alumno'&&person.especialidadNombre)specialty.value=person.especialidadNombre;}
});
const resetForm=$('#reset-password-form'),resetUserId=resetForm.querySelector('[name="userId"]');resetUserId.type='hidden';resetUserId.required=false;
const resetPickerButton=document.createElement('button');resetPickerButton.type='button';resetPickerButton.className='secondary';resetPickerButton.textContent='Seleccionar cuenta';const resetPickerStatus=document.createElement('span');resetPickerStatus.id='reset-account-selection';resetPickerStatus.className='form-note';resetPickerStatus.setAttribute('role','status');resetUserId.insertAdjacentElement('afterend',resetPickerButton);resetPickerButton.insertAdjacentElement('afterend',resetPickerStatus);
resetPickerButton.onclick=()=>openRecordPicker({title:'Seleccionar cuenta para restablecer',description:'Busca por nombre, correo o tipo de cuenta.',collection:'usuarios',onSelect:selectAccountForPasswordReset});
$('#signup-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,submit=form.querySelector('button[type="submit"]');submit.disabled=true;$('#signup-result').textContent='Enviando solicitud…';try{const payload=Object.fromEntries(new FormData(form));const result=await api('/api/auth/solicitudes',{method:'POST',body:JSON.stringify(payload)});$('#signup-result').textContent=result.mensaje;form.reset();syncSignupMatricula();}catch(error){$('#signup-result').textContent=error.message;}finally{submit.disabled=false;}});
$('#logout').onclick=()=>goLogin();$('#refresh').onclick=()=>loadPage(currentPage,labels[currentPage]??'Información',document.querySelector('.nav-link.active'));
let searchTimer;$('#record-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTerm=$('#record-search').value.trim();searchTimer=setTimeout(()=>loadPage(currentPage,labels[currentPage]??'Información',document.querySelector('.nav-link.active'),0),250);});
recordFilter.addEventListener('change',()=>{statusFilter=recordFilter.value;loadPage(currentPage,labels[currentPage]??'Información',document.querySelector('.nav-link.active'),0);});
$('#account-form').addEventListener('submit',async event=>{event.preventDefault();const formElement=event.currentTarget,submit=formElement.querySelector('button[type="submit"]'),values=Object.fromEntries(new FormData(formElement));if(values.rol!=='direccion'&&!values.personaId){$('#account-result').textContent='Selecciona el expediente que se vinculará con esta cuenta.';accountPersonButton.focus();return;}submit.disabled=true;$('#account-result').textContent='Creando cuenta…';try{await api('/api/usuarios',{method:'POST',body:JSON.stringify(values)});$('#account-result').textContent='Cuenta creada correctamente.';formElement.reset();selectedAccountCandidate=null;syncAccountFields();accountPersonStatus.textContent='Selecciona una ficha activa que todavía no tenga cuenta.';accountPersonButton.textContent='Seleccionar expediente';}catch(error){$('#account-result').textContent=error.message;}finally{submit.disabled=false;}});
$('#reset-password-form').addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));if(!values.userId){$('#reset-result').textContent='Selecciona primero la cuenta que deseas restablecer.';resetPickerButton.focus();return;}$('#reset-result').textContent='Actualizando…';try{await api(`/api/usuarios/${encodeURIComponent(values.userId)}/password`,{method:'PATCH',body:JSON.stringify({password:values.password})});$('#reset-result').textContent='Contraseña restablecida.';event.currentTarget.reset();resetUserId.value='';resetPickerStatus.textContent='';}catch(error){$('#reset-result').textContent=error.message;}});
$('#settings-form').addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));$('#settings-result').textContent='Guardando…';try{await api('/api/configuracion',{method:'PUT',body:JSON.stringify(values)});$('#settings-result').textContent='Configuración guardada.';}catch(error){$('#settings-result').textContent=error.message;}});
$('#record-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,submit=form.querySelector('button[type="submit"]'),record={};for(const [key,value] of new FormData(form))record[key]=value;const missingReference=[...form.querySelectorAll('input[type="hidden"][name]')].find(input=>referenceCollections[input.name]&&!input.value);if(missingReference){$('#record-result').textContent=`Selecciona ${missingReference.closest('.record-picker-field').querySelector('span').textContent.toLocaleLowerCase('es')} antes de guardar.`;missingReference.closest('.record-picker-field').querySelector('button').focus();return;}for(const input of form.querySelectorAll('input[type=checkbox]'))record[input.name]=input.checked;for(const key of ['orden','escalaMin','escalaMax','diaSemana'])if(key in record)record[key]=Number(record[key]);if('jornadas'in record)record.jornadas=record.jornadas.split(',').map(x=>x.trim()).filter(Boolean);const wasEditing=Boolean(editingId);$('#record-result').textContent='Guardando…';submit.disabled=true;try{const result=wasEditing?await api(`/api/${currentPage}/${encodeURIComponent(editingId)}`,{method:'PATCH',body:JSON.stringify(record)}):await api(`/api/${currentPage}`,{method:'POST',body:JSON.stringify(record)});const savedMessage=(wasEditing?'Cambios guardados.':'Registro guardado.')+(result.notificacionesPush?' '+pushReportText(result.notificacionesPush):'');editingId=null;form.reset();await loadPage(currentPage,labels[currentPage],document.querySelector('.nav-link.active'));$('#record-result').textContent=savedMessage;clearTimeout(recordStatusTimer);recordStatusTimer=setTimeout(()=>{$('#record-result').textContent='';},5000);}catch(error){$('#record-result').textContent=error.message;}finally{submit.disabled=false;}});
if(localStorage.getItem(tokenKey)){api('/api/auth/me').then(async user=>{me=user;await showPortal(user);await submitPendingAttendance(user);}).catch(()=>goLogin('Tu sesión venció. Inicia sesión nuevamente.'));}
