let eventsData = [];
let currentUser = null;

document.addEventListener("DOMContentLoaded", function () {
    // 1. ตรวจสอบ Session การ Login
    const userData = localStorage.getItem("currentUser");
    if (!userData) {
        window.location.href = "login.html";
        return;
    }

    currentUser = JSON.parse(userData);

    // ตรวจสอบสิทธิ์เข้าหน้า admin.html
    if (currentUser.role !== "ADMIN" && currentUser.role !== "SUPERVISOR") {
        alert("คุณไม่มีสิทธิ์เข้าใช้งานหน้านี้");
        window.location.href = "scanner.html";
        return;
    }

    // แสดงชื่อและ Role
    document.getElementById("userDisplayFullName").textContent = currentUser.fullname;
    document.getElementById("userDisplayRole").textContent = currentUser.role;

    // ปุ่ม Logout
    document.getElementById("btnLogout").addEventListener("click", function () {
        localStorage.removeItem("currentUser");
        window.location.href = "login.html";
    });

    // แสดงส่วนจัดการ User สำหรับ System Admin เท่านั้น
    if (currentUser.role === "ADMIN") {
        document.getElementById("userManagementSection").classList.remove("d-none");
        loadUsers();

        // ฟอร์มเพิ่ม User
        document.getElementById("userForm").addEventListener("submit", function (e) {
            e.preventDefault();
            const username = document.getElementById("u_username").value.trim();
            const password = document.getElementById("u_password").value.trim();
            const fullname = document.getElementById("u_fullname").value.trim();
            const role = document.getElementById("u_role").value;

            fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, fullname, role })
            })
            .then(async res => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
                return data;
            })
            .then(data => {
                alert("เพิ่มผู้ใช้งานเรียบร้อยแล้ว");
                document.getElementById("userForm").reset();
                loadUsers();
            })
            .catch(err => alert(err.message));
        });
    }

    loadEvents();

    // บันทึก/แก้ไข Event
    document.getElementById("eventForm").addEventListener("submit", function (e) {
        e.preventDefault();
        
        const eventId = document.getElementById("event_id").value;
        const event_name = document.getElementById("event_name").value.trim();
        const location = document.getElementById("location").value.trim();
        const event_date = document.getElementById("event_date").value;

        const url = eventId ? `/api/events/${eventId}` : '/api/events';
        const method = eventId ? 'PUT' : 'POST';

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_name, location, event_date })
        })
        .then(async res => {
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาดในการบันทึก");
            return data;
        })
        .then(data => {
            alert(eventId ? "แก้ไขข้อมูล Event เรียบร้อยแล้ว" : "บันทึก Event เรียบร้อยแล้ว");
            resetForm();
            loadEvents();
        })
        .catch(err => alert(err.message));
    });

    document.getElementById("btnResetEvent").addEventListener("click", function () {
        resetForm();
    });

    // Import Excel
    document.getElementById("importForm").addEventListener("submit", function (e) {
        e.preventDefault();

        const fileInput = document.getElementById("excel_file");
        if (!fileInput.files || fileInput.files.length === 0) {
            alert("กรุณาเลือกไฟล์ Excel ก่อนทำรายการ");
            return;
        }

        const formData = new FormData();
        formData.append("excel_file", fileInput.files[0]);

        fetch('/api/events/import', {
            method: 'POST',
            body: formData
        })
        .then(async res => {
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "ไม่สามารถ Import ไฟล์ได้");
            return data;
        })
        .then(data => {
            alert(data.message || "นำเข้าข้อมูลจาก Excel เรียบร้อยแล้ว");
            fileInput.value = "";
            loadEvents();
        })
        .catch(err => alert("เกิดข้อผิดพลาด: " + err.message));
    });

    // Export Excel
    document.getElementById("reportForm").addEventListener("submit", function (e) {
        e.preventDefault();
        const eventId = document.getElementById("report_event_id").value;
        const startDate = document.getElementById("start_date").value;
        const endDate = document.getElementById("end_date").value;

        const url = `/api/export-excel?event_id=${eventId}&start_date=${startDate}&end_date=${endDate}`;
        window.location.href = url;
    });
});

