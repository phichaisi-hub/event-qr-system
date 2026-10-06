CREATE DATABASE IF NOT EXISTS event_qr_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE event_qr_db;

-- ตารางกิจกรรม/งาน
CREATE TABLE IF NOT EXISTS events (
    event_id INT AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    event_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ตารางผู้ลงทะเบียน
CREATE TABLE IF NOT EXISTS attendees (
    permit_id VARCHAR(50) PRIMARY KEY,
    event_id INT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    position VARCHAR(100),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    booth_no VARCHAR(50) NOT NULL,
    work_type VARCHAR(100) NOT NULL,
    work_type_other VARCHAR(255),
    scheduled_time DATETIME NOT NULL,
    status ENUM('APPROVED', 'PENDING', 'REJECTED') DEFAULT 'APPROVED',
    email_status ENUM('PENDING', 'SENT', 'FAILED') DEFAULT 'PENDING',
    email_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
);

-- ตาราง Log การสแกนเข้างาน
CREATE TABLE IF NOT EXISTS checkin_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    permit_id VARCHAR(50) NOT NULL,
    gate_location VARCHAR(100) DEFAULT 'Main Gate',
    scanned_by VARCHAR(100) DEFAULT 'Staff',
    scan_status ENUM('SUCCESS', 'DUPLICATE', 'INVALID') NOT NULL,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (permit_id) REFERENCES attendees(permit_id) ON DELETE CASCADE
);

-- ข้อมูลตัวอย่าง Event
INSERT INTO events (event_id, event_name, location, event_date) 
VALUES (1, 'TestNameEvent66666', 'Hall 1-4', '2026-10-02')
ON DUPLICATE KEY UPDATE event_name=VALUES(event_name);
