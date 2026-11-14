const API_URL = "/api";
let events = [];
let authMode = "signin";

const $ = (selector) => document.querySelector(selector);
const eventGrid = $("#eventGrid");
const searchInput = $("#searchInput");
const universityFilter = $("#universityFilter");
const categoryFilter = $("#categoryFilter");

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function safeURL(value = "") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function formatDate(dateString) {
  if (!dateString) return "Date TBC";
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric"
  });
}

function daysUntil(dateString) {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateString}T00:00:00`);
  return Math.ceil((target - today) / 86400000);
}

function deadlineText(deadline) {
  const days = daysUntil(deadline);
  if (days === null) return "Deadline not set";
  if (days < 0) return "Registration closed";
  if (days === 0) return "Deadline today";
  if (days <= 3) return `Closes in ${days} day${days === 1 ? "" : "s"}`;
  return `Deadline: ${formatDate(deadline)}`;
}

/* ---------- AUTHENTICATION UI & API ---------- */
function renderAuthHeader() {
  const user = JSON.parse(localStorage.getItem("sr_user") || "null");
  const authArea = $("#authArea");
  if (!authArea) return;

  if (user) {
    authArea.innerHTML = `
      <span style="font:11px var(--mono);color:var(--muted);">HI, ${escapeHTML(user.name.toUpperCase())}</span>
      ${user.role === "admin" ? `<a href="admin.html" class="btn btn-signup">ADMIN PANEL ↗</a>` : ""}
      <button type="button" class="btn btn-signin" onclick="logoutUser()">SIGN OUT</button>
    `;
  } else {
    authArea.innerHTML = `
      <button type="button" class="btn btn-signin" onclick="openAuthModal('signin')">Sign In</button>
      <button type="button" class="btn btn-signup" onclick="openAuthModal('signup')">Sign Up</button>
    `;
  }
}

function openAuthModal(mode) {
  switchAuthTab(mode);
  $("#authModal").classList.remove("hidden");
}

function closeAuthModal() {
  $("#authModal").classList.add("hidden");
  $("#authError").textContent = "";
}

function switchAuthTab(mode) {
  authMode = mode;
  $("#tabSignin").classList.toggle("active", mode === "signin");
  $("#tabSignup").classList.toggle("active", mode === "signup");
  $("#nameField").classList.toggle("hidden", mode === "signin");
  $("#authModalTitle").textContent = mode === "signin" ? "SIGN IN TO SUDORANK" : "CREATE AN ACCOUNT";
  $("#authSubmitBtn").innerHTML = mode === "signin" ? "Sign In <span>↗</span>" : "Create Account <span>↗</span>";
}

function logoutUser() {
  localStorage.removeItem("sr_token");
  localStorage.removeItem("sr_user");
  renderAuthHeader();
}

$("#authForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  try {
    const res = await fetch(`${API_URL}/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      $("#authError").textContent = data.error || "Authentication failed";
      return;
    }
    localStorage.setItem("sr_token", data.token);
    localStorage.setItem("sr_user", JSON.stringify(data.user));
    closeAuthModal();
    renderAuthHeader();
  } catch (err) {
    $("#authError").textContent = "Server error. Make sure node server.js is running.";
  }
});

/* ---------- LOAD & RENDER EVENTS ---------- */
async function fetchEventsFromDB() {
  try {
    const res = await fetch(`${API_URL}/events`);
    events = await res.json();
    renderEvents();
    renderSelectedDay();
    initNewsAndTicker();
  } catch (err) {
    console.error("Database connection failed:", err);
  }
}

function renderEvents() {
  const query = searchInput.value.trim().toLowerCase();
  const university = universityFilter.value;
  const category = categoryFilter.value;
  const filtered = events.filter(event => event.approved !== false &&
    (!university || event.university === university) &&
    (!category || event.category === category) &&
    (!query || [event.title, event.university, event.category, event.description].join(" ").toLowerCase().includes(query))
  ).sort((a, b) => a.date.localeCompare(b.date));

  $("#resultCount").textContent = `${filtered.length} EVENT${filtered.length === 1 ? "" : "S"} FOUND`;
  $("#emptyState").classList.toggle("hidden", filtered.length > 0);
  eventGrid.innerHTML = filtered.map(event => `
    <article class="event-card">
      ${event.image_url ? `<img class="event-image" src="${escapeHTML(event.image_url)}" alt="${escapeHTML(event.title)}" loading="lazy">` : ""}
      <div class="card-top"><span class="category-pill">${escapeHTML(event.category)}</span><span class="event-date">${formatDate(event.date)}</span></div>
      <h3>${escapeHTML(event.title)}</h3>
      <div class="event-university">${escapeHTML(event.university)} · ${escapeHTML(event.venue || "Venue TBC")}</div>
      <p class="event-description">${escapeHTML(event.description)}</p>
      <div class="card-bottom"><span>REGISTRATION</span><strong>${deadlineText(event.deadline)}</strong></div>
      ${event.link ? `<a class="card-link" href="${safeURL(event.link)}" target="_blank" rel="noopener">VIEW EVENT / REGISTER ↗</a>` : `<span class="card-link">EVENT DETAILS COMING SOON</span>`}
    </article>`).join("");
  renderCalendar();
}

