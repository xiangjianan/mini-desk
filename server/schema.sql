CREATE TABLE inbox_items (
  key_hash   CHAR(64) CHARACTER SET ascii NOT NULL,
  id         VARCHAR(64) NOT NULL,
  payload    TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  read_at    BIGINT NULL,
  PRIMARY KEY (key_hash, id),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
