import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const $ = (selector) => document.querySelector(selector);
const supabaseReady =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  SUPABASE_ANON_KEY.length > 30 &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");
const supabase = supabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const STATUS_LABELS = {
  requested: "상담 대기",
  quoted: "견적 안내",
  in_progress: "작업 중",
  completed: "완료",
  cancelled: "취소",
};
const STATUS_OPTIONS = ["requested", "quoted", "in_progress", "completed", "cancelled"];

let session = null;
let isAdmin = false;
let selectedCustomerId = null;
let artworks = [];
let orders = [];
let toastTimer;
let authMode = "login";

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function currency(value) {
  return value == null || value === "" ? "상담 후 결정" : `${Number(value).toLocaleString("ko-KR")}원`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function showEmpty(element, message) {
  element.innerHTML = `<p class="empty-state">${escapeHTML(message)}</p>`;
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === "signup";
  $("#auth-title").textContent = signingUp ? "회원가입" : "로그인";
  $("#auth-submit").textContent = signingUp ? "회원가입" : "로그인";
  $("#auth-switch-copy").textContent = signingUp ? "이미 회원이신가요?" : "아직 회원이 아니신가요?";
  $("#auth-switch").textContent = signingUp ? "로그인" : "회원가입";
  $("#auth-password").autocomplete = signingUp ? "new-password" : "current-password";
  $("#auth-note").textContent = "";
}

function openAuth(mode) {
  setAuthMode(mode);
  $("#auth-dialog").showModal();
}

function renderArtworks() {
  const grid = $("#art-grid");
  if (!artworks.length) {
    showEmpty(grid, "아직 등록된 작품이 없어요. 새로운 작품을 준비 중입니다.");
    $("#request-artwork").innerHTML = '<option value="">정해진 작품 없이 신청할게요</option>';
    return;
  }

  grid.innerHTML = artworks.map((artwork) => `
    <article class="art-card">
      <div class="art-image-wrap">
        ${artwork.image_url
          ? `<img class="art-image" src="${escapeHTML(artwork.image_url)}" alt="${escapeHTML(artwork.title)}" loading="lazy" />`
          : '<span class="art-image-placeholder">그림 이미지</span>'}
      </div>
      <div class="art-info">
        <h3>${escapeHTML(artwork.title)}</h3>
        <p class="art-description">${escapeHTML(artwork.description || "작가의 마음을 담아 그린 작품입니다.")}</p>
        <div class="art-meta">
          <span class="art-price">${escapeHTML(currency(artwork.price_krw))}</span>
          ${isAdmin ? "" : `<button class="small-button art-order-button" type="button" data-request-art="${escapeHTML(artwork.id)}">이 그림 신청</button>`}
        </div>
      </div>
    </article>
  `).join("");

  $("#request-artwork").innerHTML =
    '<option value="">정해진 작품 없이 신청할게요</option>' +
    artworks.map((artwork) =>
      `<option value="${escapeHTML(artwork.id)}">${escapeHTML(artwork.title)} · ${escapeHTML(currency(artwork.price_krw))}</option>`
    ).join("");
}

function renderOrderList() {
  const list = $("#room-list");
  const title = $("#room-list-title");
  title.textContent = isAdmin ? "전체 주문" : "내 주문";
  if (!session) {
    showEmpty(list, "로그인하면 주문 내역을 확인할 수 있어요.");
    return;
  }
  if (!orders.length) {
    showEmpty(list, isAdmin ? "아직 접수된 작업이 없어요." : "아직 신청한 작업이 없어요.");
    return;
  }
  list.innerHTML = orders.map((order) => {
    const active = selectedCustomerId === order.customer_id ? " is-selected" : "";
    const artworkTitle = order.artworks?.title || "맞춤 그림 신청";
    const contents = `
      <strong>${escapeHTML(artworkTitle)}</strong>
      <span class="status-pill">${escapeHTML(STATUS_LABELS[order.status] || order.status)}</span>
      <span class="order-meta">${isAdmin ? `${escapeHTML(order.customer_id.slice(0, 8))} · ` : ""}${escapeHTML(currency(order.quote_krw ?? order.budget_krw))}</span>
    `;
    return isAdmin
      ? `<button class="order-item${active}" type="button" data-order="${escapeHTML(order.id)}">${contents}</button>`
      : `<article class="order-item">${contents}</article>`;
  }).join("");
}

async function loadMessages() {
  const container = $("#chat-messages");
  if (!session) {
    showEmpty(container, "로그인 후 상담을 시작할 수 있어요.");
    return;
  }
  if (isAdmin && !selectedCustomerId) {
    showEmpty(container, "상담함이나 주문 목록에서 고객을 선택해 주세요.");
    return;
  }
  if (!isAdmin) selectedCustomerId = session.user.id;

  const { data, error } = await supabase
    .from("support_messages")
    .select("id, customer_id, sender_id, order_id, body, created_at")
    .eq("customer_id", selectedCustomerId)
    .is("order_id", null)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    showEmpty(container, "상담 내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    console.error("Could not load messages:", error.message);
    return;
  }
  if (!data.length) {
    showEmpty(container, isAdmin ? "아직 질문이 없어요." : "질문을 남기면 관리자가 답변해 드립니다.");
    return;
  }
  container.innerHTML = data.map((message) => {
    const mine = message.sender_id === session.user.id;
    const sender = mine ? (isAdmin ? "관리자" : "나") : (isAdmin ? "고객" : "관리자");
    const time = new Date(message.created_at).toLocaleString("ko-KR", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    return `<div class="message${mine ? " is-mine" : ""}">${escapeHTML(message.body)}<small>${sender} · ${escapeHTML(time)}</small></div>`;
  }).join("");
  container.scrollTop = container.scrollHeight;
}

function updateChatHeading() {
  $("#chat-title").textContent = isAdmin ? "고객 상담 답변" : "고객 상담";
  $("#chat-subtitle").textContent = isAdmin
    ? selectedCustomerId
      ? `고객 ${selectedCustomerId.slice(0, 8)}의 질문에 답변합니다.`
      : "상담함이나 주문 목록에서 고객을 선택해 주세요."
    : "궁금한 점을 질문으로 남겨 주시면 관리자가 확인 후 답변해 드립니다.";
  $("#chat-input-label").textContent = isAdmin ? "고객에게 보낼 답변" : "상담 질문";
  $("#chat-input").placeholder = isAdmin ? "고객에게 답변을 입력해 주세요." : "궁금한 점을 질문해 주세요.";
  $("#chat-submit").textContent = isAdmin ? "답변 보내기" : "질문 보내기";
  $("#chat-form").classList.toggle("is-hidden", !session || (isAdmin && !selectedCustomerId));
}

function renderAdminOrders() {
  const list = $("#admin-order-list");
  if (!orders.length) {
    showEmpty(list, "신청 내역이 없어요.");
    return;
  }
  list.innerHTML = orders.map((order) => `
    <article class="admin-order-item">
      <h4 class="admin-order-title">${escapeHTML(order.artworks?.title || "맞춤 그림 신청")} · ${escapeHTML(order.customer_id.slice(0, 8))}</h4>
      <p class="admin-order-description">${escapeHTML(order.description)}</p>
      <span class="order-meta">희망 예산 ${escapeHTML(currency(order.budget_krw))} · 현재 견적 ${escapeHTML(currency(order.quote_krw))}</span>
      <div class="admin-order-controls">
        <label>견적 (원)<input type="number" min="0" step="1000" value="${order.quote_krw ?? ""}" data-quote="${escapeHTML(order.id)}" /></label>
        <label>진행 상태<select data-status="${escapeHTML(order.id)}">${STATUS_OPTIONS.map((status) =>
          `<option value="${status}"${order.status === status ? " selected" : ""}>${STATUS_LABELS[status]}</option>`
        ).join("")}</select></label>
        <button class="small-button" type="button" data-save-order="${escapeHTML(order.id)}">변경 저장</button>
      </div>
      <button class="text-button" type="button" data-open-order-customer="${escapeHTML(order.id)}">고객 상담 열기</button>
    </article>
  `).join("");
}

async function loadAdminInbox() {
  const list = $("#admin-inbox-list");
  if (!isAdmin) return;
  const { data, error } = await supabase
    .from("support_messages")
    .select("customer_id, body, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    showEmpty(list, "상담함을 불러오지 못했어요.");
    console.error("Could not load support inbox:", error.message);
    return;
  }
  const threads = new Map();
  for (const message of data) {
    if (!threads.has(message.customer_id)) threads.set(message.customer_id, message);
  }
  if (!threads.size) {
    showEmpty(list, "아직 고객 상담이 없어요.");
    return;
  }
  list.innerHTML = [...threads.values()].map((message) => `
    <button class="inbox-item${selectedCustomerId === message.customer_id ? " is-selected" : ""}"
      type="button" data-inbox-customer="${escapeHTML(message.customer_id)}">
      <strong>고객 질문 · ${escapeHTML(message.customer_id.slice(0, 8))}</strong>
      <span class="inbox-meta">${escapeHTML(message.body.slice(0, 100))}</span>
      <span class="inbox-meta">${escapeHTML(new Date(message.created_at).toLocaleString("ko-KR"))}</span>
    </button>
  `).join("");
}

async function loadData() {
  const { data: artworkData, error: artworkError } = await supabase
    .from("artworks")
    .select("id, title, description, price_krw, image_url, created_at")
    .order("created_at", { ascending: false });
  if (artworkError) {
    showEmpty($("#art-grid"), "작품을 불러오지 못했어요. 설정을 확인해 주세요.");
    console.error("Could not load artworks:", artworkError.message);
  } else {
    artworks = artworkData;
    renderArtworks();
  }

  if (!session) {
    orders = [];
    renderOrderList();
    return;
  }

  let orderQuery = supabase
    .from("orders")
    .select("id, customer_id, artwork_id, description, budget_krw, quote_krw, status, created_at, artworks(title)")
    .order("created_at", { ascending: false });
  if (!isAdmin) orderQuery = orderQuery.eq("customer_id", session.user.id);
  const { data: orderData, error: orderError } = await orderQuery;
  if (orderError) {
    showEmpty($("#room-list"), "주문 정보를 불러오지 못했어요.");
    console.error("Could not load orders:", orderError.message);
    return;
  }
  orders = orderData;
  renderOrderList();
  if (isAdmin) renderAdminOrders();
  updateChatHeading();
  await loadMessages();
  if (isAdmin) await loadAdminInbox();
}

async function refreshSession() {
  if (!supabase) return;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showToast("로그인 정보를 확인하지 못했어요.");
    console.error("Could not get session:", error.message);
    return;
  }
  session = data.session;
  isAdmin = false;
  if (session) {
    const { data: adminResult, error: adminError } = await supabase.rpc("is_admin");
    if (adminError) {
      console.error("Could not check admin permission:", adminError.message);
    } else {
      isAdmin = adminResult === true;
    }
  }
  $("#account-actions").classList.toggle("is-hidden", Boolean(session));
  $("#signed-in-actions").classList.toggle("is-hidden", !session);
  $("#signed-in-email").textContent = session?.user.email || "";
  $("#request-nav").classList.toggle("is-hidden", !session || isAdmin);
  $("#room-access").classList.toggle("is-hidden", Boolean(session));
  $("#room-content").classList.toggle("is-hidden", !session);
  $("#request").classList.toggle("is-hidden", isAdmin);
  $("#room-orders-panel").classList.toggle("is-hidden", !session);
  $("#room").classList.toggle("is-admin", isAdmin);
  $("#room-title").textContent = isAdmin ? "관리자 개인 작업실" : "내 작업실";
  $("#room-description").textContent = isAdmin
    ? "접수된 작업을 확인하고 고객 질문에 답변할 수 있어요."
    : "작업을 신청하고 진행 상황을 확인하거나 관리자에게 질문할 수 있어요.";
  $("#admin").classList.toggle("is-hidden", !isAdmin);
  if (!session) {
    selectedCustomerId = null;
  } else if (!isAdmin) {
    selectedCustomerId = session.user.id;
  }
  updateChatHeading();
  await loadData();
}

function setupRealtime() {
  if (!supabase) return;
  supabase
    .channel("support-message-updates")
    .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, async () => {
      if (session) {
        await loadMessages();
        if (isAdmin) await loadAdminInbox();
      }
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") console.error("Could not subscribe to chat updates.");
    });
}

