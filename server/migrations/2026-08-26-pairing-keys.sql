-- 一次性生产迁移（root 手动执行，见 spec 迁移顺序：先发前端 1.0.146，再跑本脚本 + deploy.sh）。
-- 仅限首次执行：重复执行会在 backfill 处因 revoked_keys 已删除而报 ER_NO_SUCH_TABLE（数据无害，勿重跑）。
-- CREATE 用 IF NOT EXISTS、backfill 用 INSERT IGNORE、DROP 用 IF EXISTS 只为吸收中途失败后的部分重放。
CREATE TABLE IF NOT EXISTS pairing_keys (
  key_hash       CHAR(64) CHARACTER SET ascii NOT NULL,
  registered_at  BIGINT NOT NULL,
  revoked_at     BIGINT NULL,
  PRIMARY KEY (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT IGNORE INTO pairing_keys (key_hash, registered_at, revoked_at)
  SELECT key_hash, revoked_at, revoked_at FROM revoked_keys;

DROP TABLE IF EXISTS revoked_keys;
