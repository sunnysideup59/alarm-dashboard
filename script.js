// 基础工具
const $ = (id) => document.getElementById(id);

const STORAGE_KEYS = {
  TASKS: "focusclock_tasks",
  SETTINGS: "focusclock_settings",
};

let state = {
  tasks: [],
  settings: {
    popup: true,
    sound: true,
  },
};

let activeReminderTaskId = null;

// 工具函数
function uuid() {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8).toUpperCase()
  );
}

function formatTime(dt) {
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "--:--";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatDate(dt) {
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "--";
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = "日一二三四五六".charAt(d.getDay());
  return `${month}月${day}日 (周${weekday})`;
}

function minutesDiff(from, to) {
  return Math.round((to - from) / 60000);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(state.tasks));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
  } catch (e) {
    console.error("保存失败", e);
  }
}

function loadState() {
  try {
    const rawTasks = localStorage.getItem(STORAGE_KEYS.TASKS);
    const rawSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    state.tasks = rawTasks ? JSON.parse(rawTasks) : [];
    state.settings = Object.assign(
      {},
      state.settings,
      rawSettings ? JSON.parse(rawSettings) : {}
    );
  } catch (e) {
    console.error("读取失败", e);
  }
}

// 渲染
function renderTodaySummary() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const now = new Date();

  const todayTasks = state.tasks.filter((t) =>
    t.dateTime.startsWith(todayStr)
  );
  const completedToday = todayTasks.filter((t) => t.completed).length;
  const upcomingToday = todayTasks.filter(
    (t) => !t.completed && new Date(t.dateTime) >= now
  );

  const nearest = upcomingToday.length
    ? upcomingToday.reduce((a, b) =>
        new Date(a.dateTime) < new Date(b.dateTime) ? a : b
      )
    : null;

  const container = $("today-summary");
  if (!container) return;

  container.innerHTML = `
    <div class="metric-card">
      <div class="metric-label">今日未完成</div>
      <div class="metric-value">${
        todayTasks.length - completedToday
      }</div><div class="metric-sub">总计 ${todayTasks.length} 条</div>
    </div>
    <div class="metric-card secondary">
      <div class="metric-label">下一个提醒</div>
      <div class="metric-value">${
        nearest ? formatTime(nearest.remindAt || nearest.dateTime) : "--:--"
      }</div>
      <div class="metric-sub">${
        nearest ? nearest.title.slice(0, 10) : "暂无安排"
      }</div>
    </div>
  `;
}

function renderSettings() {
  const popupBtn = $("toggle-popup");
  const soundBtn = $("toggle-sound");
  if (!popupBtn || !soundBtn) return;
  popupBtn.classList.toggle("active", state.settings.popup);
  soundBtn.classList.toggle("active", state.settings.sound);
}

