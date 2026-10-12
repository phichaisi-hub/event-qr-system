document.addEventListener("DOMContentLoaded", function () {
    // ถ้าเคย Login อยู่แล้ว ให้เปลี่ยนหน้าตาม Role
    const user = JSON.parse(localStorage.getItem("currentUser"));
    if (user) {
        redirectByUserRole(user.role);
    }

    document.getElementById("loginForm").addEventListener("submit", function (e) {
        e.preventDefault();

        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value.trim();
        const alertBox = document.getElementById("alertBox");

        alertBox.classList.add("d-none");

        fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        })
        .then(async res => {
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
            return data;
        })
        .then(data => {
            // บันทึกข้อมูล Session ลง LocalStorage
            localStorage.setItem("currentUser", JSON.stringify(data.user));
            redirectByUserRole(data.user.role);
        })
        .catch(err => {
            alertBox.textContent = err.message;
            alertBox.classList.remove("d-none");
        });
    });
});

function redirectByUserRole(role) {
    if (role === "ADMIN" || role === "SUPERVISOR") {
        window.location.href = "admin.html";
    } else if (role === "SCANNER") {
        window.location.href = "scanner.html";
    }
}
