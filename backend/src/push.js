let pushClient;

export async function sendPushNotifications(storage, userIds, message, env = process.env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return 0;
  const webPush = (await import('web-push')).default;
  if (!pushClient) {
    webPush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    pushClient = webPush;
  }
  const targets = new Set(userIds);
  const subscriptions = (await storage.read('suscripciones_push')).filter(item => targets.has(item.usuarioId));
  const payload = JSON.stringify({ title: 'Asistencia · Nuevo mensaje', body: message.asunto, url: '/?mensaje=' + encodeURIComponent(message.id) });
  let delivered = 0;
  await Promise.all(subscriptions.map(async item => {
    try {
      await pushClient.sendNotification(item.subscription, payload, { TTL: 86400 });
      delivered++;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await storage.update('suscripciones_push', rows => rows.filter(row => row.id !== item.id));
      } else {
        console.error('No se pudo enviar una notificación push:', error.statusCode ?? error.message);
      }
    }
  }));
  return delivered;
}
