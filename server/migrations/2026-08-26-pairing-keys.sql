-- 一次性生产迁移（root 手动执行，见 spec 迁移顺序：先发前端 1.0.146，再跑本脚本 + deploy.sh）。
-- 幂等可重跑：表不存在则建；backfill 用 INSERT IGNORE 防重复；DROP 用 IF EXISTS。
CREATE TABLE IF NOT EXISTS pairing_keys (
  key_hash       CHAR(64) CHARACTER SET ascii NOT NULL,
  registered_at  BIGINT NOT NULL,
  revoked_at     BIGINT NULL,
  PRIMARY KEY (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT IGNORE INTO pairing_keys (key_hash, registered_at, revoked_at)
  SELECT key_hash, revoked_at, revoked_at FROM revoked_keys;

DROP TABLE IF EXISTS revoked_keys;