function showSetupMessage() {
  showEmpty($("#art-grid"), "아직 서비스 데이터베이스에 연결되지 않았어요. README의 Supabase 설정을 마치면 작품과 주문 기능을 사용할 수 있습니다.");
  showEmpty($("#room-list"), "Supabase 연결 후 개인 작업실을 이용할 수 있어요.");
  showEmpty($("#chat-messages"), "온라인 상담을 사용하려면 Supabase 설정이 필요합니다.");
  $("#chat-form").classList.add("is-hidden");
  $("#admin").classList.add("is-hidden");
}

$("#login-open").addEventListener("click", () => openAuth("login"));
$("#signup-open").addEventListener("click", () => openAuth("signup"));
$("#room-login-open").addEventListener("click", () => openAuth("login"));
$("#room-signup-open").addEventListener("click", () => openAuth("signup"));
$("#auth-close").addEventListener("click", () => $("#auth-dialog").close());
$("#auth-switch").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) {
    $("#auth-note").textContent = "Supabase 프로젝트와 config.js 설정이 필요합니다.";
    return;
  }
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  const result = authMode === "signup"
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password });
  if (result.error) {
    $("#auth-note").textContent = result.error.message;
    return;
  }
  if (authMode === "signup" && !result.data.session) {
    $("#auth-note").textContent = "가입 확인 메일을 보냈어요. 이메일 인증을 마친 뒤 로그인해 주세요.";
    return;
  }
  $("#auth-dialog").close();
  $("#auth-form").reset();
  showToast(authMode === "signup" ? "회원가입이 완료됐어요." : "로그인했어요.");
  await refreshSession();
});

