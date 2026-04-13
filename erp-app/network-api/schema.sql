-- Techon ERP — Local Network MySQL Schema
-- Database: techon_erp_network
-- Engine: InnoDB | Charset: utf8mb4
-- This schema is used ONLY in Network Server mode (local XAMPP).
-- All ERP data is stored as JSON key-value pairs mirroring the IndexedDB layout.

CREATE DATABASE IF NOT EXISTS techon_erp_network
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE techon_erp_network;

-- ─── Key-Value store ──────────────────────────────────────────────────
-- Mirrors IndexedDB tc3_* keys. Value is always a JSON-encoded string.
CREATE TABLE IF NOT EXISTS kv_store (
  `store_key`  VARCHAR(255)  NOT NULL,
  `value`      LONGTEXT      NOT NULL DEFAULT '[]',
  `updated_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`store_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Audit log (append-only, not full overwrite) ─────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  `id`         BIGINT        NOT NULL AUTO_INCREMENT,
  `action`     VARCHAR(255)  NOT NULL,
  `reference`  VARCHAR(255)  DEFAULT NULL,
  `user`       VARCHAR(255)  DEFAULT 'system',
  `detail`     TEXT          DEFAULT NULL,
  `created_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX idx_action (`action`),
  INDEX idx_created (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Client sessions (track connected POS terminals) ─────────────────
CREATE TABLE IF NOT EXISTS client_sessions (
  `id`         VARCHAR(64)   NOT NULL,
  `hostname`   VARCHAR(255)  DEFAULT NULL,
  `ip`         VARCHAR(64)   DEFAULT NULL,
  `last_seen`  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Processed patch IDs (duplicate sync protection) ─────────────────
-- Stores IDs of successfully applied patches so they are never re-applied.
-- Entries older than 7 days are cleaned up automatically on each request.
CREATE TABLE IF NOT EXISTS processed_patches (
  `patch_id`     VARCHAR(128)  NOT NULL,
  `store_key`    VARCHAR(255)  NOT NULL,
  `processed_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`patch_id`),
  INDEX idx_processed_at (`processed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Shop license snapshot (written by server, read by clients) ──────
-- Single-row table (id always = 1). Updated after each activation/verify.
CREATE TABLE IF NOT EXISTS shop_license (
  `id`           INT           NOT NULL DEFAULT 1,
  `status`       VARCHAR(20)   NOT NULL DEFAULT 'none',
  `shop_name`    VARCHAR(255)  DEFAULT NULL,
  `license_key`  VARCHAR(100)  DEFAULT NULL,
  `plan`         VARCHAR(50)   DEFAULT NULL,
  `expires_at`   VARCHAR(50)   DEFAULT NULL,
  `trial_ends_at`VARCHAR(50)   DEFAULT NULL,
  `synced_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ensure the single license row always exists
INSERT IGNORE INTO shop_license (`id`, `status`) VALUES (1, 'none');

-- ─── Seed default keys so first load is safe ─────────────────────────
INSERT IGNORE INTO kv_store (store_key, value) VALUES
  ('tc3_settings',        '{}'),
  ('tc3_products',        '[]'),
  ('tc3_customers',       '[]'),
  ('tc3_suppliers',       '[]'),
  ('tc3_sales',           '[]'),
  ('tc3_purchases',       '[]'),
  ('tc3_expenses',        '[]'),
  ('tc3_repairs',         '[]'),
  ('tc3_assets',          '[]'),
  ('tc3_damageLog',       '[]'),
  ('tc3_productLog',      '[]'),
  ('tc3_repairDeleteLog', '[]'),
  ('tc3_salesReturns',    '[]'),
  ('tc3_purchaseReturns', '[]'),
  ('tc3_quotations',      '[]'),
  ('tc3_cheques',         '[]'),
  ('tc3_manualReceivables','[]'),
  ('tc3_manualPayables',  '[]'),
  ('tc3_capLedger',       '[]'),
  ('tc3_capLog',          '[]'),
  ('tc3_profitDist',      '[]'),
  ('tc3_assetLog',        '[]'),
  ('tc3_openBal',         'null'),
  ('tc3_labelDesigns',    '[]'),
  ('tc3_businessType',    '"tech"');
