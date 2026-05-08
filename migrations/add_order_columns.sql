-- Add missing columns to Orders table
ALTER TABLE Orders
ADD COLUMN quantity INT DEFAULT 0 AFTER user_id,
ADD COLUMN foods TEXT AFTER quantity,
ADD COLUMN brand VARCHAR(100) DEFAULT 'Eatsy' AFTER foods,
ADD COLUMN estimated_time INT DEFAULT NULL COMMENT 'Estimated delivery time in minutes' AFTER brand,
ADD COLUMN address_id CHAR(36) AFTER order_status,
ADD COLUMN payment_method VARCHAR(100) DEFAULT 'Cash' AFTER address_id,
ADD COLUMN delivery_address TEXT AFTER payment_method,
ADD COLUMN total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER delivery_address,
ADD COLUMN payment_status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid' AFTER total_amount,
ADD COLUMN voucher_code VARCHAR(50) DEFAULT NULL COMMENT 'Applied voucher code' AFTER payment_status,
ADD COLUMN discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 COMMENT 'Discount from voucher' AFTER voucher_code;
