-- Points are called coins in everything a person reads: tanga (uz), монеты
-- (ru), coins (en). Only the stored Telegram texts change here. Type names,
-- {placeholders} and the /points command keep their names.
--
--   a text still equal to the shipped default  → the new default
--   a text the owner has edited                → the old word is replaced in place
--
-- Only the four points messages are touched: in any other text "ball" or
-- "points" may mean something else (an exam score).

-- ───────────────────── 1. Unedited defaults ─────────────────────────

update public.message_templates t
set body = d.new_body
from (values
  ('points_weekly', 'uz',
   '{student} bu hafta {week_points} ball toʻpladi. Jami: {balance} ball. Oy reytingi: {group} guruhida {group_rank}-oʻrin, markazda {centre_rank}-oʻrin. {goal}',
   '{student} bu hafta {week_points} ta tanga toʻpladi. Jami: {balance} ta tanga. Oy reytingi: {group} guruhida {group_rank}-oʻrin, markazda {centre_rank}-oʻrin. {goal}'),
  ('points_weekly', 'ru',
   '{student}: за неделю {week_points} баллов. Всего: {balance}. Рейтинг за месяц: {group_rank}-е место в группе {group}, {centre_rank}-е в центре. {goal}',
   '{student}: за неделю {week_points} монет. Всего: {balance}. Рейтинг за месяц: {group_rank}-е место в группе {group}, {centre_rank}-е в центре. {goal}'),
  ('points_weekly', 'en',
   '{student} earned {week_points} points this week. Total: {balance}. This month: #{group_rank} in {group}, #{centre_rank} in the centre. {goal}',
   '{student} earned {week_points} coins this week. Total: {balance}. This month: #{group_rank} in {group}, #{centre_rank} in the centre. {goal}'),
  ('points_deduction', 'uz',
   '{student}dan {points} ball olindi ({group}). Sabab: {reason}. Balans: {balance} ball. {centre}',
   '{student}dan {points} ta tanga olindi ({group}). Sabab: {reason}. Balans: {balance} ta tanga. {centre}'),
  ('points_deduction', 'ru',
   '{student}: снято {points} баллов ({group}). Причина: {reason}. Баланс: {balance}. {centre}',
   '{student}: снято {points} монет ({group}). Причина: {reason}. Баланс: {balance}. {centre}'),
  ('points_deduction', 'en',
   '{student} lost {points} points ({group}). Reason: {reason}. Balance: {balance}. {centre}',
   '{student} lost {points} coins ({group}). Reason: {reason}. Balance: {balance}. {centre}'),
  ('points_month_result', 'uz',
   '{month} yakunlari: {student} {month_points} ball toʻpladi. {group} guruhida {group_rank}-oʻrin, markazda {centre_rank}-oʻrin. {bonus}',
   '{month} yakunlari: {student} {month_points} ta tanga toʻpladi. {group} guruhida {group_rank}-oʻrin, markazda {centre_rank}-oʻrin. {bonus}'),
  ('points_month_result', 'ru',
   'Итоги за {month}: {student} — {month_points} баллов. {group_rank}-е место в группе {group}, {centre_rank}-е в центре. {bonus}',
   'Итоги за {month}: {student} — {month_points} монет. {group_rank}-е место в группе {group}, {centre_rank}-е в центре. {bonus}'),
  ('points_month_result', 'en',
   '{month} results: {student} earned {month_points} points. #{group_rank} in {group}, #{centre_rank} in the centre. {bonus}',
   '{month} results: {student} earned {month_points} coins. #{group_rank} in {group}, #{centre_rank} in the centre. {bonus}'),
  ('reward_update', 'uz',
   '{student}, “{reward}”: {update} Balans: {balance} ball.',
   '{student}, “{reward}”: {update} Balans: {balance} ta tanga.')
  -- reward_update in ru and en never named the unit: nothing to change.
) as d (type, language, old_body, new_body)
where t.channel = 'telegram'
  and t.type::text = d.type
  and t.language::text = d.language
  and t.body = d.old_body;

-- ─────────────────────── 2. Edited texts ────────────────────────────

