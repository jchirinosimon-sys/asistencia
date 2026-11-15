import { randomUUID } from 'node:crypto';
import { sendPushNotifications } from './push.js';

const allowedSchoolDays = new Set(['lectivo', 'clases', 'jornada_especial']);
const weekDays = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function localDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function accountMessage(account, schedule, subject, group) {
  const start = schedule.horaInicio;
  const content = account.rol === 'maestro'
    ? `Tu clase de ${subject} con el grupo ${group} comienza a las ${start} (en 5 minutos).`
    : `Tu clase de ${subject} para el grupo ${group} comienza a las ${start} (en 5 minutos).`;
  return {
    id: randomUUID(),
    destinatarioUsuarioId: account.id,
    destinatarioNombre: account.nombre,
    ...(account.rol === 'alumno' ? { alumnoId: account.personaId } : {}),
    tipoEvento: 'recordatorio_horario',
    eventoOrigenId: schedule.id,
    claveIdempotencia: `horario:${schedule.fechaRecordatorio}:${schedule.id}:${account.id}`,
    asunto: 'Tu clase comienza en 5 minutos',
    contenido: content,
    creadoEn: new Date().toISOString(),
    leidoEn: null
  };
}

export async function sendScheduleReminders(storage, {
  now = new Date(),
  timeZone = 'America/Guatemala',
  env = process.env,
  push = sendPushNotifications
} = {}) {
  const local = localDateParts(now, timeZone);
  const date = `${local.year}-${local.month}-${local.day}`;
  const weekday = weekDays[local.weekday.toLowerCase()];
  const minute = Number(local.hour) * 60 + Number(local.minute);
  const [schedules, students, enrollments, accounts, subjects, groups, calendar] = await Promise.all([
    storage.read('horarios'),
    storage.read('alumnos'),
    storage.read('inscripciones'),
    storage.read('usuarios'),
    storage.read('materias'),
    storage.read('grupos'),
    storage.read('calendario_escolar')
  ]);
  const schoolDay = calendar.find(item => item.fecha === date && item.activo !== false);
  if (!schoolDay || !allowedSchoolDays.has(String(schoolDay.tipo).toLowerCase())) return 0;

  const candidates = [];
  for (const schedule of schedules) {
    if (schedule.activo === false || Number(schedule.diaSemana) !== weekday) continue;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.horaInicio)) continue;
    const [hour, minutePart] = schedule.horaInicio.split(':').map(Number);
    if (hour * 60 + minutePart - 5 !== minute) continue;
    if ((schedule.desde && schedule.desde > date) || (schedule.hasta && schedule.hasta < date)) continue;

    const subject = subjects.find(item => item.id === schedule.materiaId)?.nombre ?? 'una clase';
    const group = groups.find(item => item.id === schedule.grupoId)?.nombre ?? 'tu grupo';
    const teacher = accounts.filter(account =>
      account.activo === true && account.rol === 'maestro' && account.personaId === schedule.maestroId
    );
    const enrolledStudentIds = new Set(enrollments
      .filter(item => item.grupoId === schedule.grupoId && item.estado === 'activa')
      .map(item => item.alumnoId));
    const enrolledStudents = students.filter(student => student.activo !== false && enrolledStudentIds.has(student.id));
    const studentAccounts = accounts.filter(account =>
      account.activo === true && account.rol === 'alumno' && enrolledStudents.some(student => student.id === account.personaId)
    );

    for (const account of [...teacher, ...studentAccounts]) {
      candidates.push(accountMessage(account, { ...schedule, fechaRecordatorio: date }, subject, group));
    }
  }
  if (!candidates.length) return 0;

  const created = [];
  await storage.transact(async read => {
    const [notifications, messages] = await Promise.all([read('notificaciones'), read('mensajes')]);
    const existing = new Set([
      ...notifications.map(item => item.claveIdempotencia),
      ...messages.map(item => item.claveIdempotencia)
    ].filter(Boolean));
    const newMessages = candidates.filter(message => !existing.has(message.claveIdempotencia));
    created.splice(0, created.length, ...newMessages);
    if (!newMessages.length) return [];
    const newNotifications = newMessages.map(message => {
      const notification = {
        id: randomUUID(),
        claveIdempotencia: message.claveIdempotencia,
        destinatarioUsuarioId: message.destinatarioUsuarioId,
        tipo: 'recordatorio_horario',
        estado: 'generada',
        creadaEn: message.creadoEn
      };
      message.notificacionId = notification.id;
      return notification;
    });
    return [
      { collection: 'notificaciones', upsert: newNotifications },
      { collection: 'mensajes', upsert: newMessages }
    ];
  });

  await Promise.all(created.map(async message => {
    try {
      await push(storage, [message.destinatarioUsuarioId], {
        id: message.id,
        asunto: message.asunto,
        detalle: message.contenido,
        tipo: 'recordatorio_horario'
      }, env);
    } catch (error) {
      console.error('No se pudo enviar el recordatorio de horario:', error.message);
    }
  }));
  return created.length;
}
