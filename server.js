const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const multer = require('multer');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

const db = require('./config/db');
const { sendTicketEmail } = require('./services/mailer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// CORS Configuration
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// [1] API ระบบลงทะเบียนผู้เข้าปฏิบัติงาน
// ==========================================

// 1.1 ดึงรายชื่อ Event ทั้งหมด
app.get('/api/events', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM events ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching events:', err);
        res.status(500).json({ error: err.message });
    }
});

// 1.2 ลงทะเบียนเข้าปฏิบัติงาน + เจน QR Code + ส่ง อีเมล Ticket
app.post('/api/register', async (req, res) => {
    const { 
        event_id, 
        full_name, 
        company_name, 
        position, 
        phone, 
        email, 
        booth_no, 
        work_type, 
        work_type_other, 
        attendee_count, 
        scheduled_time 
    } = req.body;

    const permit_id = 'PERMIT-' + Date.now();

    try {
        // ดึงทั้ง event_name และ location จากตาราง events
        const [eventRow] = await db.query('SELECT event_name, location FROM events WHERE event_id = ?', [event_id]);
        const event_name = eventRow.length > 0 ? eventRow[0].event_name : 'N/A';
        const event_location = eventRow.length > 0 ? eventRow[0].location : '-';

        await db.query(
            `INSERT INTO attendees 
            (permit_id, event_id, full_name, company_name, position, phone, email, booth_no, work_type, work_type_other, attendee_count, scheduled_time, status, email_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'PENDING')`,
            [permit_id, event_id, full_name, company_name, position, phone, email, booth_no, work_type, work_type_other, attendee_count || 1, scheduled_time]
        );

        const qrDataUrl = await QRCode.toDataURL(permit_id);

        const emailResult = await sendTicketEmail(
            email, 
            { 
                full_name, 
                company_name, 
                event_name, 
                event_location, // <-- ส่งสถานที่จัดงานไปแสดงในอีเมล
                booth_no, 
                work_type, 
                attendee_count, 
                scheduled_time, 
                status: 'APPROVED', 
                permit_id 
            }, 
            qrDataUrl
        );

        if (emailResult.success) {
            await db.query('UPDATE attendees SET email_status = "SENT", email_error = NULL WHERE permit_id = ?', [permit_id]);
            res.json({ success: true, permit_id, email_status: 'SENT' });
        } else {
            await db.query('UPDATE attendees SET email_status = "FAILED", email_error = ? WHERE permit_id = ?', [emailResult.error, permit_id]);
            res.json({ success: true, permit_id, email_status: 'FAILED', email_error: emailResult.error });
        }

    } catch (err) {
        console.error('Registration Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// [2] API สแกน QR Code ตรวจสอบเข้างาน
// ==========================================

// 2.1 สแกน QR Code / Permit ID + เช็คสแกนซ้ำ + บันทึก checkin_logs
app.post('/api/scan', async (req, res) => {
    let { permit_id, gate_location = 'Main Gate', staff_id = 'Staff' } = req.body;

    if (!permit_id) {
        return res.status(400).json({ status: 'INVALID', message: 'กรุณาระบุ Permit ID' });
    }

    // ตัดช่องว่างหน้า-หลังออก ป้องกันปัญหาหาไม่เจอ
    permit_id = permit_id.trim();

    try {
        const [attendees] = await db.query(
            `SELECT A.permit_id, A.full_name, A.company_name, A.booth_no, A.work_type, A.attendee_count, E.event_name
             FROM attendees A 
             LEFT JOIN events E ON A.event_id = E.event_id 
             WHERE TRIM(A.permit_id) = ?`,
            [permit_id]
        );

        if (attendees.length === 0) {
            return res.json({ status: 'INVALID', message: 'ไม่พบข้อมูล QR Code ในระบบ' });
        }

        const attendee = attendees[0];

        const [previousLogs] = await db.query(
            `SELECT scanned_at FROM checkin_logs 
             WHERE permit_id = ? AND scan_status = 'SUCCESS' 
             ORDER BY scanned_at ASC LIMIT 1`,
            [permit_id]
        );

        if (previousLogs.length > 0) {
            await db.query(
                `INSERT INTO checkin_logs (permit_id, gate_location, scanned_by, scan_status) 
                 VALUES (?, ?, ?, 'DUPLICATE')`,
                [permit_id, gate_location, staff_id]
            );

            return res.json({ 
                status: 'DUPLICATE', 
                message: 'บัตรนี้ถูกสแกนเข้างานไปแล้ว!', 
                first_scan: previousLogs[0].scanned_at, 
                attendee 
            });
        }

        await db.query(
            `INSERT INTO checkin_logs (permit_id, gate_location, scanned_by, scan_status) 
             VALUES (?, ?, ?, 'SUCCESS')`,
            [permit_id, gate_location, staff_id]
        );

        res.json({ 
            status: 'SUCCESS', 
            message: 'เช็คอินเข้าปฏิบัติงานสำเร็จ', 
            attendee 
        });

    } catch (err) {
        console.error('Scan Error:', err);
        res.status(500).json({ status: 'ERROR', error: err.message });
    }
});

// ==========================================
// [3] API สำหรับ Admin (จัดการ Event & Excel Import)
// ==========================================

// 3.1 เพิ่ม Event ใหม่
app.post('/api/admin/events', async (req, res) => {
    const { event_name, location, event_date } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO events (event_name, location, event_date) VALUES (?, ?, ?)',
            [event_name, location, event_date || null]
        );
        res.json({ success: true, event_id: result.insertId });
    } catch (err) {
        console.error('Add Event Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3.2 แก้ไข Event
app.put('/api/admin/events/:id', async (req, res) => {
    const { id } = req.params;
    const { event_name, location, event_date } = req.body;
    try {
        await db.query(
            'UPDATE events SET event_name = ?, location = ?, event_date = ? WHERE event_id = ?',
            [event_name, location, event_date || null, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Update Event Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3.3 ลบ Event
app.delete('/api/admin/events/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM events WHERE event_id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete Event Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3.4 Import รายชื่อ Event จากไฟล์ Excel (ป้องกันข้อมูลซ้ำ)
app.post('/api/admin/events/import', upload.single('excel_file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'กรุณาอัปโหลดไฟล์ Excel' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });

        let successCount = 0;
        let duplicateCount = 0;

        for (const row of data) {
            if (row.event_name) {
                const eventName = row.event_name.trim();
                const rawDate = (row.event_date || row.eventdate || '').toString().trim();
                let formattedDate = null;

                if (rawDate) {
                    const parts = rawDate.split(/[\/\.-]/);
                    if (parts.length === 3) {
                        let day, month, year;

                        if (parts[0].length === 4) {
                            year = parseInt(parts[0], 10);
                            month = parseInt(parts[1], 10);
                            day = parseInt(parts[2], 10);
                        } else {
                            day = parseInt(parts[0], 10);
                            month = parseInt(parts[1], 10);
                            year = parseInt(parts[2], 10);
                        }

                        if (year > 2400) {
                            year -= 543;
                        }

                        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                            const mm = String(month).padStart(2, '0');
                            const dd = String(day).padStart(2, '0');
                            formattedDate = `${year}-${mm}-${dd}`;
                        }
                    } else {
                        const parsedDate = new Date(rawDate);
                        if (!isNaN(parsedDate.getTime())) {
                            let yyyy = parsedDate.getFullYear();
                            if (yyyy > 2400) yyyy -= 543;
                            const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
                            const dd = String(parsedDate.getDate()).padStart(2, '0');
                            formattedDate = `${yyyy}-${mm}-${dd}`;
                        }
                    }
                }

                let checkSql = 'SELECT event_id FROM events WHERE event_name = ?';
                let checkParams = [eventName];

                if (formattedDate) {
                    checkSql += ' AND event_date = ?';
                    checkParams.push(formattedDate);
                } else {
                    checkSql += ' AND event_date IS NULL';
                }

                const [existing] = await db.query(checkSql, checkParams);

                if (existing.length > 0) {
                    duplicateCount++;
                } else {
                    await db.query(
                        'INSERT INTO events (event_name, location, event_date) VALUES (?, ?, ?)',
                        [eventName, row.location || '', formattedDate]
                    );
                    successCount++;
                }
            }
        }

        res.json({ 
            success: true, 
            count: successCount, 
            duplicateCount: duplicateCount 
        });

    } catch (err) {
        console.error('Import Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// [4] API สำหรับ Export รายงานการเข้างาน (Excel Report)
// ==========================================
app.get('/api/admin/reports/export', async (req, res) => {
    const { event_id, start_date, end_date } = req.query;

    try {
        let sql = `
            SELECT A.permit_id, A.full_name, A.company_name, A.position, A.phone, A.email, 
                   A.booth_no, A.work_type, A.attendee_count, A.scheduled_time, A.status AS reg_status,
                   E.event_name,
                   L.log_id, L.scan_status, L.scanned_at, L.gate_location, L.scanned_by
            FROM attendees A
            LEFT JOIN events E ON A.event_id = E.event_id
            LEFT JOIN checkin_logs L ON A.permit_id = L.permit_id AND L.scan_status = 'SUCCESS'
            WHERE 1=1
        `;
        const params = [];

        if (event_id) { 
            sql += ' AND A.event_id = ?'; 
            params.push(event_id); 
        }
        if (start_date) { 
            sql += ' AND (L.scanned_at IS NULL OR DATE(L.scanned_at) >= ?)'; 
            params.push(start_date); 
        }
        if (end_date) { 
            sql += ' AND (L.scanned_at IS NULL OR DATE(L.scanned_at) <= ?)'; 
            params.push(end_date); 
        }

        sql += ' ORDER BY A.created_at DESC';

        const [rows] = await db.query(sql, params);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Checkin Report');

        worksheet.columns = [
            { header: 'ลำดับ', key: 'no', width: 8 },
            { header: 'Permit ID', key: 'permit_id', width: 22 },
            { header: 'ชื่องาน Event', key: 'event_name', width: 30 },
            { header: 'ชื่อ-นามสกุล', key: 'full_name', width: 25 },
            { header: 'บริษัท / หน่วยงาน', key: 'company_name', width: 25 },
            { header: 'เลขที่บูธ', key: 'booth_no', width: 15 },
            { header: 'ประเภทงาน', key: 'work_type', width: 18 },
            { header: 'จำนวน (คน)', key: 'attendee_count', width: 15 },
            { header: 'วันเวลาเข้าดำเนินการ', key: 'scheduled_time', width: 22 },
            { header: 'สถานะสแกน', key: 'scan_status', width: 18 },
            { header: 'เวลาที่สแกน', key: 'scanned_at', width: 22 },
            { header: 'จุดสแกน', key: 'gate_location', width: 18 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0D6EFD' } };

        rows.forEach((row, index) => {
            worksheet.addRow({
                no: index + 1,
                permit_id: row.permit_id,
                event_name: row.event_name || '-',
                full_name: row.full_name,
                company_name: row.company_name,
                booth_no: row.booth_no,
                work_type: row.work_type,
                attendee_count: row.attendee_count || 1,
                scheduled_time: row.scheduled_time || '-',
                scan_status: row.scan_status === 'SUCCESS' ? 'สแกนแล้ว (SUCCESS)' : 'ยังไม่ได้สแกน',
                scanned_at: row.scanned_at ? new Date(row.scanned_at).toLocaleString('th-TH') : '-',
                gate_location: row.gate_location || '-'
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Checkin_Report_${Date.now()}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('Export Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=================================\nServer is running on http://localhost:${PORT}\n=================================`);
});
