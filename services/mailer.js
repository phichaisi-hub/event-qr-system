const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const sendTicketEmail = async (toEmail, attendeeData, qrDataUrl) => {
    try {
        const htmlContent = `
        <div style="font-family: Arial, 'Sarabun', sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
            <div style="background-color: #0d6efd; color: #ffffff; padding: 15px; text-align: center;">
                <h3 style="margin: 0; font-size: 20px;">ยืนยันการลงทะเบียนเข้าปฏิบัติงาน</h3>
            </div>
            <div style="padding: 20px; color: #333333; line-height: 1.6;">
                <p style="font-size: 15px; margin-bottom: 10px;">เรียน คุณ <b>${attendeeData.full_name}</b> (${attendeeData.company_name})</p>
                <p style="font-size: 14px; color: #555555; margin-bottom: 15px;">ขอส่ง Ticket QR Code สำหรับใช้เข้าปฏิบัติงานพื้นที่กิจกรรม ดังรายละเอียดต่อไปนี้:</p>

                <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; font-weight: bold; width: 35%; border-bottom: 1px solid #eee;">ชื่องานที่เข้า:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${attendeeData.event_name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">สถานที่จัดงาน:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${attendeeData.event_location || '-'}</td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">เลขที่บูธ:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${attendeeData.booth_no}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">ประเภทงานที่ทำ:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${attendeeData.work_type}</td>
                    </tr>
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">จำนวนผู้เข้างาน:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${attendeeData.attendee_count} คน</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">กำหนดการเข้าพื้นที่:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${attendeeData.scheduled_time}</td>
                    </tr>
                </table>

                <div style="text-align: center; margin-top: 25px;">
                    <img src="${qrDataUrl}" alt="QR Code Ticket" style="width: 200px; height: 200px; border: 1px solid #ddd; padding: 5px; border-radius: 8px;">
                    <p style="font-size: 13px; color: #666; margin-top: 8px; font-weight: bold;">Permit ID: ${attendeeData.permit_id}</p>
                </div>
            </div>
            <div style="background-color: #f1f3f5; padding: 12px; text-align: center; font-size: 12px; color: #6c757d;">
                โปรดแสดง QR Code นี้แก่เจ้าหน้าที่ ณ จุดสแกนเข้าพื้นที่
            </div>
        </div>
        `;

        const mailOptions = {
            from: `"${process.env.SENDER_NAME || 'Event Security System'}" <${process.env.SMTP_USER}>`,
            to: toEmail,
            subject: `[Ticket QR Code] ยืนยันการลงทะเบียน - ${attendeeData.event_name}`,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Mailer Error:', error);
        return { success: false, error: error.message };
    }
};

module.exports = { sendTicketEmail };
