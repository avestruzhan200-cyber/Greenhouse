const firebaseConfig = {
  apiKey: "AIzaSyDJK1zNcKmLBgyY6gv1-NHftTeSyYQaN1M",
  authDomain: "greenhouseapp-42630.firebaseapp.com",
  projectId: "greenhouseapp-42630",
  storageBucket: "greenhouseapp-42630.firebasestorage.app",
  messagingSenderId: "99276923964",
  appId: "1:99276923964:web:881c51cf4c5df6c636cf39"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// PAGE LOCATION HANDLING
const currentPage = window.location.pathname.split("/").pop();

// LOGIN
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const errorDiv = document.getElementById("error");
    if (!email || !password) { errorDiv.innerText = "All fields required"; return; }

    auth.signInWithEmailAndPassword(email, password)
      .then(cred => {
        const uid = cred.user.uid;
        db.collection("admins").doc(uid).get()
          .then(docSnap => {
            if (docSnap.exists) {
              window.location.href = "index.html";
            } else {
              auth.signOut();
              errorDiv.innerText = "Access denied: Not an admin";
            }
          });
      }).catch(err => errorDiv.innerText = "Login failed: " + err.message);
  });
}

// LOGOUT
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to log out?")) {
      auth.signOut().then(() => {
        window.location.href = "login.html";
      });
    }
  });
}

// AUTH STATE ROUTING
auth.onAuthStateChanged(user => {
  if (user) {
    db.collection("admins").doc(user.uid).get().then(docSnap => {
      if (docSnap.exists) {
        if (currentPage === "login.html" || currentPage === "") {
          window.location.href = "index.html";
        } else {
          // --- VERIFIED ADMIN: REVEAL THE DASHBOARD ---
          document.getElementById("appBody").style.display = "block";
          loadDashboard(); 
          loadUsers();
        }
      } else {
        auth.signOut().then(() => {
          window.location.href = "login.html";
        });
      }
    }).catch(err => {
      console.error("Error verifying admin state:", err);
    });
  } else {
    if (currentPage === "index.html" || currentPage === "" || currentPage === "/") {
      window.location.href = "login.html";
    }
  }
});

function getDeviceDisplayName(deviceId) {
  const match = deviceId.match(/\d+/);
  if (!match) return deviceId;
  return "Greenhouse" + match[0].padStart(3, "0");
}

// SIDEBAR NAV
document.querySelectorAll('.menu-item[data-section]').forEach(item => {
  item.addEventListener('click', () => showSection(item.dataset.section));
});

function showSection(sectionId) {
  document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
  document.getElementById(sectionId)?.classList.add('active');
  
  document.querySelectorAll('.menu-item[data-section]').forEach(i => {
    i.classList.remove('active', 'bg-white', 'text-primary', 'shadow-sm', 'font-semibold');
    i.classList.add('text-white/75', 'font-medium');
  });
  
  const activeItem = document.querySelector(`.menu-item[data-section="${sectionId}"]`);
  if (activeItem) {
    activeItem.classList.add('active', 'bg-white', 'text-primary', 'shadow-sm', 'font-semibold');
    activeItem.classList.remove('text-white/75', 'font-medium');
  }
  
  if (sectionId === "plants") {
    loadPlants();
  }
  
  const titleMap = { 
    dashboard: "Admin Dashboard", 
    devices: "Greenhouse Monitoring", 
    users: "Greenhouse Operator Management",
    plants: "Plants Management"
  };
  const topbarTitle = document.getElementById("topbarTitle");
  if (topbarTitle) topbarTitle.innerText = titleMap[sectionId] || "";
}

