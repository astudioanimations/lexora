CREATE TABLE IF NOT EXISTS progress (
  user_id       TEXT PRIMARY KEY,
  score         INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  bonus_words   TEXT    NOT NULL DEFAULT '[]',
  updated_at    INTEGER NOT NULL DEFAULT 0
);