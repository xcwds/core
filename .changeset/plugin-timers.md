---
'@xcwds/plugin-timers': minor
---

Timers that count against wall-clock end times and are saved, so they survive a backgrounded
tab and a reload; the app owns them, so they ring, keep the screen awake and hold off updates on
every page. With `TimerList`, `Countdown` and `TimerAlert` components and an `alarm` setting.