// DASHBOARD
async function loadDashboard() {
  const activeUsersEl = document.getElementById("activeUsers");
  if (!activeUsersEl) return;

  const usersCol = db.collection("users");
  const devicesCol = db.collection("devices");

  usersCol.where("greenhouseDeviceId", "!=", null).onSnapshot(snapshot => {
    const activeCount = snapshot.docs.filter(doc => {
      const deviceId = doc.data().greenhouseDeviceId;
      return deviceId && deviceId !== "None";
    }).length;

    activeUsersEl.innerText = activeCount;
  });

  devicesCol.onSnapshot(async snapshot => {
    const dashboardTableBody = document.querySelector("#dashboardTable tbody");
    const deviceList = document.querySelector(".device-list");
    const totalDevicesEl = document.getElementById("totalDevices");
    const repairDevicesEl = document.getElementById("repairDevices");

    if (totalDevicesEl) totalDevicesEl.innerText = snapshot.size;

    let repairCount = 0;

    const deviceEntries = await Promise.all(
      snapshot.docs.map(async docSnap => {
        const device = docSnap.data();
        const deviceId = docSnap.id;
        let username = "-";
        let greenhouseName = device.greenhouseType || "-";

        const rawStatus = (device.status || "").toLowerCase();
        if (rawStatus === "repair") {
          repairCount++;
        }

        try {
          if (device.userId) {
            const userSnap = await db.collection("users").doc(device.userId).get();
            if (userSnap.exists) {
              const uData = userSnap.data();
              username = uData.fullName ? uData.fullName.trim() : (uData.username || "-");
              if (greenhouseName === "-") greenhouseName = uData.greenhouseType || "-";
            }
          } 
          else {
            const userQuery = await db.collection("users")
              .where("greenhouseDeviceId", "==", deviceId)
              .limit(1)
              .get();

            if (!userQuery.empty) {
              const uData = userQuery.docs[0].data();
              username = uData.fullName ? uData.fullName.trim() : (uData.username || "-");
              if (greenhouseName === "-") greenhouseName = uData.greenhouseType || "-";
            }
          }
        } catch (err) {
          console.error("Error fetching user/greenhouseType for device:", err);
        }

        return { deviceId, device, username, greenhouseName };
      })
    );

    if (repairDevicesEl) repairDevicesEl.innerText = repairCount;

    if (dashboardTableBody) dashboardTableBody.innerHTML = ""; 
    if (deviceList) deviceList.innerHTML = "";

    deviceEntries.forEach(({ deviceId, device, username, greenhouseName }) => {
      const temps = [device.hydroponics?.temp, device.soilArea1?.temp, device.soilArea2?.temp].filter(Boolean);
      const avgTemp = temps.length ? (temps.reduce((a,b) => a+b, 0) / temps.length).toFixed(1) : "-";
      
      const hums = [device.hydroponics?.humidity, device.soilArea1?.humidity, device.soilArea2?.humidity].filter(Boolean);
      const avgHumidity = hums.length ? (hums.reduce((a,b) => a+b, 0) / hums.length).toFixed(1) : "-";
      
      let rawTime = device.updatedAt;
      let lastUpdate = "-";
      
      if (rawTime) {
        let dateObj = null;
        if (rawTime.seconds) {
          dateObj = new Date(rawTime.seconds * 1000);
        } else if (typeof rawTime.toDate === "function") {
          dateObj = rawTime.toDate();
        } else {
          dateObj = new Date(rawTime);
        }

        if (dateObj && !isNaN(dateObj.getTime())) {
          lastUpdate = dateObj.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
          });
        }
      }

      // --- STATUS LOGIC ---
      let statusText = "Working";
      let statusClass = "px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 inline-block";
      
      const rawStatus = (device.status || "").toLowerCase();
      
      if (rawStatus === "repair") {
        statusText = "Needs Repair";
        statusClass = "px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 inline-block";
      } else {
        statusText = "Working";
        statusClass = "px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 inline-block";
      }

// --- RENDER TABLE ROW ---
      if (dashboardTableBody) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="p-4">${greenhouseName}</td>
          <td class="p-4">${username}</td>
          <td class="p-4">${avgTemp}°C</td>
          <td class="p-4">${avgHumidity}%</td>
          <td class="p-4"><span class="${statusClass}">${statusText}</span></td>
          <td class="p-4">${lastUpdate}</td>
        `;
        dashboardTableBody.appendChild(tr);
      }

      // --- RENDER DEVICE CARD WITH LEAF BACKGROUND DESIGN ---
      if (deviceList) {
        const card = document.createElement("div"); 
        // Added w-full, max-w-none, and switched breaking points to xl to safely fit 2-column grid widths
        card.classList.add("device-card", "bg-white", "p-6", "rounded-2xl", "border", "border-gray-200", "mb-4", "shadow-sm", "relative", "overflow-hidden", "flex", "flex-col", "xl:flex-row", "justify-between", "items-start", "xl:items-center", "gap-4", "w-full", "max-w-none");

        // Leaf design background
        const leafBg = document.createElement("div");
        leafBg.className = "absolute -left-4 -bottom-6 text-emerald-100 pointer-events-none z-0";
        leafBg.innerHTML = `
          <svg class="w-36 h-36" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,11.5C2,11.5 4.5,8.5 9,7.75C13.5,7 17,8 17,8Z"/>
          </svg>
        `;

        const infoDiv = document.createElement("div"); 
        infoDiv.classList.add("device-info-wrapper", "relative", "z-10");

        const cardTitle = (greenhouseName && greenhouseName !== "-") ? greenhouseName : "No name";

        infoDiv.innerHTML = `
          <div class="font-bold text-lg text-gray-800 mb-1">${cardTitle}</div>
          <div class="text-sm text-gray-600">Device ID: ${getDeviceDisplayName(deviceId)}</div>
          <div class="text-sm text-gray-600">Greenhouse Operator: ${username}</div>
          <div class="text-sm font-semibold mt-2 flex items-center gap-2">Status: <span class="${statusClass}">${statusText}</span></div>
        `;

        const btnContainer = document.createElement("div");
        // Adjusted grid/flex behavior so action buttons wrap neatly inside the half-width grid slots
        btnContainer.classList.add("device-actions", "grid", "grid-cols-2", "sm:grid-cols-3", "xl:flex", "xl:flex-col", "gap-2", "relative", "z-10", "w-full", "xl:w-auto");

        // RESET BUTTON
        const resetBtn = document.createElement("button");
        resetBtn.classList.add("action-btn", "px-3", "py-1.5", "bg-rose-500", "hover:bg-rose-600", "text-white", "rounded-lg", "text-xs", "font-semibold", "transition-all", "text-center"); 
        resetBtn.innerText = "Reset"; 
        resetBtn.onclick = () => resetDevice(deviceId);

        const viewBtn = document.createElement("button");
        viewBtn.classList.add("action-btn", "px-3", "py-1.5", "bg-emerald-100", "hover:bg-emerald-200", "text-emerald-800", "rounded-lg", "text-xs", "font-semibold", "transition-all", "text-center"); 
        viewBtn.innerText = "View"; 
        viewBtn.onclick = () => viewDevice(deviceId);

        const qrBtn = document.createElement("button");
        qrBtn.classList.add("action-btn", "px-3", "py-1.5", "bg-blue-100", "hover:bg-blue-200", "text-blue-800", "rounded-lg", "text-xs", "font-semibold", "transition-all", "text-center"); 
        qrBtn.innerText = "QR"; 
        qrBtn.onclick = () => showQr(deviceId);

        const workingBtn = document.createElement("button");
        workingBtn.classList.add("px-3", "py-1.5", "bg-emerald-600", "hover:bg-emerald-700", "text-white", "rounded-lg", "text-xs", "font-semibold", "transition-all", "text-center");
        workingBtn.innerText = "Working";
        workingBtn.onclick = () => updateDeviceStatus(deviceId, "working");

        // NEEDS REPAIR BUTTON
        const repairBtn = document.createElement("button");
        repairBtn.classList.add("px-3", "py-1.5", "bg-amber-500", "hover:bg-amber-600", "text-white", "rounded-lg", "text-xs", "font-semibold", "transition-all", "text-center");
        repairBtn.innerText = "Needs Repair";
        repairBtn.onclick = () => updateDeviceStatus(deviceId, "repair");

        btnContainer.appendChild(resetBtn);
        btnContainer.appendChild(viewBtn);
        btnContainer.appendChild(qrBtn);
        btnContainer.appendChild(workingBtn);
        btnContainer.appendChild(repairBtn);

        card.appendChild(leafBg);
        card.appendChild(infoDiv);
        card.appendChild(btnContainer);
        deviceList.appendChild(card);
      }
    });
  });
}

// Function para i-update ang status sa Firestore gamit ang merge
async function updateDeviceStatus(deviceId, newStatus) {
  try {
    await db.collection("devices").doc(deviceId).set({
      status: newStatus
      // updatedAt has been removed here so only your device can update it!
    }, { merge: true });
    
    alert(`Device status updated to: ${newStatus.toUpperCase()}`);
  } catch (err) {
    alert("Error updating status: " + err.message);
  }
}

function filterDashboardTable() {
  const input = document.getElementById("dashboardSearch");
  if (!input) return;
  const filter = input.value.toLowerCase().trim();
  const table = document.getElementById("dashboardTable");
  const rows = table.getElementsByTagName("tbody")[0].getElementsByTagName("tr");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.getElementsByTagName("td");

    if (cells.length >= 3) {
      const userText = cells[0].textContent || cells[0].innerText;
      const tempText = cells[1].textContent || cells[1].innerText;
      const humidText = cells[2].textContent || cells[2].innerText;

      const combinedText = `${userText} ${tempText} ${humidText}`.toLowerCase();

      if (combinedText.indexOf(filter) > -1) {
        row.style.display = "";
      } else {
        row.style.display = "none";
      }
    }
  }
}

// QR MODAL
const qrModal = document.getElementById("qrModal");

function showQr(deviceId) {
  if (!qrModal) return;
  qrModal.style.display = "flex";
  const qrData = `GREENHOUSE_DEVICE:${deviceId}`;
  const canvas = document.getElementById("qrCanvas");

  QRCode.toCanvas(canvas, qrData, {
    width: 200,
    margin: 2
  }, function (error) {
    if (error) console.error(error);
  });

  document.getElementById("qrText").innerText = qrData;
}

function closeQr() {
  if (qrModal) qrModal.style.display = "none";
}

// USERS / OPERATORS MANAGEMENT
function loadUsers() {
  const usersTable = document.querySelector("#usersTable tbody");
  if (!usersTable) return;

  db.collection("users").onSnapshot(snapshot => {
    usersTable.innerHTML = "";
    const totalUsersEl = document.getElementById("totalUsers");
    if (totalUsersEl) totalUsersEl.innerText = snapshot.size;

    snapshot.forEach(docSnap => {
      const user = docSnap.data();
      const uid = docSnap.id;

      const realDeviceId = user.greenhouseDeviceId || "None";
      const displayDevice = realDeviceId !== "None" ? getDeviceDisplayName(realDeviceId) : "None";

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td class="p-4 font-medium text-gray-800">${user.fullName || "-"}</td>
        <td class="p-4 text-gray-600">${user.email || "-"}</td>
        <td class="p-4 text-gray-600">${displayDevice}</td>
        <td class="p-4">
          <div class="flex items-center justify-center gap-2">
            <button class="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold transition-all" onclick="assignDevice('${uid}')">Assign</button>
            <button class="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-xs font-semibold transition-all" onclick="removeDevice('${uid}','${realDeviceId}')">Remove</button>
            <button class="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-semibold transition-all" onclick="deleteUser('${uid}', '${realDeviceId}')">Delete</button>
          </div>
        </td>
      `;

      usersTable.appendChild(tr);
    });
  });

  const usersSearchInput = document.getElementById("usersSearch");
  if (usersSearchInput) {
    usersSearchInput.removeEventListener("keyup", filterUsersTable);
    usersSearchInput.addEventListener("keyup", filterUsersTable);
  }
}