function renderUpcoming() {
  const listEl = $("upcoming-list");
  const emptyEl = $("upcoming-empty");
  const countEl = $("upcoming-count");
  if (!listEl || !emptyEl || !countEl) return;

  const now = new Date();
  const items = state.tasks
    .filter((t) => !t.completed && !t.dismissed)
    .map((t) => {
      const remindAt = new Date(t.remindAt || t.dateTime);
      return { ...t, _remindAt: remindAt };
    })
    .filter((t) => t._remindAt >= now)
    .sort((a, b) => a._remindAt - b._remindAt)
    .slice(0, 20);

  countEl.textContent = `${items.length} 条`;

  if (!items.length) {
    listEl.style.display = "none";
    emptyEl.style.display = "block";
    return;
  }

  listEl.style.display = "block";
  emptyEl.style.display = "none";
  listEl.innerHTML = "";

  items.forEach((t) => {
    const diff = minutesDiff(now, t._remindAt);
    const diffText =
      diff <= 0 ? "即将提醒" : `约 ${diff} 分钟后提醒 (${formatTime(t._remindAt)})`;
    const priorityClass = t.priority || "normal";
    const priorityLabel =
      priorityClass === "critical"
        ? "非常重要"
        : priorityClass === "high"
        ? "重要"
        : "普通";

    const el = document.createElement("div");
    el.className = "upcoming-item";
    el.innerHTML = `
      <div class="time-pill">${formatTime(t._remindAt)}</div>
      <div class="upcoming-content">
        <div class="upcoming-title">${escapeHtml(t.title)}</div>
        <div class="upcoming-meta">
          <span>${diffText}</span>
          ${
            t.remindBefore && t.remindBefore > 0
              ? `<span> · 提前 ${t.remindBefore} 分钟</span>`
              : ""
          }
        </div>
      </div>
      <div class="tag-priority ${priorityClass}">${priorityLabel}</div>
    `;
    listEl.appendChild(el);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTasks() {
  const listEl = $("task-list");
  const emptyEl = $("tasks-empty");
  const statusFilter = $("filter-status");
  const categoryFilter = $("filter-category");
  if (!listEl || !emptyEl || !statusFilter || !categoryFilter) return;

  const status = statusFilter.value;
  const category = categoryFilter.value;

  let items = [...state.tasks].sort(
    (a, b) => new Date(a.dateTime) - new Date(b.dateTime)
  );

  if (status === "active") {
    items = items.filter((t) => !t.completed);
  } else if (status === "completed") {
    items = items.filter((t) => t.completed);
  }

  if (category !== "all") {
    items = items.filter((t) => t.category === category);
  }

  if (!items.length) {
    listEl.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }

  emptyEl.style.display = "none";
  listEl.innerHTML = "";

  items.forEach((t) => {
    const item = document.createElement("div");
    item.className = "task-item";

    const date = new Date(t.dateTime);
    const isOverdue = !t.completed && date < new Date();

    const categoryLabelMap = {
      work: "工作",
      study: "学习",
      life: "生活",
      health: "健康",
      other: "其他",
    };

    const priorityLabelMap = {
      normal: "普通",
      high: "重要",
      critical: "非常重要",
    };

    item.innerHTML = `
      <button class="checkbox-round ${
        t.completed ? "checked" : ""
      }" data-id="${t.id}">
        <span>✓</span>
      </button>
      <div class="task-main">
        <div class="task-title ${
          t.completed ? "completed" : ""
        }">${escapeHtml(t.title)}</div>
        ${
          t.notes
            ? `<div class="task-notes">${escapeHtml(
                t.notes.length > 80 ? t.notes.slice(0, 80) + "…" : t.notes
              )}</div>`
            : ""
        }
      </div>
      <div class="task-meta">
        <div>${formatDate(t.dateTime)} · ${formatTime(t.dateTime)}</div>
        <div>
          <span class="category-pill">${
            categoryLabelMap[t.category] || "其他"
          }</span>
          <span style="margin-left:6px;font-size:11px;color:${
            isOverdue ? "#fecaca" : "#9ca3af"
          }">
            ${
              isOverdue
                ? "已过期"
                : t.completed
                ? "已完成"
                : priorityLabelMap[t.priority] || "普通"
            }
          </span>
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" title="再次提醒" data-action="snooze" data-id="${
          t.id
        }">⏰</button>
        <button class="icon-btn danger" title="删除" data-action="delete" data-id="${
          t.id
        }">✕</button>
      </div>
    `;

    listEl.appendChild(item);
  });
}

// 实时钟
function tickClock() {
  const el = $("realtime-clock");
  if (!el) return;
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  el.textContent = `${h}:${m}`;
}

// 提醒检查
function checkReminders() {
  const now = new Date();
  state.tasks.forEach((task) => {
    if (task.completed || task.dismissed || task.triggered) return;
    const remindAt = new Date(task.remindAt || task.dateTime);
    if (Number.isNaN(remindAt.getTime())) return;

    if (now >= remindAt) {
      task.triggered = true;
      showReminder(task);
    }
  });
  saveState();
  renderUpcoming();
  renderTodaySummary();
}

// 提醒 UI & 声音
function showReminder(task) {
  if (state.settings.popup) {
    openReminderModal(task);
  }
  showToast(task);
  playSound();
  tryNotify(task);
}

function openReminderModal(task) {
  activeReminderTaskId = task.id;
  $("modal-time").textContent =
    formatDate(task.dateTime) + " · " + formatTime(task.dateTime);
  $("modal-title").textContent = task.title;
  $("modal-notes").textContent = task.notes || "没有补充备注。";
  $("reminder-modal").classList.add("show");
}

function closeReminderModal() {
  $("reminder-modal").classList.remove("show");
  activeReminderTaskId = null;
}

function showToast(task) {
  const container = $("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="toast-icon">⏰</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(task.title)}</div>
      <div class="toast-body">${
        task.notes
          ? escapeHtml(
              task.notes.length > 60
                ? task.notes.slice(0, 60) + "…"
                : task.notes
            )
          : "到达提醒时间。"
      }</div>
      <div class="toast-time">${formatDate(task.dateTime)} · ${formatTime(
    task.dateTime
  )}</div>
    </div>
  `;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(4px)";
    setTimeout(() => el.remove(), 200);
  }, 6000);
}

function playSound() {
  if (!state.settings.sound) return;
  const audio = $("reminder-sound");
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function tryNotify(task) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("FocusClock 提醒", {
      body: task.title,
    });
  }
}

// 表单处理
function initForm() {
  const form = $("task-form");
  if (!form) return;

  // 默认日期时间
  const dateInput = $("task-date");
  const timeInput = $("task-time");
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  dateInput.value = `${yyyy}-${mm}-${dd}`;
  timeInput.value = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  // segmented 组件
  initSegmented("task-priority", "priority", "normal");
  initSegmented("task-scope", "scope", "today");

  $("btn-clear-form").addEventListener("click", () => {
    $("task-title").value = "";
    $("task-notes").value = "";
  });

  $("scroll-to-form-btn").addEventListener("click", () => {
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("task-title").value.trim();
    if (!title) {
      $("task-title").focus();
      return;
    }
    const notes = $("task-notes").value.trim();
    const date = $("task-date").value;
    const time = $("task-time").value;
    const remindBefore = parseInt($("task-remind-before").value || "0", 10);
    const category = $("task-category").value || "other";
    const priority =
      getSegmentedValue("task-priority") || state.settings.priority || "normal";
    const scope = getSegmentedValue("task-scope") || "today";

    const dateTimeStr = `${date}T${time}:00`;
    const dt = new Date(dateTimeStr);
    if (Number.isNaN(dt.getTime())) {
      alert("请选择有效的日期和时间");
      return;
    }

    const remindAt = new Date(dt.getTime() - remindBefore * 60000);

    const task = {
      id: uuid(),
      title,
      notes,
      dateTime: dt.toISOString(),
      createdAt: new Date().toISOString(),
      remindBefore,
      remindAt: remindAt.toISOString(),
      category,
      priority,
      scope,
      completed: false,
      dismissed: false,
      triggered: false,
    };

    state.tasks.push(task);
    saveState();
    renderUpcoming();
    renderTasks();
    renderTodaySummary();

    // 轻微表单动画反馈
    form.classList.add("submitted");
    setTimeout(() => form.classList.remove("submitted"), 200);
  });
}

function initSegmented(id, key, defaultValue) {
  const container = $(id);
  if (!container) return;
  const buttons = Array.from(container.querySelectorAll("button"));
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const value = btn.getAttribute("data-value");
      state.settings[key] = value;
      saveState();
    });
  });
  // 初始选中
  const current =
    state.settings[key] ||
    (buttons.find((b) => b.classList.contains("active")) &&
      buttons.find((b) => b.classList.contains("active")).dataset.value) ||
    defaultValue;
  buttons.forEach((b) =>
    b.classList.toggle("active", b.dataset.value === current)
  );
}

function getSegmentedValue(id) {
  const container = $(id);
  if (!container) return null;
  const active = container.querySelector("button.active");
  return active ? active.dataset.value : null;
}

// 列表交互
function initTaskListEvents() {
  const listEl = $("task-list");
  if (!listEl) return;
  listEl.addEventListener("click", (e) => {
    const target = e.target;
    const checkbox = target.closest(".checkbox-round");
    const actionBtn = target.closest("button[data-action]");
    if (checkbox) {
      const id = checkbox.getAttribute("data-id");
      toggleTaskCompleted(id);
    } else if (actionBtn) {
      const id = actionBtn.getAttribute("data-id");
      const action = actionBtn.getAttribute("data-action");
      if (action === "delete") {
        deleteTask(id);
      } else if (action === "snooze") {
        snoozeTask(id, 5);
      }
    }
  });

  $("filter-status").addEventListener("change", renderTasks);
  $("filter-category").addEventListener("change", renderTasks);
  $("btn-clear-completed").addEventListener("click", () => {
    state.tasks = state.tasks.filter((t) => !t.completed);
    saveState();
    renderTasks();
    renderUpcoming();
    renderTodaySummary();
  });
}

function toggleTaskCompleted(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveState();
  renderTasks();
  renderUpcoming();
  renderTodaySummary();
}

function deleteTask(id) {
  if (!confirm("确定要删除这条事务吗？")) return;
  state.tasks = state.tasks.filter((t) => t.id !== id);
  saveState();
  renderTasks();
  renderUpcoming();
  renderTodaySummary();
}

function snoozeTask(id, minutes) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const now = new Date();
  const newRemind = new Date(now.getTime() + minutes * 60000);
  task.remindAt = newRemind.toISOString();
  task.triggered = false;
  saveState();
  renderUpcoming();
  renderTodaySummary();
  showToast({
    ...task,
    title: `已延后 ${minutes} 分钟：` + task.title,
  });
}

// 设置开关
function initSettingsEvents() {
  $("toggle-popup").addEventListener("click", () => {
    state.settings.popup = !state.settings.popup;
    renderSettings();
    saveState();
  });
  $("toggle-sound").addEventListener("click", () => {
    state.settings.sound = !state.settings.sound;
    renderSettings();
    saveState();
  });
}

// 模态框事件
function initModalEvents() {
  $("modal-close-btn").addEventListener("click", closeReminderModal);
  $("reminder-modal").addEventListener("click", (e) => {
    if (e.target.id === "reminder-modal") {
      closeReminderModal();
    }
  });
  $("modal-complete").addEventListener("click", () => {
    if (!activeReminderTaskId) {
      closeReminderModal();
      return;
    }
    toggleTaskCompleted(activeReminderTaskId);
    closeReminderModal();
  });
  $("modal-snooze-5").addEventListener("click", () => {
    if (!activeReminderTaskId) return;
    snoozeTask(activeReminderTaskId, 5);
    closeReminderModal();
  });
  $("modal-snooze-10").addEventListener("click", () => {
    if (!activeReminderTaskId) return;
    snoozeTask(activeReminderTaskId, 10);
    closeReminderModal();
  });
}

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  renderSettings();
  initForm();
  initTaskListEvents();
  initSettingsEvents();
  initModalEvents();

  renderUpcoming();
  renderTasks();
  renderTodaySummary();
  tickClock();
  setInterval(tickClock, 1000 * 20); // 20 秒更新一次即可
  setInterval(checkReminders, 1000 * 15); // 15 秒检查一次提醒

  if ("Notification" in window && Notification.permission === "default") {
    setTimeout(() => {
      Notification.requestPermission().catch(() => {});
    }, 2000);
  }
});