[searchInput, universityFilter, categoryFilter].forEach(el => el?.addEventListener("input", renderEvents));
$("#clearFilters")?.addEventListener("click", () => {
  searchInput.value = "";
  universityFilter.value = "";
  categoryFilter.value = "";
  renderEvents();
});

/* ---------- EVENT SUBMISSION (with photo upload) ---------- */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const imageInput = document.querySelector('#eventForm input[name="image"]');
const imagePreview = $("#imagePreview");

imageInput?.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) { imagePreview.classList.add("hidden"); return; }
  if (file.size > MAX_IMAGE_BYTES) {
    alert("Image is too large. Max size is 3 MB.");
    imageInput.value = "";
    imagePreview.classList.add("hidden");
    return;
  }
  imagePreview.src = URL.createObjectURL(file);
  imagePreview.classList.remove("hidden");
});

$("#eventForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formTarget = e.currentTarget;
  const formData = new FormData(formTarget); // includes the image file

  if (formData.get("deadline") > formData.get("date")) {
    alert("The registration deadline should be on or before the event date.");
    return;
  }

  const file = formData.get("image");
  if (file && !file.size) formData.delete("image"); // no file chosen

  try {
    // No Content-Type header: the browser sets the multipart boundary itself
    const res = await fetch(`${API_URL}/events`, { method: "POST", body: formData });
    if (res.ok) {
      formTarget.reset();
      imagePreview.classList.add("hidden");
      alert("✅ Success! Your university event has been submitted and is pending administrator review.");
    } else {
      const err = await res.json().catch(() => ({}));
      alert("❌ " + (err.error || "Submission failed. Please try again."));
    }
  } catch (err) {
    alert("❌ Server error. Make sure node server.js is running.");
  }
});

/* ---------- FORM TABS (event / product) ---------- */
document.querySelectorAll(".form-tab[data-form]").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".form-tab[data-form]").forEach(t => t.classList.toggle("active", t === tab));
  ["eventForm", "productForm"].forEach(id => $("#" + id)?.classList.toggle("hidden", id !== tab.dataset.form));
}));

/* ---------- STORE: LOAD, FILTER & RENDER PRODUCTS ---------- */
let products = [];
let storeCategory = "";

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n === 0 ? "FREE" : `LKR ${n.toLocaleString("en-US")}`;
}

async function fetchProducts() {
  try {
    const res = await fetch(`${API_URL}/products`);
    products = await res.json();
    renderProducts();
  } catch (err) {
    console.error("Could not load products:", err);
  }
}

function renderProducts() {
  const list = products.filter(p => !storeCategory || p.category === storeCategory);
  $("#productCount").textContent = `${list.length} PRODUCT${list.length === 1 ? "" : "S"}`;
  $("#productEmpty").classList.toggle("hidden", list.length > 0);
  $("#productGrid").innerHTML = list.map(p => `
    <article class="event-card product-card">
      ${p.image_url ? `<img class="product-image" src="${escapeHTML(p.image_url)}" alt="${escapeHTML(p.name)}" loading="lazy">` : ""}
      <div class="card-top"><span class="category-pill">${escapeHTML(p.category)}</span><span class="product-price">${escapeHTML(formatPrice(p.price))}</span></div>
      <h3>${escapeHTML(p.name)}</h3>
      <div class="event-university">${escapeHTML(p.seller)}</div>
      <p class="event-description">${escapeHTML(p.description)}</p>
      <a class="card-link" href="${safeURL(p.order_link)}" target="_blank" rel="noopener noreferrer">ORDER NOW ↗</a>
    </article>`).join("");
}

document.querySelectorAll("#storeFilters .chip").forEach(chip => chip.addEventListener("click", () => {
  storeCategory = chip.dataset.cat;
  document.querySelectorAll("#storeFilters .chip").forEach(c => c.classList.toggle("active", c === chip));
  renderProducts();
}));

/* ---------- PRODUCT SUBMISSION (with photo upload) ---------- */
const productImageInput = document.querySelector('#productForm input[name="image"]');
const productPreview = $("#productPreview");

productImageInput?.addEventListener("change", () => {
  const file = productImageInput.files[0];
  if (!file) { productPreview.classList.add("hidden"); return; }
  if (file.size > MAX_IMAGE_BYTES) {
    alert("Image is too large. Max size is 3 MB.");
    productImageInput.value = "";
    productPreview.classList.add("hidden");
    return;
  }
  productPreview.src = URL.createObjectURL(file);
  productPreview.classList.remove("hidden");
});

