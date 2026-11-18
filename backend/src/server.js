import http from 'node:http';
import path from 'node:path';
import { readFile, stat, readdir } from 'node:fs/promises';
import { randomUUID, randomInt, randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import ExcelJS from 'exceljs';
import { COLLECTIONS } from './storage/json-storage.js';
import { createStorage } from './storage/create-storage.js';
import { createSession, readSession, verifyPassword, hashPassword } from './security.js';
import { sendPushNotifications } from './push.js';
import { sendScheduleReminders } from './schedule-reminders.js';

const env = process.env;
const port = Number(env.PORT ?? 3000);
const secret = env.SESSION_SECRET;
if (!secret || secret.length < 32) throw new Error('Falta SESSION_SECRET o tiene menos de 32 caracteres. Copia .env.example a .env, configura SESSION_SECRET y vuelve a ejecutar npm start.');
const root = path.resolve('frontend');
const storage = await createStorage(env);
const backupDir=path.resolve(env.BACKUP_DIR??'backups');
const roles = ['direccion', 'maestro', 'alumno', 'tutor'];
const loginFailures=new Map();
const signupFailures=new Map();
const attendanceFailures=new Map();
const createCollections = ['alumnos','maestros','tutores','relaciones_tutores','grupos','especialidades','semestres','materias','inscripciones','avisos_escolares','horarios','calendario_escolar','periodos_evaluacion'];
const securityHeaders={'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; form-action 'self'",'permissions-policy':'camera=(self), microphone=(), geolocation=()'};
const json = (res, status, value, headers={}) => { res.writeHead(status, { ...securityHeaders,...headers,'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
const todayAt = (zone='America/Guatemala') => new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fail = (status,message) => Object.assign(new Error(message),{status});
const safeEqual = (a,b) => { const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y); };
const hashQrToken = token => token.length===5 ? createHmac('sha256',secret).update(token).digest('hex') : createHash('sha256').update(token).digest('hex');
const normalizeActivationCode=value=>String(value??'').replace(/[^a-f0-9]/gi,'').toUpperCase();
const hashActivationCode=code=>createHmac('sha256',secret).update(code).digest('hex');
const createActivationCode=()=>randomBytes(8).toString('hex').toUpperCase();
const formatActivationCode=code=>code.match(/.{4}/g)?.join('-')??code;
const normalizeAreaName=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
const studentImportFields=['nombres','apellidos','especialidad','grado','grupo','matricula','semestre','ciclo'];
const studentCsvHeaders=['Nombres','Apellidos','Especialidad','Grado','Grupo','Matrícula','Semestre','Ciclo'];
const studentImportAliases={nombres:['nombres'],apellidos:['apellidos'],especialidad:['especialidad','especialidadnombre'],grado:['grado'],grupo:['grupo','gruponombre'],matricula:['matricula'],semestre:['semestre'],ciclo:['ciclo']};
const csvCell=value=>{let text=typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'');if(/^[=+\-@\t\r]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;};
function studentImportColumns(headerValues){
  const headers=new Map();
  for(let column=0;column<headerValues.length;column++){
    const header=normalizeAreaName(headerValues[column]).replace(/[^a-z0-9]/g,'');
    if(!header)continue;
    if(headers.has(header))throw fail(400,`El encabezado «${header}» está repetido.`);
    headers.set(header,column);
  }
  const columns={},missing=[];
  for(const field of studentImportFields){
    const matches=studentImportAliases[field].map(alias=>headers.get(alias)).filter(column=>column!==undefined);
    if(!matches.length)missing.push(field);
    else columns[field]=matches;
  }
  if(missing.length)throw fail(400,`Faltan columnas requeridas: ${missing.join(', ')}.`);
  return columns;
}
function importCellText(cell){
  const value=cell.value;
  if(value&&typeof value==='object'&&('formula'in value||'sharedFormula'in value))throw fail(400,'La plantilla no admite fórmulas; pega valores en las celdas antes de importar.');
  if(value&&typeof value==='object'&&Array.isArray(value.richText))return value.richText.map(part=>part.text??'').join('').trim();
  if(value&&typeof value==='object'&&typeof value.text==='string')return value.text.trim();
  return String(cell.text??value??'').trim();
}
async function parseStudentWorkbook(bytes){
  const workbook=new ExcelJS.Workbook();
  try{await workbook.xlsx.load(bytes);}catch{throw fail(400,'No se pudo leer el archivo. Guarda la hoja como Libro de Excel (.xlsx) e inténtalo de nuevo.');}
  const worksheet=workbook.worksheets[0];
  if(!worksheet)throw fail(400,'El archivo no contiene una hoja de cálculo.');
  if(worksheet.rowCount>5001)throw fail(413,'El archivo supera el límite de 5,000 filas.');
  const headerRow=worksheet.getRow(1),columns=studentImportColumns(Array.from({length:headerRow.cellCount},(_,index)=>importCellText(headerRow.getCell(index+1))));
  const rows=[];
  for(let rowNumber=2;rowNumber<=worksheet.rowCount;rowNumber++){
    const row=worksheet.getRow(rowNumber),record=Object.fromEntries(studentImportFields.map(field=>[field,columns[field].map(column=>importCellText(row.getCell(column+1))).find(Boolean)??'']));
    if(Object.values(record).every(value=>!value))continue;
    rows.push({...record,rowNumber});
  }
  if(!rows.length)throw fail(400,'La hoja no contiene alumnos para importar.');
  return rows;
}
function detectCsvDelimiter(text){
  let quoted=false;const counts={',':0,';':0};
  for(let index=0;index<text.length;index++){
    const character=text[index];
    if(quoted){if(character==='"'&&text[index+1]==='"')index++;else if(character==='"')quoted=false;continue;}
    if(character==='"'){quoted=true;continue;}
    if(character==='\r'||character==='\n')break;
    if(character in counts)counts[character]++;
  }
  return counts[';']>counts[',']?';':',';
}
function parseCsvRows(text,delimiter){
  const rows=[];let row=[],field='',quoted=false,afterQuote=false;
  const pushRow=()=>{row.push(field);rows.push(row);row=[];field='';afterQuote=false;if(rows.length>5001)throw fail(413,'El archivo supera el límite de 5,000 filas.');};
  for(let index=0;index<text.length;index++){
    const character=text[index];
    if(quoted){
      if(character==='"'){
        if(text[index+1]==='"'){field+='"';index++;}
        else{quoted=false;afterQuote=true;}
      }else field+=character;
      continue;
    }
    if(afterQuote){
      if(character===delimiter){row.push(field);field='';afterQuote=false;}
      else if(character==='\r'||character==='\n'){if(character==='\r'&&text[index+1]==='\n')index++;pushRow();}
      else if(character!==' '&&character!=='\t')throw fail(400,'El CSV tiene contenido no válido después de una celda entre comillas.');
      continue;
    }
    if(character==='"'){
      if(field)throw fail(400,'El CSV contiene comillas fuera de lugar.');
      quoted=true;
    }else if(character===delimiter){row.push(field);field='';}
    else if(character==='\r'||character==='\n'){if(character==='\r'&&text[index+1]==='\n')index++;pushRow();}
    else field+=character;
  }
  if(quoted)throw fail(400,'El CSV tiene una celda entre comillas sin cerrar.');
  if(field||row.length||afterQuote)pushRow();
  return rows;
}
function parseStudentCsv(bytes){
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail(400,'El CSV debe estar codificado como UTF-8.');}
  text=text.replace(/^\uFEFF/,'');
  const records=parseCsvRows(text,detectCsvDelimiter(text));
  if(!records.length)throw fail(400,'El CSV está vacío.');
  const columns=studentImportColumns(records[0]),rows=[];
  for(let index=1;index<records.length;index++){
    const record=Object.fromEntries(studentImportFields.map(field=>[field,columns[field].map(column=>String(records[index][column]??'').trim()).find(Boolean)??'']));
    if(Object.values(record).every(value=>!value))continue;
    rows.push({...record,rowNumber:index+1});
  }
  if(!rows.length)throw fail(400,'El CSV no contiene alumnos para importar.');
  return rows;
}
function validateStudentRows(rows){
  const validRows=[],errors=[];
  for(const row of rows){
    const record=Object.fromEntries(studentImportFields.map(field=>[field,String(row[field]??'').trim()]));
    const issues=[];
    for(const field of ['nombres','apellidos','especialidad','grado','grupo','matricula','ciclo']){
      const max=field==='matricula'?40:120;
      if(!record[field])issues.push(`${field} es obligatorio`);
      else if(record[field].length>max)issues.push(`${field} excede ${max} caracteres`);
    }
    const semester=Number(record.semestre);
    if(!Number.isInteger(semester)||semester<1||semester>6)issues.push('semestre debe ser un número entero del 1 al 6');
    if(issues.length)errors.push(`Fila ${row.rowNumber}: ${issues.join('; ')}.`);
    else validRows.push({...record,semestre:semester,rowNumber:row.rowNumber});
  }
  return{rows:validRows,errors};
}
function parseCredentialQr(value){
  if(typeof value!=='string'||value.trim().length>2000)throw fail(400,'El QR de credencial no es válido.');
  const raw=value.trim(),matriculaMatch=raw.match(/^(?:GENIX|DGETI)\|ALUMNO\|(.+)$/i);
  if(matriculaMatch){
    const matricula=matriculaMatch[1].trim();
    if(!matricula||matricula.length>40)throw fail(400,'La matrícula del QR no es válida.');
    return{tipo:'matricula',matricula};
  }
  let credential;
  try{credential=JSON.parse(raw);}catch{throw fail(400,'El QR no coincide con una credencial de alumno reconocida.');}
  if(!credential||typeof credential!=='object'||Array.isArray(credential)||credential.tipo!=='alumno'||typeof credential.credentialId!=='string'||!/^[a-f0-9]{32}$/i.test(credential.credentialId)||typeof credential.nombre!=='string'||!credential.nombre.trim()||credential.nombre.trim().length>240)throw fail(400,'El QR no contiene una credencial de alumno válida.');
  return{tipo:'aurex',credentialId:credential.credentialId.toLowerCase(),nombre:credential.nombre.trim()};
}
function matchCredentialStudents(students,credential){
  const active=students.filter(student=>student.activo!==false);
  if(credential.tipo==='matricula')return active.filter(student=>normalizeAreaName(student.matricula)===normalizeAreaName(credential.matricula));
  const qrName=normalizeAreaName(credential.nombre);
  return active.filter(student=>normalizeAreaName([student.nombres,student.apellidos].filter(Boolean).join(' '))===qrName);
}
function validateFields(collection, record){
  const required={alumnos:['nombres','apellidos','matricula'],maestros:['nombres','apellidos'],tutores:['nombres','apellidos'],relaciones_tutores:['tutorId','alumnoId','parentesco'],grupos:['nombre','ciclo'],especialidades:['nombre'],semestres:['nombre'],materias:['nombre'],inscripciones:['alumnoId','grupoId','ciclo'],avisos_escolares:['titulo','contenido'],horarios:['diaSemana','horaInicio','horaFin','materiaId','maestroId','grupoId'],calendario_escolar:['fecha','tipo'],periodos_evaluacion:['nombre','iniciaEn','terminaEn']}[collection]??[];
  for(const key of required)if(record[key]===undefined||record[key]===null||record[key]==='')throw fail(400,`El campo ${key} es obligatorio.`);
  if(collection==='alumnos'&&String(record.matricula).length>40)throw fail(400,'La matrícula no puede exceder 40 caracteres.');
  if(collection==='horarios'&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(record.horaInicio)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(record.horaFin)||record.horaInicio>=record.horaFin||!Number.isInteger(Number(record.diaSemana))||Number(record.diaSemana)<0||Number(record.diaSemana)>6))throw fail(400,'El horario debe indicar día de 0 a 6 y horas válidas.');
  if(collection==='calendario_escolar'&&!/^\d{4}-\d{2}-\d{2}$/.test(record.fecha))throw fail(400,'La fecha debe usar el formato AAAA-MM-DD.');
  if(collection==='calendario_escolar'&&!['lectivo','clases','festivo','suspension','sin_clases','evento','evaluacion','jornada_especial'].includes(String(record.tipo).toLowerCase()))throw fail(400,'El tipo de día del calendario no es válido.');
  if(collection==='relaciones_tutores'&&typeof record.activa==='undefined')record.activa=true;
  if(collection==='inscripciones'&&typeof record.estado==='undefined')record.estado='activa';
  if(collection==='alumnos'||collection==='maestros'||collection==='tutores'||collection==='grupos'||collection==='especialidades'||collection==='semestres'||collection==='materias')if(typeof record.activo==='undefined')record.activo=true;
  if(collection==='periodos_evaluacion'&&record.iniciaEn>record.terminaEn)throw fail(400,'El periodo debe terminar después de su fecha de inicio.');
}
async function authorizedRecords(collection,user,selectedStudentId=null){
  const records=await storage.read(collection);
  if(user.rol==='direccion')return collection==='usuarios'?records.map(({passwordHash,...safe})=>safe):records;
  if(collection==='avisos_escolares')return records.filter(x=>x.publicado===true&&(!x.audiencia||x.audiencia==='usuarios'||x.audiencia===user.rol));
  if(user.rol==='alumno'){
    if(collection==='permisos')return records.filter(x=>x.alumnoId===user.personaId&&x.estado==='autorizado').map(({fotoCredencial,firmaTutor,...permit})=>permit);
    if(collection==='mensajes')return records.filter(x=>x.destinatarioUsuarioId===user.id);
    if(collection==='boletas')return records.filter(x=>x.alumnoId===user.personaId&&x.publicada===true);
    if(collection==='calificaciones'){const ids=new Set((await storage.read('boletas')).filter(x=>x.alumnoId===user.personaId&&x.publicada).flatMap(x=>x.referenciasCalificacionIds??[]));return records.filter(x=>x.alumnoId===user.personaId&&ids.has(x.id));}
    if(collection==='horarios'){
      const ins=(await storage.read('inscripciones')).filter(x=>x.alumnoId===user.personaId&&x.estado==='activa');const groups=new Set(ins.map(x=>x.grupoId));return records.filter(x=>x.activo!==false&&groups.has(x.grupoId));
    }
    return records.filter(x=>x.alumnoId===user.personaId);
  }
  if(user.rol==='tutor'){
    const links=(await storage.read('relaciones_tutores')).filter(x=>x.tutorId===user.personaId&&x.activa);
    const ids=new Set(links.map(x=>x.alumnoId));if(selectedStudentId&&ids.has(selectedStudentId)){ids.clear();ids.add(selectedStudentId);}
    if(collection==='permisos')return records.filter(x=>ids.has(x.alumnoId));
    if(collection==='boletas')return records.filter(x=>ids.has(x.alumnoId)&&x.publicada===true);
    if(collection==='calificaciones'){const published=new Set((await storage.read('boletas')).filter(x=>ids.has(x.alumnoId)&&x.publicada).flatMap(x=>x.referenciasCalificacionIds??[]));return records.filter(x=>ids.has(x.alumnoId)&&published.has(x.id));}
    if(collection==='mensajes')return records.filter(x=>x.destinatarioUsuarioId===user.id);
    if(['asistencias','faltas','retardos','justificaciones'].includes(collection))return records.filter(x=>ids.has(x.alumnoId)&&(!x.tutorId||x.tutorId===user.personaId));
    if(collection==='horarios'){
      const ins=(await storage.read('inscripciones')).filter(x=>ids.has(x.alumnoId)&&x.estado==='activa');const groups=new Set(ins.map(x=>x.grupoId));return records.filter(x=>x.activo!==false&&groups.has(x.grupoId));
    }
    return [];
  }
  if(user.rol==='maestro'){
    if(collection==='mensajes')return records.filter(x=>x.destinatarioUsuarioId===user.id);
    if(['horarios','listas_asistencia','faltas','retardos','calificaciones'].includes(collection))return records.filter(x=>x.activo!==false&&x.maestroId===user.personaId);
    return [];
  }
  return [];
}
async function body(req, maxLength=4_000_000) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > maxLength) throw Object.assign(new Error('Solicitud demasiado grande'), { status: 413 }); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}
async function currentUser(req) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const id = readSession(token, secret);
  if (!id) return null;
  return (await storage.read('usuarios')).find(u => u.id === id && u.activo) ?? null;
}
async function audit(user, accion, entidad) {
  await storage.update('auditoria', rows => [...rows, { id: randomUUID(), usuarioId: user.id, accion, entidad, creadoEn: new Date().toISOString() }]);
}
async function auditLogin(email, user, resultado) {
  const record = { id: randomUUID(), usuarioId: user?.id ?? null, accion: resultado === 'correcto' ? 'inicio_sesion_correcto' : 'inicio_sesion_fallido', entidad: 'autenticacion', email: email.slice(0, 254), resultado, creadoEn: new Date().toISOString() };
  await storage.update('auditoria', rows => [...rows, record].slice(-5000));
}
function timeAt(date,zone){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return `${parts.find(x=>x.type==='hour').value}:${parts.find(x=>x.type==='minute').value}`;}
function requireCurrentOpenJornada(jornadas,jornadaId){
  const jornada=jornadas.find(item=>item.id===jornadaId&&item.estado==='habilitada');
  if(!jornada)throw fail(409,'No hay una jornada habilitada seleccionada.');
  if(jornada.fecha!==todayAt(jornada.zonaHoraria))throw fail(409,'La jornada seleccionada no corresponde a la fecha actual.');
  const localTime=timeAt(new Date(),jornada.zonaHoraria);
  if(localTime<jornada.abreEn||localTime>jornada.cierraEn)throw fail(409,`La jornada permite entradas de ${jornada.abreEn} a ${jornada.cierraEn} (${jornada.zonaHoraria}); ahora son las ${localTime}.`);
  return jornada;
}
async function generateDailyMessages(date=todayAt()){
  const [links,students,faults,delays,justifications,notifications,accounts]=await Promise.all(['relaciones_tutores','alumnos','faltas','retardos','justificaciones','notificaciones','usuarios'].map(name=>storage.read(name)));
  const existing=new Set(notifications.map(x=>x.claveIdempotencia));const newNotifications=[],newMessages=[];
  for(const link of links.filter(x=>x.activa)){
    const student=students.find(x=>x.id===link.alumnoId);if(!student)continue;
    const absent=faults.filter(x=>x.alumnoId===student.id&&x.fecha===date&&x.estado==='confirmada');const late=delays.filter(x=>x.alumnoId===student.id&&x.fecha===date&&x.estado!=='anulado');if(!absent.length&&!late.length)continue;
    const key=`resumen:${date}:${link.tutorId}:${student.id}`;if(existing.has(key))continue;
    const tutorUser=accounts.find(x=>x.rol==='tutor'&&x.personaId===link.tutorId&&x.activo);if(!tutorUser)continue;
    const subject=[student.nombres,student.apellidos].filter(Boolean).join(' ');const subjects=absent.map(x=>x.materiaNombre??x.materiaSnapshot??x.materiaId).filter(Boolean);const just=justifications.filter(x=>x.alumnoId===student.id&&absent.some(f=>f.id===x.registroId));
    const text=`Resumen de ${date}: ${subject}. Faltó a ${absent.length} clase(s)${subjects.length?`: ${subjects.join(', ')}`:''}. Retardos registrados: ${late.length}. Justificaciones: ${just.length?just.map(x=>x.estado).join(', '):'sin solicitudes registradas'}.`;
    const notification={id:randomUUID(),claveIdempotencia:key,tutorId:link.tutorId,alumnoId:student.id,estado:'generada',creadaEn:new Date().toISOString()};
    newNotifications.push(notification);newMessages.push({id:randomUUID(),notificacionId:notification.id,destinatarioUsuarioId:tutorUser.id,tutorId:link.tutorId,alumnoId:student.id,asunto:`Resumen escolar · ${subject}`,contenido:text,creadoEn:new Date().toISOString(),leidoEn:null});existing.add(key);
  }
  if(newNotifications.length)await storage.transact([{collection:'notificaciones',upsert:newNotifications},{collection:'mensajes',upsert:newMessages}]);
  return newNotifications.length;
}
let schedulerBusy=false;
async function notifyPublishedAnnouncement(announcement) {
  const audience=announcement.audiencia??'usuarios';const recipients=(await storage.read('usuarios')).filter(account=>account.activo&&(audience==='usuarios'||account.rol===audience));
  return sendPushNotifications(storage,recipients.map(account=>account.id),{id:announcement.id,asunto:announcement.titulo,tipo:'aviso'},env);
}
async function notifyTutorsOfStudentEvent(studentId,event){
  try{
    const [links,students,accounts,subjects]=await Promise.all(['relaciones_tutores','alumnos','usuarios','materias'].map(name=>storage.read(name)));
    const student=students.find(item=>item.id===studentId);if(!student)return;
    const tutorIds=new Set(links.filter(link=>link.alumnoId===studentId&&link.activa===true).map(link=>link.tutorId));if(!tutorIds.size)return;
    const tutors=accounts.filter(account=>account.activo&&account.rol==='tutor'&&tutorIds.has(account.personaId));if(!tutors.length)return;
    const name=[student.nombres,student.apellidos].filter(Boolean).join(' ')||student.nombre||'El alumno';const when=new Date(event.at??Date.now()).toLocaleString('es-GT',{timeZone:'America/Guatemala',dateStyle:'short',timeStyle:'short'});
    const title=event.tipo==='llegada'?'Llegada a la escuela':'Falta registrada';const materia=subjects.find(item=>item.id===event.materiaNombre)?.nombre??event.materiaNombre??'una clase';
    const content=event.tipo==='llegada'?name+' registró su entrada a la escuela el '+when+'.':name+' tiene una falta registrada en '+materia+' el '+when+'.';
    let created=[];
    await storage.update('mensajes',rows=>{created=tutors.filter(account=>!rows.some(row=>row.destinatarioUsuarioId===account.id&&row.eventoOrigenId===event.id)).map(account=>({id:randomUUID(),destinatarioUsuarioId:account.id,destinatarioNombre:account.nombre,tutorId:account.personaId,alumnoId:student.id,tipoEvento:event.tipo,eventoOrigenId:event.id,alcance:'evento_escolar',asunto:title,contenido:content,creadoEn:new Date().toISOString(),leidoEn:null}));return created.length?[...rows,...created]:rows;});
    await Promise.all(created.map(async message=>{try{await sendPushNotifications(storage,[message.destinatarioUsuarioId],{id:message.id,asunto:title,detalle:content,tipo:event.tipo},env)}catch(error){console.error('No se pudo enviar el aviso al tutor:',error.message)}}));
  }catch(error){console.error('No se pudo guardar el aviso del tutor:',error.message)}
}
async function runScheduledJobs(){if(schedulerBusy)return;schedulerBusy=true;try{
  const settings=(await storage.read('configuracion'))[0]??{},zone=settings.zonaHoraria??'America/Guatemala',today=todayAt(zone),summaryAt=settings.horaResumenDiario??'17:00';
  await sendScheduleReminders(storage,{timeZone:zone,env});
  const prior=new Date(`${today}T12:00:00Z`);prior.setUTCDate(prior.getUTCDate()-1);await generateDailyMessages(prior.toISOString().slice(0,10));
  if(timeAt(new Date(),zone)>=summaryAt)await generateDailyMessages(today);
  if(timeAt(new Date(),zone)==='02:00'){
    const dirs=await readdir(backupDir,{withFileTypes:true}).catch(()=>[]);const date=new Date().toISOString().slice(0,10);
    if(!dirs.some(x=>x.isDirectory()&&x.name.startsWith(date))){await storage.backup(backupDir);await storage.pruneBackups(backupDir,Number(settings.retencionBackups??30));}
  }
}catch(error){console.error('Tarea programada falló:',error.message);}finally{schedulerBusy=false;}}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { estado: 'disponible' });
    if (req.method === 'GET' && url.pathname === '/api/auth/especialidades') return json(res,200,(await storage.read('especialidades')).filter(x=>x.activo!==false).map(({id,nombre})=>({id,nombre})));
    if (req.method === 'POST' && url.pathname === '/api/auth/solicitudes') {
      const ip=req.socket.remoteAddress??'local',now=Date.now(),attempts=signupFailures.get(ip);if(attempts&&attempts.until>now&&attempts.count>=5)return json(res,429,{error:'Se alcanzó el límite de solicitudes. Intenta de nuevo más tarde.'});if(!attempts||attempts.until<=now)signupFailures.set(ip,{count:0,until:now+15*60_000});
      const input=await body(req),nombre=typeof input.nombre==='string'?input.nombre.trim():'',email=typeof input.email==='string'?input.email.trim().toLowerCase():'',password=input.password,rolSolicitado=input.rol,matricula=typeof input.matricula==='string'?input.matricula.trim():'',activationCode=typeof input.codigoActivacion==='string'?normalizeActivationCode(input.codigoActivacion):'';
      if(nombre.length<2||nombre.length>120||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>200||!['alumno','maestro','tutor'].includes(rolSolicitado)||(rolSolicitado==='alumno'&&(!matricula||matricula.length>40||typeof input.especialidad!=='string'||!input.especialidad.trim())))return json(res,400,{error:'Completa nombre, correo, tipo de cuenta, matrícula y especialidad si eres alumno, y una contraseña de 12 caracteres o más.'});
      let especialidad=null;if(rolSolicitado==='alumno'){especialidad=(await storage.read('especialidades')).find(x=>x.activo!==false&&normalizeAreaName(x.nombre)===normalizeAreaName(input.especialidad));if(!especialidad)return json(res,400,{error:'La especialidad no coincide con un área activa. Revisa el nombre registrado con la institución.'});}
      const attemptState=signupFailures.get(ip);signupFailures.set(ip,{...attemptState,count:attemptState.count+1});
      const request={id:randomUUID(),nombre,email,rolSolicitado,...(rolSolicitado==='alumno'?{matricula,especialidadId:especialidad.id,especialidadNombre:especialidad.nombre}:{}),passwordHash:await hashPassword(password),estado:'pendiente',creadoEn:new Date().toISOString()};
      if(rolSolicitado==='alumno'&&input.codigoActivacion){
        if(activationCode.length!==16)return json(res,400,{error:'El código o los datos no coinciden con un expediente activo. Contacta a Dirección.'});
        let approvedUser=null,resolvedRequest=null;
        await storage.backup(backupDir);
        await storage.transact(async read=>{
          const [accounts,requests,codes,students,areas,groups,enrollments]=await Promise.all([read('usuarios'),read('solicitudes_cuenta'),read('codigos_activacion'),read('alumnos'),read('especialidades'),read('grupos'),read('inscripciones')]);
          if(accounts.some(item=>item.email===email)||requests.some(item=>item.email===email&&item.estado==='pendiente'))throw fail(409,'Ya existe una cuenta o solicitud pendiente con ese correo.');
          const codeHash=hashActivationCode(activationCode),codeRecord=codes.find(item=>typeof item.codeHash==='string'&&safeEqual(item.codeHash,codeHash)&&!item.usadoEn&&Date.parse(item.expiraEn)>Date.now());
          if(!codeRecord)throw fail(400,'El código o los datos no coinciden con un expediente activo. Contacta a Dirección.');
          const student=students.find(item=>item.id===codeRecord.alumnoId&&item.activo!==false);
          const fullName=student?[student.nombres,student.apellidos].filter(Boolean).join(' '):'';
          const groupId=student?.grupoId??enrollments.find(item=>item.alumnoId===student?.id&&item.estado==='activa')?.grupoId;
          const group=groups.find(item=>item.id===groupId),assignedAreaId=student?.especialidadId??group?.especialidadId;
          const storedAreaName=student?.especialidadNombre??student?.especialidad??'';
          const studentArea=assignedAreaId?areas.find(item=>item.id===assignedAreaId&&item.activo!==false):areas.find(item=>item.activo!==false&&normalizeAreaName(item.nombre)===normalizeAreaName(storedAreaName));
          if(!student||normalizeAreaName(fullName)!==normalizeAreaName(nombre)||normalizeAreaName(student.matricula)!==normalizeAreaName(matricula)||studentArea?.id!==especialidad.id||(storedAreaName&&normalizeAreaName(storedAreaName)!==normalizeAreaName(especialidad.nombre)))throw fail(400,'El código o los datos no coinciden con un expediente activo. Contacta a Dirección.');
          if(accounts.some(item=>item.rol==='alumno'&&item.personaId===student.id&&item.activo))throw fail(409,'Ese expediente ya tiene una cuenta activa. Contacta a Dirección.');
          const now=new Date().toISOString();
          approvedUser={id:randomUUID(),email,nombre:fullName,rol:'alumno',personaId:student.id,especialidadId:especialidad.id,activo:true,passwordHash:request.passwordHash,creadoEn:now,aprobadoAutomaticamente:true};
          const {passwordHash:_passwordHash,...requestInfo}=request;
          resolvedRequest={...requestInfo,estado:'aprobada',personaId:student.id,usuarioId:approvedUser.id,resolucion:'codigo_activacion',resueltaEn:now};
          return[
            {collection:'usuarios',upsert:[approvedUser]},
            {collection:'solicitudes_cuenta',upsert:[resolvedRequest]},
            {collection:'codigos_activacion',upsert:[{...codeRecord,usadoEn:now,usadoPorUsuarioId:approvedUser.id}]},
            {collection:'auditoria',upsert:[{id:randomUUID(),usuarioId:null,accion:'solicitud_cuenta_aprobada_automatica',entidad:approvedUser.id,email,creadoEn:now}]}
          ];
        });
        return json(res,201,{mensaje:'Cuenta aprobada. Ya puedes iniciar sesión.'});
      }
      await storage.update('solicitudes_cuenta',async rows=>{const accounts=await storage.read('usuarios');if(accounts.some(x=>x.email===email)||rows.some(x=>x.email===email&&x.estado==='pendiente'))throw fail(409,'Ya existe una cuenta o solicitud pendiente con ese correo.');return[...rows,request];});
      return json(res,202,{mensaje:rolSolicitado==='alumno'?'Solicitud recibida. Dirección debe aprobarla; la matrícula se usará para encontrar tu expediente.':'Solicitud recibida. Dirección debe aprobar y vincular tu expediente antes de que puedas iniciar sesión.'});
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const ip=req.socket.remoteAddress??'local',now=Date.now(),entry=loginFailures.get(ip);if(entry&&entry.until>now&&entry.count>=10)return json(res,429,{error:'Demasiados intentos. Espera 15 minutos y vuelve a intentarlo.'});if(entry&&entry.until<=now)loginFailures.delete(ip);
      const input = await body(req);
      if (typeof input.email !== 'string' || typeof input.password !== 'string') return json(res, 400, { error: 'Correo y contraseña son obligatorios.' });
      const email = input.email.trim().toLowerCase();
      const user = (await storage.read('usuarios')).find(u => u.email === email && u.activo);
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {const state=loginFailures.get(ip);loginFailures.set(ip,{count:state&&state.until>now?state.count+1:1,until:state&&state.until>now?state.until:now+15*60_000});await auditLogin(email,null,'fallido');return json(res, 401, { error: 'Credenciales incorrectas.' });}
      loginFailures.delete(ip);
      await auditLogin(email,user,'correcto');
      return json(res, 200, { token: createSession(user.id, secret), usuario: { id: user.id, nombre: user.nombre, email:user.email, rol: user.rol } });
    }
    const user = await currentUser(req);
    if (req.method.startsWith('GET') && url.pathname === '/api/auth/me') {
      if (!user) return json(res, 401, { error: 'Inicia sesión.' });
      return json(res, 200, { id: user.id, nombre: user.nombre, email:user.email, rol: user.rol });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!user) return json(res, 401, { error: 'Inicia sesión.' });
      if(req.method==='GET'&&url.pathname==='/api/alumnos/plantilla.xlsx'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo Dirección puede descargar la plantilla de alumnos.'});
        const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Alumnos');
        sheet.columns=[{header:'Nombres',key:'nombres',width:24},{header:'Apellidos',key:'apellidos',width:26},{header:'Especialidad',key:'especialidad',width:24},{header:'Grado',key:'grado',width:12},{header:'Grupo',key:'grupo',width:12},{header:'Matrícula',key:'matricula',width:20},{header:'Semestre',key:'semestre',width:12},{header:'Ciclo',key:'ciclo',width:18}];
        sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8E1B22'}};sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter='A1:H1';
        const example=workbook.addWorksheet('Ejemplo');
        example.columns=sheet.columns.map(column=>({header:column.header,key:column.key,width:column.width}));
        example.addRow({nombres:'Ana Sofía',apellidos:'López Pérez',especialidad:'Informática',grado:'2',grupo:'A',matricula:'QA-0001',semestre:3,ciclo:'2026-2027'});
        example.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};example.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8E1B22'}};example.views=[{state:'frozen',ySplit:1}];example.autoFilter='A1:H1';
        const output=Buffer.from(await workbook.xlsx.writeBuffer());
        res.writeHead(200,{...securityHeaders,'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':'attachment; filename="plantilla-alumnos.xlsx"','cache-control':'no-store'});return res.end(output);
      }
      if(req.method==='GET'&&url.pathname==='/api/alumnos/plantilla.csv'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo Dirección puede descargar la plantilla de alumnos.'});
        const csv='\uFEFF'+studentCsvHeaders.map(csvCell).join(',')+'\r\n';
        res.writeHead(200,{...securityHeaders,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="plantilla-alumnos.csv"','cache-control':'no-store'});return res.end(csv);
      }
      if(req.method==='POST'&&url.pathname==='/api/alumnos/importar'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo Dirección puede importar alumnos.'});
        const input=await body(req,8_000_000);
        const filename=typeof input.nombreArchivo==='string'?input.nombreArchivo.toLowerCase():'',isWorkbook=filename.endsWith('.xlsx'),isCsv=filename.endsWith('.csv');
        if((!isWorkbook&&!isCsv)||typeof input.contenido!=='string'||!input.contenido||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.contenido))return json(res,400,{error:'Selecciona un archivo .csv o .xlsx válido.'});
        if(input.contenido.length>7_000_000)return json(res,413,{error:'El archivo no puede superar 5 MB.'});
        const bytes=Buffer.from(input.contenido,'base64');
        if(bytes.length>5_000_000||bytes.length<1||bytes.toString('base64').replace(/=+$/,'')!==input.contenido.replace(/=+$/,''))return json(res,400,{error:'El archivo está incompleto o no es válido.'});
        if(isWorkbook&&bytes.subarray(0,2).toString('hex')!=='504b')return json(res,400,{error:'El archivo Excel está incompleto o no es válido.'});
        const parsedRows=isCsv?parseStudentCsv(bytes):await parseStudentWorkbook(bytes);
        const generateActivationCode=input.generarCodigoActivacion===true;
        if(generateActivationCode&&parsedRows.length!==1)return json(res,400,{error:'La generación de un código de activación solo se permite para un alta individual.'});
        const duplicates=[],seen=new Set(),candidates=[],currentStudents=await storage.read('alumnos'),registered=new Set(currentStudents.map(row=>normalizeAreaName(row.matricula)));
        for(const row of parsedRows){
          const key=normalizeAreaName(row.matricula);
          if(key&&seen.has(key)){duplicates.push({fila:row.rowNumber,matricula:row.matricula,motivo:'La matrícula se repite en el archivo.'});continue;}
          if(key)seen.add(key);
          if(key&&registered.has(key)){duplicates.push({fila:row.rowNumber,matricula:row.matricula,motivo:'La matrícula ya está registrada.'});continue;}
          candidates.push(row);
        }
        const parsed=validateStudentRows(candidates);
        if(parsed.errors.length)return json(res,400,{error:'Hay filas que requieren corrección. No se guardó ningún alumno.',detalles:parsed.errors.slice(0,100)});
        const newRows=parsed.rows;
        if(newRows.length)await storage.backup(backupDir);
        let imported=[],concurrentDuplicates=[],activationCodes=[];
        if(newRows.length)await storage.transact(async read=>{
          const [students,areas,groups]=await Promise.all([read('alumnos'),read('especialidades'),read('grupos')]);
          const currentKeys=new Set(students.map(row=>normalizeAreaName(row.matricula))),areaUpserts=[],groupUpserts=[],enrollmentUpserts=[],activationUpserts=[];
          const areaByName=new Map(areas.map(area=>[normalizeAreaName(area.nombre),area]));
          const groupByKey=new Map(groups.map(group=>[`${group.especialidadId}|${normalizeAreaName(group.grado)}|${normalizeAreaName(group.nombre)}|${Number(group.semestre??0)}|${normalizeAreaName(group.ciclo)}`,group]));
          imported=[];concurrentDuplicates=[];activationCodes=[];
          for(const row of newRows){
            const matriculaKey=normalizeAreaName(row.matricula);
            if(currentKeys.has(matriculaKey)){concurrentDuplicates.push({fila:row.rowNumber,matricula:row.matricula,motivo:'La matrícula ya está registrada.'});continue;}
            currentKeys.add(matriculaKey);
            let area=areaByName.get(normalizeAreaName(row.especialidad));
            if(!area){area={id:randomUUID(),nombre:row.especialidad,activo:true,creadoEn:new Date().toISOString(),actualizadoEn:new Date().toISOString()};areaByName.set(normalizeAreaName(row.especialidad),area);areaUpserts.push(area);}
            else if(area.activo===false){area={...area,activo:true,actualizadoEn:new Date().toISOString()};areaByName.set(normalizeAreaName(row.especialidad),area);areaUpserts.push(area);}
            const key=`${area.id}|${normalizeAreaName(row.grado)}|${normalizeAreaName(row.grupo)}|${row.semestre}|${normalizeAreaName(row.ciclo)}`;
            let group=groupByKey.get(key);
            if(!group){group={id:randomUUID(),nombre:row.grupo,grado:row.grado,ciclo:row.ciclo,semestre:row.semestre,especialidadId:area.id,activo:true,creadoEn:new Date().toISOString(),actualizadoEn:new Date().toISOString()};groupByKey.set(key,group);groupUpserts.push(group);}
            else if(group.activo===false){group={...group,activo:true,actualizadoEn:new Date().toISOString()};groupByKey.set(key,group);groupUpserts.push(group);}
            const now=new Date().toISOString(),student={id:randomUUID(),nombres:row.nombres,apellidos:row.apellidos,matricula:row.matricula,especialidadId:area.id,especialidadNombre:area.nombre,grado:row.grado,grupoId:group.id,grupoNombre:group.nombre,semestre:row.semestre,ciclo:row.ciclo,activo:true,creadoEn:now,actualizadoEn:now};
            imported.push(student);enrollmentUpserts.push({id:randomUUID(),alumnoId:student.id,grupoId:group.id,ciclo:row.ciclo,estado:'activa',creadoEn:now,actualizadoEn:now});
            if(generateActivationCode){const code=createActivationCode(),expiraEn=new Date(Date.now()+30*24*60*60_000).toISOString();activationUpserts.push({id:student.id,alumnoId:student.id,codeHash:hashActivationCode(code),creadoEn:now,expiraEn});activationCodes.push({alumnoId:student.id,codigo:formatActivationCode(code),expiraEn});}
          }
          const patches=[{collection:'alumnos',upsert:imported},{collection:'especialidades',upsert:areaUpserts},{collection:'grupos',upsert:groupUpserts},{collection:'inscripciones',upsert:enrollmentUpserts},{collection:'codigos_activacion',upsert:activationUpserts}].filter(patch=>patch.upsert.length);
          return patches;
        });
        duplicates.push(...concurrentDuplicates);
        await audit(user,'importar_alumnos',`${imported.length} importados; ${duplicates.length} omitidos`);
        return json(res,200,{importados:imported.length,omitidos:duplicates.length,duplicados:duplicates.slice(0,100),...(activationCodes.length?{codigosActivacion:activationCodes}:{})});
      }
      const activationCodeMatch=url.pathname.match(/^\/api\/alumnos\/([^/]+)\/codigo-activacion$/);
      if(req.method==='POST'&&activationCodeMatch){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo Dirección puede generar códigos de activación.'});
        const studentId=activationCodeMatch[1],code=createActivationCode(),now=new Date().toISOString();
        const codeRecord={id:studentId,alumnoId:studentId,codeHash:hashActivationCode(code),creadoEn:now,expiraEn:new Date(Date.now()+30*24*60*60_000).toISOString()};
        const auditRecord={id:randomUUID(),usuarioId:user.id,accion:'generar_codigo_activacion_alumno',entidad:studentId,creadoEn:now};
        await storage.backup(backupDir);
        await storage.transact(async read=>{
          const [students,accounts]=await Promise.all([read('alumnos'),read('usuarios')]);
          const student=students.find(item=>item.id===studentId&&item.activo!==false);
          if(!student)throw fail(404,'No se encontró un alumno activo.');
          if(accounts.some(item=>item.rol==='alumno'&&item.personaId===studentId&&item.activo))throw fail(409,'Ese alumno ya tiene una cuenta activa.');
          return[{collection:'codigos_activacion',upsert:[codeRecord]},{collection:'auditoria',upsert:[auditRecord]}];
        });
        return json(res,201,{codigo:formatActivationCode(code),expiraEn:codeRecord.expiraEn});
      }
      if(req.method==='GET'&&url.pathname==='/api/personas-disponibles'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede consultar expedientes disponibles.'});
        const role=url.searchParams.get('rol'),collection={alumno:'alumnos',maestro:'maestros',tutor:'tutores'}[role];
        if(!collection)return json(res,400,{error:'Selecciona un tipo de cuenta válido.'});
        const [people,accounts,areas,groups,enrollments]=await Promise.all([storage.read(collection),storage.read('usuarios'),storage.read('especialidades'),storage.read('grupos'),storage.read('inscripciones')]);
        let available=people.filter(person=>person.activo!==false&&!accounts.some(account=>account.rol===role&&account.personaId===person.id&&account.activo)).map(person=>{
          const groupId=person.grupoId??enrollments.find(item=>item.alumnoId===person.id&&item.estado==='activa')?.grupoId,group=groups.find(item=>item.id===groupId),area=areas.find(item=>item.id===(person.especialidadId??group?.especialidadId));
          return{id:person.id,nombre:[person.nombres,person.apellidos].filter(Boolean).join(' ')||person.nombre||'Nombre no disponible',matricula:person.matricula??'',correo:person.correo??'',numeroEmpleado:person.numeroEmpleado??'',especialidadNombre:person.especialidadNombre??area?.nombre??person.especialidad??'',grupoNombre:person.grupoNombre??group?.nombre??''};
        }).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
        const query=url.searchParams.get('q')?.trim().toLocaleLowerCase('es');if(query)available=available.filter(item=>[item.nombre,item.matricula,item.correo,item.numeroEmpleado,item.especialidadNombre,item.grupoNombre].some(value=>String(value??'').toLocaleLowerCase('es').includes(query)));
        const total=available.length,limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')??50))),offset=Math.max(0,Number(url.searchParams.get('offset')??0));if(!Number.isFinite(limit)||!Number.isFinite(offset))return json(res,400,{error:'Paginación inválida.'});
        return json(res,200,available.slice(offset,offset+limit),{'x-total-count':String(total),'x-limit':String(limit),'x-offset':String(offset)});
      }
      if(req.method==='GET'&&url.pathname==='/api/solicitudes_cuenta'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede revisar solicitudes.'});
        let requests=(await storage.read('solicitudes_cuenta')).map(({passwordHash,passkeyCredential,...safe})=>safe);
        const state=url.searchParams.get('estado');if(state)requests=requests.filter(item=>item.estado===state);
        const query=url.searchParams.get('q')?.trim().toLocaleLowerCase('es');if(query)requests=requests.filter(item=>[item.nombre,item.email,item.rolSolicitado,item.matricula].some(value=>String(value??'').toLocaleLowerCase('es').includes(query)));
        const total=requests.length,limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')??50))),offset=Math.max(0,Number(url.searchParams.get('offset')??0));if(!Number.isFinite(limit)||!Number.isFinite(offset))return json(res,400,{error:'Paginación inválida.'});
        return json(res,200,requests.slice(offset,offset+limit),{'x-total-count':String(total),'x-limit':String(limit),'x-offset':String(offset)});
      }
      const requestCandidatesMatch=url.pathname.match(/^\/api\/solicitudes_cuenta\/([^/]+)\/candidatos$/);
      if(req.method==='GET'&&requestCandidatesMatch){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede consultar expedientes para solicitudes.'});
        const request=(await storage.read('solicitudes_cuenta')).find(item=>item.id===requestCandidatesMatch[1]&&item.estado==='pendiente');
        if(!request)return json(res,404,{error:'La solicitud no existe o ya fue atendida.'});
        const collection={alumno:'alumnos',maestro:'maestros',tutor:'tutores'}[request.rolSolicitado];
        if(!collection)return json(res,400,{error:'El tipo de cuenta no admite vinculación con un expediente.'});
        const [people,accounts,areas,groups,enrollments]=await Promise.all([storage.read(collection),storage.read('usuarios'),storage.read('especialidades'),storage.read('grupos'),storage.read('inscripciones')]);
        const available=people.filter(person=>person.activo!==false&&!accounts.some(account=>account.rol===request.rolSolicitado&&account.personaId===person.id&&account.activo)).map(person=>{
          const groupId=person.grupoId??enrollments.find(item=>item.alumnoId===person.id&&item.estado==='activa')?.grupoId;
          const group=groups.find(item=>item.id===groupId);
          const area=areas.find(item=>item.id===(person.especialidadId??group?.especialidadId));
          const name=[person.nombres,person.apellidos].filter(Boolean).join(' ')||person.nombre||'Nombre no disponible';
          const assignedAreaId=person.especialidadId??group?.especialidadId,requestArea=areas.find(item=>item.id===request.especialidadId),storedAreaName=person.especialidadNombre??person.especialidad??'';
          return {
            id:person.id,
            nombre:name,
            matricula:person.matricula??'',
            correo:person.correo??'',
            telefono:person.telefono??'',
            numeroEmpleado:person.numeroEmpleado??'',
            especialidadNombre:person.especialidadNombre??area?.nombre??person.especialidad??'',
            grupoNombre:person.grupoNombre??group?.nombre??'',
            compatibleEspecialidad:request.rolSolicitado!=='alumno'||Boolean(requestArea&&(!assignedAreaId||assignedAreaId===request.especialidadId)&&(!storedAreaName||normalizeAreaName(storedAreaName)===normalizeAreaName(requestArea.nombre)))
          };
        }).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
        return json(res,200,available);
      }
      const accountRequestMatch=url.pathname.match(/^\/api\/solicitudes_cuenta\/([^/]+)\/resolver$/);
      if(req.method==='POST'&&accountRequestMatch){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede resolver solicitudes.'});
        const input=await body(req);if(!['aprobar','rechazar'].includes(input.decision))return json(res,400,{error:'Selecciona aprobar o rechazar.'});
        let approvedUser=null,resolvedRequest=null;
        await storage.transact(async read=>{
          const requests=await read('solicitudes_cuenta'),request=requests.find(x=>x.id===accountRequestMatch[1]);if(!request||request.estado!=='pendiente')throw fail(409,'La solicitud no existe o ya fue atendida.');
          const {passwordHash,passkeyCredential:_legacyPasskeyCredential,...requestInfo}=request;
          if(input.decision==='rechazar'){resolvedRequest={...requestInfo,estado:'rechazada',resueltaPor:user.id,resueltaEn:new Date().toISOString()};return[{collection:'solicitudes_cuenta',upsert:[resolvedRequest]}];}
          const personCollection={alumno:'alumnos',maestro:'maestros',tutor:'tutores'}[request.rolSolicitado];const personaId=typeof input.personaId==='string'?input.personaId.trim():'';const person=personaId&&(await read(personCollection)).find(x=>x.id===personaId&&x.activo!==false);if(!person)throw fail(400,'Selecciona un expediente activo existente antes de aprobar la solicitud.');if(request.rolSolicitado==='alumno'){const area=(await read('especialidades')).find(x=>x.id===request.especialidadId&&x.activo!==false);if(!area)throw fail(409,'La especialidad ya no existe o está inactiva. Rechaza la solicitud o reactiva el área.');const groups=await read('grupos'),enrollments=await read('inscripciones'),group=groups.find(x=>x.id===(person.grupoId??enrollments.find(item=>item.alumnoId===person.id&&item.estado==='activa')?.grupoId)),assignedAreaId=person.especialidadId??group?.especialidadId,storedAreaName=person.especialidadNombre??person.especialidad??'';if((assignedAreaId&&assignedAreaId!==request.especialidadId)||(storedAreaName&&normalizeAreaName(storedAreaName)!==normalizeAreaName(area.nombre)))throw fail(409,'La especialidad del expediente no coincide con la indicada en la solicitud. Selecciona un alumno compatible.');}
          const accounts=await read('usuarios');if(accounts.some(x=>x.email===request.email))throw fail(409,'Ya existe una cuenta con ese correo.');if(accounts.some(x=>x.rol===request.rolSolicitado&&x.personaId===personaId&&x.activo))throw fail(409,'Ese expediente ya tiene una cuenta activa.');
          approvedUser={id:randomUUID(),email:request.email,nombre:request.nombre,rol:request.rolSolicitado,personaId,activo:true,...(request.rolSolicitado==='alumno'?{especialidadId:request.especialidadId}:{}),passwordHash,creadoEn:new Date().toISOString(),aprobadoPor:user.id};
          resolvedRequest={...requestInfo,estado:'aprobada',usuarioId:approvedUser.id,resueltaPor:user.id,resueltaEn:new Date().toISOString()};
          const patches=[{collection:'usuarios',upsert:[approvedUser]},{collection:'solicitudes_cuenta',upsert:[resolvedRequest]}];
          if(request.rolSolicitado==='alumno'){const code=(await read('codigos_activacion')).find(item=>item.alumnoId===person.id&&!item.usadoEn);if(code)patches.push({collection:'codigos_activacion',upsert:[{...code,usadoEn:new Date().toISOString(),usadoPorUsuarioId:approvedUser.id}]});}
          return patches;
        });
        await audit(user,`solicitud_cuenta_${input.decision}`,accountRequestMatch[1]);
        if(approvedUser){const{passwordHash,...safe}=approvedUser;return json(res,200,{solicitud:resolvedRequest,usuario:safe});}
        return json(res,200,resolvedRequest);
      }
      if (url.pathname === '/api/dashboard' && req.method === 'GET') {
        if (user.rol === 'direccion') {
          const [alumnos, maestros, grupos, asistencias, faltas, retardos, listas, notificaciones, calificaciones, jornadas,periodos] = await Promise.all(['alumnos','maestros','grupos','asistencias','faltas','retardos','listas_asistencia','notificaciones','calificaciones','jornadas','periodos_evaluacion'].map(n => storage.read(n)));
          return json(res, 200, { alumnos: alumnos.filter(x=>x.activo!==false).length, maestros: maestros.filter(x=>x.activo!==false).length, grupos: grupos.filter(x=>x.activo!==false).length, asistencias: asistencias.filter(x=>x.fecha===todayAt()).length, faltas: faltas.filter(x=>x.fecha===todayAt()).length, retardos: retardos.filter(x=>x.fecha===todayAt()).length, listasPendientes: listas.filter(x => x.estado === 'abierta').length, notificacionesPendientes: notificaciones.filter(x => x.estado === 'pendiente').length, calificaciones: calificaciones.length, jornadas:jornadas.filter(x=>x.fecha===todayAt()&&x.estado==='habilitada').length,periodosActivos:periodos.filter(x=>x.estado!=='cerrado').length });
        }
        return json(res, 200, { rol: user.rol, nombre: user.nombre });
      }
      if(req.method==='GET'&&url.pathname==='/api/backups'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede consultar las copias.'});
        const dirs=await readdir(backupDir,{withFileTypes:true}).catch(()=>[]);return json(res,200,dirs.filter(x=>x.isDirectory()&&!x.name.startsWith('.tmp-')).map(x=>({id:x.name})).sort((a,b)=>b.id.localeCompare(a.id)));
      }
      if(req.method==='PUT'&&url.pathname==='/api/configuracion'&&user.rol==='direccion'){
        const input=await body(req),timeZone=input.zonaHoraria??'America/Guatemala';try{new Intl.DateTimeFormat('es',{timeZone}).format(new Date())}catch{return json(res,400,{error:'La zona horaria no es válida.'});}
        const summary=input.horaResumenDiario??'17:00',retention=Number(input.retencionBackups??30),scaleMin=Number(input.escalaMin??0),scaleMax=Number(input.escalaMax??100);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(summary)||!Number.isInteger(retention)||retention<1||retention>365||!Number.isFinite(scaleMin)||!Number.isFinite(scaleMax)||scaleMin>=scaleMax)return json(res,400,{error:'Hora, retención (1 a 365 días) o escala de calificaciones inválida.'});
        const setting={id:'configuracion-institucional',zonaHoraria:timeZone,horaResumenDiario:summary,retencionBackups:retention,escalaMin:scaleMin,escalaMax:scaleMax,actualizadoEn:new Date().toISOString(),actualizadoPor:user.id};await storage.update('configuracion',()=>[setting]);await audit(user,'actualizar_configuracion',setting.id);return json(res,200,setting);
      }
      if(req.method==='POST'&&url.pathname==='/api/backups'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede crear copias.'});const directory=await storage.backup(backupDir);await storage.pruneBackups(backupDir,30);await audit(user,'crear_respaldo',path.basename(directory));return json(res,201,{id:path.basename(directory)});
      }
      if(req.method==='POST'&&url.pathname==='/api/backups/restaurar'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede restaurar copias.'});const input=await body(req);if(typeof input.id!=='string'||path.basename(input.id)!==input.id||input.id.startsWith('.'))return json(res,400,{error:'Copia seleccionada inválida.'});const source=path.join(backupDir,input.id);const safetyCopy=await storage.restoreBackup(source,backupDir);await audit(user,'restaurar_respaldo',input.id);return json(res,200,{restaurado:input.id,copiaAnterior:path.basename(safetyCopy)});
      }
      if(req.method==='GET'&&url.pathname==='/api/mis-alumnos'){
        if(!['alumno','tutor'].includes(user.rol))return json(res,403,{error:'Este portal no tiene expedientes vinculados.'});const students=await storage.read('alumnos');if(user.rol==='alumno')return json(res,200,students.filter(x=>x.id===user.personaId));const links=(await storage.read('relaciones_tutores')).filter(x=>x.tutorId===user.personaId&&x.activa);const ids=new Set(links.map(x=>x.alumnoId));return json(res,200,students.filter(x=>ids.has(x.id)));
      }
      if(req.method==='GET'&&url.pathname==='/api/mis-vinculos'&&user.rol==='tutor'){
        const [links,students]=await Promise.all([storage.read('relaciones_tutores'),storage.read('alumnos')]);return json(res,200,links.filter(x=>x.tutorId===user.personaId).map(link=>{const student=students.find(x=>x.id===link.alumnoId);return{id:link.id,alumnoNombre:link.alumnoNombreSnapshot??(student?[student.nombres,student.apellidos].filter(Boolean).join(' '):'Alumno no disponible'),matricula:link.matricula??student?.matricula??'',parentesco:link.parentesco,estado:link.activa?'activo':'pendiente de aprobación',activa:Boolean(link.activa)}}));
      }
      if(req.method==='GET'&&url.pathname==='/api/relaciones_tutores/alumno'&&user.rol==='tutor'){
        const matricula=url.searchParams.get('matricula')?.trim()??'';if(!matricula||matricula.length>40)return json(res,400,{error:'Escribe una matrícula válida para buscar al alumno.'});
        const [students,links,groups,areas,enrollments]=await Promise.all(['alumnos','relaciones_tutores','grupos','especialidades','inscripciones'].map(name=>storage.read(name)));
        const student=students.find(item=>item.activo!==false&&String(item.matricula??'').trim().toLocaleLowerCase('es')===matricula.toLocaleLowerCase('es'));
        if(!student)return json(res,404,{error:'No se encontró un alumno activo con esa matrícula. Verifícala con la institución.'});
        if(links.some(link=>link.tutorId===user.personaId&&link.alumnoId===student.id))return json(res,409,{error:'Ya existe una solicitud o vínculo para ese alumno.'});
        const groupId=student.grupoId??enrollments.find(item=>item.alumnoId===student.id&&item.estado==='activa')?.grupoId,group=groups.find(item=>item.id===groupId),area=areas.find(item=>item.id===(student.especialidadId??group?.especialidadId));
        return json(res,200,{id:student.id,nombres:student.nombres,apellidos:student.apellidos,matricula:student.matricula,especialidadNombre:student.especialidadNombre??area?.nombre??student.especialidad??'',grupoNombre:student.grupoNombre??group?.nombre??''});
      }
      if(req.method==='POST'&&url.pathname==='/api/relaciones_tutores/vincular'&&user.rol==='tutor'){
        const input=await body(req),matricula=typeof input.matricula==='string'?input.matricula.trim(): '',parentesco=typeof input.parentesco==='string'?input.parentesco.trim():'';
        if((typeof input.alumnoId!=='string'&&!matricula)||matricula.length>40||!parentesco||parentesco.length>40)return json(res,400,{error:'Selecciona un alumno y especifica tu parentesco.'});
        const student=(await storage.read('alumnos')).find(x=>x.activo!==false&&(typeof input.alumnoId==='string'?x.id===input.alumnoId:String(x.matricula??'').trim().toLocaleLowerCase('es')===matricula.toLocaleLowerCase('es')));if(!student)return json(res,404,{error:'No se encontró un alumno activo. Vuelve a buscar su matrícula.'});
        const linked=await storage.read('relaciones_tutores');if(linked.some(x=>x.tutorId===user.personaId&&x.alumnoId===student.id))return json(res,409,{error:'Ya existe una solicitud o vínculo para ese alumno.'});
        const relation={id:randomUUID(),tutorId:user.personaId,alumnoId:student.id,parentesco,activa:false,estado:'pendiente',matricula:student.matricula,alumnoNombreSnapshot:[student.nombres,student.apellidos].filter(Boolean).join(' '),solicitadaPor:user.id,solicitadaEn:new Date().toISOString()};await storage.update('relaciones_tutores',rows=>[...rows,relation]);await audit(user,'solicitar_vinculo_alumno',relation.id);return json(res,202,{mensaje:'Solicitud enviada a Dirección. El expediente aparecerá en tu cuenta cuando aprueben el vínculo.'});
      }
      if((req.method==='GET'||req.method==='PATCH')&&url.pathname==='/api/perfil'){
        if(!['alumno','maestro','tutor'].includes(user.rol))return json(res,403,{error:'El administrador no tiene un perfil académico personal.'});
        const collection={alumno:'alumnos',maestro:'maestros',tutor:'tutores'}[user.rol];
        let profile=(await storage.read(collection)).find(x=>x.id===user.personaId);
        if(!profile)return json(res,404,{error:'No existe una ficha asociada a esta cuenta.'});
        if(req.method==='PATCH'){
          if(user.rol!=='alumno')return json(res,403,{error:'Solo el alumno puede completar sus datos de contacto.'});
          const input=await body(req),allowed=['telefono','correoContacto'];
          if(Object.keys(input).some(key=>!allowed.includes(key)))return json(res,400,{error:'Solo puedes actualizar teléfono y correo de contacto.'});
          const telefono=String(input.telefono??'').trim(),correoContacto=String(input.correoContacto??'').trim().toLowerCase();
          if(telefono.length>30|| (telefono&&!/^\+?[0-9 ()-]{7,30}$/.test(telefono)))return json(res,400,{error:'Escribe un teléfono válido de hasta 30 caracteres.'});
          if(correoContacto.length>254||(correoContacto&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoContacto)))return json(res,400,{error:'Escribe un correo de contacto válido.'});
          const updated=await storage.update('alumnos',rows=>rows.map(row=>row.id===user.personaId?{...row,telefono,correoContacto,actualizadoEn:new Date().toISOString()}:row));
          profile=updated.find(x=>x.id===user.personaId);await audit(user,'completar_perfil_alumno',user.personaId);
        }
        if(user.rol==='alumno'){
          const [enrollments,groups,areas]=await Promise.all([storage.read('inscripciones'),storage.read('grupos'),storage.read('especialidades')]);
          const enrollment=enrollments.find(x=>x.alumnoId===profile.id&&x.estado==='activa'),group=groups.find(x=>x.id===enrollment?.grupoId),area=areas.find(x=>x.id===(profile.especialidadId??group?.especialidadId??user.especialidadId));
          profile={...profile,correoCuenta:user.email,especialidadNombre:area?.nombre??profile.especialidad??'',grupoNombre:group?.nombre??'',semestre:group?.semestre??'',ciclo:enrollment?.ciclo??group?.ciclo??''};
        }
        return json(res,200,profile);
      }
      const exportMatch=url.pathname.match(/^\/api\/exportar\/([a-z_]+)\.csv$/);
      if(req.method==='GET'&&exportMatch){
        const collection=exportMatch[1],exportable=['alumnos','maestros','tutores','grupos','materias','horarios','asistencias','listas_asistencia','faltas','retardos','justificaciones','calificaciones','boletas','mensajes','avisos_escolares'];if(!exportable.includes(collection))return json(res,403,{error:'Esta categoría no se puede exportar.'});
        let records=await authorizedRecords(collection,user,url.searchParams.get('alumnoId'));for(const key of ['grupoId','materiaId','fecha','estado']){const value=url.searchParams.get(key);if(value)records=records.filter(row=>String(row[key]??'')===value);}if(records.length>50_000)return json(res,413,{error:'Aplica filtros para exportar como máximo 50,000 registros.'});
        let csv;
        if(collection==='alumnos'){
          const [groups,areas]=await Promise.all([storage.read('grupos'),storage.read('especialidades')]),groupsById=new Map(groups.map(group=>[group.id,group])),areasById=new Map(areas.map(area=>[area.id,area]));
          const rows=records.map(student=>{const group=groupsById.get(student.grupoId);return[student.nombres,student.apellidos,student.especialidadNombre??student.especialidad??areasById.get(student.especialidadId)?.nombre??'',student.grado??group?.grado??'',student.grupoNombre??group?.nombre??'',student.matricula,student.semestre??group?.semestre??'',student.ciclo??group?.ciclo??''];});
          csv='\uFEFF'+[studentCsvHeaders,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
        }else{
          const keys=[...new Set(records.flatMap(row=>Object.keys(row)))].filter(key=>!['passwordHash','token','secret','tokenHash'].includes(key));
          csv='\uFEFF'+[keys.map(csvCell).join(','),...records.map(row=>keys.map(key=>csvCell(row[key])).join(','))].join('\r\n');
        }
        await audit(user,'exportar',collection);res.writeHead(200,{...securityHeaders,'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="${collection}.csv"`,'cache-control':'no-store'});return res.end(csv);
      }
      const deleteMatch=url.pathname.match(/^\/api\/(alumnos|avisos_escolares|mensajes)\/([^/]+)$/);
      if(req.method==='DELETE'&&deleteMatch){
        const [,collection,id]=deleteMatch;let deleted;
        if(collection==='avisos_escolares'||collection==='alumnos'){if(user.rol!=='direccion')return json(res,403,{error:'Solo Dirección puede borrar este registro.'});}
        if(collection==='mensajes'&&user.rol!=='direccion'){const owned=(await storage.read('mensajes')).find(x=>x.id===id&&x.destinatarioUsuarioId===user.id);if(!owned)return json(res,403,{error:'Solo puedes borrar mensajes de tu propia bandeja.'});}
        if(collection==='mensajes'||collection==='avisos_escolares'){
          const item=(await storage.read(collection)).find(x=>x.id===id);if(!item)return json(res,404,{error:'No se encontró el registro.'});
          await storage.transact([{collection,removeIds:[id]}]);deleted=item;
        }else{
          const all=Object.fromEntries(await Promise.all(['alumnos','usuarios','relaciones_tutores','inscripciones','asistencias','faltas','retardos','justificaciones','calificaciones','boletas','notificaciones','mensajes','suscripciones_push','listas_asistencia'].map(async name=>[name,await storage.read(name)])));
          const student=all.alumnos.find(x=>x.id===id);if(!student)return json(res,404,{error:'No se encontró el alumno.'});
          const linkedAccounts=all.usuarios.filter(x=>x.rol==='alumno'&&x.personaId===id),accountIds=new Set(linkedAccounts.map(x=>x.id));
          const links=all.relaciones_tutores.filter(x=>x.alumnoId===id).map(x=>x.id),enrollments=all.inscripciones.filter(x=>x.alumnoId===id).map(x=>x.id);
          const filters={usuarios:x=>accountIds.has(x.id),relaciones_tutores:x=>x.alumnoId===id,inscripciones:x=>x.alumnoId===id,asistencias:x=>x.alumnoId===id,faltas:x=>x.alumnoId===id,retardos:x=>x.alumnoId===id,justificaciones:x=>x.alumnoId===id,calificaciones:x=>x.alumnoId===id,boletas:x=>x.alumnoId===id,notificaciones:x=>x.alumnoId===id||accountIds.has(x.destinatarioUsuarioId),mensajes:x=>x.alumnoId===id||accountIds.has(x.destinatarioUsuarioId),suscripciones_push:x=>accountIds.has(x.usuarioId)};
          const patches=[{collection:'alumnos',removeIds:[id]},...Object.entries(filters).map(([name,predicate])=>({collection:name,removeIds:all[name].filter(predicate).map(x=>x.id)})).filter(x=>x.removeIds.length)];
          const lists=all.listas_asistencia.filter(row=>(row.alumnos??[]).some(member=>member.alumnoId===id)).map(row=>({...row,alumnos:row.alumnos.filter(member=>member.alumnoId!==id)}));if(lists.length)patches.push({collection:'listas_asistencia',upsert:lists});
          await storage.transact(patches);deleted=student;
        }
        await audit(user,'eliminar',collection+':'+id);return json(res,200,{mensaje:collection==='alumnos'?'Alumno y datos relacionados eliminados.':'Registro eliminado.',id:deleted.id});
      }
      const editMatch=url.pathname.match(/^\/api\/([^/]+)\/([^/]+)$/);
      if(req.method==='PATCH'&&editMatch&&user.rol==='direccion'){
        const [,collection,id]=editMatch;if(collection!=='usuarios'&&!createCollections.includes(collection))return json(res,403,{error:'Esta categoría no admite edición desde esta ruta.'});const old=(await storage.read(collection)).find(x=>x.id===id);if(!old)return json(res,404,{error:'Registro no encontrado.'});const input=await body(req);
        const fields={usuarios:['nombre','email'],alumnos:['nombres','apellidos','matricula','fechaNacimiento','activo'],maestros:['nombres','apellidos','numeroEmpleado','correo','activo'],tutores:['nombres','apellidos','correo','telefono','activo'],relaciones_tutores:['tutorId','alumnoId','parentesco','activa'],grupos:['nombre','ciclo','semestreId','especialidadId','semestre','activo'],especialidades:['nombre','clave','activo'],semestres:['nombre','orden','activo'],materias:['nombre','clave','activo'],inscripciones:['alumnoId','grupoId','ciclo','estado'],avisos_escolares:['titulo','contenido','publicado','visibleDesde','visibleHasta','audiencia'],horarios:['diaSemana','horaInicio','horaFin','materiaId','maestroId','grupoId','aula','desde','hasta','activo'],calendario_escolar:['fecha','tipo','descripcion','jornadas','activo'],periodos_evaluacion:['nombre','iniciaEn','terminaEn','estado','escalaMin','escalaMax']}[collection]??[];
        if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!fields.includes(key)))return json(res,400,{error:'Los campos de actualización no son válidos.'});const candidate={...old,...input,actualizadoEn:new Date().toISOString()};if(collection==='usuarios'&&typeof candidate.email==='string')candidate.email=candidate.email.trim().toLowerCase();if(collection==='avisos_escolares'){candidate.audiencia=candidate.audiencia??'usuarios';if(!['usuarios','alumno','tutor','maestro'].includes(candidate.audiencia))return json(res,400,{error:'Selecciona un destinatario válido para el aviso.'});}validateFields(collection,candidate);
        if(collection==='relaciones_tutores'&&(!(await storage.read('tutores')).some(x=>x.id===candidate.tutorId)||!(await storage.read('alumnos')).some(x=>x.id===candidate.alumnoId)))return json(res,400,{error:'El tutor y alumno deben existir.'});
        if(collection==='inscripciones'&&(!(await storage.read('alumnos')).some(x=>x.id===candidate.alumnoId)||!(await storage.read('grupos')).some(x=>x.id===candidate.grupoId)))return json(res,400,{error:'El alumno y grupo deben existir.'});
        if(collection==='grupos'&&candidate.semestreId&&!(await storage.read('semestres')).some(x=>x.id===candidate.semestreId))return json(res,400,{error:'El semestre indicado no existe.'});
        if(collection==='grupos'&&candidate.especialidadId&&!(await storage.read('especialidades')).some(x=>x.id===candidate.especialidadId&&x.activo!==false))return json(res,400,{error:'La especialidad indicada no existe o está inactiva.'});if(collection==='grupos'&&candidate.semestre!==undefined){candidate.semestre=Number(candidate.semestre);if(!Number.isInteger(candidate.semestre)||candidate.semestre<1||candidate.semestre>6)return json(res,400,{error:'El semestre del grupo debe ser un número del 1 al 6.'});}
        if(collection==='usuarios'){if(typeof candidate.nombre!=='string'||!candidate.nombre.trim()||typeof candidate.email!=='string'||!candidate.email.includes('@'))return json(res,400,{error:'Nombre y correo válido son obligatorios.'});candidate.nombre=candidate.nombre.trim();}
        if(collection==='horarios'){
          for(const [name,ref] of [['maestros',candidate.maestroId],['grupos',candidate.grupoId],['materias',candidate.materiaId]])if(!(await storage.read(name)).some(x=>x.id===ref))return json(res,400,{error:`La referencia ${name} no existe.`});
          if((await storage.read('horarios')).some(x=>x.id!==id&&x.activo!==false&&Number(x.diaSemana)===Number(candidate.diaSemana)&&[x.maestroId===candidate.maestroId,x.grupoId===candidate.grupoId,Boolean(candidate.aula&&x.aula===candidate.aula)].some(Boolean)&&candidate.horaInicio<x.horaFin&&candidate.horaFin>x.horaInicio))return json(res,409,{error:'El horario se cruza con otra clase del mismo maestro, grupo o aula.'});candidate.diaSemana=Number(candidate.diaSemana);
        }
        if(['horarios','periodos_evaluacion'].includes(collection))await storage.backup(backupDir);
        const unique=({usuarios:['email'],alumnos:['matricula'],maestros:['numeroEmpleado'],especialidades:['clave'],materias:['clave']}[collection]??[]);const updated=await storage.update(collection,rows=>{if(collection==='especialidades'&&rows.some(row=>row.id!==id&&normalizeAreaName(row.nombre)===normalizeAreaName(candidate.nombre)))throw fail(409,'Ya existe un área con ese nombre, aunque cambien los acentos o las mayúsculas.');if(unique.some(key=>candidate[key]&&rows.some(row=>row.id!==id&&String(row[key]).toLowerCase()===String(candidate[key]).toLowerCase())))throw fail(409,'Ya existe otro registro con ese identificador.');return rows.map(row=>row.id===id?candidate:row);});await audit(user,'editar',`${collection}:${id}`);const edited=updated.find(x=>x.id===id);if(edited.passwordHash){const{passwordHash,...safe}=edited;return json(res,200,safe)}if(collection==='avisos_escolares'&&!old.publicado&&edited.publicado)return json(res,200,{...edited,notificacionesPush:await notifyPublishedAnnouncement(edited)});return json(res,200,edited);
      }
      const passwordMatch=url.pathname.match(/^\/api\/usuarios\/([^/]+)\/password$/);
      if(req.method==='PATCH'&&passwordMatch&&user.rol==='direccion'){
        const input=await body(req);if(typeof input.password!=='string'||input.password.length<12)return json(res,400,{error:'La contraseña debe tener al menos 12 caracteres.'});const passwordHash=await hashPassword(input.password),rows=await storage.update('usuarios',items=>{const index=items.findIndex(x=>x.id===passwordMatch[1]);if(index<0)throw fail(404,'Cuenta no encontrada.');items[index]={...items[index],passwordHash,actualizadoEn:new Date().toISOString()};return items;});await audit(user,'restablecer_contraseña',passwordMatch[1]);const{passwordHash:_hash,...safe}=rows.find(x=>x.id===passwordMatch[1]);return json(res,200,safe);
      }
      const stateMatch=url.pathname.match(/^\/api\/([^/]+)\/([^/]+)\/estado$/);
      if(req.method==='PATCH'&&stateMatch&&user.rol==='direccion'){
        const [,collection,id]=stateMatch;if(!['usuarios',...createCollections].includes(collection))return json(res,403,{error:'Esta categoría no admite cambios de estado desde esta ruta.'});
        const updated=await storage.update(collection,rows=>{const index=rows.findIndex(x=>x.id===id);if(index<0)throw fail(404,'Registro no encontrado.');const item={...rows[index]};if(collection==='periodos_evaluacion')item.estado=item.estado==='cerrado'?'abierto':'cerrado';else{const field=collection==='usuarios'?'activo':collection==='relaciones_tutores'?'activa':collection==='avisos_escolares'?'publicado':'activo';item[field]=!(item[field]??true);if(collection==='relaciones_tutores')item.estado=item.activa?'activa':'inactiva';}item.actualizadoEn=new Date().toISOString();rows[index]=item;return rows;});
        await audit(user,'cambiar_estado',`${collection}:${id}`);const item=updated.find(x=>x.id===id);if(item.passwordHash){const{passwordHash,...safe}=item;return json(res,200,safe)}if(collection==='avisos_escolares'&&item.publicado)return json(res,200,{...item,notificacionesPush:await notifyPublishedAnnouncement(item)});return json(res,200,item);
      }
      const match = url.pathname.match(/^\/api\/([^/]+)$/);
      if(req.method==='GET'&&url.pathname==='/api/asistencias/tiempo-real'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo Dirección puede consultar las entradas en tiempo real.'});
        const jornadaId=url.searchParams.get('jornadaId');if(!jornadaId)return json(res,400,{error:'Selecciona una jornada.'});
        const [journeys,attendance,students]=await Promise.all([storage.read('jornadas'),storage.read('asistencias'),storage.read('alumnos')]);
        const journey=journeys.find(item=>item.id===jornadaId);if(!journey)return json(res,404,{error:'Jornada no encontrada.'});
        const studentById=new Map(students.map(student=>[student.id,student]));
        const matching=attendance.filter(item=>item.jornadaId===journey.id).sort((a,b)=>(Date.parse(b.horaServidor)||0)-(Date.parse(a.horaServidor)||0));
        const registros=matching.slice(0,20).map(item=>({id:item.id,alumnoId:item.alumnoId,nombreSnapshot:item.nombreSnapshot||'Alumno',matricula:studentById.get(item.alumnoId)?.matricula??'',horaServidor:item.horaServidor,metodo:item.metodo}));
        return json(res,200,{jornadaId:journey.id,fecha:journey.fecha,zonaHoraria:journey.zonaHoraria??'America/Guatemala',total:matching.length,registros});
      }
      if (match && req.method === 'GET') {
        const collection = match[1];
        if (!COLLECTIONS.includes(collection)) return json(res, 404, { error: 'Colección no encontrada.' });
        if(['credenciales_passkey','suscripciones_push'].includes(collection))return json(res,404,{error:'Colección no encontrada.'});
        if(collection==='operaciones')return json(res,403,{error:'Este archivo interno no es consultable por la API.'});
        const allowed = user.rol === 'direccion' || ['avisos_escolares','horarios','asistencias','faltas','retardos','listas_asistencia','calificaciones','boletas','mensajes','justificaciones','permisos'].includes(collection);
        if (!allowed) return json(res, 403, { error: 'Sin permiso para consultar esta información.' });
        const selectedStudentId=url.searchParams.get('alumnoId');let results=await authorizedRecords(collection,user,selectedStudentId);
        if(collection==='usuarios')results=results.map(({passwordHash,...safe})=>safe);
        if(collection==='horarios'){
          const [groups,subjects,teachers,areas,semesters]=await Promise.all(['grupos','materias','maestros','especialidades','semestres'].map(name=>storage.read(name)));
          const groupById=new Map(groups.map(item=>[item.id,item])),subjectById=new Map(subjects.map(item=>[item.id,item])),teacherById=new Map(teachers.map(item=>[item.id,item])),areaById=new Map(areas.map(item=>[item.id,item])),semesterById=new Map(semesters.map(item=>[item.id,item]));
          results=results.map(schedule=>{
            const group=groupById.get(schedule.grupoId),subject=subjectById.get(schedule.materiaId),teacher=teacherById.get(schedule.maestroId),area=areaById.get(group?.especialidadId),semester=semesterById.get(group?.semestreId);
            return{...schedule,grupoNombre:group?.nombre??'',grado:group?.grado??'',ciclo:group?.ciclo??'',semestreNombre:semester?.nombre??group?.semestreNombre??(group?.semestre?`${group.semestre}º semestre`:''),areaNombre:area?.nombre??'',materiaNombre:subject?.nombre??'',materiaClave:subject?.clave??'',maestroNombre:[teacher?.nombres,teacher?.apellidos].filter(Boolean).join(' ')};
          });
        }
        if(collection==='relaciones_tutores'&&user.rol==='direccion'){const [tutors,students]=await Promise.all([storage.read('tutores'),storage.read('alumnos')]);results=results.map(link=>{const tutor=tutors.find(person=>person.id===link.tutorId),student=students.find(person=>person.id===link.alumnoId);return{...link,tutorNombre:[tutor?.nombres,tutor?.apellidos].filter(Boolean).join(' ')||'Tutor no disponible',alumnoNombreSnapshot:link.alumnoNombreSnapshot||[student?.nombres,student?.apellidos].filter(Boolean).join(' ')||'Alumno no disponible'};});}
        const selectedId=url.searchParams.get('id');if(selectedId)results=results.filter(row=>row.id===selectedId);
        for(const key of ['grupoId','materiaId','especialidadId','semestreId','periodoId','estado','fecha']){const value=url.searchParams.get(key);if(value)results=results.filter(row=>String(row[key]??'')===value);}
        const query=url.searchParams.get('q')?.trim().toLocaleLowerCase('es');if(query)results=results.filter(row=>Object.entries(row).filter(([key])=>/nombre|matricula|titulo|materia|asunto/i.test(key)||(collection==='usuarios'&&['email','rol'].includes(key))).some(([,value])=>String(value??'').toLocaleLowerCase('es').includes(query)));
        if(collection==='usuarios'){const roleOrder={alumno:0,maestro:1,tutor:2,direccion:3};results.sort((a,b)=>(roleOrder[a.rol]??9)-(roleOrder[b.rol]??9)||String(a.nombre??'').localeCompare(String(b.nombre??''),'es',{sensitivity:'base'}));}
        const total=results.length,limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')??50))),offset=Math.max(0,Number(url.searchParams.get('offset')??0));if(!Number.isFinite(limit)||!Number.isFinite(offset))return json(res,400,{error:'Paginación inválida.'});return json(res, 200, results.slice(offset,offset+limit),{'x-total-count':String(total),'x-limit':String(limit),'x-offset':String(offset)});
      }
      if (req.method==='POST'&&url.pathname==='/api/jornadas'&&user.rol==='direccion'){
        const input=await body(req);if(typeof input.fecha!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha))return json(res,400,{error:'Indica una fecha válida (AAAA-MM-DD).'});
        const calendar=await storage.read('calendario_escolar');const calendarDay=calendar.find(x=>x.fecha===input.fecha&&x.activo!==false);if(!calendarDay)return json(res,409,{error:'Primero define esta fecha como lectiva en el calendario escolar.'});if(!['lectivo','clases','jornada_especial'].includes(String(calendarDay.tipo).toLowerCase()))return json(res,409,{error:'El calendario marca esta fecha como día sin clases ordinarias.'});
        const created={id:randomUUID(),fecha:input.fecha,nombre:String(input.nombre??'Jornada ordinaria').trim(),estado:'habilitada',abreEn:input.abreEn??'06:00',cierraEn:input.cierraEn??'08:00',zonaHoraria:input.zonaHoraria??'America/Guatemala',creadoEn:new Date().toISOString(),creadoPor:user.id};
        await storage.update('jornadas',rows=>{if(rows.some(x=>x.fecha===created.fecha&&x.estado==='habilitada'))throw fail(409,'Ya existe una jornada habilitada para esta fecha.');return [...rows,created];});await audit(user,'habilitar_jornada',created.id);return json(res,201,created);
      }
      if(req.method==='DELETE'&&url.pathname.startsWith('/api/jornadas/')&&user.rol==='direccion'){
        const id=decodeURIComponent(url.pathname.slice('/api/jornadas/'.length)),jornada=(await storage.read('jornadas')).find(x=>x.id===id);if(!jornada)return json(res,404,{error:'Jornada no encontrada.'});
        if((await storage.read('asistencias')).some(x=>x.jornadaId===id))return json(res,409,{error:'No se puede borrar esta jornada porque ya tiene entradas registradas. Ciérrala para conservar el historial.'});
        const revoked=(await storage.read('qr_diarios')).filter(x=>x.jornadaId===id&&x.activa).map(x=>({...x,activa:false,revocadaEn:new Date().toISOString()}));
        if(revoked.length)await storage.update('qr_diarios',rows=>rows.map(row=>revoked.find(x=>x.id===row.id)??row));
        await storage.update('jornadas',rows=>rows.filter(row=>row.id!==id));await audit(user,'borrar_jornada',id);return json(res,200,{mensaje:'Jornada borrada.'});
      }
      if(req.method==='GET'&&url.pathname==='/api/mensajes/destinatarios'&&user.rol==='direccion'){
        const recipients=(await storage.read('usuarios')).filter(x=>x.activo).map(({id,nombre,email,rol})=>({id,nombre,email,rol}));return json(res,200,recipients);
      }
      if(req.method==='GET'&&url.pathname==='/api/push/public-key'){
        return json(res,200,{enabled:Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT),publicKey:env.VAPID_PUBLIC_KEY??''});
      }
      if(req.method==='POST'&&url.pathname==='/api/push/test'){
        const report=await sendPushNotifications(storage,[user.id],{id:randomUUID(),asunto:'Si recibiste este aviso, las notificaciones están funcionando.',tipo:'prueba'},env);
        return json(res,200,report);
      }
      if(req.method==='POST'&&url.pathname==='/api/push/subscriptions'){
        const input=await body(req),subscription=input.subscription;
        if(!subscription||typeof subscription.endpoint!=='string'||subscription.endpoint.length>3000||!subscription.endpoint.startsWith('https://')||typeof subscription.keys?.p256dh!=='string'||typeof subscription.keys?.auth!=='string')return json(res,400,{error:'La suscripción del dispositivo no es válida.'});
        const saved={id:randomUUID(),usuarioId:user.id,subscription,actualizadaEn:new Date().toISOString()};
        await storage.update('suscripciones_push',rows=>[...rows.filter(row=>!(row.usuarioId===user.id&&row.subscription?.endpoint===subscription.endpoint)),saved]);
        return json(res,201,{mensaje:'Notificaciones activadas en este dispositivo.'});
      }
      if(req.method==='POST'&&url.pathname==='/api/mensajes'&&user.rol==='direccion'){
        const input=await body(req),asunto=typeof input.asunto==='string'?input.asunto.trim():'',contenido=typeof input.contenido==='string'?input.contenido.trim():'',destinatario=typeof input.destinatario==='string'?input.destinatario.trim():'';
        if(asunto.length<2||asunto.length>160||contenido.length<2||contenido.length>5000)return json(res,400,{error:'Escribe un asunto y un mensaje de 2 a 5000 caracteres.'});
        const accounts=(await storage.read('usuarios')).filter(x=>x.activo);let recipients;const groups={todos_usuarios:accounts,todos_alumnos:accounts.filter(x=>x.rol==='alumno'),todos_tutores:accounts.filter(x=>x.rol==='tutor'),todos_maestros:accounts.filter(x=>x.rol==='maestro')};if(Object.hasOwn(groups,destinatario))recipients=groups[destinatario];else recipients=accounts.filter(x=>x.id===destinatario);
        if(!recipients.length)return json(res,404,{error:groups[destinatario]?'No hay cuentas activas de ese grupo para recibir el mensaje.':'Selecciona un usuario activo.'});
        const createdAt=new Date().toISOString(),broadcast=Object.hasOwn(groups,destinatario),messages=recipients.map(target=>({id:randomUUID(),destinatarioUsuarioId:target.id,destinatarioNombre:target.nombre,...(target.rol==='alumno'&&target.personaId?{alumnoId:target.personaId}:{}),alcance:broadcast?destinatario.slice(6):'individual',asunto,contenido,creadoPor:user.id,creadoEn:createdAt,leidoEn:null}));
        await storage.update('mensajes',rows=>[...rows,...messages]);
        const notificacionesPush=await sendPushNotifications(storage,recipients.map(target=>target.id),{id:messages[0].id,asunto},env);
        await audit(user,'enviar_mensaje',broadcast?destinatario+':'+messages.length:recipients[0].id);
        return json(res,201,{mensaje:broadcast?'Mensaje enviado a '+messages.length+' usuario(s) del grupo seleccionado.':'Mensaje enviado.',cantidad:messages.length,notificacionesPush});
      }
      if(req.method==='POST'&&url.pathname==='/api/asistencias/credencial/validar'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo Dirección puede consultar credenciales para registrar entradas.'});
        const input=await body(req),credential=parseCredentialQr(input.qr);
        const [students,groups,areas,enrollments,attendances,jornadas]=await Promise.all(['alumnos','grupos','especialidades','inscripciones','asistencias','jornadas'].map(name=>storage.read(name)));
        const jornada=requireCurrentOpenJornada(jornadas,String(input.jornadaId??''));
        const matched=matchCredentialStudents(students,credential);
        if(!matched.length)return json(res,404,{error:'No se encontró un alumno activo en Asistencia que coincida con esta credencial.'});
        const candidates=matched.map(student=>{
          const enrollment=enrollments.find(item=>item.alumnoId===student.id&&item.estado==='activa'),group=groups.find(item=>item.id===(student.grupoId??enrollment?.grupoId)),area=areas.find(item=>item.id===(student.especialidadId??group?.especialidadId));
          return{id:student.id,nombres:student.nombres,apellidos:student.apellidos,matricula:student.matricula,especialidadNombre:student.especialidadNombre??area?.nombre??'',grado:student.grado??group?.grado??'',grupoNombre:student.grupoNombre??group?.nombre??'',semestre:student.semestre??group?.semestre??'',ciclo:student.ciclo??enrollment?.ciclo??group?.ciclo??'',yaRegistrada:attendances.some(item=>item.alumnoId===student.id&&item.jornadaId===jornada.id)};
        });
        return json(res,200,{tipoCredencial:credential.tipo,jornada:{id:jornada.id,fecha:jornada.fecha,nombre:jornada.nombre},candidatos:candidates});
      }
      if(req.method==='POST'&&url.pathname==='/api/asistencias/credencial/registrar'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo Dirección puede registrar entradas con credencial.'});
        const input=await body(req);
        if(input.confirmacionVisual!==true||typeof input.alumnoId!=='string')return json(res,400,{error:'Confirma que comparaste la credencial física con los datos del alumno.'});
        const credential=parseCredentialQr(input.qr);let attendance,student;
        await storage.transact(async read=>{
          const [students,jornadas]=await Promise.all([read('alumnos'),read('jornadas')]),jornada=requireCurrentOpenJornada(jornadas,String(input.jornadaId??''));
          student=matchCredentialStudents(students,credential).find(item=>item.id===input.alumnoId);
          if(!student)throw fail(409,'El alumno seleccionado no corresponde a esta credencial. Vuelve a escanearla.');
          const existing=await read('asistencias');if(existing.some(item=>item.alumnoId===student.id&&item.jornadaId===jornada.id))throw fail(409,'Este alumno ya tiene una entrada registrada para la jornada.');
          attendance={id:randomUUID(),alumnoId:student.id,nombreSnapshot:[student.nombres,student.apellidos].filter(Boolean).join(' '),fecha:jornada.fecha,jornadaId:jornada.id,horaServidor:new Date().toISOString(),metodo:'credencial_qr',estado:'validada',verificadaManualmente:true,registradaPor:user.id};
          return[{collection:'asistencias',upsert:[attendance]}];
        });
        await notifyTutorsOfStudentEvent(student.id,{id:attendance.id,tipo:'llegada',at:attendance.horaServidor});
        await audit(user,'registrar_entrada_credencial_qr',attendance.id);
        return json(res,201,{mensaje:'Entrada registrada correctamente.',asistencia:attendance});
      }
      if(req.method==='POST'&&url.pathname==='/api/qr_diarios/renovar'&&user.rol==='direccion'){
        const input=await body(req);const jornada=(await storage.read('jornadas')).find(x=>x.id===input.jornadaId&&x.estado==='habilitada');if(!jornada)return json(res,404,{error:'No existe una jornada habilitada para ese QR.'});
        const versionId=randomUUID();let token,qr;
        await storage.transact(async read=>{
          const all=await read('qr_diarios'),now=Date.now(),occupied=new Set(all.filter(x=>x.activa&&Date.parse(x.expiraEn)>now&&x.jornadaId!==jornada.id).map(x=>x.tokenHash));
          for(let attempt=0;attempt<100;attempt++){const candidate=String(randomInt(0,100000)).padStart(5,'0');if(!occupied.has(hashQrToken(candidate))){token=candidate;break;}}
          if(!token)throw fail(503,'No se pudo generar un código libre. Inténtalo de nuevo.');
          const createdAt=new Date(now).toISOString(),expiresAt=now+10*60*1000;
          qr={id:randomUUID(),jornadaId:jornada.id,versionId,tokenHash:hashQrToken(token),activa:true,creadaEn:createdAt,expiraEn:new Date(expiresAt).toISOString(),creadaPor:user.id};
          const oldVersions=all.filter(x=>x.jornadaId===jornada.id&&x.activa).map(x=>({...x,activa:false,revocadaEn:createdAt}));
          return[{collection:'qr_diarios',upsert:[...oldVersions,qr]}];
        });
        await audit(user,'renovar_qr',jornada.id);return json(res,201,{jornadaId:jornada.id,versionId,token,expiraEn:qr.expiraEn});
      }
      if(req.method==='POST'&&url.pathname==='/api/asistencias/registrar'&&user.rol==='alumno'){
        const attemptKey=user.id,now=Date.now(),attempt=attendanceFailures.get(attemptKey);
        if(attempt&&attempt.until>now&&attempt.count>=10)return json(res,429,{error:'Se alcanzó el límite de intentos de código. Espera 15 minutos y vuelve a intentarlo.'});
        if(attempt&&attempt.until<=now)attendanceFailures.delete(attemptKey);
        const input=await body(req);if(typeof input.token!=='string'||!(/^[0-9]{5}$/.test(input.token)||/^[A-Za-z0-9_-]{22}$/.test(input.token)))return json(res,400,{error:'Escribe el código de 5 números o escanea el QR completo.'});
        const digest=hashQrToken(input.token),version=(await storage.read('qr_diarios')).find(x=>x.activa&&Date.parse(x.expiraEn)>Date.now()&&safeEqual(x.tokenHash,digest));
        if(!version){const state=attendanceFailures.get(attemptKey);attendanceFailures.set(attemptKey,{count:state&&state.until>now?state.count+1:1,until:state&&state.until>now?state.until:now+15*60_000});return json(res,410,{error:'El código venció o no es correcto. Revisa que tenga cinco cifras y genera uno nuevo si expiró.'});}
        attendanceFailures.delete(attemptKey);
        const jornada=(await storage.read('jornadas')).find(x=>x.id===version.jornadaId&&x.estado==='habilitada');if(!jornada)return json(res,409,{error:'La jornada no está habilitada.'});
        if(jornada.fecha!==todayAt(jornada.zonaHoraria))return json(res,410,{error:'El código QR venció o corresponde a otra fecha.'});
        const localTime=timeAt(new Date(),jornada.zonaHoraria);if(localTime<jornada.abreEn||localTime>jornada.cierraEn)return json(res,409,{error:`El código QR sí es válido, pero el registro está cerrado. La jornada permite entradas de ${jornada.abreEn} a ${jornada.cierraEn} (${jornada.zonaHoraria}); ahora son las ${localTime}. Dirección debe habilitar una jornada con el horario correcto.`});
        const student=(await storage.read('alumnos')).find(x=>x.id===user.personaId&&x.activo!==false);if(!student)return json(res,403,{error:'La cuenta no está vinculada con un alumno activo.'});
        const attendance={id:randomUUID(),alumnoId:student.id,nombreSnapshot:[student.nombres,student.apellidos].filter(Boolean).join(' '),fecha:jornada.fecha,jornadaId:jornada.id,horaServidor:new Date().toISOString(),metodo:'qr',estado:'validada',versionQrId:version.versionId};
        await storage.update('asistencias',rows=>{if(rows.some(x=>x.alumnoId===student.id&&x.jornadaId===jornada.id))throw fail(409,'Ya registraste tu entrada para esta jornada.');return [...rows,attendance];});await notifyTutorsOfStudentEvent(student.id,{id:attendance.id,tipo:'llegada',at:attendance.horaServidor});await audit(user,'registrar_entrada',attendance.id);return json(res,201,{mensaje:'Entrada registrada correctamente.',asistencia:attendance});
      }
      if(req.method==='POST'&&url.pathname==='/api/listas_asistencia'&&user.rol==='maestro'){
        const input=await body(req),schedule=(await storage.read('horarios')).find(x=>x.id===input.horarioId&&x.activo!==false&&x.maestroId===user.personaId);if(!schedule)return json(res,403,{error:'La clase no pertenece a tu horario.'});
        const date=input.fecha??todayAt();if(date!==todayAt())return json(res,400,{error:'Solo se puede abrir una lista para la fecha escolar actual.'});const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();if(Number(schedule.diaSemana)!==weekday)return json(res,409,{error:'Esta clase no aparece en el horario para hoy.'});
        const calendarDay=(await storage.read('calendario_escolar')).find(x=>x.fecha===date&&x.activo!==false);if(!calendarDay||!['lectivo','clases','jornada_especial'].includes(String(calendarDay.tipo).toLowerCase()))return json(res,409,{error:'El calendario no marca hoy como día lectivo.'});
        const existing=await storage.read('listas_asistencia');if(existing.some(x=>x.horarioId===schedule.id&&x.fecha===date))return json(res,409,{error:'Ya existe una lista para esta clase y fecha.'});
        const enrollment=await storage.read('inscripciones'),students=await storage.read('alumnos'),members=enrollment.filter(x=>x.grupoId===schedule.grupoId&&x.estado==='activa').map(x=>students.find(s=>s.id===x.alumnoId)).filter(Boolean);
        const list={id:randomUUID(),horarioId:schedule.id,sesionId:schedule.sesionId??schedule.id,fecha:date,maestroId:user.personaId,grupoId:schedule.grupoId,materiaId:schedule.materiaId,estado:'abierta',alumnos:members.map(s=>({alumnoId:s.id,nombreSnapshot:[s.nombres,s.apellidos].filter(Boolean).join(' '),estado:'pendiente'})),creadaEn:new Date().toISOString()};
        await storage.update('listas_asistencia',rows=>{if(rows.some(x=>x.horarioId===schedule.id&&x.fecha===date))throw fail(409,'Ya existe una lista para esta clase y fecha.');return[...rows,list]});await audit(user,'abrir_lista',list.id);return json(res,201,list);
      }
      const closeMatch=url.pathname.match(/^\/api\/listas_asistencia\/([^/]+)\/cerrar$/);
      if(req.method==='POST'&&closeMatch){
        const list=(await storage.read('listas_asistencia')).find(x=>x.id===closeMatch[1]);if(!list||list.estado!=='abierta')return json(res,404,{error:'No existe una lista abierta.'});if(user.rol!=='direccion'&&!(user.rol==='maestro'&&user.personaId===list.maestroId))return json(res,403,{error:'No tienes permiso para cerrar esta lista.'});
        const schedule=(await storage.read('horarios')).find(x=>x.id===list.horarioId);if(schedule&&list.fecha===todayAt()&&schedule.horaFin&&timeAt(new Date(),schedule.zonaHoraria??'America/Guatemala')<schedule.horaFin)return json(res,409,{error:'La clase todavía no termina; la lista no puede cerrarse.'});
        const input=await body(req),states=new Map((input.alumnos??[]).map(x=>[x.alumnoId,x.estado]));const allowedStates=new Set(['presente','retardo','ausente']);if(list.alumnos.some(x=>!allowedStates.has(states.get(x.alumnoId))))return json(res,400,{error:'Confirma el estado de cada alumno antes de cerrar la lista.'});
        const closed={...list,estado:'cerrada',alumnos:list.alumnos.map(x=>({...x,estado:states.get(x.alumnoId)})),cerradaEn:new Date().toISOString(),cerradaPor:user.id};const snapshots=[];
        const approvedPermits=await storage.read('permisos');for(const student of closed.alumnos){if(student.estado==='ausente'){const permit=approvedPermits.find(x=>x.alumnoId===student.alumnoId&&x.fecha===list.fecha&&x.estado==='autorizado');snapshots.push({collection:'faltas',record:{id:`falta_${list.id}_${student.alumnoId}`,alumnoId:student.alumnoId,nombreSnapshot:student.nombreSnapshot,fecha:list.fecha,grupoId:list.grupoId,materiaId:list.materiaId,sesionId:list.sesionId,maestroId:list.maestroId,estado:permit?'justificada':'confirmada',...(permit?{permisoId:permit.id}:{}),listaId:list.id,creadoEn:new Date().toISOString()}});}if(student.estado==='retardo')snapshots.push({collection:'retardos',record:{id:`retardo_${list.id}_${student.alumnoId}`,alumnoId:student.alumnoId,nombreSnapshot:student.nombreSnapshot,fecha:list.fecha,grupoId:list.grupoId,materiaId:list.materiaId,sesionId:list.sesionId,maestroId:list.maestroId,estado:'registrado',listaId:list.id,creadoEn:new Date().toISOString()}});}
        await storage.backup(backupDir);const patches=[{collection:'listas_asistencia',upsert:[closed]},...['faltas','retardos'].map(collection=>({collection,upsert:snapshots.filter(x=>x.collection===collection).map(x=>x.record)}))];await storage.transact(async read=>{const latest=(await read('listas_asistencia')).find(x=>x.id===list.id);if(!latest||latest.estado!=='abierta')throw fail(409,'La lista ya se cerró en otra solicitud.');return patches});for(const student of closed.alumnos.filter(item=>item.estado==='ausente'))await notifyTutorsOfStudentEvent(student.alumnoId,{id:`falta_${list.id}_${student.alumnoId}`,tipo:'falta',at:new Date().toISOString(),materiaNombre:list.materiaNombre??list.materiaSnapshot??list.materiaId});await audit(user,'cerrar_lista',list.id);return json(res,200,closed);
      }
      if(req.method==='GET'&&url.pathname==='/api/calificaciones/opciones'&&user.rol==='maestro'){
        const [schedules,groups,subjects,students,enrollments,periods]=await Promise.all(['horarios','grupos','materias','alumnos','inscripciones','periodos_evaluacion'].map(name=>storage.read(name)));
        const assigned=schedules.filter(item=>item.activo!==false&&item.maestroId===user.personaId),groupIds=new Set(assigned.map(item=>item.grupoId)),subjectIds=new Set(assigned.map(item=>item.materiaId));
        const eligibleStudentIds=new Set(enrollments.filter(item=>groupIds.has(item.grupoId)&&item.estado==='activa').map(item=>item.alumnoId));
        return json(res,200,{
          alumnos:students.filter(item=>eligibleStudentIds.has(item.id)&&item.activo!==false).map(item=>{const enrollment=enrollments.find(link=>link.alumnoId===item.id&&link.estado==='activa'),group=groups.find(entry=>entry.id===enrollment?.grupoId);return{id:item.id,nombres:item.nombres,apellidos:item.apellidos,nombre:[item.nombres,item.apellidos].filter(Boolean).join(' '),matricula:item.matricula??'',grupoId:group?.id,grupoNombre:group?.nombre??''};}),
          grupos:groups.filter(item=>groupIds.has(item.id)&&item.activo!==false).map(item=>({id:item.id,nombre:item.nombre,ciclo:item.ciclo??'',semestre:item.semestre??''})),
          materias:subjects.filter(item=>subjectIds.has(item.id)&&item.activo!==false).map(item=>({id:item.id,nombre:item.nombre,clave:item.clave??''})),
          periodos:periods.filter(item=>item.estado!=='cerrado').map(item=>({id:item.id,nombre:item.nombre,iniciaEn:item.iniciaEn,terminaEn:item.terminaEn})),
          asignaciones:assigned.map(item=>({grupoId:item.grupoId,materiaId:item.materiaId}))
        });
      }
      if(req.method==='POST'&&url.pathname==='/api/calificaciones'&&user.rol==='maestro'){
        const input=await body(req),student=(await storage.read('alumnos')).find(x=>x.id===input.alumnoId),period=(await storage.read('periodos_evaluacion')).find(x=>x.id===input.periodoId&&x.estado!=='cerrado');if(!student||!period)return json(res,400,{error:'Alumno o periodo de evaluación inválido.'});
        const groupId=input.grupoId??(await storage.read('inscripciones')).find(x=>x.alumnoId===student.id&&x.estado==='activa')?.grupoId;
        if(!(await storage.read('horarios')).some(x=>x.activo!==false&&x.maestroId===user.personaId&&x.grupoId===groupId&&x.materiaId===input.materiaId))return json(res,403,{error:'No tienes asignada esta materia y grupo.'});
        const settings=(await storage.read('configuracion'))[0]??{},value=Number(input.valor),min=Number(period.escalaMin??settings.escalaMin??0),max=Number(period.escalaMax??settings.escalaMax??100);if(!Number.isFinite(value)||value<min||value>max)return json(res,400,{error:`La calificación debe estar entre ${min} y ${max}.`});
        if((await storage.read('boletas')).some(x=>x.alumnoId===student.id&&x.periodoId===period.id&&x.publicada))return json(res,409,{error:'La boleta ya fue publicada. Dirección debe retirarla antes de una corrección.'});
        const now=new Date().toISOString();let savedGrade;
        await storage.transact(async read=>{const rows=await read('calificaciones'),boletas=await read('boletas');if(boletas.some(x=>x.alumnoId===student.id&&x.periodoId===period.id&&x.publicada))throw fail(409,'La boleta ya fue publicada. Dirección debe retirarla antes de una corrección.');const old=rows.find(x=>x.alumnoId===student.id&&x.materiaId===String(input.materiaId)&&x.periodoId===period.id);savedGrade={id:old?.id??randomUUID(),alumnoId:student.id,materiaId:String(input.materiaId),maestroId:user.personaId,grupoId:groupId,periodoId:period.id,valor:value,estado:'borrador',modificadoPor:user.id,modificadoEn:now,creadoEn:old?.creadoEn??now};return[{collection:'calificaciones',upsert:[savedGrade]}];});await audit(user,'capturar_calificacion',savedGrade.id);return json(res,201,savedGrade);
      }
      if(req.method==='POST'&&url.pathname==='/api/boletas/publicar'&&user.rol==='direccion'){
        const input=await body(req),studentId=input.alumnoId,periodId=input.periodoId;if(!(await storage.read('alumnos')).some(x=>x.id===studentId)||!(await storage.read('periodos_evaluacion')).some(x=>x.id===periodId))return json(res,400,{error:'Alumno o periodo inválido.'});
        await storage.backup(backupDir);const published=await storage.transact(async read=>{const grades=(await read('calificaciones')).filter(x=>x.alumnoId===studentId&&x.periodoId===periodId);if(!grades.length)throw fail(409,'No hay calificaciones para publicar.');const all=await read('boletas'),old=all.find(x=>x.alumnoId===studentId&&x.periodoId===periodId);const boleta={id:old?.id??randomUUID(),alumnoId:studentId,periodoId:periodId,publicada:true,publicadaEn:new Date().toISOString(),publicadaPor:user.id,referenciasCalificacionIds:grades.map(x=>x.id)};return[{collection:'boletas',upsert:[boleta]}];});await audit(user,'publicar_boleta',studentId);const boleta=(await storage.read('boletas')).find(x=>x.alumnoId===studentId&&x.periodoId===periodId);return json(res,200,boleta);
      }
      if(req.method==='POST'&&url.pathname==='/api/permisos'){
        if(user.rol!=='tutor')return json(res,403,{error:'Solo los tutores pueden solicitar permisos. Los alumnos únicamente pueden consultar permisos autorizados.'});
        const input=await body(req),alumnoId=String(input.alumnoId??''),student=(await storage.read('alumnos')).find(x=>x.id===alumnoId&&x.activo!==false);
        if(!student)return json(res,404,{error:'No se encontró una ficha activa para el alumno.'});
        if(user.rol==='tutor'&&!(await storage.read('relaciones_tutores')).some(x=>x.tutorId===user.personaId&&x.alumnoId===alumnoId&&x.activa))return json(res,403,{error:'El alumno no está vinculado a tu cuenta.'});
        const validDate=typeof input.fecha==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)&&!Number.isNaN(Date.parse(`${input.fecha}T00:00:00Z`))&&new Date(`${input.fecha}T00:00:00Z`).toISOString().slice(0,10)===input.fecha;if(!validDate||typeof input.motivo!=='string'||input.motivo.trim().length<10||input.motivo.trim().length>2000)return json(res,400,{error:'Indica una fecha válida y describe el motivo con al menos 10 caracteres.'});
        const validImage=value=>typeof value==='string'&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)&&Buffer.from(value.slice(value.indexOf(',')+1),'base64').length<=1_800_000;
        if(!validImage(input.fotoCredencial)||Buffer.from(input.fotoCredencial.slice(input.fotoCredencial.indexOf(',')+1),'base64').length>1_000_000)return json(res,400,{error:'Adjunta una foto JPG, PNG o WEBP legible de la credencial (máximo 1 MB después de comprimir).'});
        if(input.firmaTutor&&!(typeof input.firmaTutor==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.firmaTutor)&&Buffer.from(input.firmaTutor.slice(input.firmaTutor.indexOf(',')+1),'base64').length<=300_000))return json(res,400,{error:'La firma opcional no tiene un formato válido.'});
        const existing=(await storage.read('permisos')).find(x=>x.alumnoId===alumnoId&&x.fecha===input.fecha&&['pendiente','autorizado'].includes(x.estado));if(existing)return json(res,409,{error:'Ya existe un permiso pendiente o autorizado para ese alumno y fecha.'});
        const permit={id:randomUUID(),alumnoId,tutorId:user.rol==='tutor'?user.personaId:null,nombreSnapshot:[student.nombres,student.apellidos].filter(Boolean).join(' '),matricula:student.matricula,fecha:input.fecha,motivo:input.motivo.trim(),fotoCredencial:input.fotoCredencial,...(input.firmaTutor?{firmaTutor:input.firmaTutor}:{}),estado:'pendiente',solicitadoPor:user.id,solicitadoEn:new Date().toISOString()};
        await storage.update('permisos',rows=>[...rows,permit]);await audit(user,'solicitar_permiso',permit.id);return json(res,201,{id:permit.id,estado:permit.estado,fecha:permit.fecha,mensaje:'Solicitud enviada. El permiso solo tendrá efecto después de la revisión y autorización de Dirección.'});
      }
      const permissionMatch=url.pathname.match(/^\/api\/permisos\/([^/]+)\/resolver$/);
      if(req.method==='POST'&&permissionMatch&&user.rol==='direccion'){
        const input=await body(req),decision=input.decision;if(!['autorizar','rechazar'].includes(decision))return json(res,400,{error:'La decisión debe ser autorizar o rechazar.'});if(decision==='autorizar'&&input.revisionCompleta!==true)return json(res,400,{error:'Confirma que revisaste la credencial, el motivo, la fecha y los datos del alumno.'});let resolved;
        await storage.transact(async read=>{const permits=await read('permisos'),current=permits.find(x=>x.id===permissionMatch[1]);if(!current||current.estado!=='pendiente')throw fail(409,'El permiso no existe o ya fue revisado.');if(decision==='autorizar'&&(!current.fotoCredencial||!current.motivo||!current.alumnoId||!current.fecha))throw fail(409,'El permiso está incompleto y no se puede autorizar.');resolved={...current,estado:decision==='autorizar'?'autorizado':'rechazado',resueltaPor:user.id,resueltaEn:new Date().toISOString()};const patches=[{collection:'permisos',upsert:[resolved]}];if(decision==='autorizar'){const faults=await read('faltas'),matching=faults.filter(x=>x.alumnoId===current.alumnoId&&x.fecha===current.fecha);if(matching.length)patches.push({collection:'faltas',upsert:matching.map(x=>({...x,estado:'justificada',permisoId:current.id,actualizadoEn:new Date().toISOString()}))});}return patches;});await audit(user,`resolver_permiso_${decision}`,resolved.id);const{fotoCredencial,firmaTutor,...safe}=resolved;return json(res,200,safe);
      }
      if(req.method==='POST'&&url.pathname==='/api/justificaciones'&&user.rol==='tutor'){
        const input=await body(req),link=(await storage.read('relaciones_tutores')).find(x=>x.tutorId===user.personaId&&x.alumnoId===input.alumnoId&&x.activa);if(!link)return json(res,403,{error:'El alumno no está vinculado a tu cuenta.'});const faults=await storage.read('faltas'),delays=await storage.read('retardos'),record=faults.find(x=>x.id===input.registroId)||delays.find(x=>x.id===input.registroId);if(!record||record.alumnoId!==input.alumnoId)return json(res,404,{error:'No se encontró una falta o retardo de ese alumno.'});if(typeof input.motivo!=='string'||input.motivo.trim().length<5)return json(res,400,{error:'Describe el motivo de la solicitud.'});
        const request={id:randomUUID(),alumnoId:input.alumnoId,tutorId:user.personaId,registroId:record.id,tipo:faults.some(x=>x.id===record.id)?'falta':'retardo',motivo:input.motivo.trim(),estado:'pendiente',solicitadoEn:new Date().toISOString()};await storage.update('justificaciones',rows=>{if(rows.some(x=>x.registroId===record.id&&x.estado==='pendiente'))throw fail(409,'Ya existe una solicitud pendiente para este registro.');return[...rows,request]});await audit(user,'solicitar_justificacion',request.id);return json(res,201,request);
      }
      const resolveMatch=url.pathname.match(/^\/api\/justificaciones\/([^/]+)\/resolver$/);
      if(req.method==='POST'&&resolveMatch&&user.rol==='direccion'){
        const input=await body(req),decision=input.decision;if(!['autorizar','rechazar'].includes(decision))return json(res,400,{error:'La decisión debe ser autorizar o rechazar.'});let resolved;
        await storage.transact(async read=>{const all=await read('justificaciones'),current=all.find(x=>x.id===resolveMatch[1]);if(!current||current.estado!=='pendiente')throw fail(409,'La solicitud no existe o ya fue resuelta.');resolved={...current,estado:decision==='autorizar'?'autorizada':'rechazada',resueltaPor:user.id,resueltaEn:new Date().toISOString()};const patches=[{collection:'justificaciones',upsert:[resolved]}];if(decision==='autorizar'){const collection=current.tipo==='falta'?'faltas':'retardos',items=await read(collection),item=items.find(x=>x.id===current.registroId);if(item)patches.push({collection,upsert:[{...item,estado:'justificada',justificacionId:current.id,actualizadoEn:new Date().toISOString()}]});}return patches;});await audit(user,`resolver_justificacion_${decision}`,resolved.id);return json(res,200,resolved);
      }
      const withdrawMatch=url.pathname.match(/^\/api\/boletas\/([^/]+)\/retirar$/);
      if(req.method==='POST'&&withdrawMatch&&user.rol==='direccion'){
        const list=await storage.read('boletas'),current=list.find(x=>x.id===withdrawMatch[1]&&x.publicada);if(!current)return json(res,404,{error:'No existe una boleta publicada con ese ID.'});const updated={...current,publicada:false,retiradaEn:new Date().toISOString(),retiradaPor:user.id};await storage.update('boletas',rows=>rows.map(x=>x.id===current.id?updated:x));await audit(user,'retirar_boleta',current.id);return json(res,200,updated);
      }
      const closeDay=url.pathname.match(/^\/api\/jornadas\/([^/]+)\/cerrar$/);
      if(req.method==='POST'&&closeDay&&user.rol==='direccion'){
        const current=(await storage.read('jornadas')).find(x=>x.id===closeDay[1]);if(!current)return json(res,404,{error:'Jornada no encontrada.'});const closed={...current,estado:'cerrada',cerradaEn:new Date().toISOString(),cerradaPor:user.id};
        const revoked=(await storage.read('qr_diarios')).filter(x=>x.jornadaId===current.id&&x.activa).map(x=>({...x,activa:false,revocadaEn:new Date().toISOString()}));await storage.transact([{collection:'jornadas',upsert:[closed]},{collection:'qr_diarios',upsert:revoked}]);await audit(user,'cerrar_jornada',current.id);return json(res,200,closed);
      }
      if (match && req.method === 'POST' && match[1] === 'usuarios' && user.rol === 'direccion') {
        const input = await body(req);
        const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
        if (!email.includes('@') || typeof input.nombre !== 'string' || !input.nombre.trim() || !roles.includes(input.rol) || typeof input.password !== 'string' || input.password.length < 12) return json(res, 400, { error: 'Indica nombre, correo válido, rol y contraseña de al menos 12 caracteres.' });
        let personaId = input.personaId;
        if(input.rol==='alumno'){
          const students=await storage.read('alumnos'),student=typeof personaId==='string'?students.find(person=>person.id===personaId&&person.activo!==false):null;
          if(student){
           const groups=await storage.read('grupos'),enrollments=await storage.read('inscripciones'),group=groups.find(item=>item.id===(student.grupoId??enrollments.find(item=>item.alumnoId===student.id&&item.estado==='activa')?.grupoId)),assignedAreaId=student.especialidadId??group?.especialidadId;
           const areas=await storage.read('especialidades'),storedAreaName=student.especialidadNombre??student.especialidad??'';let area=assignedAreaId?areas.find(item=>item.id===assignedAreaId&&item.activo!==false):null;
           if(area&&storedAreaName&&normalizeAreaName(storedAreaName)!==normalizeAreaName(area.nombre))return json(res,409,{error:'El área no coincide con el expediente seleccionado.'});
           if(!area){const selectedAreaName=storedAreaName||input.especialidad;if(typeof selectedAreaName==='string')area=areas.find(item=>item.activo!==false&&normalizeAreaName(item.nombre)===normalizeAreaName(selectedAreaName));}
           if(!area)return json(res,400,{error:'El alumno seleccionado no tiene un área activa asociada. Asigna un área antes de crear su cuenta.'});
           if(assignedAreaId&&assignedAreaId!==area.id)return json(res,409,{error:'El área no coincide con el expediente seleccionado.'});
           personaId=student.id;input.especialidadId=area.id;
          }else{
           const matricula=typeof input.matricula==='string'?input.matricula.trim().toLocaleLowerCase('es'):'';
           const legacyStudent=students.find(person=>String(person.matricula??'').trim().toLocaleLowerCase('es')===matricula&&person.activo!==false);
           if(!legacyStudent)return json(res,400,{error:'Selecciona un alumno activo existente.'});
           const area= (await storage.read('especialidades')).find(x=>x.activo!==false&&normalizeAreaName(x.nombre)===normalizeAreaName(input.especialidad));if(!area)return json(res,400,{error:'La especialidad no coincide con un área activa.'});if(legacyStudent.especialidadId&&legacyStudent.especialidadId!==area.id)return json(res,409,{error:'La especialidad no coincide con el expediente seleccionado.'});
           personaId=legacyStudent.id;input.especialidadId=area.id;
          }
        }else if (input.rol !== 'direccion') {
          const personCollection = { alumno: 'alumnos', maestro: 'maestros', tutor: 'tutores' }[input.rol];
          if (typeof personaId !== 'string' || !(await storage.read(personCollection)).some(person => person.id === personaId&&person.activo!==false)) return json(res, 400, { error: 'Selecciona un expediente activo para esta cuenta.' });
        }
        await storage.backup(backupDir);const passwordHash = await hashPassword(input.password);
        const created = { id: randomUUID(), email, nombre: input.nombre.trim(), rol: input.rol, activo: true, ...(personaId ? { personaId } : {}), ...(input.rol==='alumno'?{especialidadId:input.especialidadId}:{}), passwordHash, creadoEn: new Date().toISOString() };
        await storage.update('usuarios', rows => {
          if (rows.some(item => item.email.toLowerCase() === email)) throw Object.assign(new Error('Ya existe una cuenta con ese correo.'), { status: 409 });
          if(personaId&&rows.some(item=>item.rol===input.rol&&item.personaId===personaId&&item.activo))throw fail(409,'Ese expediente ya tiene una cuenta activa.');
          return [...rows, created];
        });
        await audit(user, 'crear_usuario', created.id);
        const { passwordHash: _secret, ...safe } = created;
        return json(res, 201, safe);
      }
      if (match && req.method === 'POST' && user.rol === 'direccion' && createCollections.includes(match[1])) {
        const collection = match[1];
        const record = await body(req);
        if (!record || typeof record !== 'object' || Array.isArray(record)) return json(res, 400, { error: 'Registro inválido.' });
        if(collection==='avisos_escolares'){record.audiencia=record.audiencia??'usuarios';if(!['usuarios','alumno','tutor','maestro'].includes(record.audiencia))return json(res,400,{error:'Selecciona un destinatario válido para el aviso.'});}
        validateFields(collection,record);
        if(collection==='grupos'){
          const area=(await storage.read('especialidades')).find(x=>x.id===record.especialidadId&&x.activo!==false);if(!area)return json(res,400,{error:'Selecciona un área activa existente.'});record.semestre=Number(record.semestre);if(!Number.isInteger(record.semestre)||record.semestre<1||record.semestre>6)return json(res,400,{error:'Selecciona un semestre del 1 al 6.'});
          if(record.semestreId&&!(await storage.read('semestres')).some(x=>x.id===record.semestreId))return json(res,400,{error:'El semestre indicado no existe.'});
          if(record.especialidadId&&!(await storage.read('especialidades')).some(x=>x.id===record.especialidadId))return json(res,400,{error:'La especialidad indicada no existe.'});
        }
        if(collection==='relaciones_tutores'){
          if(!(await storage.read('tutores')).some(x=>x.id===record.tutorId)||!(await storage.read('alumnos')).some(x=>x.id===record.alumnoId))return json(res,400,{error:'El tutor y el alumno deben existir.'});
        }
        if(collection==='inscripciones'){
          if(!(await storage.read('alumnos')).some(x=>x.id===record.alumnoId)||!(await storage.read('grupos')).some(x=>x.id===record.grupoId))return json(res,400,{error:'El alumno y grupo deben existir.'});
        }
        if(collection==='horarios'){
          for(const [name,id] of [['maestros',record.maestroId],['grupos',record.grupoId],['materias',record.materiaId]])if(!(await storage.read(name)).some(x=>x.id===id))return json(res,400,{error:`La referencia ${name} no existe.`});
          const conflict=(await storage.read('horarios')).find(x=>x.activo!==false&&Number(x.diaSemana)===Number(record.diaSemana)&&[x.maestroId===record.maestroId,x.grupoId===record.grupoId,Boolean(record.aula&&x.aula===record.aula)].some(Boolean)&&record.horaInicio<x.horaFin&&record.horaFin>x.horaInicio);
          if(conflict)return json(res,409,{error:'El horario se cruza con otra clase del mismo maestro, grupo o aula.'});
          record.diaSemana=Number(record.diaSemana);
        }
        if(['horarios','periodos_evaluacion'].includes(collection))await storage.backup(backupDir);
        const saved = { ...record, ...(collection==='avisos_escolares'?{audiencia:record.audiencia??'usuarios'}:{}), id: randomUUID(), creadoEn: new Date().toISOString(), actualizadoEn:new Date().toISOString() };
        await storage.update(collection, rows => {
          const unique=({alumnos:['matricula'],maestros:['numeroEmpleado'],especialidades:['clave'],materias:['clave']}[collection]??[]);
          if(collection==='especialidades'&&rows.some(row=>normalizeAreaName(row.nombre)===normalizeAreaName(saved.nombre)))throw fail(409,'Ya existe un área con ese nombre, aunque cambien los acentos o las mayúsculas.');
          if(unique.some(field=>saved[field]&&rows.some(row=>String(row[field]).toLowerCase()===String(saved[field]).toLowerCase())))throw fail(409,`Ya existe un registro con el mismo ${unique[0]}.`);
          if(collection==='relaciones_tutores'&&rows.some(x=>x.tutorId===saved.tutorId&&x.alumnoId===saved.alumnoId))throw fail(409,'El tutor ya está vinculado a ese alumno.');
          if(collection==='inscripciones'&&saved.estado==='activa'&&rows.some(x=>x.alumnoId===saved.alumnoId&&x.estado==='activa'))throw fail(409,'El alumno ya tiene una inscripción activa.');
          return [...rows, saved];
        });
        await audit(user, 'crear', collection);
        if(collection==='avisos_escolares'&&saved.publicado)return json(res,201,{...saved,notificacionesPush:await notifyPublishedAnnouncement(saved)});
        return json(res, 201, saved);
      }
      return json(res, 404, { error: 'Ruta no encontrada.' });
    }
    const candidate = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!candidate.startsWith(root + path.sep) && candidate !== path.join(root, 'index.html')) return json(res, 403, { error: 'Ruta no permitida.' });
    const info = await stat(candidate).catch(() => null);
    if (!info?.isFile()) return json(res, 404, { error: 'No encontrado.' });
    const ext = path.extname(candidate).toLowerCase();
    const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
    res.writeHead(200, { ...securityHeaders,'content-type': contentTypes[ext] ?? 'application/octet-stream','cache-control': candidate.endsWith(`${path.sep}sw.js`) ? 'no-cache' : 'public, max-age=300' });
    res.end(await readFile(candidate));
  } catch (error) { if(!error.status)console.error('Error de solicitud:',error.stack??error.message);json(res, error.status ?? 500, { error: error.status ? error.message : 'Error interno del servidor.' }); }
});
server.listen(port, env.HOST ?? '127.0.0.1', () => console.log(`Plataforma escolar disponible en http://${env.HOST ?? '127.0.0.1'}:${port}`));
setInterval(runScheduledJobs,30_000);
runScheduledJobs();
