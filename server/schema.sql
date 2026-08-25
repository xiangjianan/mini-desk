CREATE TABLE inbox_items (
  key_hash   CHAR(64) CHARACTER SET ascii NOT NULL,
  id         VARCHAR(64) NOT NULL,
  payload    TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  read_at    BIGINT NULL,
  PRIMARY KEY (key_hash, id),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 注销记录：桌面端清除/轮换配对码时写入，永久保留（码永久有效，除非主动注销；
-- 注销后该 key_hash 的 POST 一律 410）。30 天保留期只清 inbox_items，不清本表。
CREATE TABLE revoked_keys (
  key_hash   CHAR(64) CHARACTER SET ascii NOT NULL,
  revoked_at BIGINT NOT NULL,
  PRIMARY KEY (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
