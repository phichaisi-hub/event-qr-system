CREATE DATABASE IF NOT EXISTS event_qr_db;
USE event_qr_db;

-- 1. ตาราง Events
CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    event_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. ตาราง Attendees (แทน registrations เดิม)
CREATE TABLE IF NOT EXISTS attendees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT,
    fullname VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    position VARCHAR(100),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    booth_number VARCHAR(100),
    job_type VARCHAR(100),
    num_workers INT DEFAULT 1,
    work_date DATETIME,
    qr_code_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

-- 3. ตาราง Checkin Logs
CREATE TABLE IF NOT EXISTS checkin_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    attendee_id INT,
    event_id INT,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'SUCCESS',
    FOREIGN KEY (attendee_id) REFERENCES attendees(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
