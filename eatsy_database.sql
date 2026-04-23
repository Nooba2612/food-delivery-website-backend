-- Create database
DROP DATABASE IF EXISTS eatsy_food;
CREATE DATABASE eatsy_food;
SHOW DATABASES;
USE eatsy_food;

-- User authorization
-- CREATE USER 'eatsy_user'@'localhost' IDENTIFIED BY '123';
-- GRANT ALL PRIVILEGES ON eatsy_food.* TO 'eatsy_user'@'localhost';
-- SHOW GRANTS FOR CURRENT_USER;
-- FLUSH PRIVILEGES;

-- Create PaymentMethods table
CREATE TABLE PaymentMethods (
    payment_method_id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create Users table
CREATE TABLE Users (
    user_id CHAR(36) PRIMARY KEY,
    fullname VARCHAR(255),
    gender ENUM('Male', 'Female', 'Other'),
    date_of_birth DATE,
    password VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    type_login ENUM('Standard', 'Google', 'Facebook', 'Apple') NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    country_code VARCHAR(10) NOT NULL,
    role ENUM('Admin', 'Customer', 'Owner', 'Employee') DEFAULT 'Customer',
    avatar_path VARCHAR(1000),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login DATETIME NULL,
    is_online BOOLEAN DEFAULT TRUE,
    payment_method_id INT,
FOREIGN KEY (payment_method_id) REFERENCES PaymentMethods(payment_method_id)
);

-- Create Customer table
CREATE TABLE Customers (
    customer_id CHAR(36) PRIMARY KEY,
    user_id CHAR(36),
    loyal_points INT UNSIGNED DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

-- Create Addresses table for multiple addresses management
CREATE TABLE Addresses (
    address_id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    street VARCHAR(500) NOT NULL,
    ward VARCHAR(255) NOT NULL,
    district VARCHAR(255) NULL,
    city VARCHAR(255) NOT NULL,
    label ENUM('Home', 'Work', 'Other') DEFAULT 'Home',
    is_default BOOLEAN DEFAULT FALSE,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_user_default (user_id, is_default)
);

-- Create Categories Table
CREATE TABLE Categories (
    category_id CHAR(36) PRIMARY KEY, 
    name VARCHAR(255) NOT NULL UNIQUE, 
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create Dishes table
CREATE TABLE Dishes (
    dish_id CHAR(36) PRIMARY KEY,
    category_id CHAR(36),
    -- Basic info
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    brand VARCHAR(100) NULL,
    description TEXT,
    -- Media
    thumbnail_path VARCHAR(1000) NOT NULL,
    -- Pricing
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    discount_amount DECIMAL(5,2) UNSIGNED NOT NULL DEFAULT 0,
    -- Stock & sales
    stock INT NOT NULL DEFAULT 100 CHECK (stock >= 0),
    sold_count INT NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
    -- Rating
    rating_avg DECIMAL(2,1) DEFAULT 0,
	rating_count INT DEFAULT 0,
    -- Flags
    available BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    status ENUM('draft', 'active', 'inactive') DEFAULT 'active',
    -- Extra info
    preparation_time INT COMMENT 'minutes',
    calories INT,
    tags JSON,
    -- Time
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (category_id) REFERENCES Categories(category_id) ON DELETE CASCADE
);

CREATE TABLE DishImages (
    image_id CHAR(36) PRIMARY KEY,
    dish_id CHAR(36),
    image_url VARCHAR(1000),
    is_thumbnail BOOLEAN DEFAULT FALSE,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (dish_id) REFERENCES Dishes(dish_id) ON DELETE CASCADE
);
CREATE TABLE DishVariants (
    variant_id CHAR(36) PRIMARY KEY,
    dish_id CHAR(36),

    name VARCHAR(100), 
    price DECIMAL(10,2),
    stock INT DEFAULT 0,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (dish_id) REFERENCES Dishes(dish_id) ON DELETE CASCADE
);
CREATE TABLE DishAddons (
    addon_id CHAR(36) PRIMARY KEY,
    name VARCHAR(255),
    price DECIMAL(10,2)
);
-- Create OTP table
CREATE TABLE OTP (
    otp_id CHAR(36) PRIMARY KEY, 
    info VARCHAR(255) NOT NULL,
    country_code CHAR(10),
    otp VARCHAR(6) NOT NULL, 
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Reviews table
CREATE TABLE Reviews (
    review_id CHAR(36) PRIMARY KEY,
    user_id CHAR(36),
    dish_id CHAR(36),
    points DECIMAL(2, 1) NOT NULL CHECK (points >= 0 AND points <=5),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (dish_id) REFERENCES Dishes(dish_id)
);

-- Create Carts table
CREATE TABLE Carts (
    cart_id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) UNIQUE,
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

-- Create Cart Items table
CREATE TABLE CartItems (
	cart_item_id CHAR(36) PRIMARY KEY,
	dish_id CHAR(36),
    cart_id CHAR(36),
    price_snapshot DECIMAL(10,2) NOT NULL,
    quantity INT NOT NULL CHECK (quantity >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (dish_id) REFERENCES Dishes(dish_id) ON DELETE CASCADE,
    FOREIGN KEY (cart_id) REFERENCES Carts(cart_id) ON DELETE CASCADE,
    UNIQUE (cart_id, dish_id) 
);

-- Create Orders table
CREATE TABLE Orders (
    order_id CHAR(36) PRIMARY KEY,
    user_id CHAR(36),
    order_note TEXT,
    order_status ENUM('Pending', 'In Progress', 'Completed', 'Cancelled') NOT NULL,
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

-- Create Order Items table
CREATE TABLE OrderItems (
    order_item_id CHAR(36) PRIMARY KEY,
    order_id CHAR(36),
    dish_id CHAR(36),
    quantity INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES Orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (dish_id) REFERENCES Dishes(dish_id) ON DELETE CASCADE
);

-- Create Invoices table
CREATE TABLE Invoices (
    invoice_id CHAR(36) PRIMARY KEY,
    customer_id CHAR(36) NOT NULL, 
    employee_id CHAR(36) NOT NULL,
    payment_method_id INT NOT NULL,
    shipping_fee DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status ENUM('Paid', 'Pending', 'Cancelled') DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, 
    FOREIGN KEY (customer_id) REFERENCES Customers(customer_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (payment_method_id) REFERENCES PaymentMethods(payment_method_id)
);

-- Create Invoice Items table
CREATE TABLE InvoiceItems (
    invoice_item_id CHAR(36) PRIMARY KEY, 
    invoice_id CHAR(36) NOT NULL, 
    dish_id CHAR(36) NOT NULL, 
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0), 
    price DECIMAL(10, 2) NOT NULL, 
    FOREIGN KEY (invoice_id) REFERENCES Invoices(invoice_id) ON DELETE CASCADE,
    FOREIGN KEY (dish_id) REFERENCES Dishes(dish_id) ON DELETE CASCADE 
);

-- Create Vouchers table
CREATE TABLE Vouchers (
    voucher_id CHAR(36) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_type ENUM('Percentage', 'Amount') NOT NULL, 
    discount_value DECIMAL(10, 2) NOT NULL,
    valid_from DATETIME NOT NULL,
    valid_to DATETIME NOT NULL,
    min_purchase DECIMAL(10, 2) DEFAULT 0,
    number_of_uses INT DEFAULT 1 CHECK (number_of_uses >= 0),
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create User Voucher table
CREATE TABLE UserVoucher (
    user_id CHAR(255) NOT NULL,
    voucher_id CHAR(255) NOT NULL,
    used_at DATETIME NULL,
    PRIMARY KEY (user_id, voucher_id),
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (voucher_id) REFERENCES Vouchers(voucher_id)
);

-- ------------------------ TRIGGERS -------------------------------
-- ! Run this in Admin(root) to turn on privilege

-- SET GLOBAL log_bin_trust_function_creators = 1;

DELIMITER $$

-- Auto generate Categories Id
CREATE TRIGGER insert_categories_id_trigger
BEFORE INSERT ON Categories
FOR EACH ROW
BEGIN
    IF NEW.category_id IS NULL OR NEW.category_id = ''
    THEN
        SET NEW.category_id = UUID();
    END IF;
END$$

-- Auto generate Cart Items Id
CREATE TRIGGER insert_cart_items_id_trigger
BEFORE INSERT ON CartItems
FOR EACH ROW
BEGIN
    IF NEW.cart_item_id IS NULL THEN
        SET NEW.cart_item_id = UUID();
    END IF;
END$$

-- Auto generate Carts Id
CREATE TRIGGER insert_carts_id_trigger
BEFORE INSERT ON Carts
FOR EACH ROW
BEGIN
    IF NEW.cart_id IS NULL THEN
        SET NEW.cart_id = UUID();
    END IF;
END$$

-- Auto generate Customers Id
CREATE TRIGGER insert_customers_id_trigger
BEFORE INSERT ON Customers
FOR EACH ROW
BEGIN
    IF NEW.customer_id IS NULL THEN
        SET NEW.customer_id = UUID();
    END IF;
END$$

-- Auto generate Invoice Items Id
CREATE TRIGGER insert_invoice_items_id_trigger
BEFORE INSERT ON InvoiceItems
FOR EACH ROW
BEGIN
    IF NEW.invoice_item_id IS NULL THEN
        SET NEW.invoice_item_id = UUID();
    END IF;
END$$

-- Auto generate Invoices Id
CREATE TRIGGER insert_invoices_id_trigger
BEFORE INSERT ON Invoices
FOR EACH ROW
BEGIN
    IF NEW.invoice_id IS NULL THEN
        SET NEW.invoice_id = UUID();
    END IF;
END$$

-- Auto generate Dishes Id

CREATE TRIGGER insert_dishes_id_trigger
BEFORE INSERT ON Dishes
FOR EACH ROW
BEGIN
    IF NEW.dish_id IS NULL OR NEW.dish_id = '' THEN
        SET NEW.dish_id = UUID();
    END IF;
END$$

-- Auto generate Order Items Id
CREATE TRIGGER insert_order_items_id_trigger
BEFORE INSERT ON OrderItems
FOR EACH ROW
BEGIN
    IF NEW.order_item_id IS NULL THEN
        SET NEW.order_item_id = UUID();
    END IF;
END$$

-- Auto generate Orders Id
CREATE TRIGGER insert_orders_id_trigger
BEFORE INSERT ON Orders
FOR EACH ROW
BEGIN
    IF NEW.order_id IS NULL THEN
        SET NEW.order_id = UUID();
    END IF;
END$$

-- Auto generate OTP Id
CREATE TRIGGER insert_otp_id_trigger
BEFORE INSERT ON OTP
FOR EACH ROW
BEGIN
    IF NEW.otp_id IS NULL THEN
        SET NEW.otp_id = UUID();
    END IF;
END$$

-- Auto generate Reviews Id


CREATE TRIGGER insert_reviews_id_trigger
BEFORE INSERT ON Reviews
FOR EACH ROW
BEGIN
    IF NEW.review_id IS NULL OR NEW.review_id = '' THEN
        SET NEW.review_id = UUID();
    END IF;
END$$

-- Auto generate Users Id
CREATE TRIGGER insert_users_id_trigger
BEFORE INSERT ON Users
FOR EACH ROW
BEGIN
    IF NEW.user_id IS NULL OR NEW.user_id = '' THEN
        SET NEW.user_id = UUID();
    END IF;
END$$

-- Auto generate Vouchers Id
CREATE TRIGGER insert_vouchers_id_trigger
BEFORE INSERT ON Vouchers
FOR EACH ROW
BEGIN
    IF NEW.voucher_id IS NULL OR NEW.voucher_id = '' THEN
        SET NEW.voucher_id = UUID();
    END IF;
END$$


DELIMITER ;


/* ---------------- DATAS ------------------------------- */

-- Insert Payment Methods
INSERT INTO PaymentMethods (name, code) VALUES
    ('Cash', 'cash'),
    ('Credit Card', 'credit_card'),
    ('Momo', 'momo'),
    ('Zalo Pay', 'zalopay'),
    ('Bank Transfer', 'bank_transfer');

-- Insert Categories
INSERT INTO Categories (name, description)
VALUES
	('Burgers', 'A variety of burgers including beef, chicken, abd veggie options'),
    ('Pizza', 'Different types of pizza, including classic and specialty options'),   
    ('Mì', 'Different types of noodles like spaghetti, and stir-fried noodles'),
    ('Cơm', 'Various rice dishes such as fried rice, steamed rice, and rice bowls'),
    ('Nước uống', 'Soft drinks, milkshakes, and a variety of beverages'),
    ('Combos', 'Combo meals including a main dish, side, and drink'),
    ('Ưu đãi đặc biệt', 'Limited-time offers and meal deals for customers');

-- Create category item id variables
SELECT category_id INTO @BurgersCategoryId FROM Categories WHERE name = 'Burgers';
SELECT category_id INTO @PizzaCategoryId FROM Categories WHERE name = 'Pizza';
SELECT category_id INTO @MiCategoryId FROM Categories WHERE name = 'Mì';
SELECT category_id INTO @ComCategoryId FROM Categories WHERE name = 'Cơm';
SELECT category_id INTO @DrinksCategoryId FROM Categories WHERE name = 'Nước uống';
SELECT category_id INTO @CombosCategoryId FROM Categories WHERE name = 'Combos';
SELECT category_id INTO @OffersCategoryId FROM Categories WHERE name = 'Ưu đãi đặc biệt';

INSERT INTO Dishes (category_id, thumbnail_path, name, slug, description, price)
VALUES
-- Burgers
(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802062/ex_cheese_whp_jr_1_av3n9m.jpg', 'American Trio Charcoal Burger ( Size M )', 'american-trio-charcoal-burger-size-m', 'Burger với 3 loại xốt mới và vỏ bánh than tre thủ công', 79000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802061/dbl-bbq-bc-chz_mkhjpv.jpg', 'American Trio Charcoal Burger ( Size L )', 'american-trio-charcoal-burger-size-l', 'Burger với 3 loại xốt mới và vỏ bánh than tre thủ công', 129000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802059/16-burger-b_-n_ng-whopper_1_uhyh8v.jpg', 'CHEESE RING BURGER', 'cheese-ring-burger', 'Burger bò nướng Whopper ( cỡ vừa )', 55000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802059/12-burger-b_-n_ng-h_nh-chi_n_4_nkn25c.jpg', 'FISH BURGER', 'fish-burger', 'Burger Cá giòn', 49000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802060/burger-american-jr_uvzewn.jpg', 'GRILLED ONION BURGER', 'grilled-onion-burger', 'Grilled Onion Burger', 49000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802058/6-burger-ca_x5c3qq.jpg', 'EXTREME CHEESE BURGER JR', 'extreme-cheese-burger-jr-m', 'Burger bò tắm phô mai ( cỡ vừa )', 65000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802058/6-burger-ca_x5c3qq.jpg', 'EXTREME CHEESE BURGER JR', 'extreme-cheese-burger-jr-l', 'Burger bò tắm phô mai ( cỡ lớn )', 125000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802060/burger-american-jr_uvzewn.jpg', 'BBQ CHIC''N CRISP CHEESE BURGER', 'bbq-chicn-crisp-cheese-burger-1', 'Burger gà giòn phô mai sốt BBQ', 49000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802057/2-mieng-b_-burger-b_-n_ng-whopper_3_eqkc20.jpg', 'BBQ CHIC''N CRISP CHEESE BURGER', 'bbq-chicn-crisp-cheese-burger-2', 'Burger gà giòn phô mai sốt BBQ', 49000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802057/2-mieng-b_-burger-b_-n_ng-whopper_3_eqkc20.jpg', 'DOUBLE WHOPPER', 'double-whopper', 'DOUBLE WHOPPER', 175000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802057/2-mieng-b_-burger-b_-n_ng-whopper_3_eqkc20.jpg', 'WHOPPER', 'whopper-l', 'Burger bò nướng Whopper ( cỡ lớn )', 125000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802057/2-mieng-b_-burger-b_-n_ng-whopper_3_eqkc20.jpg', 'WHOPPER', 'whopper-m', 'Burger bò nướng Whopper ( cỡ vừa )', 125000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802057/2-mieng-b_-burger-b_-n_ng-whopper_3_eqkc20.jpg', 'DOUBLE CHEESEBURGER', 'double-cheeseburger', 'Burger 2 miếng bò nướng phô mai', 79000),

(@BurgersCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802057/2-mieng-b_-burger-b_-n_ng-whopper_3_eqkc20.jpg', 'DOUBLE BBQ BACON CHEESE', 'double-bbq-bacon-cheese', 'Burger 2 miếng bò nướng phô mai thịt xông khói', 105000),

-- Pizza (rút gọn vài cái cho bạn thấy pattern, còn lại bạn copy tương tự)
(@PizzaCategoryId, 'https://res.cloudinary.com/dxitytnx9/image/upload/v1763292400/viber_image_2024-12-20_11-11-37-302_ezuu5p.jpg', 'Pizza Siêu Topping Siêu Topping Hải Sản 4 Mùa', 'pizza-sieu-topping-hai-san-4-mua', '12 inches', 355000),

(@PizzaCategoryId, 'https://res.cloudinary.com/dxitytnx9/image/upload/v1763292400/viber_image_2024-12-20_11-11-35-787_caryzj.jpg', 'Pizza Siêu Topping Hải Sản Xốt Pesto "Chanh Sả"', 'pizza-hai-san-pesto-chanh-sa', '9 inches', 235000),

(@PizzaCategoryId, 'https://res.cloudinary.com/dxitytnx9/image/upload/v1763292398/Veggie-mania-Pizza-Rau-Cu-Thap-Cam_txn7kk.jpg', 'Pizza Siêu Topping Bò Và Tôm Nướng Kiểu Mỹ', 'pizza-bo-tom-nuong-kieu-my', '9 inches', 235000),

(@PizzaCategoryId, 'https://res.cloudinary.com/dxitytnx9/image/upload/v1763292396/Pizza-Dam-Bong-Dua-Kieu-Hawaii-Hawaiian_hxanox.jpg', 'Pizza Dăm Bông Dứa Kiểu Hawaii', 'pizza-hawaiian', '9 inches', 175000),

-- Noodles
(@MiCategoryId, 'https://res.cloudinary.com/dxitytnx9/image/upload/v1763292392/mi-carbonara-300x300_rf01bi.jpg', 'Mì Carbonara', 'mi-carbonara', 'Mì spaghetti, thịt xông khói, phô mai Parmesan', 155000),

(@MiCategoryId, 'https://res.cloudinary.com/dxitytnx9/image/upload/v1763292392/mi-bolognese-300x300_jz6iba.jpg', 'Mì Bolognese', 'mi-bolognese', 'Sự kết hợp hoàn hảo giữa mì spaghetti', 155000),

-- Rices
(@ComCategoryId, 'https://res.cloudinary.com/dxitytnx9/image/upload/v1763292386/38.RM4CmGTNM_t1h8o6.png', 'Cơm gà tắm nước mắm', 'com-ga-nuoc-mam', '', 49000),

-- Drinks
(@DrinksCategoryId, 'https://res.cloudinary.com/dxitytnx9/image/upload/v1763292391/Milohop_y8q3k6.webp', 'Milo', 'milo', '', 25000),

(@DrinksCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802123/Cocazero_fvx0tc.webp', 'Coca Cola', 'coca-cola', '', 15000),

-- Combos
(@CombosCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802112/m_n_ngon_ph_i_th_-_7_y1anbs.png', 'COMBO DOUBLE WHOPPER JR.', 'combo-double-whopper-jr', 'Combo burger + khoai + nước', 95000),

(@CombosCategoryId, 'https://res.cloudinary.com/dgw84jhvl/image/upload/q_auto/f_auto/v1775802107/combo-doublewhopper_2_uqqe8q.jpg', 'Combo Cặp đôi ăn ý', 'combo-cap-doi', '2 mì + 2 nước + khoai', 145000);

INSERT INTO Vouchers (code, description, discount_type, discount_value, valid_from, valid_to, min_purchase, number_of_uses)
VALUES
('EATSYWELCOME', 'Giảm 10% cho hóa đơn', 'Percentage', 0.1, '2025-01-01 00:00:00', '2025-12-31 23:59:59', 0, 999),
('EATSY50', 'Giảm 50.000đ cho đơn hàng từ 500.000đ', 'Amount', 50000, '2025-01-01 00:00:00', '2025-06-30 23:59:59', 500000, 100),
('WELCOME20', 'Chào mừng khách hàng mới, giảm 20%', 'Percentage', 0.2, '2025-01-01 00:00:00', '2025-03-31 23:59:59', 0, 100),
('BIGSALE100', 'Giảm 100.000đ cho đơn hàng từ 1.000.000đ', 'Amount', 100000, '2025-01-01 00:00:00', '2025-08-31 23:59:59', 1000000, 100),
('FREESHIP', 'Miễn phí vận chuyển cho đơn hàng từ 300.000đ', 'Amount', 30000, '2025-01-01 00:00:00', '2025-12-31 23:59:59', 300000, 100);

-- Sample Users for Reviews
INSERT INTO Users (fullname, username, email, phone_number, country_code, password, type_login, role)
VALUES
('Nguyễn Văn An', 'nguyenvanan', 'nguyenvanan@gmail.com', '0901234567', '+84', '$2a$10$dummyhash1', 'Standard', 'Customer'),
('Trần Thị Bình', 'tranthibinh', 'tranthibinh@gmail.com', '0902345678', '+84', '$2a$10$dummyhash2', 'Standard', 'Customer'),
('Lê Hoàng Cường', 'lehoangcuong', 'lehoangcuong@gmail.com', '0903456789', '+84', '$2a$10$dummyhash3', 'Standard', 'Customer'),
('Phạm Thị Dung', 'phamthidung', 'phamthidung@gmail.com', '0904567890', '+84', '$2a$10$dummyhash4', 'Standard', 'Customer'),
('Hoàng Minh Đức', 'hoangminhduc', 'hoangminhduc@gmail.com', '0905678901', '+84', '$2a$10$dummyhash5', 'Standard', 'Customer');

-- Get user IDs and dish IDs for reviews
SET @user1 = (SELECT user_id FROM Users WHERE username = 'nguyenvanan' LIMIT 1);
SET @user2 = (SELECT user_id FROM Users WHERE username = 'tranthibinh' LIMIT 1);
SET @user3 = (SELECT user_id FROM Users WHERE username = 'lehoangcuong' LIMIT 1);
SET @user4 = (SELECT user_id FROM Users WHERE username = 'phamthidung' LIMIT 1);
SET @user5 = (SELECT user_id FROM Users WHERE username = 'hoangminhduc' LIMIT 1);

-- Get some dish IDs
SET @burger1 = (SELECT dish_id FROM Dishes WHERE name = 'WHOPPER' LIMIT 1);
SET @pizza1 = (SELECT dish_id FROM Dishes WHERE name = 'Pizza Hải Sản 4 Mùa' LIMIT 1);
SET @pizza2 = (SELECT dish_id FROM Dishes WHERE name = 'Pizza Phô Mai Truyền Thống' LIMIT 1);
SET @noodle1 = (SELECT dish_id FROM Dishes WHERE name = 'Mì Carbonara' LIMIT 1);
SET @rice1 = (SELECT dish_id FROM Dishes WHERE name = 'Cơm gà tắm nước mắm' LIMIT 1);
SET @burger2 = (SELECT dish_id FROM Dishes WHERE name = 'DOUBLE WHOPPER' LIMIT 1);
SET @pizza3 = (SELECT dish_id FROM Dishes WHERE name = 'Pizza Siêu Topping Hải Sản 4 Mùa' LIMIT 1);

-- Insert Reviews
INSERT INTO Reviews (user_id, dish_id, points, content)
VALUES
(@user1, @burger1, 5.0, 'Burger rất ngon, thịt bò nướng vừa ý, rau củ tươi. Sẽ quay lại lần sau!'),
(@user1, @pizza1, 4.5, 'Pizza hải sản phong phú, topping nhiều. Đế bánh giòn tan. Recommend!'),
(@user2, @burger2, 4.8, 'Double Whopper rất đáng tiền! 2 miếng bò dày, ngon lắm. Chỉ hơi nhiều cho 1 người ăn thôi.'),
(@user2, @noodle1, 4.0, 'Mì Carbonara béo ngậy, phô mai thơm. Tuy nhiên hơi mặn một chút.'),
(@user3, @pizza2, 5.0, 'Pizza phô mai 4 loại, tan chảy trong miệng. Tuyệt vời! Sẽ đặt thường xuyên.'),
(@user3, @rice1, 3.5, 'Cơm gà tạm ổn, gà hơi khô. Nước mắm ngon nhưng ít quá.'),
(@user4, @burger1, 4.7, 'Whopper xứng đáng là burger kinh điển. Xốt đặc biệt rất ngon!'),
(@user4, @pizza3, 5.0, 'Pizza siêu topping thật sự siêu! Hải sản tươi ngon, topping đầy đủ. Worth it!'),
(@user5, @noodle1, 4.2, 'Mì Ý ngon, phần ăn vừa đủ. Thịt xông khói thơm, trứng lòng đào chuẩn.'),
(@user5, @burger2, 4.9, 'Hamburger ngon nhất từng ăn! Thịt bò tươi, nướng vừa chín. 10/10!'),
(@user1, @rice1, 3.8, 'Cơm gà ổn, giá hợp lý. Thích hợp cho bữa trưa nhanh gọn.'),
(@user2, @pizza2, 4.6, 'Phô mai kéo sợi dài, bánh mềm. Ăn một lần nhớ mãi.'),
(@user3, @burger2, 4.5, 'Burger size lớn, đầy đặn. Phù hợp cho người ăn nhiều như mình.'),
(@user4, @noodle1, 4.3, 'Mì Carbonara chuẩn vị Ý. Giá có hơi cao nhưng chất lượng xứng đáng.'),
(@user5, @pizza1, 4.7, 'Pizza hải sản tươi ngon, không tanh. Đế bánh giòn rụm. Thích quá!');
