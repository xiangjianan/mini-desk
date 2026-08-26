CREATE TABLE inbox_items (
  key_hash   CHAR(64) CHARACTER SET ascii NOT NULL,
  id         VARCHAR(64) NOT NULL,
  payload    TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  read_at    BIGINT NULL,
  PRIMARY KEY (key_hash, id),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 配对码注册表：三态——无行 unknown（从未注册）/ revoked_at IS NULL active / 非空 revoked。
-- 注册 INSERT IGNORE（不复活注销行）；表永久保留，30 天保留期只清 inbox_items。
CREATE TABLE pairing_keys (
  key_hash       CHAR(64) CHARACTER SET ascii NOT NULL,
  registered_at  BIGINT NOT NULL,
  revoked_at     BIGINT NULL,
  PRIMARY KEY (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
