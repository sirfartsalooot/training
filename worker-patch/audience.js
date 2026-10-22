// ПАТЧ CLOUDFLARE WORKER: общий итог по уникальным участникам для слайдов 29 и 38.
// Патч только ДОБАВЛЯЕТ поле "audience" в ответ GET /api/results.
// Запись ответов, схема D1, защита от повторного голосования и остальные поля ответа не меняются.
//
// Шаг 1. Вставьте функцию audienceStats целиком в код Worker (на верхнем уровне, например сразу перед функцией stats).
// Шаг 2. В функции stats(env, url), прямо перед её строкой `return {...}`, добавьте одну строку:
//
//     const audience = await audienceStats(env, sid, slide);
//
//    где sid и slide — переменные, в которых stats уже хранит sessionId и slideId (если они названы иначе, подставьте их имена).
// Шаг 3. В объект, который возвращает stats, добавьте поле audience. Было, например:
//
//     return {sessionId:sid, slideId:slide, totalResponses:entries.length, units, updatedAt:...};
//
//    Стало:
//
//     return {sessionId:sid, slideId:slide, totalResponses:entries.length, units, audience, updatedAt:...};
//
// Шаг 4. Deploy.

async function audienceStats(env, sessionId, slideId) {
  // Блоки, которые нужно пройти, чтобы задание считалось выполненным целиком.
  // Блок "back" на слайде 29 (возврат к первому опросу) в итог не входит.
  const REQUIRED = {
    s29: ['crm', 'draft', 'rcpt'],
    s38: ['data_disclosure', 'status_change', 'resource_exhaustion']
  };
  const req = REQUIRED[slideId];
  if (!req) return null;

  const ph = req.map(() => '?').join(',');
  const n = req.length;
  // first: ровно одна, самая ранняя запись на пару (участник, блок).
  // Если дубли в D1 уже запрещены ограничением UNIQUE, фильтр ничего не меняет; если нет — повторы не учитываются.
  const sql = `
    WITH first AS (
      SELECT participant_key, unit_id, outcome FROM responses
      WHERE rowid IN (
        SELECT MIN(rowid) FROM responses
        WHERE session_id = ? AND slide_id = ?
        GROUP BY participant_key, unit_id
      )
    ),
    per AS (
      SELECT participant_key,
        COUNT(DISTINCT CASE WHEN unit_id IN (${ph}) THEN unit_id END) AS done,
        COUNT(DISTINCT CASE WHEN unit_id IN (${ph}) AND outcome = 'Passed' THEN unit_id END) AS ok
      FROM first
      GROUP BY participant_key
    )
    SELECT
      COUNT(*) AS uniqueParticipants,
      COALESCE(SUM(CASE WHEN done = ${n} THEN 1 ELSE 0 END), 0) AS allCompleted,
      COALESCE(SUM(CASE WHEN ok = ${n} THEN 1 ELSE 0 END), 0) AS allPassed
    FROM per`;

  const row = await env.DB.prepare(sql).bind(sessionId, slideId, ...req, ...req).first();
  return {
    uniqueParticipants: Number(row?.uniqueParticipants || 0), // разные участники, ответившие хотя бы на один блок слайда
    allCompleted: Number(row?.allCompleted || 0),             // ответили на все обязательные блоки
    allPassed: Number(row?.allPassed || 0)                    // прошли все обязательные блоки без ошибок (outcome = 'Passed')
  };
}
