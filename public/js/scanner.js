const HOST_IP = window.location.hostname || 'localhost';
const API_BASE_URL = `http://${HOST_IP}:3000/api`;
let isProcessing = false;

function onScanSuccess(decodedText) {
    if (isProcessing) return;
    isProcessing = true;
    checkPermit(decodedText);
    setTimeout(() => { isProcessing = false; }, 3000);
}

if (window.isSecureContext) {
    const html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    html5QrcodeScanner.render(onScanSuccess);
}

document.getElementById('btnCheck').addEventListener('click', () => {
    const id = document.getElementById('manual_id').value.trim();
    if (id) checkPermit(id);
});

document.getElementById('manual_id').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const id = e.target.value.trim();
        if (id) checkPermit(id);
    }
});

async function checkPermit(permitId) {
    const box = document.getElementById('resultBox');
    const title = document.getElementById('resultTitle');
    const details = document.getElementById('resultDetails');

    box.style.display = 'block';
    box.className = 'result-box text-center';
    title.innerText = 'กำลังตรวจสอบ...';
    details.innerHTML = '';

    try {
        const res = await fetch(`${API_BASE_URL}/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permit_id: permitId, gate_location: 'Main Gate', staff_id: 'Staff-01' })
        });
        const data = await res.json();

        if (data.status === 'SUCCESS') {
            box.className = 'result-box status-SUCCESS';
            title.innerText = '✅ อนุญาตให้เข้าพื้นที่';
            details.innerHTML = `
                <hr>
                <p class="mb-1"><b>ชื่องาน:</b> ${data.attendee.event_name}</p>
                <p class="mb-1"><b>ชื่อ:</b> ${data.attendee.full_name} (${data.attendee.company_name})</p>
                <p class="mb-1"><b>บูธ:</b> ${data.attendee.booth_no} | <b>จำนวน:</b> ${data.attendee.attendee_count || 1} คน</p>
                <p class="mb-0"><b>Permit ID:</b> ${data.attendee.permit_id}</p>
            `;
        } else if (data.status === 'DUPLICATE') {
            box.className = 'result-box status-DUPLICATE';
            title.innerText = '⚠ บัตรนี้ถูกสแกนเข้างานไปแล้ว!';
            details.innerHTML = `
                <hr>
                <p class="mb-1"><b>สแกนเข้าเมื่อ:</b> ${new Date(data.first_scan).toLocaleString('th-TH')}</p>
                <p class="mb-1"><b>ชื่อ:</b> ${data.attendee.full_name} (${data.attendee.company_name})</p>
                <p class="mb-0"><b>Permit ID:</b> ${data.attendee.permit_id}</p>
            `;
        } else {
            box.className = 'result-box status-INVALID';
            title.innerText = '❌ ไม่สามารถเข้าพื้นที่ได้';
            details.innerHTML = `<hr><p class="mb-0">${data.message || 'ไม่พบข้อมูล QR Code ในระบบ'}</p>`;
        }
    } catch (err) {
        box.className = 'result-box status-INVALID';
        title.innerText = '❌ ไม่สามารถเชื่อมต่อกับ Server ได้';
    } finally {
        document.getElementById('manual_id').value = '';
    }
}
