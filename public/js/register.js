const HOST_IP = window.location.hostname || 'localhost';
const API_BASE_URL = `http://${HOST_IP}:3000/api`;
let globalEventsData = []; // เก็บข้อมูลรายการ Event ทั้งหมดไว้ใช้ดึงสถานที่

document.addEventListener('DOMContentLoaded', async () => {
    const selectEvent = document.getElementById('event_id');
    try {
        const res = await fetch(`${API_BASE_URL}/events`);
        globalEventsData = await res.json();
        
        if (globalEventsData.length === 0) {
            selectEvent.innerHTML = '<option value="">-- ไม่พบรายการ Event --</option>';
            return;
        }

        selectEvent.innerHTML = '<option value="">-- เลือกชื่องาน --</option>';
        globalEventsData.forEach(e => {
            selectEvent.innerHTML += `<option value="${e.event_id}">${e.event_name}</option>`;
        });
    } catch (err) {
        console.error('Error fetching events:', err);
        selectEvent.innerHTML = '<option value="">-- โหลดข้อมูลไม่สำเร็จ --</option>';
    }
});

// เมื่อผู้ใช้เลือก Event ให้ดึงสถานที่จัดงานมาแสดงในช่อง event_location อัตโนมัติ
document.getElementById('event_id').addEventListener('change', (e) => {
    const selectedId = e.target.value;
    const locationInput = document.getElementById('event_location');
    
    if (selectedId) {
        const selectedEvent = globalEventsData.find(evt => evt.event_id == selectedId);
        if (selectedEvent && locationInput) {
            locationInput.value = selectedEvent.location || '-';
        }
    } else if (locationInput) {
        locationInput.value = '';
    }
});

// ซ่อน/แสดง ช่องระบุประเภทงานอื่นๆ
document.getElementById('work_type').addEventListener('change', (e) => {
    const otherGroup = document.getElementById('otherGroup');
    const otherInput = document.getElementById('work_type_other');
    if (e.target.value === 'อื่นๆ') {
        otherGroup.classList.remove('d-none');
        otherInput.required = true;
    } else {
        otherGroup.classList.add('d-none');
        otherInput.required = false;
        otherInput.value = '';
    }
});

// ส่งข้อมูลลงทะเบียน
document.getElementById('regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.innerText = 'กำลังลงทะเบียน...';

    // ดึงค่าจำนวนคนและแปลงเป็นตัวเลข
    const countInput = document.getElementById('attendee_count');
    const countValue = countInput ? parseInt(countInput.value, 10) : 1;

    const formData = {
        event_id: document.getElementById('event_id').value,
        full_name: document.getElementById('full_name').value.trim(),
        company_name: document.getElementById('company_name').value.trim(),
        position: document.getElementById('position').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        email: document.getElementById('email').value.trim(),
        booth_no: document.getElementById('booth_no').value.trim(),
        work_type: document.getElementById('work_type').value,
        work_type_other: document.getElementById('work_type_other').value.trim(),
        attendee_count: isNaN(countValue) || countValue < 1 ? 1 : countValue,
        scheduled_time: document.getElementById('scheduled_time').value
    };

    try {
        const res = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const result = await res.json();

        if (result.success) {
            if (result.email_status === 'SENT') {
                alert(`ลงทะเบียนสำเร็จ!\nส่ง QR Code ไปที่อีเมลเรียบร้อยแล้ว`);
            } else {
                alert(`ลงทะเบียนสำเร็จ!\n⚠️️ แต่ไม่สามารถส่งอีเมลได้: ${result.email_error}`);
            }
            document.getElementById('regForm').reset();
            document.getElementById('otherGroup').classList.add('d-none');
            document.getElementById('event_location').value = ''; // เคลียร์ค่าสถานที่
        } else {
            alert('เกิดข้อผิดพลาด: ' + (result.error || 'ไม่สามารถลงทะเบียนได้'));
        }
    } catch (err) {
        console.error('Registration Submit Error:', err);
        alert('ไม่สามารถเชื่อมต่อ Server ได้');
    } finally {
        btn.disabled = false;
        btn.innerText = 'ลงทะเบียน & รับ QR Code';
    }
});