$("#productForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formTarget = e.currentTarget;
  const formData = new FormData(formTarget);

  const file = formData.get("image");
  if (file && !file.size) formData.delete("image");

  try {
    const res = await fetch(`${API_URL}/products`, { method: "POST", body: formData });
    if (res.ok) {
      formTarget.reset();
      productPreview.classList.add("hidden");
      alert("✅ Success! Your product has been submitted and is pending administrator review.");
    } else {
      const err = await res.json().catch(() => ({}));
      alert("❌ " + (err.error || "Submission failed. Please try again."));
    }
  } catch (err) {
    alert("❌ Server error. Make sure node server.js is running.");
  }
});

/* ---------- OPTIMIZED CALENDAR ---------- */
let calendarMonth = new Date();
calendarMonth.setDate(1);
let selectedDate = null;

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderCalendar() {
  const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
  const monthLabel = $("#monthLabel");
  if (monthLabel) {
    monthLabel.textContent = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
  }

  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const cells = [];

  for (let i = 0; i < 42; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const key = dateKey(day);
    
    const dayEvents = events.filter(e => e.approved !== false && e.date === key);
    const isCurrent = day.getMonth() === month;
    const isSelected = selectedDate === key;

    cells.push(`
      <button type="button" class="calendar-cell ${isCurrent ? "" : "muted"} ${dayEvents.length ? "has-event" : ""} ${isSelected ? "selected" : ""}" data-date="${key}">
        <span class="day-number">${day.getDate()}</span>
        ${dayEvents.slice(0, 2).map(e => `<span class="day-event-label">${escapeHTML(e.title)}</span>`).join("")}
        ${dayEvents.length > 2 ? `<span class="day-event-label" style="color:var(--ink);font-weight:700;">+${dayEvents.length - 2} more</span>` : ""}
      </button>
    `);
  }

  const calendarGrid = $("#calendarGrid");
  if (calendarGrid) {
    calendarGrid.innerHTML = cells.join("");
    document.querySelectorAll(".calendar-cell").forEach(cell => {
      cell.addEventListener("click", () => {
        selectedDate = cell.dataset.date;
        renderCalendar();
        renderSelectedDay();
      });
    });
  }
}

function renderSelectedDay() {
  const container = $("#selectedDayEvents");
  if (!container) return;

  const dayEvents = events.filter(e => e.approved !== false && e.date === selectedDate);
  container.textContent = selectedDate
    ? `${formatDate(selectedDate)} — ${dayEvents.length ? dayEvents.map(e => e.title).join(" · ") : "No published events on this date."}`
    : "Select a date to see scheduled events.";
}

$("#prevMonth")?.addEventListener("click", () => { 
  calendarMonth.setMonth(calendarMonth.getMonth() - 1); 
  renderCalendar(); 
});

$("#nextMonth")?.addEventListener("click", () => { 
  calendarMonth.setMonth(calendarMonth.getMonth() + 1); 
  renderCalendar(); 
});

/* ---------- NEWS LINE, TICKER & LIVE COUNTDOWN ---------- */
const newsItems = [
  "REGISTRATIONS OPEN FOR MORATUWA CODEFEST 2026",
  "NEW AI & CYBERSECURITY WORKSHOPS ADDED FOR DECEMBER",
  "ORGANIZERS: SUBMIT YOUR UNIVERSITY HACKATHON BELOW",
  "INTERNSHIP APPLICATIONS CLOSING SOON FOR 2027 COHORT"
];

function initNewsAndTicker() {
  const newsTrack = $("#newsTrack");
  if (newsTrack) {
    newsTrack.innerHTML = newsItems.join(" &nbsp;&nbsp;●&nbsp;&nbsp; ");
  }

  const eventTicker = $("#eventTicker");
  const upcoming = events
    .filter(e => e.approved !== false && new Date(`${e.date}T00:00:00`) >= new Date().setHours(0, 0, 0, 0))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (eventTicker && upcoming.length) {
    eventTicker.innerHTML = upcoming
      .map(e => `${escapeHTML(e.title.toUpperCase())} (${escapeHTML(e.university.toUpperCase())}) — ${formatDate(e.date).toUpperCase()}`)
      .join(" <b>✳</b> ");
  }
}

function startCountdown() {
  const titleEl = $("#cdEventTitle");
  if (!titleEl) return;

  function updateTimer() {
    const now = new Date();
    const nextEvent = events
      .filter(e => e.approved !== false && new Date(`${e.date}T09:00:00`) > now)
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    if (!nextEvent) {
      titleEl.textContent = "NO UPCOMING EVENTS";
      return;
    }

    titleEl.textContent = nextEvent.title.toUpperCase();
    const target = new Date(`${nextEvent.date}T09:00:00`);
    const diff = Math.max(0, Math.floor((target - now) / 1000));

    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;

    $("#cdDays").textContent = String(d).padStart(2, "0");
    $("#cdHours").textContent = String(h).padStart(2, "0");
    $("#cdMins").textContent = String(m).padStart(2, "0");
    $("#cdSecs").textContent = String(s).padStart(2, "0");
  }

  updateTimer();
  setInterval(updateTimer, 1000);
}

renderAuthHeader();
fetchEventsFromDB();
startCountdown();
fetchProducts();