// ดึงรายการ Users (เฉพาะ ADMIN)
function loadUsers() {
    fetch('/api/users')
        .then(res => res.json())
        .then(users => {
            const tbody = document.getElementById("userTableBody");
            tbody.innerHTML = "";
            users.forEach(u => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="text-center fw-bold">${u.id}</td>
                    <td><b>${u.username}</b></td>
                    <td>${u.fullname}</td>
                    <td class="text-center"><span class="badge ${u.role === 'ADMIN' ? 'bg-danger' : (u.role === 'SUPERVISOR' ? 'bg-warning text-dark' : 'bg-info text-dark')}">${u.role}</span></td>
                    <td class="text-center">
                        ${u.username !== 'admin' ? `<button class="btn btn-danger btn-sm px-2 py-0 fw-bold" onclick="deleteUser(${u.id})">ลบ</button>` : '-'}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        });
}

function deleteUser(id) {
    if (confirm("ต้องการลบผู้ใช้งานนี้ใช่หรือไม่?")) {
        fetch(`/api/users/${id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(() => loadUsers());
    }
}

// ดึงรายการ Event
function loadEvents() {
    fetch('/api/events')
        .then(res => res.json())
        .then(events => {
            eventsData = events;
            const tbody = document.getElementById("eventTableBody");
            const select = document.getElementById("report_event_id");

            tbody.innerHTML = "";
            select.innerHTML = '<option value="">-- ทั้งหมดทุก Event --</option>';

            if (events.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">ยังไม่มีข้อมูล Event ในระบบ</td></tr>';
                return;
            }

            events.forEach(event => {
                let formattedDate = '-';
                if (event.event_date) {
                    const d = new Date(event.event_date);
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = d.getFullYear();
                    formattedDate = `${day}/${month}/${year}`;
                }

                // [UPDATE] แสดงปุ่มลบสำหรับทั้ง ADMIN และ SUPERVISOR
                const canDelete = currentUser.role === "ADMIN" || currentUser.role === "SUPERVISOR";
                const deleteBtnHtml = canDelete 
                    ? `<button class="btn btn-danger btn-sm px-2 py-0 fw-bold" onclick="deleteEvent(${event.id})">ลบ</button>` 
                    : '';

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="text-center fw-bold">${event.id}</td>
                    <td><b>${event.event_name}</b></td>
                    <td>${event.location || '-'}</td>
                    <td class="text-center">${formattedDate}</td>
                    <td class="text-center">
                        <button class="btn btn-warning btn-sm me-1 px-2 py-0 fw-bold" onclick="editEvent(${event.id})">แก้ไข</button>
                        ${deleteBtnHtml}
                    </td>
                `;
                tbody.appendChild(tr);

                const option = document.createElement("option");
                option.value = event.id;
                option.textContent = event.event_name;
                select.appendChild(option);
            });
        });
}

function editEvent(id) {
    const event = eventsData.find(e => e.id === id);
    if (!event) return;

    document.getElementById("event_id").value = event.id;
    document.getElementById("event_name").value = event.event_name;
    document.getElementById("location").value = event.location || '';
    
    if (event.event_date) {
        const d = new Date(event.event_date);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        document.getElementById("event_date").value = `${yyyy}-${mm}-${dd}`;
    } else {
        document.getElementById("event_date").value = '';
    }

    document.getElementById("btnSaveEvent").textContent = "อัปเดต Event";
    document.getElementById("btnSaveEvent").className = "btn btn-warning px-4";
    document.getElementById("btnResetEvent").classList.remove("d-none");
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
    document.getElementById("eventForm").reset();
    document.getElementById("event_id").value = "";
    document.getElementById("btnSaveEvent").textContent = "บันทึก Event";
    document.getElementById("btnSaveEvent").className = "btn btn-success px-4";
    document.getElementById("btnResetEvent").classList.add("d-none");
}

function deleteEvent(id) {
    if (confirm("คุณต้องการลบรายการ Event นี้ใช่หรือไม่?")) {
        fetch(`/api/events/${id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(() => loadEvents())
            .catch(err => alert("เกิดข้อผิดพลาดในการลบรายการ"));
    }
}