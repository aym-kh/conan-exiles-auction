export function formatCountdown(endTime: string, now = Date.now()): string {
  const parsedEndTime = Date.parse(endTime);
  const remainingSeconds = Number.isFinite(parsedEndTime)
    ? Math.max(0, Math.floor((parsedEndTime - now) / 1000))
    : 0;
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}
