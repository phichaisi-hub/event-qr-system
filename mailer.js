const nodemailer = require('nodemailer');

// 1. ตั้งค่า Mail Transporter เชื่อมต่อกับ SMTP
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // false สำหรับ Port 587 (STARTTLS)
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * ฟังก์ชันส่งอีเมล Ticket QR Code
 * @param {string} toEmail - อีเมลผู้รับ
 * @param {object} attendeeData - ข้อมูลผู้ลงทะเบียน
 * @param {string} qrDataUrl - รูป QR Code แบบ Base64 Data URL
 */
const sendTicketEmail = async (toEmail, attendeeData, qrDataUrl) => {
    try {
        // ดึงและแมปข้อมูลให้รองรับทั้ง Schema แบบเก่าและแบบใหม่
        const fullname = attendeeData.fullname || attendeeData.full_name || 'ผู้เข้าปฏิบัติงาน';
        const company = attendeeData.company || attendeeData.company_name || '-';
        const eventName = attendeeData.event_name || '-';
        const location = attendeeData.event_location || attendeeData.location || '-';
        const boothNo = attendeeData.booth_number || attendeeData.booth_no || '-';
        const jobType = attendeeData.job_type || attendeeData.work_type || '-';
        const numWorkers = attendeeData.num_workers || attendeeData.attendee_count || '1';
        const workDate = attendeeData.work_date || attendeeData.scheduled_time || '-';
        const permitId = attendeeData.id || attendeeData.permit_id || Date.now();

        // 2. แม่แบบ HTML อีเมล
        const htmlContent = `
        <div style="font-family: Arial, 'Sarabun', sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
            <div style="background-color: #0d6efd; color: #ffffff; padding: 15px; text-align: center;">
                <h3 style="margin: 0; font-size: 20px;">ยืนยันการลงทะเบียนเข้าปฏิบัติงาน</h3>
            </div>
            <div style="padding: 20px; color: #333333; line-height: 1.6;">
                <p style="font-size: 15px; margin-bottom: 10px;">เรียน คุณ <b>${fullname}</b> (${company})</p>
                <p style="font-size: 14px; color: #555555; margin-bottom: 15px;">ขอส่ง Ticket QR Code สำหรับใช้เข้าปฏิบัติงานพื้นที่กิจกรรม ดังรายละเอียดต่อไปนี้:</p>

                <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; font-weight: bold; width: 35%; border-bottom: 1px solid #eee;">ชื่องานที่เข้า:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${eventName}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">สถานที่จัดงาน:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${location}</td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">เลขที่บูธ:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${boothNo}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">ประเภทงานที่ทำ:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${jobType}</td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">จำนวนผู้เข้างาน:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${numWorkers} คน</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">กำหนดการเข้าพื้นที่:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${workDate}</td>
                    </tr>
                </table>

                <div style="text-align: center; margin-top: 25px;">
                    <img src="cid:qrcode_image" alt="QR Code Ticket" style="width: 200px; height: 200px; border: 1px solid #ddd; padding: 5px; border-radius: 8px;">
                    <p style="font-size: 13px; color: #666; margin-top: 8px; font-weight: bold;">Permit ID: PERMIT-${permitId}</p>
                </div>
            </div>
            <div style="background-color: #f1f3f5; padding: 12px; text-align: center; font-size: 12px; color: #6c757d;">
                โปรดแสดง QR Code นี้แก่เจ้าหน้าที่ ณ จุดสแกนเข้าพื้นที่
            </div>
        </div>
        `;

        // 3. กำหนดค่าในการส่ง Mail และผูกรูป QR Code แบบ Inline (CID)
        const mailOptions = {
            from: `"${process.env.SENDER_NAME || 'Event Security System'}" <${process.env.SMTP_USER}>`,
            to: toEmail,
            subject: `[Ticket QR Code] ยืนยันการลงทะเบียน - ${eventName}`,
            html: htmlContent,
            attachments: [
                {
                    filename: 'qrcode.png',
                    path: qrDataUrl,
                    cid: 'qrcode_image' // ผูกกับ <img src="cid:qrcode_image"> ป้องกันปัญหาภาพไม่ขึ้น
                }
            ]
        };

        // 4. สั่งส่ง Email
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        console.error('❌ Mailer Error:', error);
        return { success: false, error: error.message };
    }
};

module.exports = { sendTicketEmail };