function filterUsersTable() {
  const input = document.getElementById("usersSearch");
  if (!input) return;
  const filter = input.value.toLowerCase().trim();
  const rows = document.querySelectorAll("#usersTable tbody tr");

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? "" : "none";
  });
}

async function deleteUser(uid, deviceId) {
  if (!confirm("Are you sure you want to delete this user and reset their device? This cannot be undone!")) return;

  try {
    if (deviceId && deviceId !== "None") {
      await db.collection("users").doc(uid).update({
        greenhouseDeviceId: firebase.firestore.FieldValue.delete(),
        onboardingStep: 1
      });

      await db.collection("devices").doc(deviceId).set({
        paired: false,
        userId: firebase.firestore.FieldValue.delete()
      }, { merge: true });
    }

    await db.collection("users").doc(uid).delete();
    alert("User and their device association deleted successfully!");
  } catch (err) {
    alert("Error deleting user: " + err.message);
  }
}

async function resetDevice(deviceId) {
  if (!confirm(`Reset all data for ${getDeviceDisplayName(deviceId)}? This cannot be undone!`)) return;

  try {
    const deviceRef = db.collection("devices").doc(deviceId);
    const deviceSnap = await deviceRef.get();
    const data = deviceSnap.data();
    const paired = data?.paired || false;

    const clearedData = { paired };

    function clearNested(obj) {
      for (const key in obj) {
        if (key === "paired") continue;
        if (obj[key] !== null && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
          obj[key] = {}; 
        } else {
          obj[key] = null;
        }
      }
    }

    clearNested(data);
    await deviceRef.set({ ...clearedData, ...data }, { merge: true });

    const subcollections = ["logs", "notifications"];
    for (const colName of subcollections) {
      const colRef = deviceRef.collection(colName);
      const snapshot = await colRef.get();
      for (const doc of snapshot.docs) {
        await doc.ref.delete();
      }
    }

    alert("Device reset successfully!");
  } catch (err) {
    alert("Error resetting device: " + err.message);
  }
}

