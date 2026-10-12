const express = require('express');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ตั้งค่า Multer สำหรับพักไฟล์อัปโหลดไว้ในหน่วยความจำ (Memory Storage)
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'rootpassword',
    database: process.env.DB_NAME || 'event_qr_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+07:00'
});

const mailUser = process.env.SMTP_USER || process.env.EMAIL_USER;
const mailPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: mailUser,
        pass: mailPass
    }
});

// ตรวจสอบ Database และสร้าง/อัปเดตคอลัมน์อัตโนมัติ
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to MySQL Database successfully.');

        // สร้างตาราง users
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                fullname VARCHAR(100) NOT NULL,
                role ENUM('ADMIN', 'SUPERVISOR', 'SCANNER') NOT NULL DEFAULT 'SCANNER',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ตรวจสอบและเพิ่มคอลัมน์ scanned_by ใน checkin_logs หากยังไม่มี
        const [cols] = await connection.query("SHOW COLUMNS FROM checkin_logs LIKE 'scanned_by'");
        if (cols.length === 0) {
            await connection.query("ALTER TABLE checkin_logs ADD COLUMN scanned_by VARCHAR(100) NULL AFTER status");
            console.log('✅ Added column "scanned_by" to checkin_logs table.');
        }

        // สร้าง Admin เริ่มต้นถ้ายังไม่มี (admin / admin123)
        const [users] = await connection.query('SELECT * FROM users WHERE username = "admin"');
        if (users.length === 0) {
            await connection.query(`
                INSERT INTO users (username, password, fullname, role) 
                VALUES ('admin', 'admin123', 'System Administrator', 'ADMIN')
            `);
            console.log('🔑 Created Default Admin Account: admin / admin123');
        }

        connection.release();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
    }
})();

// ฟังก์ชันแปลงวันที่ Excel
function parseExcelDate(cellValue) {
    if (!cellValue) return null;

    if (cellValue instanceof Date) {
        if (isNaN(cellValue.getTime())) return null;
        let year = cellValue.getFullYear();
        if (year > 2400) year -= 543;
        const month = String(cellValue.getMonth() + 1).padStart(2, '0');
        const day = String(cellValue.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    let str = "";
    if (typeof cellValue === 'object') {
        if (cellValue.result) str = String(cellValue.result);
        else if (cellValue.text) str = String(cellValue.text);
        else str = String(cellValue);
    } else {
        str = String(cellValue);
    }

    str = str.trim();
    if (!str || str === 'undefined' || str === 'null') return null;

    if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            let year = parseInt(parts[2], 10);
            if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
            if (year > 2400) year -= 543;
            const mm = String(month).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            return `${year}-${mm}-${dd}`;
        }
    }

    if (str.includes('-')) {
        const parts = str.split('-');
        if (parts.length === 3) {
            if (parts[0].length === 4) {
                let year = parseInt(parts[0], 10);
                if (year > 2400) year -= 543;
                const month = String(parseInt(parts[1], 10)).padStart(2, '0');
                const day = String(parseInt(parts[2], 10)).padStart(2, '0');
                return `${year}-${month}-${day}`;
            } else if (parts[2].length === 4) {
                const day = String(parseInt(parts[0], 10)).padStart(2, '0');
                const month = String(parseInt(parts[1], 10)).padStart(2, '0');
                let year = parseInt(parts[2], 10);
                if (year > 2400) year -= 543;
                return `${year}-${month}-${day}`;
            }
        }
    }

    return null;
}

// ==========================================
// 1. API AUTHENTICATION & USER MANAGEMENT
// ==========================================

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "กรุณากรอก Username และ Password" });
    }

    try {
        const [users] = await pool.query('SELECT id, username, fullname, role FROM users WHERE username = ? AND password = ?', [username, password]);
        if (users.length === 0) {
            return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
        }
        res.json({ success: true, user: users[0] });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, username, fullname, role, created_at FROM users ORDER BY id DESC');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.post('/api/users', async (req, res) => {
    const { username, password, fullname, role } = req.body;
    if (!username || !password || !fullname) {
        return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    try {
        await pool.query('INSERT INTO users (username, password, fullname, role) VALUES (?, ?, ?, ?)', [username, password, fullname, role || 'SCANNER']);
        res.json({ success: true, message: "เพิ่มผู้ใช้งานสำเร็จ" });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: "Username นี้มีในระบบแล้ว" });
        }
        res.status(500).json({ error: "Database error" });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: "ลบผู้ใช้งานสำเร็จ" });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// ==========================================
// 2. API จัดการ EVENT
// ==========================================

