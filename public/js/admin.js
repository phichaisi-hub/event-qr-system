const HOST_IP = window.location.hostname || 'localhost';
const API_BASE = `http://${HOST_IP}:3000/api`;

let globalEvents = [];

document.addEventListener('DOMContentLoaded', () => {
    loadEvents();
});

async function loadEvents() {
    try {
        const res = await fetch(`${API_BASE}/events`);
        if (!res.ok) throw new Error('Network response was not ok');

        globalEvents = await res.json();

        const tbody = document.getElementById('eventTableBody');
        const reportSelect = document.getElementById('report_event_id');

        tbody.innerHTML = '';
        reportSelect.innerHTML = '<option value="">-- ทั้งหมดทุก Event --</option>';

        if (globalEvents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">ยังไม่มีข้อมูล Event</td></tr>';
            return;
        }

        globalEvents.forEach((e) => {
            let dateStr = '-';
            if (e.event_date) {
                const d = new Date(e.event_date);
                if (!isNaN(d.getTime())) {
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const yearTH = d.getFullYear() + 543; // แสดงผลเป็น พ.ศ. (เช่น 01/09/2569)
                    dateStr = `${day}/${month}/${yearTH}`;
                }
            }

            tbody.innerHTML += `
                <tr>
                    <td>${e.event_id}</td>
                    <td><b>${escapeHtml(e.event_name)}</b></td>
                    <td>${escapeHtml(e.location || '-')}</td>
                    <td>${dateStr}</td>
                    <td>
                        <button class="btn btn-sm btn-warning me-1" onclick="onEditClick(${e.event_id})">แก้ไข</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteEvent(${e.event_id}, '${escapeHtml(e.event_name)}')">ลบ</button>
                    </td>
                </tr>
            `;
            reportSelect.innerHTML += `<option value="${e.event_id}">${escapeHtml(e.event_name)}</option>`;
        });
    } catch (err) {
        console.error('Error loading events:', err);
        alert(`ไม่สามารถเชื่อมต่อ API Server ได้ที่: ${API_BASE}\nกรุณาตรวจสอบว่ารัน 'node server.js' อยู่หรือไม่`);
    }
}

document.getElementById('eventForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('btnSaveEvent');
    btn.disabled = true;

    const id = document.getElementById('event_id').value;
    const data = {
        event_name: document.getElementById('event_name').value.trim(),
        location: document.getElementById('location').value.trim(),
        event_date: document.getElementById('event_date').value || null
    };

    const url = id ? `${API_BASE}/admin/events/${id}` : `${API_BASE}/admin/events`;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (result.success) {
            alert(id ? 'อัปเดตข้อมูลสำเร็จ!' : 'เพิ่ม Event สำเร็จ!');
            resetEventForm();
            loadEvents();
        } else {
            alert('เกิดข้อผิดพลาด: ' + (result.error || 'ไม่สามารถบันทึกได้'));
        }
    } catch (err) {
        console.error('Save Event Error:', err);
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ Server');
    } finally {
        btn.disabled = false;
    }
});

function onEditClick(eventId) {
    const eventData = globalEvents.find(e => e.event_id === eventId);
    if (!eventData) return;

    document.getElementById('event_id').value = eventData.event_id;
    document.getElementById('event_name').value = eventData.event_name;
    document.getElementById('location').value = eventData.location || '';

    if (eventData.event_date) {
        const dateObj = new Date(eventData.event_date);
        const formattedDate = dateObj.toISOString().split('T')[0];
        document.getElementById('event_date').value = formattedDate;
    } else {
        document.getElementById('event_date').value = '';
    }

    document.getElementById('btnSaveEvent').innerText = 'อัปเดต';
    document.getElementById('btnResetEvent').classList.remove('d-none');
}

async function deleteEvent(eventId, eventName) {
    if (!confirm(`คุณต้องการลบ Event "${eventName}" ใช่หรือไม่?\n(การลบจะลบข้อมูลผู้ลงทะเบียนและ Log ที่เกี่ยวข้องทั้งหมด)`)) {
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/admin/events/${eventId}`, {
            method: 'DELETE'
        });
        const result = await res.json();

        if (result.success) {
            alert('ลบข้อมูลเรียบร้อยแล้ว');
            if (document.getElementById('event_id').value == eventId) {
                resetEventForm();
            }
            loadEvents();
        } else {
            alert('เกิดข้อผิดพลาด: ' + (result.error || 'ไม่สามารถลบได้'));
        }
    } catch (err) {
        console.error('Delete Error:', err);
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ Server');
    }
}

document.getElementById('btnResetEvent').addEventListener('click', resetEventForm);

function resetEventForm() {
    document.getElementById('eventForm').reset();
    document.getElementById('event_id').value = '';
    document.getElementById('btnSaveEvent').innerText = 'บันทึก';
    document.getElementById('btnResetEvent').classList.add('d-none');
}

document.getElementById('importForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('excel_file');
    if (!fileInput.files[0]) {
        alert('กรุณาเลือกไฟล์ Excel');
        return;
    }

    const formData = new FormData();
    formData.append('excel_file', fileInput.files[0]);

    try {
        const res = await fetch(`${API_BASE}/admin/events/import`, {
            method: 'POST',
            body: formData
        });
        const result = await res.json();

        if (result.success) {
            let msg = `นำเข้าสำเร็จ ${result.count} รายการ`;
            if (result.duplicateCount > 0) {
                msg += `\n(ข้ามรายการที่ซ้ำ ${result.duplicateCount} รายการ)`;
            }
            alert(msg);
            fileInput.value = '';
            loadEvents();
        } else {
            alert('เกิดข้อผิดพลาด: ' + (result.error || 'ไม่สามารถนำเข้าได้'));
        }
    } catch (err) {
        console.error('Import Error:', err);
        alert('เกิดข้อผิดพลาดในการอัปโหลดไฟล์');
    }
});

document.getElementById('reportForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const event_id = document.getElementById('report_event_id').value;
    const start_date = document.getElementById('start_date').value;
    const end_date = document.getElementById('end_date').value;

    const queryParams = new URLSearchParams({ event_id, start_date, end_date }).toString();
    window.location.href = `${API_BASE}/admin/reports/export?${queryParams}`;
});

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