async function assignDevice(uid) {
  const deviceId = prompt("Enter device ID (example: device001)");
  if (!deviceId) return;

  try {
    const deviceDoc = await db.collection("devices").doc(deviceId).get();

    if (!deviceDoc.exists) {
      alert("Device does not exist!");
      return;
    }

    if (deviceDoc.data().paired) {
      alert("Device already assigned!");
      return;
    }

    await db.collection("users").doc(uid).update({
      greenhouseDeviceId: deviceId,
      onboardingStep: 2
    });

    await db.collection("devices").doc(deviceId).update({
      userId: uid,
      paired: true
    });

    alert("Device assigned and onboarding updated!");
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function removeDevice(uid, deviceId) {
  if (deviceId === "None") {
    alert("User has no device");
    return;
  }

  if (!confirm("Remove device and reset it to default?")) return;

  try {
    await db.collection("users").doc(uid).update({
      greenhouseDeviceId: firebase.firestore.FieldValue.delete(),
      onboardingStep: 1
    });

    await db.collection("devices").doc(deviceId).set({
      paired: false,
      userId: firebase.firestore.FieldValue.delete()
    }, { merge: true });

    alert("Device removed, and onboarding reset!");
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// DEVICE VIEW MODAL
const modal = document.getElementById("deviceModal");
const modalDeviceName = document.getElementById("modalDeviceName");

const closeBtn = document.querySelector("#deviceModal .close-button");
if (closeBtn) {
  closeBtn.addEventListener("click", () => { if (modal) modal.style.display = "none"; });
}

window.addEventListener("click", e => {
  if (e.target === modal) modal.style.display = "none";
  if (e.target === qrModal) qrModal.style.display = "none";
});

async function viewDevice(deviceId) {
  try {
    const docSnap = await db.collection("devices").doc(deviceId).get();
    if (!docSnap.exists) return alert("Device not found");

    const device = docSnap.data();

    // Shows 0 correctly; only null/undefined become "-"
    const fmt = (v, unit) => (v !== null && v !== undefined) ? `${v} ${unit}` : "-";

    // Averages ignore only missing readings (null/undefined); 0 counts as a real reading.
    const validReading = v => v !== null && v !== undefined;
    const average = values => {
      const valid = values.filter(validReading);
      return valid.length ? (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) : null;
    };

    if (modal) modal.style.display = "flex";
    if (modalDeviceName) modalDeviceName.innerText = getDeviceDisplayName(deviceId);

    const avgTemp = average([device.hydroponics?.temp, device.soilArea1?.temp, device.soilArea2?.temp])
      ?? (device.temp != null ? String(device.temp) : "-");
    const avgHumidity = average([device.hydroponics?.humidity, device.soilArea1?.humidity, device.soilArea2?.humidity])
      ?? (device.humidity != null ? String(device.humidity) : "-");

    const currentTemp = parseFloat(avgTemp) || 0;
    const shouldFanBeOn = currentTemp >= 33;
    const isPaired = device.paired || false;

    const pestRisk = (device.pestRisk || "low").toLowerCase();
    const isHighPestRisk = pestRisk === "high";

    let modalBody = document.getElementById("modalBodyContent");
    const oldTable = document.getElementById("deviceDetailsTable");
    if (oldTable) oldTable.style.display = "none";

    if (!modalBody) {
      const modalContent = document.querySelector("#deviceModal .modal-content");
      if (modalContent) {
        modalBody = document.createElement("div");
        modalBody.id = "modalBodyContent";
        modalBody.className = "flex flex-col gap-5 mt-4";
        modalContent.appendChild(modalBody);
      }
    }

    if (modalBody) {
      modalBody.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div class="col-span-2 md:col-span-3 bg-gradient-to-br from-emerald-600 to-emerald-700 border border-emerald-500 p-4 rounded-2xl flex items-center gap-4 shadow-md">
            <div class="w-10 h-10 shrink-0 rounded-xl bg-white/10 flex items-center justify-center text-white font-bold text-xl">🌡️</div>
            <div class="min-w-0">
              <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-100 block">Temperature</span>
              <span class="text-2xl font-black text-white">${avgTemp !== "-" ? avgTemp + '<span class="text-sm font-semibold text-emerald-200 ml-0.5">°C</span>' : '-'}</span>
            </div>
          </div>

          <div class="col-span-2 md:col-span-3 bg-gradient-to-br from-emerald-600 to-emerald-700 border border-emerald-500 p-4 rounded-2xl flex items-center gap-4 shadow-md">
            <div class="w-10 h-10 shrink-0 rounded-xl bg-white/10 flex items-center justify-center text-white font-bold text-xl">💧</div>
            <div class="min-w-0">
              <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-100 block">Humidity</span>
              <span class="text-2xl font-black text-white">${avgHumidity !== "-" ? avgHumidity + '<span class="text-sm font-semibold text-emerald-200 ml-0.5">%</span>' : '-'}</span>
            </div>
          </div>

          <div class="col-span-2 bg-gradient-to-br from-emerald-600 to-emerald-700 border border-emerald-500 p-4 rounded-2xl flex items-center justify-between shadow-md">
            <div>
              <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-100 block">Fan Status</span>
              <span class="text-xs font-bold text-white mt-0.5 block">${shouldFanBeOn ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
            <span class="w-4 h-4 rounded-full ${shouldFanBeOn ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-rose-500 shadow-lg shadow-rose-500/50'} inline-block"></span>
          </div>

          <div class="col-span-2 bg-gradient-to-br from-emerald-600 to-emerald-700 border border-emerald-500 p-4 rounded-2xl flex items-center justify-between shadow-md">
            <div>
              <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-100 block">Device State</span>
              <span class="text-xs font-bold text-white mt-0.5 block">${isPaired ? 'PAIRED' : 'UNPAIRED'}</span>
            </div>
            <span class="w-4 h-4 rounded-full ${isPaired ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-rose-500 shadow-lg shadow-rose-500/50'} inline-block"></span>
          </div>

          <div class="col-span-2 bg-gradient-to-br from-emerald-600 to-emerald-700 border border-emerald-500 p-4 rounded-2xl flex items-center justify-between shadow-md">
            <div>
              <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-100 block">Pest Risk</span>
              <span class="text-xs font-bold text-white mt-0.5 block">${pestRisk.toUpperCase()}</span>
            </div>
            <span class="w-4 h-4 rounded-full ${isHighPestRisk ? 'bg-rose-500 shadow-lg shadow-rose-500/50' : 'bg-emerald-400 shadow-lg shadow-emerald-400/50'} inline-block"></span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2 items-start">
          <div class="bg-gradient-to-br from-emerald-600 to-emerald-700 border border-emerald-500 p-5 rounded-2xl shadow-md flex flex-col">
            <div class="flex items-center gap-2 mb-4">
              <span class="w-2 h-2 rounded-full bg-white shadow-sm"></span>
              <h4 class="font-black text-xs tracking-wider text-white uppercase">Hydroponics</h4>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-xs text-center flex flex-col justify-center">
                <span class="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wide">Temperature</span>
                <span class="text-sm font-bold text-gray-800 mt-1">${fmt(device.hydroponics?.temp, '°C')}</span>
              </div>
              <div class="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-xs text-center flex flex-col justify-center">
                <span class="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wide">Humidity</span>
                <span class="text-sm font-bold text-gray-800 mt-1">${fmt(device.hydroponics?.humidity, '%')}</span>
              </div>
            </div>
          </div>

          <div class="bg-gradient-to-br from-emerald-600 to-emerald-700 border border-emerald-500 p-5 rounded-2xl shadow-md flex flex-col">
            <div class="flex items-center gap-2 mb-4">
              <span class="w-2 h-2 rounded-full bg-white shadow-sm"></span>
              <h4 class="font-black text-xs tracking-wider text-white uppercase">Plant Section 1</h4>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-xs text-center">
                <span class="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wide block mb-1">Temperature</span>
                <span class="text-sm font-bold text-gray-800">${fmt(device.soilArea1?.temp, '°C')}</span>
              </div>
              <div class="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-xs text-center">
                <span class="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wide block mb-1">Humidity</span>
                <span class="text-sm font-bold text-gray-800">${fmt(device.soilArea1?.humidity, '%')}</span>
              </div>
              <div class="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-xs text-center flex flex-col items-center justify-center">
                <span class="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wide mb-1.5">Light</span>
                <div class="w-5 h-5 rounded-full ${device.soilArea1?.lightOn ? 'bg-emerald-500 shadow-md shadow-emerald-500/30' : 'bg-rose-500 shadow-md shadow-rose-500/30'}"></div>
              </div>
              <div class="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-xs text-center">
                <span class="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wide block mb-1">Soil Moisture</span>
                <span class="text-sm font-bold text-gray-800">${fmt(device.soilArea1?.soilMoisture, '%')}</span>
              </div>
            </div>
          </div>

          <div class="bg-gradient-to-br from-emerald-600 to-emerald-700 border border-emerald-500 p-5 rounded-2xl shadow-md flex flex-col">
            <div class="flex items-center gap-2 mb-4">
              <span class="w-2 h-2 rounded-full bg-white shadow-sm"></span>
              <h4 class="font-black text-xs tracking-wider text-white uppercase">Plant Section 2</h4>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-xs text-center">
                <span class="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wide block mb-1">Temperature</span>
                <span class="text-sm font-bold text-gray-800">${fmt(device.soilArea2?.temp, '°C')}</span>
              </div>
              <div class="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-xs text-center">
                <span class="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wide block mb-1">Humidity</span>
                <span class="text-sm font-bold text-gray-800">${fmt(device.soilArea2?.humidity, '%')}</span>
              </div>
              <div class="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-xs text-center flex flex-col items-center justify-center">
                <span class="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wide mb-1.5">Light</span>
                <div class="w-5 h-5 rounded-full ${device.soilArea2?.lightOn ? 'bg-emerald-500 shadow-md shadow-emerald-500/30' : 'bg-rose-500 shadow-md shadow-rose-500/30'}"></div>
              </div>
              <div class="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-xs text-center">
                <span class="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wide block mb-1">Soil Moisture</span>
                <span class="text-sm font-bold text-gray-800">${fmt(device.soilArea2?.soilMoisture, '%')}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.error("Error viewing device:", err);
    alert("Error loading device details: " + err.message);
  }
}
// PLANTS MANAGEMENT
let plantsListenerInitialized = false;

function loadPlants() {
  const searchInput = document.getElementById("searchPlant");
  const categoryFilter = document.getElementById("filterCategory");
  const tbody = document.getElementById("plantsBody");

  if (!searchInput || !categoryFilter || !tbody) return;

  if (!plantsListenerInitialized) {
    searchInput.addEventListener("input", loadPlants);
    categoryFilter.addEventListener("change", loadPlants);
    
    tbody.addEventListener("click", e => {
      if (e.target.classList.contains("delete-btn")) {
        const plantId = e.target.dataset.id;
        if (confirm(`Delete plant "${plantId}"?`)) {
          db.collection("plants").doc(plantId).delete()
            .then(() => alert("Plant deleted!"))
            .catch(err => alert("Error: " + err.message));
        }
      }
    });

    plantsListenerInitialized = true;
  }

  db.collection("plants").onSnapshot(snapshot => {
    tbody.innerHTML = "";

    const searchText = searchInput.value.toLowerCase();
    const selectedCategory = categoryFilter.value;

    snapshot.forEach(docSnap => {
      const p = docSnap.data();
      const docId = docSnap.id;

      const matchesSearch = (p.name || "").toLowerCase().includes(searchText);
      const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;

      if (!matchesSearch || !matchesCategory) return;

      const row = document.createElement("tr");

      const rawTemp = (p.avgTemp || "").replace("°C", "").trim();
      const rawHumidity = (p.avgHumidity || "").replace("%", "").trim();
      const rawMoisture = (p.avgMoisture || "").replace("%", "").trim();

      row.innerHTML = `
        <td class="p-4 font-medium">${p.name}</td>
        <td class="p-4">${p.category === "hydro" ? "Hydroponic" : "Soil"}</td>
        <td class="p-4">${p.avgTemp || "-"}</td>
        <td class="p-4">${p.avgHumidity || "-"}</td>
        <td class="p-4">${p.avgMoisture || "-"}</td>
        <td class="p-4">
          <div class="flex items-center gap-2">
            <button class="edit-btn px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-700 transition-all" onclick="openEditPlantModal('${docId}', '${p.name}', '${p.category}', '${rawTemp}', '${rawHumidity}', '${rawMoisture}')">Edit</button>
            <button class="delete-btn px-3 py-1 bg-rose-600 text-white rounded-lg text-xs hover:bg-rose-700 transition-all" data-id="${docId}">Delete</button>
          </div>
        </td>
      `;

      tbody.appendChild(row);
    });
  });
}

function openEditPlantModal(id, name, category, temp, humidity, moisture) {
  const modal = document.getElementById("editPlantModal");
  if (!modal) return;

  document.getElementById("editPlantId").value = id;
  document.getElementById("editPlantName").value = name;
  document.getElementById("editPlantCategory").value = category;
  document.getElementById("editPlantTemp").value = temp;
  document.getElementById("editPlantHumidity").value = humidity;
  document.getElementById("editPlantMoisture").value = moisture;

  modal.style.display = "flex";
}

function closeEditPlantModal() {
  const modal = document.getElementById("editPlantModal");
  if (modal) modal.style.display = "none";
}

async function updatePlant() {
  const id = document.getElementById("editPlantId").value;
  const name = document.getElementById("editPlantName").value.trim();
  const category = document.getElementById("editPlantCategory").value;
  const temp = document.getElementById("editPlantTemp").value.trim();
  const humidity = document.getElementById("editPlantHumidity").value.trim();
  const moisture = document.getElementById("editPlantMoisture").value.trim();

  if (!id || !name) {
    alert("Please fill in all required fields.");
    return;
  }

  try {
    await db.collection("plants").doc(id).update({
      name: name,
      category: category,
      avgTemp: temp ? `${temp} °C` : "",
      avgHumidity: humidity ? `${humidity} %` : "",
      avgMoisture: moisture ? `${moisture} %` : ""
    });

    alert("Plant updated successfully!");
    closeEditPlantModal();
  } catch (err) {
    alert("Error updating plant: " + err.message);
  }
}

function addGreenhouse() {
  const deviceIdInput = document.getElementById("newDeviceId");
  if (!deviceIdInput) return;
  const deviceId = deviceIdInput.value.trim();

  if (!deviceId) {
    alert("Please enter a Device ID");
    return;
  }

  db.collection("devices").doc(deviceId).set({
    paired: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
  .then(() => {
    alert("Greenhouse device added successfully!");
    deviceIdInput.value = "";
  })
  .catch(err => {
    alert("Error adding device: " + err.message);
  });
}

function addPlant() {
  const name = document.getElementById("plantName").value.trim();
  const temp = document.getElementById("plantTemp").value.trim();
  const humidity = document.getElementById("plantHumidity").value.trim();
  const moisture = document.getElementById("plantMoisture").value.trim();
  const category = document.getElementById("plantCategory").value;

  if (!name || !temp || !humidity || !moisture) {
    alert("Fill all fields");
    return;
  }

  db.collection("plants").doc(name).set({
    name: name,
    category: category,
    avgTemp: temp + "°C",
    avgHumidity: humidity + "%",
    avgMoisture: moisture + "%"
  })
  .then(() => {
    alert("Plant added!");
  })
  .catch(err => {
    alert("Error: " + err.message);
  });
}