app.get('/api/events', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM events ORDER BY id DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.post('/api/events', async (req, res) => {
    const { event_name, location, event_date } = req.body;
    if (!event_name) return res.status(400).json({ error: "กรุณากรอกชื่องาน Event" });

    try {
        const sql = "INSERT INTO events (event_name, location, event_date) VALUES (?, ?, ?)";
        const [result] = await pool.query(sql, [event_name, location || null, event_date || null]);
        res.json({ message: "เพิ่มงานสำเร็จ", id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.put('/api/events/:id', async (req, res) => {
    const eventId = req.params.id;
    const { event_name, location, event_date } = req.body;

    if (!event_name) return res.status(400).json({ error: "กรุณากรอกชื่องาน Event" });

    try {
        const sql = "UPDATE events SET event_name = ?, location = ?, event_date = ? WHERE id = ?";
        await pool.query(sql, [event_name, location || null, event_date || null, eventId]);
        res.json({ message: "อัปเดตข้อมูล Event สำเร็จ" });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.delete('/api/events/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM events WHERE id = ?", [req.params.id]);
        res.json({ message: "ลบงานสำเร็จ" });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.post('/api/events/import', upload.single('excel_file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "กรุณาแนบไฟล์ Excel" });

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);

        const worksheet = workbook.worksheets[0];
        if (!worksheet) return res.status(400).json({ error: "ไม่พบข้อมูลในไฟล์ Excel" });

        const [existingEvents] = await pool.query(
            "SELECT LOWER(TRIM(event_name)) AS name_clean, DATE_FORMAT(event_date, '%Y-%m-%d') AS date_str FROM events"
        );
        
        const existingSet = new Set();
        existingEvents.forEach(e => {
            const key = `${e.name_clean}_${e.date_str || ''}`;
            existingSet.add(key);
        });

        let colMap = { event_name: 1, location: 2, event_date: 3 };

        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
            const val = cell.value ? cell.value.toString().trim().toLowerCase() : '';
            if (val.includes('name') || val.includes('ชื่องาน') || val === 'event_name') colMap.event_name = colNumber;
            if (val.includes('location') || val.includes('สถานที่') || val === 'location') colMap.location = colNumber;
            if (val.includes('date') || val.includes('วันที่') || val === 'event_date') colMap.event_date = colNumber;
        });

        const eventsToInsert = [];
        let duplicateCount = 0;

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const nameCell = row.getCell(colMap.event_name);
                const locCell = row.getCell(colMap.location);
                const dateCell = row.getCell(colMap.event_date);

                const raw_name = nameCell && nameCell.value ? nameCell.value.toString().trim() : '';
                const location = locCell && locCell.value ? locCell.value.toString().trim() : null;
                const event_date = dateCell ? parseExcelDate(dateCell.value) : null;

                if (raw_name) {
                    const clean_name = raw_name.toLowerCase();
                    const checkKey = `${clean_name}_${event_date || ''}`;

                    if (existingSet.has(checkKey)) {
                        duplicateCount++;
                    } else {
                        existingSet.add(checkKey);
                        eventsToInsert.push([raw_name, location || null, event_date || null]);
                    }
                }
            }
        });

        if (eventsToInsert.length > 0) {
            const sql = "INSERT INTO events (event_name, location, event_date) VALUES ?";
            await pool.query(sql, [eventsToInsert]);
        }

        if (eventsToInsert.length === 0 && duplicateCount > 0) {
            return res.status(400).json({ 
                error: `ไม่สามารถนำเข้าได้ เนื่องจากข้อมูลทั้งหมดยังคงซ้ำกับในระบบ (${duplicateCount} รายการ)` 
            });
        } else if (eventsToInsert.length === 0) {
            return res.status(400).json({ error: "ไม่พบข้อมูล Event ที่ถูกต้องในไฟล์ Excel" });
        }

        let responseMsg = `นำเข้าสำเร็จทั้งหมด ${eventsToInsert.length} รายการ`;
        if (duplicateCount > 0) {
            responseMsg += ` (ข้ามรายการที่ชื่องานและวันที่ซ้ำ ${duplicateCount} รายการ)`;
        }

        res.json({ 
            success: true, 
            message: responseMsg,
            imported_count: eventsToInsert.length,
            duplicate_count: duplicateCount
        });

    } catch (err) {
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการประมวลผลไฟล์ Excel: " + err.message });
    }
});

// ==========================================
// 3. API Export Excel (เพิ่มคอลัมน์ ผู้สแกนเข้างาน)
// ==========================================

app.get('/api/export-excel', async (req, res) => {
    const { event_id, start_date, end_date } = req.query;

    try {
        let sql = `
            SELECT 
                l.id AS log_id,
                a.fullname,
                a.company,
                a.phone,
                a.email,
                e.event_name,
                e.location AS event_location,
                a.booth_number,
                a.job_type,
                a.num_workers,
                a.work_date,
                l.scanned_at,
                l.status,
                l.scanned_by
            FROM checkin_logs l
            JOIN attendees a ON l.attendee_id = a.id
            LEFT JOIN events e ON l.event_id = e.id
            WHERE 1=1
        `;
        const params = [];

        if (event_id) {
            sql += ` AND l.event_id = ?`;
            params.push(event_id);
        }
        if (start_date) {
            sql += ` AND DATE(l.scanned_at) >= ?`;
            params.push(start_date);
        }
        if (end_date) {
            sql += ` AND DATE(l.scanned_at) <= ?`;
            params.push(end_date);
        }

        sql += ` ORDER BY l.scanned_at DESC`;

        const [rows] = await pool.query(sql, params);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('รายงานการสแกนเข้างาน');

        worksheet.columns = [
            { header: 'ลำดับ', key: 'log_id', width: 10 },
            { header: 'ชื่อ-นามสกุล', key: 'fullname', width: 25 },
            { header: 'บริษัท', key: 'company', width: 25 },
            { header: 'เบอร์โทร', key: 'phone', width: 15 },
            { header: 'อีเมล', key: 'email', width: 25 },
            { header: 'ชื่องาน Event', key: 'event_name', width: 25 },
            { header: 'สถานที่จัดงาน', key: 'event_location', width: 20 },
            { header: 'เลขที่บูธ', key: 'booth_number', width: 15 },
            { header: 'ประเภทงาน', key: 'job_type', width: 15 },
            { header: 'จำนวนคน', key: 'num_workers', width: 12 },
            { header: 'กำหนดการเข้าพื้นที่', key: 'work_date', width: 20 },
            { header: 'เวลาที่สแกนเข้างาน (เวลาไทย)', key: 'scanned_at', width: 25 },
            { header: 'สถานะการสแกน', key: 'status', width: 15 },
            { header: 'ผู้สแกนเข้างาน (User Scanner)', key: 'scanned_by', width: 25 }
        ];

        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'D9E1F2' }
        };

        rows.forEach(row => {
            worksheet.addRow({
                ...row,
                work_date: row.work_date ? new Date(row.work_date).toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).substring(0, 16) : '-',
                scanned_at: row.scanned_at ? new Date(row.scanned_at).toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }) : '-',
                status: row.status === 'SUCCESS' ? 'ผ่าน (ครั้งแรก)' : 'สแกนซ้ำ',
                scanned_by: row.scanned_by || '-'
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=checkin_report_${Date.now()}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการสร้างไฟล์ Excel" });
    }
});

// ==========================================
// 4. API ลงทะเบียน
// ==========================================

app.post('/api/register', async (req, res) => {
    const { event_id, fullname, company, position, phone, email, booth_number, job_type, num_workers, work_date } = req.body;

    if (!fullname || !phone || !email) {
        return res.status(400).json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    try {
        let eventName = 'งานทั่วไป';
        let eventLocation = '-';
        if (event_id) {
            const [events] = await pool.query('SELECT * FROM events WHERE id = ?', [event_id]);
            if (events.length > 0) {
                eventName = events[0].event_name;
                eventLocation = events[0].location || '-';
            }
        }

        const sql = `INSERT INTO attendees 
            (event_id, fullname, company, position, phone, email, booth_number, job_type, num_workers, work_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const [result] = await pool.query(sql, [
            event_id || null, fullname, company, position, phone, email, booth_number, job_type, num_workers || 1, work_date
        ]);

        const attendeeId = result.insertId;

        const qrPayload = JSON.stringify({ id: attendeeId, fullname, event_id });
        const qrDataUrl = await QRCode.toDataURL(qrPayload);

        await pool.query('UPDATE attendees SET qr_code_path = ? WHERE id = ?', [qrDataUrl, attendeeId]);

        if (mailUser && mailPass) {
            const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; background-color: #ffffff;">
                <h3 style="color: #0d6efd; text-align: center;">ยืนยันการลงทะเบียนเข้าปฏิบัติงาน</h3>
                <p>เรียน คุณ <b>${fullname}</b> (${company})</p>
                <p>ขอส่ง Ticket QR Code สำหรับใช้เข้าปฏิบัติงานพื้นที่กิจกรรม ดังรายละเอียดต่อไปนี้:</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <tr style="background-color: #f8f9fa;"><td style="padding: 8px; font-weight: bold;">ชื่องาน:</td><td style="padding: 8px;">${eventName}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">สถานที่จัดงาน:</td><td style="padding: 8px;">${eventLocation}</td></tr>
                    <tr style="background-color: #f8f9fa;"><td style="padding: 8px; font-weight: bold;">เลขที่บูธ:</td><td style="padding: 8px;">${booth_number || '-'}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">ประเภทงาน:</td><td style="padding: 8px;">${job_type || '-'}</td></tr>
                    <tr style="background-color: #f8f9fa;"><td style="padding: 8px; font-weight: bold;">จำนวนผู้เข้างาน:</td><td style="padding: 8px;">${num_workers || 1} คน</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">กำหนดการเข้าพื้นที่:</td><td style="padding: 8px;">${work_date || '-'}</td></tr>
                </table>
                <div style="text-align: center; margin-top: 25px;">
                    <img src="cid:qrcode_image" alt="QR Code Ticket" style="width: 200px; height: 200px; border: 1px solid #ddd; padding: 5px;">
                    <p style="font-weight: bold; margin-top: 10px;">Permit ID: PERMIT-${attendeeId}</p>
                </div>
            </div>`;

            const mailOptions = {
                from: `"${process.env.SENDER_NAME || 'Event Security System'}" <${mailUser}>`,
                to: email,
                subject: `[Ticket QR Code] ยืนยันการลงทะเบียน - ${eventName}`,
                html: htmlContent,
                attachments: [{ filename: 'qrcode.png', path: qrDataUrl, cid: 'qrcode_image' }]
            };

            transporter.sendMail(mailOptions).catch(err => console.error("Email Error:", err.message));
        }

        res.json({ success: true, message: "ลงทะเบียนสำเร็จเรียบร้อยแล้ว", attendee_id: attendeeId });

    } catch (err) {
        res.status(500).json({ error: "เกิดข้อผิดพลาดของฐานข้อมูล" });
    }
});

// ==========================================
// 5. API สแกนเช็คอิน (บันทึก scanned_by)
// ==========================================

app.post('/api/checkin', async (req, res) => {
    const { attendee_id, scanned_by } = req.body;

    if (!attendee_id) return res.status(400).json({ error: "ไม่พบรหัสผู้ลงทะเบียน (Permit ID)" });

    try {
        const [attendees] = await pool.query(
            `SELECT a.*, e.event_name, e.location AS event_location 
             FROM attendees a 
             LEFT JOIN events e ON a.event_id = e.id 
             WHERE a.id = ?`,
            [attendee_id]
        );

        if (attendees.length === 0) return res.status(404).json({ error: "ไม่พบข้อมูลผู้ลงทะเบียนในระบบ" });

        const attendee = attendees[0];

        const [logs] = await pool.query(
            'SELECT scanned_at FROM checkin_logs WHERE attendee_id = ? ORDER BY id DESC LIMIT 1',
            [attendee.id]
        );

        let isDuplicate = false;
        let lastScannedTime = null;

        if (logs.length > 0) {
            isDuplicate = true;
            lastScannedTime = new Date(logs[0].scanned_at).toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });
        }

        const status = isDuplicate ? 'DUPLICATE' : 'SUCCESS';
        
        // บันทึกการเช็คอินลง DB พร้อมเก็บชื่อผู้สแกน (scanned_by)
        await pool.query(
            'INSERT INTO checkin_logs (attendee_id, event_id, status, scanned_by) VALUES (?, ?, ?, ?)',
            [attendee.id, attendee.event_id, status, scanned_by || 'Unknown Scanner']
        );

        const message = isDuplicate 
            ? `⚠️ เตือนการสแกนซ้ำ! คุณ${attendee.fullname} (${attendee.company || '-'}) เคยเช็คอินไปแล้วเมื่อ ${lastScannedTime}`
            : `✅ ผ่านการตรวจสอบ: คุณ${attendee.fullname} (${attendee.company || '-'})`;

        const formattedWorkDate = attendee.work_date 
            ? new Date(attendee.work_date).toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).substring(0, 16) 
            : '-';

        res.json({
            success: true,
            is_duplicate: isDuplicate,
            message: message,
            attendee: {
                fullname: attendee.fullname,
                company: attendee.company,
                event_name: attendee.event_name || '-',
                event_location: attendee.event_location || '-',
                booth_number: attendee.booth_number || '-',
                job_type: attendee.job_type || '-',
                num_workers: attendee.num_workers || 1,
                work_date: formattedWorkDate
            }
        });

    } catch (err) {
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการตรวจสอบเข้างาน" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
