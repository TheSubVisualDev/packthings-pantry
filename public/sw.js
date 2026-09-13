// The service worker, which exists for one reason: notifications.
//
// It deliberately does not cache anything. A pantry is a shared, live view of
// what is on the shelves - two people in one kitchen, one of them adding a tin
// while the other looks at the list - and a stale-while-revalidate cache over
// that shows somebody stock that is not there. The app is already installable
// without a worker; this adds the one capability a manifest cannot.
//
// Registered by components/push-toggle.tsx, only when somebody turns
// notifications on.

self.addEventListener("install", () => {
  // Take over straight away rather than waiting for every tab to close. There
  // is nothing cached to invalidate, so the usual reason for waiting does not
  // apply, and the alternative is somebody turning notifications on and not
  // getting them until they have quit the app.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // A push with no readable body still deserves to show something. A silent
  // failure here looks identical to notifications not working at all.
  let payload = {
    title: "Pantry",
    body: "Time to think about the week ahead.",
    url: "/plan",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Left as the default.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // One tag, so a nudge that was never tapped is replaced by the next one
      // rather than stacking up into a fortnight of identical reminders.
      tag: "pantry-nudge",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/plan";

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Reuse a window that is already open rather than adding a second copy
      // of an app that is meant to feel installed.
      for (const client of open) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
