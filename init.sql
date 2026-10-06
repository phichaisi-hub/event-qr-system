CREATE DATABASE IF NOT EXISTS event_qr_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE event_qr_db;

-- ตาราง events (เพิ่ม UNIQUE KEY ป้องกันชื่องานและวันที่ซ้ำ)
CREATE TABLE IF NOT EXISTS events (
    event_id INT AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    location VARCHAR(255) DEFAULT NULL,
    event_date DATE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_event (event_name, event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตาราง attendees
CREATE TABLE IF NOT EXISTS attendees (
    permit_id VARCHAR(50) PRIMARY KEY,
    event_id INT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    company_name VARCHAR(150) NOT NULL,
    position VARCHAR(100) DEFAULT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(150) NOT NULL,
    booth_no VARCHAR(50) NOT NULL,
    work_type VARCHAR(50) NOT NULL,
    work_type_other VARCHAR(100) DEFAULT NULL,
    attendee_count INT DEFAULT 1,
    scheduled_time DATETIME NOT NULL,
    status VARCHAR(20) DEFAULT 'APPROVED',
    email_status VARCHAR(20) DEFAULT 'PENDING',
    email_error TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตาราง checkin_logs
CREATE TABLE IF NOT EXISTS checkin_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    permit_id VARCHAR(50) NOT NULL,
    gate_location VARCHAR(100) DEFAULT 'Main Gate',
    scanned_by VARCHAR(100) DEFAULT 'Staff',
    scan_status VARCHAR(20) NOT NULL, -- SUCCESS / DUPLICATE
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (permit_id) REFERENCES attendees(permit_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