-- The old word in each of its forms becomes the coin word. A word inside
-- braces is a placeholder and is never matched: {points}, {week_points},
-- {month_points} and {points_needed} stay as they are, and so does /points.
create function pg_temp.coins_wording(p_body text, p_language text)
returns text
language plpgsql
immutable
as $$
declare
  body text := p_body;
  form text[];
  -- Not part of a longer word.
  ru_start constant text := '(?<![А-Яа-яЁё])';
  ru_end constant text := '(?![А-Яа-яЁё])';
  uz_start constant text := '(?<![A-Za-zʻʼ{_/])';
  uz_end constant text := '(?![A-Za-zʻʼ}_])';
  en_start constant text := '(?<![A-Za-z{_/])';
  en_end constant text := '(?![A-Za-z}_])';
begin
  if p_language = 'uz' then
    -- A counted noun takes "ta": "{points} ball" → "{points} ta tanga".
    body := regexp_replace(body, '(\}|\d) ball(?=(ga|ni|ning|dan|da)?' || uz_end || ')', '\1 ta tanga', 'g');
    -- ballar, ballari, ballarni … → tangalar, tangalari, tangalarni …
    body := regexp_replace(body, uz_start || 'ball(?=ar)', 'tangal', 'g');
    body := regexp_replace(body, uz_start || 'Ball(?=ar)', 'Tangal', 'g');
    body := regexp_replace(body, uz_start || 'BALL(?=AR)', 'TANGAL', 'g');
    -- balli (possessive) → tangasi
    body := regexp_replace(body, uz_start || 'balli' || uz_end, 'tangasi', 'g');
    body := regexp_replace(body, uz_start || 'Balli' || uz_end, 'Tangasi', 'g');
    -- ball, ballga, ballni, ballning, balldan, ballda, ballsiz
    body := regexp_replace(body, uz_start || 'ball(?=(ga|ni|ning|dan|da|siz)?' || uz_end || ')', 'tanga', 'g');
    body := regexp_replace(body, uz_start || 'Ball(?=(ga|ni|ning|dan|da|siz)?' || uz_end || ')', 'Tanga', 'g');
    body := regexp_replace(body, uz_start || 'BALL(?=(GA|NI|NING|DAN|DA|SIZ)?' || uz_end || ')', 'TANGA', 'g');

  elsif p_language = 'ru' then
    -- балл is masculine, монета feminine: each case ending has its own pair.
    foreach form slice 1 in array array[
      ['ов', ''],      -- баллов   → монет
      ['ами', 'ами'],  -- баллами  → монетами
      ['ам', 'ам'],    -- баллам   → монетам
      ['ах', 'ах'],    -- баллах   → монетах
      ['ом', 'ой'],    -- баллом   → монетой
      ['ы', 'ы'],      -- баллы    → монеты
      ['а', 'ы'],      -- балла    → монеты
      ['у', 'е'],      -- баллу    → монете
      ['е', 'е'],      -- балле    → монете
      ['', 'а']        -- балл     → монета
    ] loop
      body := regexp_replace(body, ru_start || 'балл' || form[1] || ru_end, 'монет' || form[2], 'g');
      body := regexp_replace(body, ru_start || 'Балл' || form[1] || ru_end, 'Монет' || form[2], 'g');
      body := regexp_replace(body, ru_start || 'БАЛЛ' || upper(form[1]) || ru_end, 'МОНЕТ' || upper(form[2]), 'g');
    end loop;

  elsif p_language = 'en' then
    body := regexp_replace(body, en_start || 'points' || en_end, 'coins', 'g');
    body := regexp_replace(body, en_start || 'Points' || en_end, 'Coins', 'g');
    body := regexp_replace(body, en_start || 'POINTS' || en_end, 'COINS', 'g');
    -- The singular only after a number: "at this point" is not about coins.
    body := regexp_replace(body, '(\}|\d) point' || en_end, '\1 coin', 'g');
  end if;

  return body;
end;
$$;

update public.message_templates t
set body = pg_temp.coins_wording(t.body, t.language::text)
where t.type::text in ('points_weekly', 'points_deduction', 'points_month_result', 'reward_update')
  and t.body <> pg_temp.coins_wording(t.body, t.language::text);

drop function pg_temp.coins_wording(text, text);
