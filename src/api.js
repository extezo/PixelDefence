// Клиент серверной таблицы лидеров (см. serve.py).

async function call(path, body) {
  let res;
  try {
    res = await fetch(path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);
  } catch {
    throw new Error('Сервер недоступен');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка сервера (${res.status})`);
  return data;
}

export const register = (nick) => call('/api/register', { nick });
// daily — дата вызова дня (UTC, ГГГГ-ММ-ДД) или null для обычной партии.
export const submitScore = ({ nick, token, wave, seed, heat, daily }) =>
  call('/api/score', { nick, token, wave, seed, heat, daily });
export const leaderboard = (day = null) => call(day ? `/api/leaderboard?daily=${encodeURIComponent(day)}` : '/api/leaderboard');