$("#logout").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast("로그아웃하지 못했어요.");
    console.error("Could not sign out:", error.message);
    return;
  }
  showToast("로그아웃했어요.");
  await refreshSession();
});

$("#art-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-request-art]");
  if (!button) return;
  $("#request-artwork").value = button.dataset.requestArt;
  if (!session) {
    openAuth("login");
    return;
  }
  if (isAdmin) return;
  $("#request").scrollIntoView({ behavior: "smooth" });
});

$("#request-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!session || isAdmin) {
    if (!session) openAuth("login");
    return;
  }
  if (!$("#request-description").value.trim()) {
    showToast("원하는 그림 내용을 적어 주세요.");
    return;
  }
  const artworkId = $("#request-artwork").value || null;
  const budgetValue = $("#request-budget").value;
  const { error } = await supabase.from("orders").insert({
    customer_id: session.user.id,
    artwork_id: artworkId,
    description: $("#request-description").value.trim(),
    budget_krw: budgetValue ? Number(budgetValue) : null,
  });
  if (error) {
    showToast("신청을 보내지 못했어요. 입력 내용과 연결 설정을 확인해 주세요.");
    console.error("Could not create order:", error.message);
    return;
  }
  $("#request-form").reset();
  showToast("작업 신청을 보냈어요. 내 작업실에서 진행 상황을 확인할 수 있습니다.");
  await loadData();
  $("#room-orders-panel").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#room-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-order]");
  if (!button || !isAdmin) return;
  const order = orders.find((item) => item.id === button.dataset.order);
  if (!order) return;
  selectedCustomerId = order.customer_id;
  renderOrderList();
  updateChatHeading();
  await loadMessages();
});

