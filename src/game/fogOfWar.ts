export function formatGameTime(phase: number): string {
  const totalMinutes = Math.floor((phase % 1) * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getTimeOfDayLabel(phase: number): string {
  const hour = (phase % 1) * 24;
  if (hour >= 5 && hour < 7) return 'Рассвет';
  if (hour >= 7 && hour < 17) return 'День';
  if (hour >= 17 && hour < 20) return 'Закат';
  return 'Ночь';
}