$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!session) return;
  const body = $("#chat-input").value.trim();
  if (!body) return;
  const customerId = isAdmin ? selectedCustomerId : session.user.id;
  if (!customerId) {
    showToast("상담함에서 고객을 먼저 선택해 주세요.");
    return;
  }
  const { error } = await supabase.from("support_messages").insert({
    customer_id: customerId,
    sender_id: session.user.id,
    order_id: null,
    body,
  });
  if (error) {
    showToast(isAdmin ? "답변을 보내지 못했어요." : "질문을 보내지 못했어요.");
    console.error("Could not send message:", error.message);
    return;
  }
  $("#chat-input").value = "";
  await loadMessages();
  if (isAdmin) await loadAdminInbox();
});

$("#artwork-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdmin) return;
  const file = $("#artwork-image").files[0];
  if (!file || !file.type.startsWith("image/")) {
    showToast("이미지 파일을 선택해 주세요.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast("이미지는 5MB 이하로 올려 주세요.");
    return;
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("artworks").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (uploadError) {
    showToast("이미지를 올리지 못했어요. 저장소 설정을 확인해 주세요.");
    console.error("Could not upload artwork image:", uploadError.message);
    return;
  }
  const { data: imageData } = supabase.storage.from("artworks").getPublicUrl(path);
  const { error: insertError } = await supabase.from("artworks").insert({
    title: $("#artwork-title").value.trim(),
    description: $("#artwork-description").value.trim(),
    price_krw: Number($("#artwork-price").value),
    image_url: imageData.publicUrl,
    storage_path: path,
  });
  if (insertError) {
    showToast("작품 정보를 저장하지 못했어요.");
    console.error("Could not save artwork:", insertError.message);
    return;
  }
  $("#artwork-form").reset();
  showToast("새 작품을 등록했어요.");
  await loadData();
});

$("#admin-order-list").addEventListener("click", async (event) => {
  const openButton = event.target.closest("[data-open-order-customer]");
  const saveButton = event.target.closest("[data-save-order]");
  if (openButton) {
    const orderId = openButton.dataset.openOrderCustomer;
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    selectedCustomerId = order.customer_id;
    renderOrderList();
    updateChatHeading();
    await loadMessages();
    $("#room").scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (!saveButton) return;
  const orderId = saveButton.dataset.saveOrder;
  const quoteInput = $(`[data-quote="${CSS.escape(orderId)}"]`);
  const statusInput = $(`[data-status="${CSS.escape(orderId)}"]`);
  const quote = quoteInput.value === "" ? null : Number(quoteInput.value);
  const { error } = await supabase.from("orders").update({
    quote_krw: quote,
    status: statusInput.value,
  }).eq("id", orderId);
  if (error) {
    showToast("주문 내용을 저장하지 못했어요.");
    console.error("Could not update order:", error.message);
    return;
  }
  showToast("견적과 진행 상태를 저장했어요.");
  await loadData();
});

$("#admin-inbox-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-inbox-customer]");
  if (!button) return;
  selectedCustomerId = button.dataset.inboxCustomer;
  updateChatHeading();
  await loadMessages();
  await loadAdminInbox();
  $("#room").scrollIntoView({ behavior: "smooth" });
});

if (supabase) {
  refreshSession();
  setupRealtime();
  supabase.auth.onAuthStateChange(() => {
    window.setTimeout(() => refreshSession(), 0);
  });
  window.setInterval(async () => {
    if (session) {
      await loadMessages();
      if (isAdmin) await loadAdminInbox();
    }
  }, 20000);
} else {
  showSetupMessage();
}
